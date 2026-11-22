import "./style.css";
import { SIM } from "@oneshot/shared";
import { GameRenderer } from "./core/Renderer";
import { FixedStepLoop } from "./core/Loop";
import { IdleInputSource } from "./core/InputSource";
import type { InputSource } from "./core/InputSource";

const OVERLAY_REFRESH_S = 0.5;

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app element in index.html");
const overlay = document.getElementById("fps");

const gfx = new GameRenderer(app);
const input: InputSource = new IdleInputSource();

let frames = 0;
let elapsed = 0;

const loop = new FixedStepLoop(
  {
    update: (dt) => {
      const cmd = input.poll(dt);
      gfx.applyLook(cmd.yaw, cmd.pitch);
    },
    render: (_alpha, frameSeconds) => {
      gfx.render();
      frames += 1;
      elapsed += frameSeconds;
      if (elapsed >= OVERLAY_REFRESH_S && overlay) {
        const fps = Math.round(frames / elapsed);
        const { drawCalls, triangles } = gfx.stats();
        overlay.textContent = `${fps} FPS | ${drawCalls} calls | ${triangles} tris`;
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
