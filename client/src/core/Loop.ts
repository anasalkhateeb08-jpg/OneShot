/**
 * Fixed-step game loop (master prompt section 7).
 * Physics runs at a fixed rate; rendering happens once per animation frame
 * with an interpolation factor (alpha) between the last two physics states.
 */

export interface LoopCallbacks {
  /** One fixed physics step of exactly `dtSeconds`. */
  update(dtSeconds: number): void;
  /** Draw a frame. `alpha` is in [0, 1): how far we are toward the next physics state. */
  render(alpha: number, frameSeconds: number): void;
}

/** Tolerance for floating-point drift when comparing the accumulator with the step. */
const EPSILON = 1e-9;

export class FixedStepLoop {
  readonly stepSeconds: number;
  private readonly maxFrameSeconds: number;
  private accumulator = 0;
  private lastMs: number | null = null;
  private rafId: number | null = null;

  /**
   * @param callbacks update and render functions
   * @param hz physics steps per second
   * @param maxFrameSeconds a longer frame (tab hidden, debugger) is clamped to this,
   *   so the loop never spirals trying to catch up
   */
  constructor(
    private readonly callbacks: LoopCallbacks,
    hz: number,
    maxFrameSeconds = 0.25,
  ) {
    if (!(hz > 0) || !Number.isFinite(hz)) throw new Error(`Invalid loop rate: ${hz}`);
    this.stepSeconds = 1 / hz;
    this.maxFrameSeconds = maxFrameSeconds;
  }

  /**
   * Advance the loop to the timestamp `nowMs` (milliseconds).
   * Pure with respect to time: tests call it directly with fake timestamps.
   * @returns the number of physics steps that ran
   */
  tick(nowMs: number): number {
    if (this.lastMs === null) {
      this.lastMs = nowMs;
      this.callbacks.render(0, 0);
      return 0;
    }

    let frameSeconds = (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;
    if (!(frameSeconds > 0) || !Number.isFinite(frameSeconds)) frameSeconds = 0;
    if (frameSeconds > this.maxFrameSeconds) frameSeconds = this.maxFrameSeconds;

    this.accumulator += frameSeconds;
    let steps = 0;
    while (this.accumulator + EPSILON >= this.stepSeconds) {
      this.callbacks.update(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      steps += 1;
    }
    if (this.accumulator < 0) this.accumulator = 0;

    const alpha = Math.min(this.accumulator / this.stepSeconds, 1 - EPSILON);
    this.callbacks.render(alpha, frameSeconds);
    return steps;
  }

  /** Start driving the loop from the browser's animation frames. */
  start(): void {
    if (this.rafId !== null) return;
    const frame = (nowMs: number): void => {
      this.tick(nowMs);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  /** Stop the loop and forget timing, so a later start() does not jump. */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastMs = null;
    this.accumulator = 0;
  }
}
