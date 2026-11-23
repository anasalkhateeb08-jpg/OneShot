/**
 * Game constants shared literally by client and server.
 * Source: master prompt Appendix B and add-on Appendix D.
 * All values are first guesses, to be tuned by playtesting.
 * Must not import Three.js, Colyseus, DOM, or Node APIs.
 */

export const SIM = { physicsHz: 60, serverTickHz: 30, bulletSubstepHz: 240 } as const;

export const BALLISTICS = {
  gravity: 9.81,
  muzzleSpeed: 850,
  /** Tuned in phase 1 (D-029): was 0.0004; 0.00085 gives realistic speed loss and wind drift. */
  dragK: 0.00085,
  maxFlightSeconds: 3,
  /** Height of the scope's line of sight above the bore axis (added in phase 1, D-017). */
  sightHeightM: 0.05,
} as const;

/**
 * Scope sway shape (added in phase 1, D-017). Final sway =
 * baseAmplitudeRad x posture multiplier x breath scale x wound factor.
 */
export const SWAY = {
  baseAmplitudeRad: 0.003,
  breathAmplitudeRad: 0.0012,
  breathCycleS: 4,
  minFreqHz: 0.25,
  maxFreqHz: 0.6,
  transitionS: 0.25,
} as const;

/**
 * Scope optics (added in phase 1c, D-022; variable zoom D-023, D-026). Mil-dot reticle:
 * 1 mil = 1 milliradian, identical for every player (master section 18).
 * The LOWEST zoom is derived from the map: through the lens the player sees at most
 * `maxViewOfEnemyZone` of the enemy zone's width (owner rule: the whole zone, no more).
 */
export const SCOPE = {
  unscopedFovDeg: 70,
  transitionS: 0.12,
  milDots: 5,
  /** The lens circle's diameter as a fraction of the screen height (matches the HUD). */
  lensFractionOfHeight: 0.92,
  maxViewOfEnemyZone: 1,
  /** Highest zoom = lowest zoom x this. */
  maxOverMinZoom: 3.5,
  zoomLevels: 6,
  /** Creeping while scoped moves at this fraction of the posture speed (D-035). */
  creepSpeedFactor: 0.25,
} as const;

/** Rangefinder (added in phase 1c, D-022). Local only; the opponent never sees it. */
export const RANGEFINDER = { maxRangeM: 1500 } as const;

/** Sound (added in phase 1, D-017). The shot is heard late by distance / speed of sound. */
export const AUDIO = { speedOfSoundMps: 343 } as const;

export const WIND = { maxSpeed: 8, minPeriodS: 20, maxPeriodS: 60 } as const;

export const RIFLE = {
  boltCycleS: 1.8,
  magazine: 5,
  reloadS: 3.5,
  zeroing: [100, 200, 300, 400],
} as const;

/** Wooden crates (D-032): a bullet passes through and keeps this fraction of its speed. */
export const CRATE = { speedKeep: 0.67 } as const;

export const PLAYER = {
  eyeHeight: { stand: 1.7, crouch: 1.0, prone: 0.4 },
  speed: { stand: 3.5, crouch: 1.8, prone: 0.8 },
  swayMultiplier: { stand: 1.0, crouch: 0.5, prone: 0.15 },
  /** Sway is multiplied by this while creeping with the scope up (D-035). */
  creepSwayFactor: 2,
  breathHoldSwayFactor: 0.15,
  breathHoldFovFactor: 0.85,
  lungDrainPerS: 0.125,
  lungRecoverPerS: 0.25,
  forcedExhaleSwayS: 2.5,
  forcedExhaleSwayFactor: 3,
  limbWoundSwayFactor: 1.5,
  limbWoundSeconds: 10,
} as const;

export const NET = {
  interpDelayMs: 100,
  maxRewindMs: 300,
  historyFrames: 16,
  reconnectS: 15,
} as const;

export const KILLCAM = { minDistanceM: 100, timeScale: 0.15, durationS: 3 } as const;

export const MATCH = {
  timerPresets: [180, 300, 600],
  countdownS: 5,
  suddenDeathBeforeEndS: 30,
  suddenDeathHardCapAfterZeroS: 120,
  pulseIntervalS: 8,
  pulseSectorStartDeg: 60,
  pulseSectorShrinkDeg: 10,
  pulseSectorMinDeg: 20,
} as const;

export const EXPOSURE = {
  scopeGlintAfterS: 4,
  shotCueDurationS: 4,
  shotCueSectorDeg: 30,
  campRadiusM: 5,
  campSeconds: 45,
} as const;

export const TRIALS = {
  startFree: 5,
  freeCap: 20,
  windowHours: 24,
  adMaxPerWindow: 5,
  packSize: 45,
  packValidityDays: 30,
  packPriceUsd: 3,
} as const;

export const ABUSE = {
  minMatchSecondsForReward: 60,
  minShotsPerPlayerForReward: 1,
  samePairMaxPerDay: 3,
  queueFallbackToPracticeS: 90,
} as const;

export const TOUCH = {
  minTargetPx: 48,
  fireButtonPx: 88,
  secondaryButtonPx: 64,
  stickDeadZone: 0.1,
  stickRadiusPx: 64,
  stickZoneWidthFraction: 0.4,
  layoutScaleMin: 0.7,
  layoutScaleMax: 1.4,
  mobilePixelRatioCapStart: 0.75,
  mobileDevicePixelRatioMax: 2,
  mobileTargetFps: 30,
  mobileTextureBudgetMb: 48,
  tutorialMaxSeconds: 90,
} as const;

export const VERSIONING = {
  shellBannerIntervalHours: 24,
  emailBatchSize: 50,
  emailBatchIntervalSeconds: 60,
  emailDryRunDefault: true,
} as const;

export const LANGUAGES = [
  "en",
  "zh-Hans",
  "hi",
  "es",
  "fr",
  "pt-BR",
  "ru",
  "ja",
  "de",
  "id",
  "tr",
  "ko",
  "it",
  "vi",
  "ar",
] as const;

export type LanguageCode = (typeof LANGUAGES)[number];

export const TEXT_EXPANSION_BUDGET = 1.35;
