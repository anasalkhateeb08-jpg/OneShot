import type { ClientInput, InputClass } from "@oneshot/shared";

/** Controls that stay on this device and are never sent to the server. */
export interface LocalControls {
  /** Rangefinder held (master section 2: local only, the opponent never sees it). */
  rangefinder: boolean;
}

/** One-shot actions since the last call (each press counts once). */
export interface InputActions {
  fire: boolean;
  reload: boolean;
  /** Scope zoom steps requested (+ more zoom, - less zoom). */
  zoomDelta: number;
  /** Cycle to the next scope zoom level. */
  cycleZoom: boolean;
}

/**
 * The ONLY way the game reads player input (add-on A1).
 * Keyboard/mouse (phase 1) and touch (phase 7) both implement this,
 * and the rest of the game never knows which one is active.
 */
export interface InputSource {
  readonly kind: InputClass;
  /** Continuous state for one fixed step; this is what goes to the server. */
  poll(dtSeconds: number): ClientInput;
  /** Local-only controls. */
  localControls(): LocalControls;
  /** Actions pressed since the previous call; calling clears them. */
  consumeActions(): InputActions;
  /**
   * Look sensitivity multiplier. The scope sets 1 / zoom so aiming stays precise
   * when zoomed (add-on 7.2 applies the same rule to touch).
   */
  setLookScale(scale: number): void;
  dispose(): void;
}

/**
 * Placeholder source: produces a neutral input every step.
 * Useful for tests and as a safe default.
 */
export class IdleInputSource implements InputSource {
  readonly kind: InputClass = "mouseKeyboard";
  private seq = 0;

  poll(dtSeconds: number): ClientInput {
    this.seq += 1;
    return {
      seq: this.seq,
      dt: dtSeconds,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      posture: "stand",
      scoped: false,
      holdBreath: false,
      zeroIndex: 0,
    };
  }

  localControls(): LocalControls {
    return { rangefinder: false };
  }

  consumeActions(): InputActions {
    return { fire: false, reload: false, zoomDelta: 0, cycleZoom: false };
  }

  setLookScale(_scale: number): void {
    // Nothing to scale.
  }

  dispose(): void {
    // Nothing to release.
  }
}
