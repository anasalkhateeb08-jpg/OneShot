import "./style.css";
import { DESERT_CANYON, SIM } from "@oneshot/shared";
import { FixedStepLoop } from "./core/Loop";
import { KeyboardMouseInput } from "./core/KeyboardMouseInput";
import { GameRenderer } from "./core/Renderer";
import { LocalPlayer } from "./player/LocalPlayer";
import { buildWorld } from "./world/MapLayout";

const OVERLAY_REFRESH_S = 0.5;

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

  let frames = 0;
  let elapsed = 0;

  const loop = new FixedStepLoop(
    {
      update: (dt) => {
        player.update(input.poll(dt), dt);
      },
      render: (alpha, frameSeconds) => {
        player.applyToCamera(gfx.camera, alpha);
        world.update(gfx.camera.position);
        gfx.render();
        if (hint) hint.hidden = input.isLocked();
        frames += 1;
        elapsed += frameSeconds;
        if (elapsed >= OVERLAY_REFRESH_S && overlay) {
          const fps = Math.round(frames / elapsed);
          const { drawCalls, triangles } = gfx.stats();
          overlay.textContent =
            `${gfx.backend} | ${fps} FPS | ${drawCalls} calls | ${triangles} tris | ` +
            `${player.posture} | x ${player.feet.x.toFixed(1)} z ${player.feet.z.toFixed(1)}`;
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
