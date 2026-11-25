/**
 * Graphics quality presets and automatic adjustment (master section 9, D-016:
 * every device runs at the best quality it can sustain). Gameplay is identical on every preset.
 * Pure logic, no rendering code, so it is unit-tested.
 */

export type QualityLevel = "low" | "medium" | "high";

export interface QualityPreset {
  /** Multiplier on the device pixel ratio (capped at 2). */
  resolutionScale: number;
  /** Sun shadow map size in pixels. Shadows are on at every level so they never pop (D-048). */
  shadowMapSize: number;
  shrubs: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { resolutionScale: 0.75, shadowMapSize: 1024, shrubs: true },
  medium: { resolutionScale: 1, shadowMapSize: 2048, shrubs: true },
  high: { resolutionScale: 1, shadowMapSize: 2048, shrubs: true },
};

export const QUALITY_ORDER: readonly QualityLevel[] = ["low", "medium", "high"];

const WINDOW_S = 2;
const DOWN_BELOW_FPS = 50;
const UP_ABOVE_FPS = 58;
const GOOD_WINDOWS_TO_UPGRADE = 3;
/** After a step down, going back up needs this many fast windows in a row (20 s). */
const GOOD_WINDOWS_AFTER_DROP = 10;
/** A level the device had to leave this many times is not tried again (no ping-pong, D-048). */
const MAX_DROPS_PER_LEVEL = 2;

/**
 * Measures frame times in 2-second windows. Two slow windows in a row lower the quality one
 * step; three fast windows in a row raise it one step. A manual choice turns auto mode off.
 */
export class AdaptiveQuality {
  level: QualityLevel;
  auto = true;
  private frames = 0;
  private time = 0;
  private slow = 0;
  private fast = 0;
  private droppedOnce = false;
  private readonly drops = new Map<QualityLevel, number>();

  constructor(
    initial: QualityLevel,
    private readonly apply: (level: QualityLevel) => void,
  ) {
    this.level = initial;
    apply(initial);
  }

  /** Call once per rendered frame with that frame's duration in seconds. */
  sample(frameSeconds: number): void {
    if (!this.auto || !(frameSeconds > 0)) return;
    this.frames += 1;
    this.time += frameSeconds;
    if (this.time < WINDOW_S) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (fps < DOWN_BELOW_FPS) {
      this.fast = 0;
      this.slow += 1;
      if (this.slow >= 2) {
        this.slow = 0;
        this.step(-1);
      }
    } else if (fps >= UP_ABOVE_FPS) {
      this.slow = 0;
      this.fast += 1;
      const needed = this.droppedOnce ? GOOD_WINDOWS_AFTER_DROP : GOOD_WINDOWS_TO_UPGRADE;
      if (this.fast >= needed) {
        this.fast = 0;
        this.step(1);
      }
    } else {
      this.slow = 0;
      this.fast = 0;
    }
  }

  /** Manual choice (settings or hotkey): applies it and turns automatic mode off. */
  set(level: QualityLevel): void {
    this.auto = false;
    this.level = level;
    this.apply(level);
  }

  /** Next level, wrapping around (hotkey). */
  cycle(): void {
    const i = QUALITY_ORDER.indexOf(this.level);
    this.set(QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length] ?? "medium");
  }

  private step(delta: number): void {
    const i = QUALITY_ORDER.indexOf(this.level) + delta;
    const next = QUALITY_ORDER[i];
    if (delta < 0) {
      this.drops.set(this.level, (this.drops.get(this.level) ?? 0) + 1);
      this.droppedOnce = true;
    } else if (next && (this.drops.get(next) ?? 0) >= MAX_DROPS_PER_LEVEL) {
      return;
    }
    if (next && next !== this.level) {
      this.level = next;
      this.apply(next);
    }
  }
}
