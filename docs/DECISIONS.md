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

## D-022 Scope, breath, rangefinder details (ACTIVE)
- Scope: 10x magnification (unscoped vertical FOV 70 degrees, scoped about 8 degrees), done by
  changing the main camera's FOV only (master section 7). Breath-hold narrows it by
  `PLAYER.breathHoldFovFactor`. Mouse sensitivity is divided by the current zoom.
- Mil-dot reticle drawn in milliradian units with the view box set from the live FOV, so 1 mil
  on the reticle is exactly 1 milliradian in the world at any zoom (first focal plane).
  5 dots each way, 0.25 mil dots. Identical for every player.
- Breath-hold works only while scoped (the server will apply the same rule).
- Sway is applied to the view at all times (barely visible unscoped, clear in the scope).
- Rangefinder (hold B): distance to the aimed point up to 1500 m plus wind speed and direction.
  The wind gauge in the scope shows the wind relative to where you look.
- New constants `SCOPE` and `RANGEFINDER`. HUD text is English developer text until phase 8.

## D-023 Variable scope zoom with a map-derived minimum (ACTIVE, owner directive 2026-11-23)
The player chooses the scope zoom: V cycles the levels, the mouse wheel steps up and down.
Owner rule: even the LOWEST zoom shows at most HALF of the enemy zone's width through the lens,
never all of it. The range is computed from each map (`scopeZoomRange`): lowest = the zoom at
which the lens circle covers half the enemy zone width at the zone-to-zone distance; highest =
1.75 x lowest; 4 geometric levels. Desert canyon (400 m, 60 m zones): 17x, 21x, 25x, 30x.
Replaces the fixed 10x of D-022.
Deviation from master section 2: zeroing moves to Q and E only (the wheel now zooms).

## D-024 Stronger posture effect on sway (ACTIVE, owner directive 2026-11-23)
`PLAYER.swayMultiplier` changed from stand 1.0 / crouch 0.6 / prone 0.3 to
stand 1.0 / crouch 0.5 / prone 0.15: a prone body pressed to the ground barely sways.
The price of going prone is natural, from the geometry: the eye drops to 0.4 m, so rocks,
ridges, and low walls hide the enemy from many prone spots (and the player moves at 0.8 m/s).
Every posture has a cost.

## D-025 Desert cover is natural only (ACTIVE, owner directive 2026-11-23)
Walls in the open desert look fake. All desert cover now comes from the desert itself:
a big boulder group in front of each spawn, low boulders inside each zone, a central rock
formation (replaces the "ruined outpost" of master section 9), 7 rock outcrops, 9 sand dunes
(2.5 to 6 m, mirrored), and scattered rocks: 180 rocks in total, all mirrored.
Rocks now use ELLIPSOID colliders (wide and low like real boulders), and the visual rock shape
is scaled to the same ellipsoid (surface noise at most 12%), so what you see stops the bullet.
Walls stay available for maps that need them (the city map).

## D-026 Wider scope zoom range and a zoom ladder (ACTIVE, owner directive 2026-11-23)
Replaces the "half the enemy zone" rule of D-023: the LOWEST zoom now shows the WHOLE enemy
zone width and no more (owner choice). Highest = 3.5 x lowest, 6 levels.
Desert canyon: 8.6x, 11x, 14x, 18x, 23x, 30x.
A vertical zoom ladder sits on the black area beside the lens: one step per level with its
magnification, lowest at the bottom; steps up to the selected level turn green, the rest stay
white. V cycles, the mouse wheel steps up and down.

## D-027 Firing, bullets, targets, and sound (ACTIVE, phase 1d)
- Rifle state (`shared/src/rifle.ts`): 5 rounds, 1.8 s bolt cycle, 3.5 s reload (R).
  Shared so the server enforces the same fire rate and magazine.
- Launch (`launchState`): the bore sits 5 cm below the eye and is tilted by the zero angle;
  aim = raw look + the deterministic sway at the moment of firing (the server will do this
  part in duels).
- Every bullet substep (240 Hz) tests its path SEGMENT against terrain, rocks, walls, and
  bodies (`traceSegment`, `segmentHitbox`). Max flight 3 s.
- Human hitbox (`shared/src/hitbox.ts`): oriented ellipsoids per posture (head, torso, limbs).
  Head or torso = lethal (temporary rule, master section 3).
- Practice targets: 7 human-size targets at 100, 200, 250 (walking), 300 (crouched),
  350 (jogging), 400, and 450 m (prone). Their visual shapes ARE the hitbox shapes.
  A lethal hit drops the target for 3 s; a red mark shows where the bullet hit.
- Visible bullet: a glowing streak along the velocity, widened with distance so it stays
  visible; impact puffs (sand, rock chips, blood).
- Sound: made procedurally in code (no audio files): shot, bolt, reload, dry fire, impacts,
  heartbeat while holding the breath, and a wind bed that follows the wind speed. Impact
  sounds are delayed by distance / 343 m/s. The opponent's delayed shot sound arrives with the
  AI enemy (phase 2) and online play (phase 3).
- Recoil is a visual kick of the view (it does not move the aim of the shot already fired).

## D-028 Green impact dot and training guide: PRACTICE ONLY (ACTIVE, owner decision 2026-11-23)
In practice mode the scope shows a green dot where the bullet will land at the aimed distance,
including wind and drop (`predictImpact`, in mils). A coach line under the lens explains the hold
("distance 312 m, wind 2.3 m/s from the left, hold 0.4 mil left and 1.2 mil up"), and a lesson
panel teaches step by step: scope and breath, distance and zeroing, drop, reading the wind, how
much to hold, moving targets, and what changes in a duel (H show/hide, N next, P previous).
Arabic and English drafts, NOT reviewed by a native editor; they move into the localization
system in phase 8.
Real duels have NO dot and NO coach: the player reads wind and drop alone (VISION pillar 4,
add-on A6 "no aim assist"). The dot does not account for target movement.

## D-029 Drag tuned for meaningful wind (ACTIVE, playtest tuning 2026-11-23)
`BALLISTICS.dragK` 0.0004 -> 0.00085 (Appendix B values are first guesses to tune).
With 0.0004 a 5 m/s crosswind moved the bullet only 11 cm at 300 m, so wind barely mattered.
With 0.00085 (close to a real .308): speed at 300 m 659 m/s, drop 0.73 m, drift 25 cm at 300 m
in 5 m/s (0.8 mil), 92 cm at 450 m in 8 m/s (2 mil). Reading the wind now matters.
Reference values re-verified against the independent fine-step solver. Revert = one constant.

## D-030 Step 1e part 1: real assets pipeline, quality presets, glowing dot (ACTIVE)
- `npm run assets` (tools/assets/fetch-assets.mjs) downloads CC0 assets from Poly Haven through
  its public API: ground texture `sandy_gravel_02` (color, normal, roughness, 1k) and three
  photoscanned desert boulders (`namaqualand_boulder_02/03/05`), simplified to about 300
  triangles each with meshoptimizer (the normal map keeps the surface detail), saved as .glb
  in client/public/assets with a manifest. docs/ASSET_LICENSES.md is regenerated by the script.
  If assets are missing the game falls back to the procedural look and still runs.
- Rock models are normalized to a unit shape and scaled to each rock's collider ellipsoid.
  Rocks within 90 m of the player's zone cast shadows; far rocks do not (saves triangles).
- Terrain uses the ground texture with world-space tiling every 6 m; vertex colors only tint
  it (rock tint on steep slopes, large-scale variation against visible repetition).
- Quality presets Low / Medium / High (`client/src/gfx/Quality.ts`), automatic by measured
  frame rate (two slow 2 s windows: one step down; three fast windows: one step up). F9 cycles
  by hand (turns auto off); `?q=low|medium|high` in the URL forces a preset. Medium and High
  are identical until post-processing arrives in step 1e part 2.
- Practice impact dot: fluorescent green with a pulsing halo, fixed on-screen size at any zoom
  (owner request).
- New dev dependencies: @gltf-transform/core, @gltf-transform/extensions,
  @gltf-transform/functions, meshoptimizer (asset build only, not shipped to players).

## D-031 .. D-034 (owner feedback after step 1e part 1)

- **D-031 Rocks are solid for the player.** The player cannot walk into a rock; movement pushes
  the body (radius 0.4 m) out of every rock ellipsoid and slides along it. Done in shared
  `stepMovement` so the server applies the same rule. Rocks always stop bullets.
- **D-032 Broken wooden crates (planned).** Crates are hiding places. A bullet passes through a
  crate and loses about a third of its speed (dust and splinters); rocks stop bullets. Cover is
  concealment for crates and protection for rocks. Not built yet.
- **D-033 Fuller environment and visible zone boundary (planned).** More rocks, plants, debris
  and crates (instanced, simplified with distance, to stay under 150k triangles). The zone edge
  gets a visible marker (stakes and rope or lined stones) plus a warning near the edge, so
  players and spectators see that both are confined.
- **D-034 Aim arc (planned).** Aiming is limited to a front arc toward the enemy zone (about
  120 degrees, 60 each side). No 360-degree turning.

- **D-035 Creeping while scoped (replaces master section 2 "no movement while scoped").**
  The player may move with the scope up, in any posture, at 25% of the posture speed
  (`SCOPE.creepSpeedFactor`): prone 0.2 m/s, crouch 0.45 m/s, standing 0.875 m/s. Creeping
  doubles the scope sway (`PLAYER.creepSwayFactor`), so the player must stop and breathe before
  a precise shot. Reason (owner): a prone player scans and shifts slowly to the side to see the
  enemy gradually. Shared `stepMovement`, so the server applies the same rule.

- **D-032 / D-033 built (step 1f).** Broken wooden crates in loose rows ("ruined yard"): one row
  inside each zone (spawn lane kept free) and six rows across the midfield, with gaps, single
  low crates (exposed) and stacked crates (hiding). Everything is mirrored through the map
  center, so each player sees the same yard the other player sees. Bullets pass through crates
  (they keep 67% of their speed, `CRATE.speedKeep`, once per crate) and throw splinters; rocks
  still stop bullets. Crates block walking like rocks. The rangefinder sees crates. Crates are
  drawn as instanced boxes with a canvas-drawn plank texture; broken ones are darker with a
  loose plank beside them. Still to do from D-033: visible zone-edge markers and the aim arc
  (D-034).

- **D-036 See-through bullet holes and visible crates (owner feedback).** A bullet that crosses a
  crate leaves a hole in the entry face and in the exit face (about 7 cm, larger than a real
  bullet so it is visible at range). The holes are real gaps (alpha test), so whatever stands
  behind the crate can be seen through them. A crate that is shot is swapped for its own mesh
  with its own small textures (at most 80 crates at a time). The holes are cosmetic: hits and
  speed loss stay in the shared simulation. In online duels (phase 3) the server will send each
  crate hit so both players see the same holes. Crates were redrawn pale, with a dark frame and
  a diagonal brace, because the first dark wood looked black at range.

- **D-037 Rotating wood impact effects (owner idea).** Five wood impact effects take turns: dust
  puff, splinter burst, spark flash, chip spray, rising dust ring. The active one changes every
  second (`IMPACT_EFFECTS`, `activeImpactEffect(simTime)` in shared); a bullet that hits a
  crate plays the effect that is active at that moment, at the entry and the exit hole. The
  index depends only on simulation time, so in online duels everyone agrees on it. Only wood
  has this for now; rock, ground and body keep one effect each.

- **D-038 Rocks collide with their real shape for shooting (owner feedback).** The rock
  collider used to be an ellipsoid, so a fat invisible blob could stop a bullet or laser in a gap
  that looked open, and open gaps between rocks are exactly where a sniper sets up. Now bullets,
  the rangefinder, and line of sight test the rock's own triangles (the same simplified mesh that
  is drawn, 300 to 405 triangles per rock), moved by the rock's scale, turn, and position. The
  ellipsoid stays as the fallback when no rock model is loaded, and for walking (player
  collision still uses it; to be refined if it shows invisible walls). The server will need the
  same triangle lists in phase 3 (to be exported to a data file then). The practice dot also
  works at any distance beyond 3 m (it was 20 m, which hid it in tight spots).

- **D-039 Downloaded assets stay out of Git.** `client/public/assets/` is in `.gitignore`
  (about 10 MB, regenerated by `npm run assets`). A deploy build must run `npm run assets`
  first; the license list stays in `docs/ASSET_LICENSES.md`.
- **D-040 Scope zoom changes only while scoped (owner request).** The mouse wheel and V change
  the zoom level only while the right mouse button is held. Wheel turns and V presses made
  without the scope up are ignored, so the zoom you chose is exactly what you get when you
  raise the scope.

- **D-041 Lighter scoped recoil (owner request).** The view kick after a shot was a fixed 2
  degrees, which threw the picture across most of the lens at high zoom. Scoped, it is now 8%
  of the current field of view (the same look on screen at every zoom); unscoped it is
  unchanged. Visual only: the bullet leaves before the kick and is not affected.

- **D-042 Sound by distance, and wood sounds like wood (owner feedback).** Every impact heard at
  a distance is low-passed: the cutoff falls from 16 kHz up close to 900 Hz at long range
  (`16000 / (1 + d / 40)`), on top of the existing delay and volume fade, so a crate at 300 m
  sounds dull and a crate in front of you sounds sharp. Bullets through crates now play a new
  wood sound (thump, hollow knock, splinter crackle) instead of the rock sound, which sounded
  like a bullet on sheet metal.
- **D-043 Rocks keep their natural proportions (owner feedback).** The photoscanned rocks were
  stretched on every axis to fill the collider box, which turned them into flat plates with
  smeared textures. Now both horizontal axes share one scale, and the height is mostly the
  rock's own height (75% natural, 25% from the map data, `rockHalfHeight` in shared). Collision
  uses the same scale. The rock models are still low-detail (300 to 405 triangles); a higher
  detail level for rocks near the player is the next step if they still look poor.

- **D-044 Smooth rocks in three detail levels (owner feedback: "stone-age 3D").** The first
  rock models were cut down to 300 triangles, which made them angular with dark faces. The
  asset script now builds three levels from each scan: about 2500 triangles (rocks within 90 m
  of the player's zone, with shadows, and used for exact collision), 700 (90 to 200 m), and 150
  (beyond 200 m). Only the detailed file carries the textures; the others share its material
  and are normalized with the same frame. Cost: about 92k triangles for rocks instead of 54k,
  so the scene is near 195k triangles on High/Medium (budget was 150k). To do: the Low preset
  should use the middle level for near rocks. Needs `npm run assets` to be run again.
- **D-042 follow-up.** Distance muffling is steeper (`14000 / (1 + d / 25)`, floor 500 Hz) and
  the wood sound has a bright snap at the start that only close impacts keep.

- **D-045 Professional asset pipeline with Blender (SUPER HIGH PRO).** The first rocks were cut
  from about 180000 triangles to 300, which cannot look good. The pipeline now is: download the
  ORIGINAL Poly Haven model (CC0, 2k textures) into `.assets-src/`; Blender (portable 5.2.4 in
  `F:\Tools`, run without a window) makes three levels of detail with the Decimate modifier,
  BAKES the surface detail of the original into a normal map for the closest level (the method
  AAA games use), exports glb files into `.assets-pro/`, and renders a preview picture (original
  against game-ready) that the owner checks before anything enters the game. Tools:
  `tools/make-rock.ps1`, `tools/blender/make_rock.py`, `tools/assets/fetch-sources.mjs`,
  `tools/install-blender.ps1`. Candidate models are listed in `docs/POLYHAVEN_MODELS.md`
  (`npm run assets:list`). Chosen first: Namaqualand boulders for rocks (arid South African
  scans), Poly Haven wooden crates, military crates, barrels and dry plants next.

- **D-046 Megascans as the main source of rocks and environment (SUPER HIGH PRO, owner
  approved).** Epic made the full Quixel Megascans library free again on Fab in November 2026,
  under the Fab Standard License (any engine, commercial use, no standalone redistribution of
  the assets). Megascans is the AAA photoscan library and has a consistent desert set ("Desert
  Western") with real cover sizes, so it replaces Poly Haven as the first choice; Poly Haven
  stays as a fallback. The owner downloads each asset once from Fab ("fbx, High quality" zip:
  game mesh plus 4K BaseColor, Roughness, Normal, AO). `tools/make-megascans.ps1` finds the
  zips in Downloads and runs the same Blender tool (`make_rock.py`, now also reading .fbx with
  loose textures): three levels (3000 / 800 / 200 triangles), normal map baked from the High
  mesh at 2048 px, textures limited to 2048 px, ambient occlusion exported to glTF, preview on
  the Desktop. Fab files stay out of Git (`.assets-src/`, `.assets-pro/`). Assumptions not yet
  tested: the normal maps are OpenGL style (`-FlipGreen` if the preview lighting looks
  inverted); the web build ships modified, incorporated copies, which is the usual reading of
  "incorporated into a project" but has not been checked by a lawyer. Next for the web budget:
  KTX2 textures and meshopt geometry compression.

- **D-047 The Megascans rocks enter the game (owner approved the previews).** Three Desert
  Western rocks (Rock Medium 15, Cluster Rock Medium 05, Cluster Rock Large 05) replace the
  Poly Haven rocks as the map's three rock variants. `npm run assets:rocks`
  (`tools/assets/use-pro-rocks.mjs`) copies their three detail levels from `.assets-pro/` to
  `client/public/assets/rocks-pro/` and points the manifest at them; the game code that loads
  rocks, builds the 90 m / 200 m detail tiers and the exact triangle collision is unchanged.
  One fix in `Assets.ts`: the rock normals exported by Blender are kept instead of being
  recomputed, because the baked normal map was made against them (recomputing showed seams).
  `make-megascans.ps1` no longer reports Blender's normal log lines as a failure. Known limits:
  the near rock is 1.1 to 1.7 MB with JPEG textures (KTX2 compression is the next step);
  tangents are computed by the renderer, not exported (small shading difference, to revisit);
  a thin dark seam shows on one edge of Cluster Rock Large 05 (bake cage, to revisit).

- **D-048 Shadows that stay and are not black (owner feedback).** Three causes, three standard
  fixes. (1) Automatic quality switched between Low (no shadows) and Medium (shadows) every few
  seconds, so shadows appeared and vanished. Shadows are now on at every level (Low uses a 1024
  shadow map instead of 2048, and keeps the shrubs), and the automatic mode no longer
  ping-pongs: after a step down it needs 20 s of good frame rate to go back up, and a level it
  had to leave twice is not tried again. (2) The sky fill was too weak for the sun (0.55 against
  3.0), so shade was nearly black and the ground color was lost. Now 1.2 against 2.8: shade on
  flat sand is about 40% of full sun, as in a real clear desert. Full image-based sky lighting
  (environment map) is the higher quality ceiling and is planned after the props are done.
  (3) The shadow area moved with every step of the camera, which makes shadow edges crawl. It
  now moves in whole shadow-map pixels only (texel snapping), and covers 90 m around the
  player instead of 60 m.

- **D-049 In-game map editor; maps become hand-editable files (owner request).** Describing an
  exact layout in words cannot match placing things by hand, so the owner places props himself
  in an editor inside the game (the standard studio approach: what he sees is exactly what
  players see, with the same lighting, shadows and collision). Design agreed with the owner:
  press a key to enter edit mode with a free camera; click a prop to move, rotate or scale it
  with arrows; **D + left-drag duplicates** the prop (no side panels); the owner builds only
  his own half and the other half is ALWAYS the mirror through the map center, (x, z) ->
  (-x, -z), so both players see the same scene from their own side (fairness); one click saves
  the file into the project through the dev server. Step 1 (this patch): the props of the
  desert map now come from `shared/src/layouts/desert-canyon.json` (north half only, heights
  stored relative to the ground) through `shared/src/mapLayout.ts`, instead of being generated
  by code. The file was generated from the old code: the map is identical (largest difference
  0.5 mm). Steps 2 and 3: edit mode, then saving.
