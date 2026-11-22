# DECISIONS

Decisions made after the master prompt, or deviations from it. Newest last.
Status values: ACTIVE, PENDING OWNER APPROVAL, REPLACED.

## D-001 Project location (ACTIVE)
The project lives in `F:\OneShot` on the owner's PC.

## D-002 VISION.md and the feel gate (PENDING OWNER APPROVAL)
`docs/VISION.md` records the owner's directive: the feel of Sniper Elite (tension, breath,
nerves, competitiveness), on the web, for people who cannot buy or run the original.
Addition beyond the master prompt: the owner's "does it feel right" answer gates the end of
phases 1, 2, 3, and 7 (the master prompt asks for feel feedback in phase 1 only).

## D-003 Tool versions (ACTIVE, updated 2026-11-22)
Installed and verified on the owner's PC: TypeScript 5.9.3, Vite 7.3.8, Vitest 5.1.1,
three 0.178.0, ESLint 10.15.0, @eslint/js 10.0.1, typescript-eslint 8.73.0, Prettier 3.8.
History: first pinned Vitest ^3.2 and ESLint ^9; `npm audit` found 3 vulnerabilities
(2 critical) in Vitest's dependencies (tinypool, @vitest/mocker) and ESLint 9 is out of support,
so both were upgraded to latest (no `audit fix --force`). Result: 0 vulnerabilities, all checks pass.
TypeScript stays on 5.9 for lint-toolchain stability; revisit after phase 1.
Open item: npm 11 blocks esbuild's postinstall script (allowScripts); verify the build works.

## D-004 Shared package is consumed as TypeScript source (ACTIVE)
`@oneshot/shared` exports `./src/index.ts` with no build step. Vite and Vitest compile it directly.
The server's runtime strategy (bundling or Node's own TypeScript support) is decided in phase 3.

## D-005 Server in phase 0 is configuration only (ACTIVE)
No server run script until phase 3, when Colyseus arrives. Phase 0 typechecks and tests the
config loader only.

## D-006 Lighting: sun plus a hemisphere fill (ACTIVE, approved 2026-11-22)
Master section 9 says "a single sun light only". We use one directional sun (the only light that
casts shadows) plus one hemisphere fill light (no shadows, almost free) so shaded sides are not
pitch black. Approved by the owner as part of D-012 to D-016.

## D-007 CI runs on Node 26 (ACTIVE)
Matches the owner's machine (v26.13.1) to avoid "works on my machine" differences.

## D-008 Constants use `as const` (ACTIVE)
Values are exactly those of Appendix B and D; `as const` only makes them read-only and gives
exact types (for example, `RIFLE.zeroing` has exactly four entries for `zeroIndex` 0..3).

## D-009 Owner workflow tools (ACTIVE)
`tools/run.ps1` (run and copy output to clipboard), `tools/update-status.ps1` (status, progress
log, git checkpoint), `tools/make-handoff.ps1` with `tools/handoff.cmd` and the desktop icon
(new handoff file on the Desktop). Scripts are ASCII and print English, because Windows
PowerShell 5.1 and the console window handle Arabic poorly. Documents stay Arabic where the
owner reads them.

## D-010 LF line endings (ACTIVE)
`.gitattributes` forces LF (CRLF only for `.cmd`/`.bat`) so Prettier checks pass the same way
on Windows and in CI.

## D-011 Phase 0 dev overlay (ACTIVE)
A small corner overlay shows FPS, draw calls, and triangles. It is developer text, not player UI,
and will be removed or put behind a debug flag before localization (phase 8).

## D-012 Renderer: WebGPU with automatic WebGL2 fallback (ACTIVE, approved 2026-11-22)
Deviation from master section 4 ("Three.js (WebGL2)"). From phase 1 the client uses
`WebGPURenderer` from `three/webgpu` (automatic WebGL2 fallback) with TSL shaders, and three.js is
upgraded to the latest release. Reason: WebGPU now ships in Chrome, Edge, Firefox, and Safari
(including iOS 26 and Android 12+ Chrome). Risk: reports of higher CPU cost per draw call in some
three.js versions; it is MEASURED in phase 1 on the owner's PC and a weak device. If it is slower
for our scene, the WebGL2 path stays the default. The decision follows the measurements.

## D-013 Tiered post-processing (ACTIVE, approved 2026-11-22)
Deviation from master section 9 ("heavy post-processing is forbidden"). Allowed ONLY on the
High preset: ambient occlusion (GTAO), bloom (sun glare, scope glint), anti-aliasing (SMAA/TRAA),
color grading, dust and heat haze. Medium gets a light subset. Low and all phones: none (CSS
vignette only). Post-processing never changes gameplay information: a glint or a cue must be
equally visible on every preset (fairness).

## D-014 Photoscanned materials (ACTIVE, approved 2026-11-22)
Rocks, soil, and sand use real photoscanned PBR textures and models from free libraries with
fully open licenses (candidates: Poly Haven, ambientCG; license verified per asset before use and
recorded in ASSET_LICENSES.md). Compressed as KTX2, sizes per preset, within the load budget.

## D-015 Gaussian-splat horizon (EXPERIMENT, approved 2026-11-22)
Try a distant canyon backdrop rendered as 3D Gaussian splats (Spark library, MIT license) for
scenery only, never for collision or gameplay. Kept only if it fits the performance and load
budget on weak devices and is compatible with the chosen renderer; otherwise removed.

## D-016 Every device at its maximum (ACTIVE, approved 2026-11-22)
Owner directive: each device must run at the best quality it can sustain. AdaptiveQuality
measures frame time during play and moves between presets automatically (up as well as down);
the player can override in settings. Gameplay (ballistics, wind, sway, timings, visibility of
cues) is identical on every preset and device.
