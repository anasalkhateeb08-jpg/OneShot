# ARCHITECTURE

Full design: `MASTER_PROMPT.md` sections 4 to 7 and the add-on. This file tracks what EXISTS now.

## Packages (npm workspaces)

| Package | Path | Role | Depends on |
|---|---|---|---|
| `@oneshot/shared` | `shared/` | Pure, deterministic code both sides must agree on | nothing |
| `@oneshot/client` | `client/` | Vite + Three.js browser game | shared, three |
| `@oneshot/server` | `server/` | Authoritative server (Colyseus from phase 3) | shared |

Rule: `shared` never imports Three.js, Colyseus, DOM, or Node APIs.

## Data contracts that exist (phase 0)

- `shared/src/constants.ts`: Appendix B and D constants (`as const`).
- `shared/src/messages.ts`: Appendix A and D message types, `MSG` names.
- `client/src/core/InputSource.ts`: `InputSource { kind; poll(dt): ClientInput; dispose() }`.
  The game loop reads input ONLY through this interface.
- `client/src/core/Loop.ts`: `FixedStepLoop(callbacks, hz)`; `update(dt)` at a fixed 60 Hz,
  `render(alpha, frameSeconds)` once per animation frame.
- `server/src/config.ts`: `loadConfig(env): ServerConfig` (port, allowed origin, node env).

## Client frame flow (phase 0)

```text
requestAnimationFrame -> FixedStepLoop.tick(now)
  -> N x update(1/60): InputSource.poll(dt) -> GameRenderer.applyLook(yaw, pitch)
  -> render(alpha): GameRenderer.render() -> dev overlay (FPS, calls, tris)
```

## Scene (phase 0)

One sun (shadows, 2048 map), one hemisphere fill (see D-006), FogExp2, ACES Filmic tone mapping,
a 1200 m sand ground plane, and four instanced distance markers at 100, 200, 300, 400 m.

## Tooling

TypeScript strict (`tsconfig.base.json`), ESLint flat config (`eslint.config.js`), Prettier,
Vitest (tests next to each file), GitHub Actions (`.github/workflows/ci.yml`):
install, typecheck, lint, format check, test, build.
