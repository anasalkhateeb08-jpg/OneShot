import type { ClientInput, InputClass } from "@oneshot/shared";

/**
 * The ONLY way the game loop reads player input (add-on A1).
 * Keyboard/mouse (phase 1) and touch (phase 7) both implement this,
 * and the rest of the game never knows which one is active.
 */
export interface InputSource {
  readonly kind: InputClass;
  poll(dtSeconds: number): ClientInput;
  dispose(): void;
}

/**
 * Phase 0 placeholder: produces a neutral input every step.
 * Replaced by KeyboardMouseInput in phase 1.
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

  dispose(): void {
    // Nothing to release.
  }
}
