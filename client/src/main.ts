import "./style.css";
import {
  DESERT_CANYON,
  RIFLE,
  SIM,
  WIND,
  canFire,
  crosswind,
  directionFromYawPitch,
  fireRifle,
  initialRifle,
  launchState,
  predictImpact,
  scopeZoomRange,
  startReload,
  stepRifle,
  swayAmplitudes,
  swayOffset,
  windAt,
  windSpeedAndDirection,
} from "@oneshot/shared";
import type { AngleOffset, RifleState, Vec3 } from "@oneshot/shared";
import { AudioBus } from "./audio/AudioBus";
import { createSoundBank } from "./audio/Sounds";
import type { SoundBank } from "./audio/Sounds";
import { BulletRenderer } from "./ballistics/BulletRenderer";
import { BulletSim } from "./ballistics/BulletSim";
import type { BulletImpact } from "./ballistics/BulletSim";
import { FixedStepLoop } from "./core/Loop";
import { KeyboardMouseInput } from "./core/KeyboardMouseInput";
import { loadAssets } from "./core/Assets";
import { GameRenderer } from "./core/Renderer";
import { AdaptiveQuality, QUALITY_PRESETS } from "./gfx/Quality";
import type { QualityLevel } from "./gfx/Quality";
import { Breath } from "./player/Breath";
import { LocalPlayer } from "./player/LocalPlayer";
import { Rangefinder } from "./player/Rangefinder";
import { ScopeView } from "./player/ScopeView";
import { Coach } from "./practice/Coach";
import type { CoachReading } from "./practice/Coach";
import { Targets } from "./practice/Targets";
import { Hud } from "./ui/Hud";
import { buildWorld } from "./world/MapLayout";

const OVERLAY_REFRESH_S = 0.5;
const PULSE_HZ = 1.2;
const RECOIL_KICK_RAD = 0.035;
/** Scoped kick as a fraction of the scope's field of view: the same on screen at every zoom. */
const RECOIL_SCOPED_FOV_FRACTION = 0.08;
const RECOIL_RECOVER_S = 0.18;
const BOLT_SOUND_DELAY_S = 0.45;
const HEARTBEAT_INTERVAL_S = 0.85;
/** Practice mode: the green impact dot and the coach exist ONLY here (D-028), never in duels. */
const PRACTICE = true;
/** The practice dot works at any distance beyond this (was 20 m, which hid it in tight gaps). */
const MIN_COACH_DISTANCE_M = 3;

/** Random 32-bit seed (practice mode; in duels the server sends the match seed). */
const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

/** Wind direction relative to the view: 0 = blowing straight away, + = toward the right. */
function windRelativeToView(directionRad: number, yaw: number): number {
  const wx = Math.cos(directionRad);
  const wz = Math.sin(directionRad);
  const along = -Math.sin(yaw) * wx - Math.cos(yaw) * wz;
  const across = Math.cos(yaw) * wx - Math.sin(yaw) * wz;
  return Math.atan2(across, along);
}

/** Stereo pan of a world point for a listener at `eye` looking along `yaw`. */
function panFor(eye: Vec3, yaw: number, p: Vec3): number {
  const dx = p.x - eye.x;
  const dz = p.z - eye.z;
  const across = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const len = Math.hypot(dx, dz);
  return len > 0 ? across / len : 0;
}

function rifleStatus(r: RifleState): "ready" | "bolt" | "reload" | "empty" {
  if (r.reloadS > 0) return "reload";
  if (r.rounds === 0) return "empty";
  if (r.boltS > 0) return "bolt";
  return "ready";
}

async function start(): Promise<void> {
  const app = document.getElementById("app");
  const overlay = document.getElementById("fps");
  const hint = document.getElementById("hint");
  if (!app) throw new Error("Missing #app element in index.html");

  const params = new URLSearchParams(window.location.search);
  const gfx = await GameRenderer.create(app, { forceWebGL: params.get("gfx") === "webgl" });

  const map = DESERT_CANYON;
  const zone = map.zones[0];
  if (overlay) overlay.textContent = "Loading assets...";
  const assets = await loadAssets();
  const world = buildWorld(gfx.scene, map, assets, zone);
  const colliders = {
    grid: world.grid,
    walls: map.walls,
    rocks: map.rocks,
    crates: map.crates,
    rockMeshes: assets.rocks.map((r) => r.mesh),
  };

  // Graphics quality: automatic by measured frame rate (D-016); F9 cycles it by hand.
  const requested = params.get("q");
  const initialQuality: QualityLevel =
    requested === "low" || requested === "medium" || requested === "high" ? requested : "high";
  const quality = new AdaptiveQuality(initialQuality, (level) => {
    const preset = QUALITY_PRESETS[level];
    gfx.setResolutionScale(preset.resolutionScale);
    world.setQuality(preset);
  });
  if (requested) quality.auto = false;
  window.addEventListener("keydown", (e) => {
    if (e.code === "F9") {
      e.preventDefault();
      quality.cycle();
    }
  });
  const input = new KeyboardMouseInput(gfx.canvas, zone.facingYaw);
  const player = new LocalPlayer(
    zone,
    world.grid,
    map.rocks.map((r) => r.collider),
    map.crates,
  );
  const breath = new Breath();
  const scope = new ScopeView(scopeZoomRange(map));
  const rangefinder = new Rangefinder(colliders);
  const hud = new Hud(document.body, scope.range.levels);
  const targets = new Targets(world.grid, zone);
  const coach = PRACTICE ? new Coach(document.body) : null;
  gfx.scene.add(targets.group);

  const matchSeed = randomSeed();
  const playerSeed = randomSeed();
  const bullets = new BulletSim(colliders, (t) => targets.hitboxesAt(t), matchSeed);
  const tracers = new BulletRenderer();
  gfx.scene.add(tracers.group);

  const audio = new AudioBus();
  let sounds: SoundBank | null = null;
  gfx.canvas.addEventListener("mousedown", () => {
    audio.unlock();
    const ctx = audio.context;
    if (ctx && !sounds) {
      sounds = createSoundBank(ctx);
      audio.startWind(sounds.windNoise);
    }
  });

  let simTime = 0;
  let zeroIndex: 0 | 1 | 2 | 3 = 0;
  let scoped = false;
  let creeping = false;
  let rifle = initialRifle();
  let recoil = 0;
  let nextHeartbeat = 0;
  let frames = 0;
  let elapsed = 0;

  const currentSway = (): AngleOffset =>
    swayOffset(simTime, playerSeed, swayAmplitudes(player.posture, breath.state, false, creeping));

  const onImpact = (impact: BulletImpact): void => {
    tracers.impact(impact.kind, impact.point, simTime);
    if (impact.kind === "crate" && impact.crateIndex !== undefined) {
      world.perforateCrate(impact.crateIndex, impact.point, impact.exitPoint);
      if (impact.exitPoint) tracers.impact("crate", impact.exitPoint, simTime);
    }
    const eye = player.eyePosition(1);
    const heardFrom = Math.hypot(
      impact.point.x - eye.x,
      impact.point.y - eye.y,
      impact.point.z - eye.z,
    );
    const pan = panFor(eye, player.yaw, impact.point);
    if (impact.kind === "body" && impact.targetId !== undefined && impact.zone) {
      const info = targets.hit(
        impact.targetId,
        impact.zone,
        impact.point,
        simTime,
        impact.distanceM,
      );
      if (info) {
        hud.flash(`${info.zone.toUpperCase()}  ${Math.round(info.distanceM)} m`, info.lethal);
      }
      audio.playAtDistance(sounds?.impactBody ?? null, heardFrom, 1.6, pan);
    } else {
      const buffer =
        impact.kind === "terrain"
          ? sounds?.impactGround
          : impact.kind === "crate"
            ? sounds?.impactWood
            : sounds?.impactRock;
      audio.playAtDistance(buffer ?? null, heardFrom, 1.2, pan);
    }
  };

  const loop = new FixedStepLoop(
    {
      update: (dt) => {
        const cmd = input.poll(dt);
        scoped = cmd.scoped;
        creeping = cmd.scoped && (cmd.moveX !== 0 || cmd.moveZ !== 0);
        zeroIndex = cmd.zeroIndex;
        player.update(cmd, dt);
        breath.update(cmd.holdBreath, cmd.scoped, dt);
        scope.update(cmd.scoped, breath.state.mode, dt);
        input.setLookScale(1 / scope.zoom);
        rifle = stepRifle(rifle, dt);

        const actions = input.consumeActions();
        if (actions.cycleZoom) scope.cycleLevel();
        if (actions.zoomDelta !== 0) scope.changeLevel(actions.zoomDelta);
        if (actions.reload) {
          const before = rifle.reloadS;
          rifle = startReload(rifle);
          if (rifle.reloadS > 0 && before === 0) audio.play(sounds?.reload ?? null, { gain: 0.6 });
        }
        if (actions.fire) {
          if (canFire(rifle)) {
            rifle = fireRifle(rifle);
            const sway = currentSway();
            const eye = player.eyePosition(1);
            bullets.fire(
              launchState(eye, player.yaw + sway.yaw, player.pitch + sway.pitch, zeroIndex),
            );
            recoil = scoped
              ? ((scope.fovDeg * Math.PI) / 180) * RECOIL_SCOPED_FOV_FRACTION
              : RECOIL_KICK_RAD;
            audio.play(sounds?.shot ?? null, { gain: 1 });
            if (rifle.rounds > 0)
              audio.play(sounds?.bolt ?? null, { delayS: BOLT_SOUND_DELAY_S, gain: 0.5 });
          } else if (rifle.rounds === 0) {
            audio.play(sounds?.dryFire ?? null, { gain: 0.5 });
          }
        }

        for (const impact of bullets.step(dt, simTime)) onImpact(impact);
        recoil *= Math.exp(-dt / RECOIL_RECOVER_S);
        simTime += dt;
      },
      render: (alpha, frameSeconds) => {
        const sway = currentSway();
        player.applyToCamera(gfx.camera, alpha, { yaw: sway.yaw, pitch: sway.pitch + recoil });
        if (Math.abs(gfx.camera.fov - scope.fovDeg) > 1e-4) {
          gfx.camera.fov = scope.fovDeg;
          gfx.camera.updateProjectionMatrix();
        }
        targets.update(simTime);
        tracers.update(bullets.bullets, gfx.camera, simTime);
        world.update(gfx.camera.position);
        gfx.render();

        const wind = windSpeedAndDirection(simTime, matchSeed);
        audio.setWind(wind.speed / WIND.maxSpeed);
        if (breath.state.mode !== "normal" && simTime >= nextHeartbeat) {
          audio.play(sounds?.heartbeat ?? null, {
            gain: breath.state.mode === "exhausted" ? 0.9 : 0.5,
          });
          nextHeartbeat =
            simTime + HEARTBEAT_INTERVAL_S * (breath.state.mode === "exhausted" ? 0.7 : 1);
        }

        const eye = player.eyePosition(alpha);
        const aimYaw = player.yaw + sway.yaw;
        const aimPitch = player.pitch + sway.pitch;
        let rangeM: number | null | undefined;
        if (input.localControls().rangefinder) {
          rangeM = rangefinder.read(
            eye,
            directionFromYawPitch(aimYaw, aimPitch),
            simTime,
            matchSeed,
          ).distanceM;
        }

        // Practice coach: where would the bullet land at the aimed distance, right now?
        let impactMils: { right: number; up: number } | null = null;
        if (coach) {
          let reading: CoachReading | null = null;
          if (scoped) {
            const aimed = rangefinder.read(
              eye,
              directionFromYawPitch(aimYaw, aimPitch),
              simTime,
              matchSeed,
            );
            if (aimed.distanceM !== null && aimed.distanceM > MIN_COACH_DISTANCE_M) {
              const p = predictImpact(eye, aimYaw, aimPitch, zeroIndex, aimed.distanceM, (dt) =>
                windAt(simTime + dt, matchSeed),
              );
              if (p) {
                impactMils = { right: p.rightMils, up: p.upMils };
                reading = {
                  distanceM: aimed.distanceM,
                  crosswind: crosswind(windAt(simTime, matchSeed), aimYaw),
                  rightMils: p.rightMils,
                  upMils: p.upMils,
                };
              }
            }
          }
          coach.update(reading);
        }
        hud.update({
          scoped,
          fovDeg: scope.fovDeg,
          aspect: gfx.camera.aspect,
          lung: breath.state.lung,
          breathMode: breath.state.mode,
          windRelativeRad: windRelativeToView(wind.directionRad, player.yaw),
          windSpeed: wind.speed,
          zeroM: RIFLE.zeroing[zeroIndex],
          zoom: scope.selectedZoom,
          zoomLevel: scope.level,
          posture: player.posture,
          rangeM,
          pulse: 0.5 + 0.5 * Math.sin(simTime * Math.PI * 2 * PULSE_HZ),
          impactMils,
          rounds: rifle.rounds,
          magazine: RIFLE.magazine,
          rifle: rifleStatus(rifle),
        });

        if (hint) hint.hidden = input.isLocked();
        quality.sample(frameSeconds);
        frames += 1;
        elapsed += frameSeconds;
        if (elapsed >= OVERLAY_REFRESH_S && overlay) {
          const fps = Math.round(frames / elapsed);
          const { drawCalls, triangles } = gfx.stats();
          overlay.textContent =
            `${gfx.backend} | ${quality.level}${quality.auto ? " auto" : ""} | ${fps} FPS | ` +
            `${drawCalls} calls | ${triangles} tris | ` +
            `x ${player.feet.x.toFixed(1)} z ${player.feet.z.toFixed(1)}`;
          frames = 0;
          elapsed = 0;
        }
      },
    },
    SIM.physicsHz,
  );

  window.addEventListener("resize", () => gfx.resize());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) loop.stop();
    else loop.start();
  });
  loop.start();
}

start().catch((err: unknown) => {
  console.error(err);
  const overlay = document.getElementById("fps");
  if (overlay)
    overlay.textContent = `Start failed: ${err instanceof Error ? err.message : String(err)}`;
});
