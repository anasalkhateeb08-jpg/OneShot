import "./style.css";
import {
  DESERT_CANYON,
  RIFLE,
  SIM,
  directionFromYawPitch,
  scopeZoomRange,
  swayAmplitudes,
  swayOffset,
  windSpeedAndDirection,
} from "@oneshot/shared";
import type { AngleOffset } from "@oneshot/shared";
import { FixedStepLoop } from "./core/Loop";
import { KeyboardMouseInput } from "./core/KeyboardMouseInput";
import { GameRenderer } from "./core/Renderer";
import { Breath } from "./player/Breath";
import { LocalPlayer } from "./player/LocalPlayer";
import { Rangefinder } from "./player/Rangefinder";
import { ScopeView } from "./player/ScopeView";
import { Hud } from "./ui/Hud";
import { buildWorld } from "./world/MapLayout";

const OVERLAY_REFRESH_S = 0.5;
const PULSE_HZ = 1.2;

/** Random 32-bit seed (practice mode; in duels the server sends the match seed). */
const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

/**
 * Wind direction relative to the view: 0 = blowing straight away from the player,
 * positive = toward the player's right.
 */
function windRelativeToView(directionRad: number, yaw: number): number {
  const wx = Math.cos(directionRad);
  const wz = Math.sin(directionRad);
  const along = -Math.sin(yaw) * wx - Math.cos(yaw) * wz;
  const across = Math.cos(yaw) * wx - Math.sin(yaw) * wz;
  return Math.atan2(across, along);
}

async function start(): Promise<void> {
  const app = document.getElementById("app");
  const overlay = document.getElementById("fps");
  const hint = document.getElementById("hint");
  if (!app) throw new Error("Missing #app element in index.html");

  const params = new URLSearchParams(window.location.search);
  const gfx = await GameRenderer.create(app, { forceWebGL: params.get("gfx") === "webgl" });

  const map = DESERT_CANYON;
  const world = buildWorld(gfx.scene, map);
  const zone = map.zones[0];
  const input = new KeyboardMouseInput(gfx.canvas, zone.facingYaw);
  const player = new LocalPlayer(zone, world.grid);
  const breath = new Breath();
  const scope = new ScopeView(scopeZoomRange(map));
  const rangefinder = new Rangefinder({ grid: world.grid, walls: map.walls, rocks: map.rocks });
  const hud = new Hud(document.body, scope.range.levels);

  const matchSeed = randomSeed();
  const playerSeed = randomSeed();
  let simTime = 0;
  let zeroIndex: 0 | 1 | 2 | 3 = 0;
  let scoped = false;

  let frames = 0;
  let elapsed = 0;

  const loop = new FixedStepLoop(
    {
      update: (dt) => {
        const cmd = input.poll(dt);
        simTime += dt;
        scoped = cmd.scoped;
        zeroIndex = cmd.zeroIndex;
        player.update(cmd, dt);
        breath.update(cmd.holdBreath, cmd.scoped, dt);
        scope.update(cmd.scoped, breath.state.mode, dt);
        input.setLookScale(1 / scope.zoom);
        const actions = input.consumeActions(); // firing arrives in step 1d
        if (actions.cycleZoom) scope.cycleLevel();
        if (actions.zoomDelta !== 0) scope.changeLevel(actions.zoomDelta);
      },
      render: (alpha, frameSeconds) => {
        const amps = swayAmplitudes(player.posture, breath.state, false);
        const sway: AngleOffset = swayOffset(simTime, playerSeed, amps);
        player.applyToCamera(gfx.camera, alpha, sway);
        if (Math.abs(gfx.camera.fov - scope.fovDeg) > 1e-4) {
          gfx.camera.fov = scope.fovDeg;
          gfx.camera.updateProjectionMatrix();
        }
        world.update(gfx.camera.position);
        gfx.render();

        const wind = windSpeedAndDirection(simTime, matchSeed);
        let rangeM: number | null | undefined;
        if (input.localControls().rangefinder) {
          const eye = player.eyePosition(alpha);
          const aim = directionFromYawPitch(player.yaw + sway.yaw, player.pitch + sway.pitch);
          rangeM = rangefinder.read(eye, aim, simTime, matchSeed).distanceM;
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
        });

        if (hint) hint.hidden = input.isLocked();
        frames += 1;
        elapsed += frameSeconds;
        if (elapsed >= OVERLAY_REFRESH_S && overlay) {
          const fps = Math.round(frames / elapsed);
          const { drawCalls, triangles } = gfx.stats();
          overlay.textContent =
            `${gfx.backend} | ${fps} FPS | ${drawCalls} calls | ${triangles} tris | ` +
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
