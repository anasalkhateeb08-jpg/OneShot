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

## D-017 Phase 1 is delivered in five steps; new shared constants and breath.ts (ACTIVE)
The AI cannot run the 3D client in its own workspace, so phase 1 is split into steps that the
owner runs and verifies one by one:
1a shared simulation core (fully unit-tested), 1b world and renderer, 1c player, input, scope,
breath, rangefinder, HUD, 1d bullets, targets, sound, 1e quality presets, measurements, feel test.
Added constants not in Appendix B (first guesses, tune by playtesting):
`BALLISTICS.sightHeightM` 0.05, `SWAY` (base amplitude 3 mrad, breathing 1.2 mrad over 4 s,
frequencies 0.25 to 0.6 Hz, 0.25 s transitions), `AUDIO.speedOfSoundMps` 343.
Added `shared/src/breath.ts` (not in the master file list): the lung meter must be computed
identically by the server (which never trusts the client) and the client, so it lives in shared.
Integration method: Runge-Kutta 4 at 240 Hz (verified against an independent fine-step solver:
drop 0.663 m and drift 0.110 m in a 5 m/s crosswind at 300 m).

## D-018 Multiple maps and per-player zones (ACTIVE, owner directive 2026-11-22)
Maps: desert canyon first (phase 1 and 2), then jungle and city. Each map is a data definition
(terrain, props, two mirrored player zones, spawn points, lighting and atmosphere preset), so a
new map adds data and assets, not new game code. From step 1b the code reads the map through this
definition (`MapLayout`).
Player zones: each player moves only inside their own zone (sideways and forward/back). The zone
border is enforced by the shared movement code, so the server applies the same limit (anti-cheat).
Defaults chosen by the AI, to be tuned: zone 60 m wide and 30 m deep; zone centers at least
350 m apart (master section 9).
Map choice in real duels: random per match by the server, so the queues are not split further.
Jungle and city are built after phase 2 and before the online duel goes public; their exact phase
is set with the owner when we get there. Each map gets its own performance measurements.

## D-019 Terrain from a shared procedural height function, not an image file (ACTIVE)
Deviation from master section 9 ("a heightmap generated from an image file plus noise").
Each map defines `heightAt(x, z)` in shared code (deterministic noise plus shaped features:
canyon walls, plateaus for the zones, a broken mid ridge). Both client and server sample it into
the same 4 m grid (`buildHeightGrid`), the client renders exactly that grid, and collision uses
the same triangles (`sampleHeight`, `segmentTerrain`). Reasons: identical terrain on both sides
without shipping an image to the server, zero download size, and exact visual/collision match.
An artist-made heightmap image can still be added later as one more input to `heightAt`.

## D-020 Controls detail (ACTIVE)
"One key to return to standing" (master section 2) is X. Keys use physical codes (KeyW...),
so they work with Arabic and other keyboard layouts. Clicking the game captures the mouse;
Esc releases it. A short English dev hint shows how to start; it is replaced by localized UI
in phase 8.

## D-021 Phase 1b scene content (ACTIVE)
Desert canyon v1: 800 x 640 m terrain grid (4 m cells), distant scenery ring to 3.6 km under
the fog, procedural sky dome with sun glow and sun disk, one sun with a 2048 shadow map that
follows the player (60 m range), a hemisphere fill, 26 walls (ruined outpost, spawn covers,
zone low walls, scattered ruins), 110 rocks, 440 shrubs, all instanced. Surfaces use vertex
colors for now; photoscanned textures (D-014) replace them in step 1e, after we measure
performance with the plain version first.
