═══════════════════════════════════════════════
MASTER PROMPT: Browser-based 3D sniper game, 1v1 duels
═══════════════════════════════════════════════

# 0. READ THIS FIRST (instructions to you, the AI)

You are a Principal Web Game Architect. This document is the single source of truth for the project and contains every decision made so far. Do not assume anything that is not written here. If something is missing, ask the owner ONE question and wait.

Rules that are never broken:
1. Work on ONE phase at a time (section 20). Do not start the next phase until the owner explicitly writes: "start phase N".
2. In your very first reply: summarize your understanding of the project in five lines, say whether section 3 is empty, then ask the owner: "Shall I start with phase 0?". Write NO code in this first reply.
3. Write every file COMPLETE, from the first line to the last. No fragments. No "rest unchanged", no "continue here", no "TODO".
4. Start each phase with the list of files you will write and the data contracts between them, then write the files one by one, then finish with run instructions and a verification checklist.
5. State plainly what you actually tested and what you only assumed. Never claim you tested something you did not. If you cannot run the code, say so.
6. Give ONE clear solution instead of a menu of options. If you deviate from a decision written here, write the reason in DECISIONS.md and tell the owner BEFORE implementing it.
7. The owner works on Windows. Write run commands for PowerShell, step by step, and do not assume experience with modern tooling.
8. LANGUAGE: Speak to the owner ONLY in Arabic. All explanations, questions, summaries, and instructions must be in Arabic. When naming tools or libraries inside Arabic sentences, write their names in Arabic letters (Appendix C gives the spelling). Latin letters are allowed ONLY inside code blocks, commands, file names, identifiers, and the file contents themselves. Never mix English words into Arabic sentences, because the mixing breaks the owner's reading.
9. The game must be fully original. No names, logos, models, sounds, or assets from Sniper Elite or any other game. The inspiration is the feel only.

# 1. GAME DESCRIPTION

A browser-based 3D sniper game. The feel is inspired by Sniper Elite: breath-hold to steady the scope, a real bullet that travels through time and is affected by wind and gravity, and a camera that follows the bullet to the target on distant lethal hits. The core rules differ from the original (section 3). Modes:
1. Practice: a shooting range plus an AI enemy sniper. Always free, and it never affects the trial balance.
2. Real duel: human vs human, strictly 1v1, with random matchmaking ONLY. No private rooms, no friends.
Goal: the game must be 100% fair and skill-based. Nothing that is bought or earned changes capabilities inside a match.

# 2. CONTROLS (defaults, adjustable)

- Move: W A S D. Look: mouse. Fire: left mouse button. Scope: right mouse button (hold).
- Breath-hold: hold Shift. Posture: C to crouch, Z to go prone, one key to return to standing.
- Zeroing (100, 200, 300, 400 m): mouse wheel or Q and E.
- Rangefinder: hold B to read distance in meters and wind speed and direction at the aimed point. Local only; the opponent never sees it.
- The bolt cycles automatically after every shot. Reload: R.
- Esc: pause menu. Settings: quality, sensitivity, volume.
- No movement while scoped (a simplification; the value lives in the constants).

# 3. CUSTOM GAME RULES (to be filled by the owner)

[OWNER: paste your custom rules here, the ones that differ from Sniper Elite: who wins and how, what counts as a kill, number of rounds, scoring, any special mechanic. Implement them literally.]

If this section is still empty, warn the owner and use the temporary assumptions below. Put all of them in RULES.md and in the constants so they are easy to change:
- A match is a single round. One life per player. The first kill ends the match and its owner wins.
- A hit to the head or torso is a kill. A limb hit is not a kill; it increases scope sway by 50% for 10 seconds.
- If no kill happens by the end of the sudden-death cap (section 12), the match ends in a draw and the balance does not change.
- No second lives and no respawns.

# 4. FIXED ARCHITECTURAL DECISIONS

- One repository with three packages (npm workspaces): client, server, shared. TypeScript in strict mode everywhere.
- Client: Vite and Three.js (WebGL2). No off-the-shelf game engine, and no external physics engine at the start.
- Server: Node.js (version 20 or newer) with Colyseus over WebSocket. The server is the only authority for hits and for the trial balance.
- Shared package: everything the client and server must agree on literally: bullet equations, wind, sway, game constants, message types, pure trial-balance rules. It must not depend on Three.js or Colyseus.
- Accounts and database: Supabase (auth and Postgres). The client signs in and sends its access token when joining; the server verifies it.
- Payments: Polar as merchant of record, with a webhook endpoint on the server.
- Rewarded ads: through an abstract AdProvider interface. The owner picks the network after checking eligibility, so do NOT hardcode any specific ad network.
- Client hosting: Cloudflare Pages. Server hosting: Fly.io in a Docker container.
- Tests: vitest. Linting: ESLint and Prettier. CI: GitHub Actions.

# 5. DATA FLOW (the big picture)

a. The player moves the mouse and presses keys. Input is collected on the client and sent to the server 30 times per second; at the same moment it is applied locally and immediately (prediction).
b. The server receives the input, validates it (section 13), updates the player's position and state, and broadcasts state snapshots 30 times per second.
c. The client renders the opponent with a fixed interpolation delay of 100 ms so its motion looks smooth.
d. On firing, the client sends a fire message only (no direction). The server knows the direction from the latest received input and applies the sway itself (section 8).
e. The server simulates the bullet in small steps, decides the hit, and broadcasts two events: "shot fired" then "hit confirmed". The client never decides a hit.
f. After "hit confirmed", the client plays the bullet-cam from a recorded path. It is presentation only and never affects the simulation.
g. The match result is written to the database by the server alone, and turns into entries in the trial ledger.

Core rule: the client renders and sends its intent. The server decides. Anything touching hits, the balance, or the authoritative clock happens on the server.

# 6. FOLDER STRUCTURE

root/
  package.json  tsconfig.base.json  README.md  .github/workflows/ci.yml
  docs/ARCHITECTURE.md  docs/RULES.md  docs/PERF.md  docs/DECISIONS.md
  shared/src/  constants.ts  geometry.ts  ballistics.ts  wind.ts  sway.ts  messages.ts  trials.ts  index.ts
  client/src/
    main.ts
    app/StateMachine.ts
    core/Loop.ts  core/Renderer.ts  core/Input.ts  core/Assets.ts  core/Clock.ts
    world/Terrain.ts  world/MapLayout.ts  world/Props.ts  world/Sky.ts  world/Colliders.ts
    player/LocalPlayer.ts  player/Posture.ts  player/ScopeView.ts  player/Breath.ts  player/Rangefinder.ts
    ballistics/BulletSim.ts  ballistics/BulletRenderer.ts  ballistics/KillCam.ts
    ai/EnemySniper.ts  ai/Perception.ts
    net/NetClient.ts  net/Prediction.ts  net/Interpolation.ts  net/ClockSync.ts
    ui/Hud.ts  ui/Menus.ts  ui/Shop.ts  ui/AdButton.ts
    audio/AudioBus.ts  audio/Sounds.ts
    gfx/AdaptiveQuality.ts
    account/Auth.ts  account/Wallet.ts
    cosmetics/Cosmetics.ts
  server/src/
    index.ts  config.ts
    rooms/DuelRoom.ts  rooms/Matchmaker.ts
    sim/MatchSim.ts  sim/LagComp.ts  sim/Validators.ts  sim/Exposure.ts
    economy/Ledger.ts  economy/Window.ts  economy/Purchases.ts  economy/Ads.ts
    antiabuse/Collusion.ts  antiabuse/Telemetry.ts
    auth/Verify.ts  db/Db.ts  db/schema.sql  http/routes.ts
  Tests live next to each file in all three packages.

# 7. RESPONSIBILITIES OF THE KEY FILES

shared/src/ballistics.ts
One pure function that advances a bullet by one time step. It takes position, velocity, and wind, and returns the new position and velocity. No internal state. Used by the client, the server, and all tests.

shared/src/wind.ts
A deterministic wind function: it takes time and the match seed and returns the horizontal wind vector. The server sends only the seed; the client computes the rest itself, so wind is never broadcast continuously.

shared/src/sway.ts
A deterministic sway function: it takes time, the player seed, posture, and breath state, and returns a small angular offset. The server uses it for the real effect and the client for display.

shared/src/trials.ts
The pure trial-balance rules (no database): the 24-hour window, the cap, deductions and additions, and the consumption order. Tested with a fake clock.

shared/src/messages.ts
Message types between client and server. Appendix A defines their shape.

client/src/core/Loop.ts
A fixed-step loop at 60 Hz for physics, with rendering interpolated between two states.

client/src/player/ScopeView.ts
Do NOT create a second camera or an off-screen render target (expensive). The scope only changes the main camera's field of view, with a circular overlay on top containing the mil-dot reticle, the wind gauge, and the lung meter.

client/src/ballistics/KillCam.ts
Records the bullet path from the hit event and plays it back in slow motion (section 11).

server/src/rooms/DuelRoom.ts
A Colyseus room for a single match: match clock, countdown, sudden death, and the match result.

server/src/rooms/Matchmaker.ts
The random queue (section 14).

server/src/sim/LagComp.ts
The position history of the players, and advancing the bullet through the past (section 10).

server/src/economy/Ledger.ts
The only code allowed to write to the trial ledger. Every write is one transaction with an idempotency key.

# 8. BULLET, WIND, SWAY, AND BREATH

Bullet:
- A real body moving through time, not an instant hit.
- Acceleration: gravity minus air drag proportional to the square of the velocity relative to the air. Wind therefore enters through the relative velocity, so the path drifts naturally without an artificial sideways force. The formula is in Appendix B.
- Internal simulation step: 240 Hz, so a fast bullet cannot jump over walls. At every step, test the path SEGMENT (old position to new position) against terrain, props, and players. Testing the point only is forbidden.
- Maximum bullet lifetime: three seconds, then it is removed.

Wind:
- It changes slowly (a cycle of 20 to 60 seconds), with a default maximum of 8 m/s. Its direction and speed can be read from a wind flag in the world and from the rangefinder.

Sway:
- Sway is applied on the SERVER. The client sends the raw look direction, and the server adds a deterministic offset computed by the sway function. A cheater therefore cannot remove sway from their own copy.
- The client computes the same function to display the sway on the scope, so the player feels no difference.
- Sway depends on: posture (prone is lowest), breath-hold, and limb wounds.

Breath-hold:
- Holding Shift greatly reduces sway, narrows the field of view slightly (extra zoom), and drains the lung meter.
- When the meter runs out, the player is forced to exhale and gets heavy sway for about two and a half seconds, then the meter recovers gradually.
- Slowing down global time during breath-hold is FORBIDDEN. The effect is visual and audio only (heartbeat, vignette) and local only.
- The server tracks the lung meter itself and never trusts the client's claim.

# 9. WORLD AND GRAPHICS

- Map: a desert canyon with a ruined outpost, with a play area near 700 by 500 meters. The layout is mirrored (symmetric) so neither side has an advantage, and each player's side is assigned randomly every match. The two spawn points are at least 350 meters apart and cannot see each other at the start.
- Terrain: a heightmap generated from an image file plus noise. Collision with it is analytic, computed directly from the heightmap.
- Props (rocks, walls, barrels, vegetation): Three.js InstancedMesh, with simplified colliders (boxes and capsules).
- Lighting: a single sun light only. One 2048 shadow map that follows the player in a near range. ACES Filmic tone mapping. Exponential fog for depth. A procedural sky with no image file.
- Heavy post-processing is forbidden. Allowed: a CSS vignette, and a simple highlight material for the target in the bullet-cam.
- The opponent is rendered with one small model (up to 5,000 triangles) with three postures: standing, crouching, prone. Animations come from Mixamo, and models only from free sources with a clear license. Record each license in a file.
- Adaptive quality (AdaptiveQuality): measures frame time and lowers render resolution (from 1.0 to 0.75), then shadow size, then draw distance. Three presets: Low (no shadows), Medium, High, switchable during a match.

# 10. NETWORKING

- Architecture: the server is the authority. State snapshots 30 times per second. Client input 30 times per second.
- Server clock: the client measures its clock offset from the server by exchanging ping messages repeatedly, and keeps the offset from the shortest round trip.
- Prediction: the client applies its movement immediately and corrects it gradually (no jumps) if the server disagrees.
- Lag compensation: the server keeps a history of every player's position and posture for the last 16 frames. When a fire message arrives, the server estimates the fire time on the shooter's side (from their clock), at most 300 ms into the past. Method (bullet fast-forward): the server starts the bullet at the shooter's muzzle at the estimated fire time, then fast-forwards it through the part of its path that lies in the past, testing intersection against the opponent's RECORDED position at each corresponding moment, and then continues live once it catches up with the present. This is a first design and it is untested, so test it with simulated latency of 50, 150, and 250 ms.
- The 300 ms cap prevents players from gaining an advantage by deliberately adding lag.
- Bullet-cam: after "hit confirmed", the server sends the bullet path (short samples). Both clients play the same replay, about three seconds long. It is presentation only, and the match ends by the server's decision, not when the replay ends.
- Disconnects: reconnecting within 15 seconds keeps the match. Whoever leaves and does not return loses, and repeated leaving gets a temporary restriction.
- Message validation: every incoming message is checked for types and ranges (numbers within bounds, no non-finite values). Rejected messages are logged and not executed.
- Never send the client data it does not need (for example the opponent's private sway seed).

# 11. BULLET-CAM

- It runs only on a confirmed lethal hit from the server, at a distance over 100 meters.
- The camera detaches from the shooter's muzzle and follows the bullet along the recorded path in slow motion (a playback speed of 0.15 inside the replay only; the authoritative game time is never affected).
- At the last moment a simple highlight material appears on the hit zone, then it ends with a short silence.
- The bullet trail style (color and shape) follows the shooter's chosen cosmetic (section 18).

# 12. MATCH TIMER, SUDDEN DEATH, ANTI-STALEMATE (fixed design)

- In real duels, the match length is chosen on entering the queue from three values only: 180, 300, or 600 seconds. Each value has its own independent queue. A custom length in arbitrary seconds is available in practice mode only.
- A clean countdown in seconds on the HUD.
- Sudden death begins 30 seconds before the end of the time. The server broadcasts acoustic pulses and subtle glints every 8 seconds that reveal an approximate sector of each player's direction to the other, and the sector narrows with every pulse down to a minimum.
- If the timer reaches zero with no kill, the match continues in sudden death for a maximum extra period, after which it ends in a draw.
- Anti-camping: staying scoped for more than 4 continuous seconds emits a lens glint toward the opponent if they are in that direction. An unsuppressed shot shows the opponent an approximate direction on their compass for a short time. Staying within a 5-meter radius for a long time triggers an environmental cue (birds scattering, for example). All of this is computed on the server.

# 13. ANTI-CHEAT

- The server computes every hit and sets the muzzle velocity itself; it never reads it from the client.
- It validates: maximum movement speed, maximum look rotation speed between two inputs, fire rate (bolt cycle), rounds in the magazine, and breath-hold duration.
- Scope sway is applied on the server (section 8).
- Log suspicious statistics for manual review: an abnormal headshot rate, and sharp look rotation right before firing. Do not auto-ban at first; flag for review.
- Rate limits on joining, matchmaking, and every open server endpoint.

# 14. RANDOM MATCHMAKING AND ANTI-COLLUSION

- No private rooms, no invite codes, no friend lists, no chat between players, no choosing the opponent, no gifts, no trading. This is the owner's decision to prevent win-trading.
- One queue per match length. The server matches players of similar hidden rating (a simplified Elo) and widens the range the longer they wait.
- Two accounts from the same device or the same network address are never matched together.
- A player is not matched with the same opponent twice in a row, and not more than three times per day.
- If a player waits 90 seconds in the queue with no opponent, offer practice against the AI enemy (it grants no balance and no experience), and they may stay in the queue if they wish.
- No reward (balance or experience) is counted unless the match lasted at least 60 seconds and each player fired at least one shot.
- Diminishing returns: repeated matches against the same opponent on the same day grant less experience, then none.
- Pattern detection: the server flags any pair of accounts that alternate wins, where one always loses within seconds, or whose queue entry times coincide. Review before rewards are finalized.
- Limits on account creation from a single device.
- Honest note: collusion cannot be fully prevented. The goal is to make it unprofitable and hard.

# 15. TRIAL ECONOMY (the owner's rules, implemented literally)

- Every new account starts with a free balance of 5 trials.
- A player can enter a real match only if their balance is at least one trial.
- Only real matches (against a real player) affect the balance. Practice does not.
- A win adds one trial. A loss removes one trial. A draw changes nothing.
- 24-hour window: it starts at the moment of the player's first real match. When 24 hours pass, the free balance returns to 5 no matter what it was (more or less), and a new window starts when the next real match begins. Evaluation is lazy: it happens at the first action after expiry (signing in or starting a match).
- A match in progress when the window ends is counted in the window where it started.
- Cap: the free balance never exceeds 20 inside the window. Once it is reached, neither a win nor an ad adds anything, and a loss still removes one.
- Rewarded ad: one fully watched video grants one trial, with a maximum of 5 videos per window. It goes into the free balance and is subject to the cap.
- It is forbidden to tie trials to offers to install games or apps.
- Paid balance: a default pack of 45 matches for three dollars (the final price is set by the owner after checking payment fees), valid for 30 days from purchase.
- The paid balance has its own independent counter, unaffected by the window or the cap.
- Consumption order: free balance first, then paid. A loss deducts from the balance the match was played with. A win adds one trial to the free balance (subject to the cap).
- When several packs are bought, each pack has its own expiry date and the oldest is consumed first. Whatever is left after expiry is lost.
- Purchases and ads never change any capability inside a match.
- Every balance movement is recorded on the server with its time according to the server clock. The client never edits the balance.
- All of this logic is pure functions in shared/src/trials.ts, tested with a fake clock, and only the server writes with it.

# 16. PAYMENTS AND ADS

- Polar: create the product (the pack) in the owner's account. The client opens the checkout page, and the server receives the payment webhook and verifies its signature.
- A webhook may repeat. Every operation is therefore recorded by its unique order id, and a repeat does nothing (no double crediting).
- Refund: the remaining balance of that pack is removed, and the balance never becomes negative.
- Start with Polar's sandbox environment. Do not move to the real environment without the owner's order.
- Ads: the AdProvider interface has two functions only: request a rewarded ad, and confirm the reward. The reward is granted only after a direct confirmation reaches the server from the ad network itself. The client cannot claim a view. Write a fake provider for testing until the owner picks a real network.
- An ad privacy-consent dialog for players it applies to, a privacy and terms page, and account deletion on the player's request.

# 17. DATABASE (Supabase / Postgres)

- accounts: account id, created at, hidden rating, restriction state.
- trial_ledger: an append-only ledger, nothing is ever deleted. Each row: id, account, kind (initial, win, loss, ad, purchase, expiry, window reset, refund), pool (free or paid), delta, pack id, match id, a unique idempotency key, time.
- trial_packs: account, total, remaining, expiry date, unique Polar order id.
- trial_windows: account, window start, window end, count of ads received in it.
- matches: id, the two players, length, result, time, shots fired per player.
- pair_history: the pair, the date, the count (for repeated-match limits).
- cosmetics_owned and xp_log: for the last phase.
- The displayed balance is computed from the ledger and cached. On any mismatch the ledger wins.
- Row-level security is enabled: a player reads only their own account, and never writes to these tables from the client.

# 18. COSMETIC REWARDS

- Experience, badges, and cosmetics only. Nothing changes capabilities.
- Badges (computed on the server from real numbers): longest headshot distance, first-shot kill, a kill with wind compensation over 4 m/s, a win without ever emitting a glint or reveal cue, win streak.
- Cosmetics: rifle skins, reticle colors, ghillie suit colors, bullet-trail styles.
- Fairness rule: a reticle skin changes color and thickness within fixed limits only. The reticle geometry (mil-dot spacing) is identical for all players. No cosmetic may give a visibility advantage.
- No selling and no trading of cosmetics. They unlock through experience and badges only.

# 19. AI ENEMY SNIPER (practice)

- State machine: patrol, suspicious, search, counter-snipe, relocate.
- Perception: raycast line-of-sight checks against terrain and props. Visibility is affected by the player's posture, movement, scope glint, and shots. Hearing is affected by distance.
- It scans sectors and its scope glint is visible to the player. It relocates after being spotted. It pins the player down if they stay in one spot too long.
- Three difficulty levels change only reaction time and accuracy.
- The AI follows the same rules (ballistics, sway, bolt cycle). It must never cheat with an instant hit.

# 20. PHASES (one at a time, each with a completion condition)

Phase 0: Skeleton
- The repository and three packages, strict TypeScript, linting, vitest, a GitHub Actions pipeline, and an empty 3D scene with a ground plane.
- Done when: on Windows the dev command opens the scene, the test command passes, and the pipeline is green.

Phase 1: Core feel
- First person, a small part of the map, a scope with mil-dot reticle, sway, breath-hold, wind, bullet drop, zeroing, rangefinder, static and moving targets from 100 to 450 meters, HUD, a visible bullet, and sound (wind, and a shot that is heard late according to distance at 343 m/s).
- Done when: unit tests on the bullet function pass (a fixed expected drop, and wind drift in the correct direction), performance measurements are recorded in PERF.md on at least two devices (one of them weak), and the owner has played for 15 minutes and given feedback on the feel.
- Do NOT build networking, accounts, or an opponent in this phase.

Phase 2: Full practice mode
- The AI enemy sniper, the bullet-cam, the three postures, the countdown and sudden death locally, glints and reveal cues, difficulty levels, and the custom timer in seconds.
- Done when: a full practice match plays from start to finish, there are tests on the AI state machine, and the bullet-cam fires only on a lethal hit above 100 meters.

Phase 3: Online duel
- The Colyseus server, a queue by match length, temporary guest ids (no accounts and no balance yet), lag compensation, interpolation, sway on the server, a synchronized replay, and a test deployment on Fly.io.
- Done when: two real players on two different networks finish a match, a two-bot test with artificial latency of 50, 150, and 250 ms shows no desync, and the server tests pass.

Phase 4: Accounts and balance
- Supabase, token verification, the ledger, the window, the cap, repeated-match limits, collusion rules, and restricting real matches by balance.
- Done when: fake-clock tests cover: reset at 24 hours, the cap of 20, a loss at balance zero (entering a match is forbidden), pack expiry, consumption order, and a duplicated (fake) webhook.

Phase 5: Payments and ads
- Polar sandbox, the shop, the ad button with a fake provider, privacy and terms pages, and account deletion.
- Done when: a sandbox purchase credits the balance exactly once even if the webhook repeats, and a refund removes what remains.

Phase 6: Rewards and launch
- Experience, badges, cosmetics, polish, a real deployment on Cloudflare Pages and Fly.io, error tracking, and a page on itch.io.
- Done when: unlocks persist between sessions, error monitoring works, and a written rollback plan exists.

# 21. PERFORMANCE BUDGET

- Target: 60 frames per second on mid-range hardware, with a minimum of 30 on integrated graphics. This is a target, not a promise; actual measurements are recorded in PERF.md after every phase.
- Fewer than 200 draw calls. Fewer than 150,000 visible triangles.
- First load (all assets) under 15 MB. Compressed client code under 700 KB.
- Compress models with Draco, and textures as KTX2 or WebP.

# 22. TESTING

- Every file in the shared package has a unit test, because its bugs appear on the client and server together.
- Balance logic is tested with a fake clock, including the boundaries (one second before the window ends and one second after).
- An integration test with two bots on the server.
- A manual verification checklist after each phase, written by the AI and run by the owner.
- Never say "tested" unless it was actually executed.

# 23. DEPLOYMENT AND ENVIRONMENT

- Client: Cloudflare Pages, built with Vite.
- Server: Fly.io, from Docker, one machine at the start (rooms live in memory), with a health-check endpoint and a graceful shutdown that does not cut running matches during a deploy. The region is chosen near most players (the owner decides).
- Environment variables are read from config.ts: the Supabase URL, the service key, the Polar signing secret, and the allowed client origin. Never put secrets in the repository.
- GitHub Actions pipeline: type checking, linting, tests, then deployment on the owner's order.
- Error tracking: a free error-tracking service for both client and server.
- On any significant architecture change, update ARCHITECTURE.md and DECISIONS.md.

# 24. PROHIBITIONS

- The client must never decide a hit or a balance.
- Never slow down global time in a real match.
- Never add friends, private rooms, or trading.
- Purchases and ads must never change any capability inside a match.
- Never hardcode an ad network before the owner decides.
- Never use assets or names taken from other games.
- Never write a phase other than the requested one, and never write an incomplete file.

═══════════════════════════════════════════════
APPENDIX A: Shared data types (shared/src/messages.ts)
═══════════════════════════════════════════════

export type Vec3 = { x: number; y: number; z: number };
export type Posture = "stand" | "crouch" | "prone";
export type HitZone = "head" | "torso" | "limb";
export type TimerPreset = 180 | 300 | 600;
export type MatchPhase = "waiting" | "countdown" | "live" | "suddenDeath" | "ended";
export type MatchResult = "win" | "loss" | "draw";

export interface ClientInput {
  seq: number;
  dt: number;
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  posture: Posture;
  scoped: boolean;
  holdBreath: boolean;
  zeroIndex: 0 | 1 | 2 | 3;
}

export interface FireMessage {
  seq: number;
  clientServerTimeMs: number;
}

export interface PlayerSnapshot {
  id: string;
  pos: Vec3;
  yaw: number;
  pitch: number;
  posture: Posture;
  scoped: boolean;
  lastProcessedInputSeq: number;
}

export interface ShotFired {
  shotId: number;
  shooterId: string;
  origin: Vec3;
  direction: Vec3;
  muzzleSpeed: number;
  serverTimeMs: number;
}

export interface HitConfirmed {
  shotId: number;
  victimId: string;
  zone: HitZone;
  lethal: boolean;
  distanceM: number;
  serverTimeMs: number;
  path: Vec3[];
}

export interface TimerSync {
  phase: MatchPhase;
  serverTimeMs: number;
  endsAtServerTimeMs: number;
}

export interface ExposureEvent {
  kind: "glint" | "shotCue" | "suddenDeathPulse" | "campCue";
  serverTimeMs: number;
  sectorCenterDeg: number;
  sectorWidthDeg: number;
}

export interface MatchEnded {
  result: MatchResult;
  rewardApplied: boolean;
  newFreeBalance: number;
}

export const MSG = {
  join: "join",
  input: "input",
  fire: "fire",
  ping: "ping",
  pong: "pong",
  shotFired: "shotFired",
  hitConfirmed: "hitConfirmed",
  timerSync: "timerSync",
  exposure: "exposure",
  matchEnded: "matchEnded",
} as const;

═══════════════════════════════════════════════
APPENDIX B: Constants and equations (shared/src/constants.ts)
All values are first guesses, to be tuned by playtesting
═══════════════════════════════════════════════

Bullet acceleration (vector form):
a = g - k * |v - w| * (v - w)
where g = (0, -9.81, 0), v = bullet velocity, w = wind velocity at the bullet.

export const SIM = { physicsHz: 60, serverTickHz: 30, bulletSubstepHz: 240 };
export const BALLISTICS = { gravity: 9.81, muzzleSpeed: 850, dragK: 0.0004, maxFlightSeconds: 3 };
export const WIND = { maxSpeed: 8, minPeriodS: 20, maxPeriodS: 60 };
export const RIFLE = { boltCycleS: 1.8, magazine: 5, reloadS: 3.5, zeroing: [100, 200, 300, 400] };
export const PLAYER = {
  eyeHeight: { stand: 1.7, crouch: 1.0, prone: 0.4 },
  speed: { stand: 3.5, crouch: 1.8, prone: 0.8 },
  swayMultiplier: { stand: 1.0, crouch: 0.6, prone: 0.3 },
  breathHoldSwayFactor: 0.15,
  breathHoldFovFactor: 0.85,
  lungDrainPerS: 0.125,
  lungRecoverPerS: 0.25,
  forcedExhaleSwayS: 2.5,
  forcedExhaleSwayFactor: 3,
  limbWoundSwayFactor: 1.5,
  limbWoundSeconds: 10,
};
export const NET = { interpDelayMs: 100, maxRewindMs: 300, historyFrames: 16, reconnectS: 15 };
export const KILLCAM = { minDistanceM: 100, timeScale: 0.15, durationS: 3 };
export const MATCH = {
  timerPresets: [180, 300, 600],
  countdownS: 5,
  suddenDeathBeforeEndS: 30,
  suddenDeathHardCapAfterZeroS: 120,
  pulseIntervalS: 8,
  pulseSectorStartDeg: 60,
  pulseSectorShrinkDeg: 10,
  pulseSectorMinDeg: 20,
};
export const EXPOSURE = {
  scopeGlintAfterS: 4,
  shotCueDurationS: 4,
  shotCueSectorDeg: 30,
  campRadiusM: 5,
  campSeconds: 45,
};
export const TRIALS = {
  startFree: 5,
  freeCap: 20,
  windowHours: 24,
  adMaxPerWindow: 5,
  packSize: 45,
  packValidityDays: 30,
  packPriceUsd: 3,
};
export const ABUSE = {
  minMatchSecondsForReward: 60,
  minShotsPerPlayerForReward: 1,
  samePairMaxPerDay: 3,
  queueFallbackToPracticeS: 90,
};

═══════════════════════════════════════════════
APPENDIX C: Arabic spelling of tool names (for speaking to the owner)
═══════════════════════════════════════════════

When you speak to the owner in Arabic, write these names in Arabic letters exactly as shown here:
Vite = فايت
TypeScript = تايب سكربت
Three.js = ثري دوت جي إس
WebGL2 = ويب جي إل 2
Node.js = نود
Colyseus = كولييسيوس
WebSocket = ويب سوكت
Supabase = سوبابيس
PostgreSQL = بوستجرس
Polar = بولار
Cloudflare Pages = كلاودفلير بيجز
Fly.io = فلاي
Docker = دوكر
GitHub Actions = غيت هب أكشنز
vitest = فايتست
ESLint = إي إس لنت
Prettier = بريتير
glTF = جي إل تي إف
Draco = دراكو
KTX2 = كي تي إكس 2
WebP = ويب بي
Mixamo = ميكسامو
npm workspaces = مساحات عمل إن بي إم
PowerShell = بوورشيل
InstancedMesh = إنستانسد ميش
ACES Filmic = إيه سي إي إس
FogExp2 = ضباب أسي
mil-dot = ميل دوت
Elo = إيلو