/**
 * Breath-hold and lung meter (master section 8). Pure state stepper.
 * The server runs this itself from the player's inputs and never trusts a client claim;
 * the client runs the same code to display the lung meter and the scope sway.
 *
 * Rules:
 * - Holding the breath drains the lung meter (PLAYER.lungDrainPerS) and steadies the scope.
 * - When the meter is empty the player is forced to exhale: heavy sway for
 *   PLAYER.forcedExhaleSwayS seconds, and no new hold until the key is released.
 * - Otherwise the meter recovers at PLAYER.lungRecoverPerS.
 * - Sway changes smoothly (SWAY.transitionS), never in a jump.
 */
import { PLAYER, SWAY } from "./constants";

export type BreathMode = "normal" | "holding" | "exhausted";

export interface BreathState {
  /** Lung meter, 0 (empty) to 1 (full). */
  lung: number;
  mode: BreathMode;
  /** Seconds left of forced exhale. */
  exhaleTimerS: number;
  /** True after exhaustion until the hold key is released. */
  holdLocked: boolean;
  /** Current sway multiplier from breathing (eases toward its target). */
  swayScale: number;
  /** Weight of the normal breathing rhythm in the sway, 1 when breathing, 0 when holding. */
  breathingWeight: number;
}

export function initialBreath(): BreathState {
  return {
    lung: 1,
    mode: "normal",
    exhaleTimerS: 0,
    holdLocked: false,
    swayScale: 1,
    breathingWeight: 1,
  };
}

function targetScale(mode: BreathMode): number {
  if (mode === "holding") return PLAYER.breathHoldSwayFactor;
  if (mode === "exhausted") return PLAYER.forcedExhaleSwayFactor;
  return 1;
}

/**
 * Advances the breath state by dt seconds.
 * @param holdPressed whether the breath-hold control is held during this step
 */
export function stepBreath(state: BreathState, holdPressed: boolean, dt: number): BreathState {
  let { lung, mode, exhaleTimerS, holdLocked } = state;

  if (!holdPressed) holdLocked = false;

  if (mode === "exhausted") {
    exhaleTimerS -= dt;
    lung = Math.min(1, lung + PLAYER.lungRecoverPerS * dt);
    if (exhaleTimerS <= 0) {
      exhaleTimerS = 0;
      mode = "normal";
    }
  } else if (mode === "holding") {
    if (!holdPressed) {
      mode = "normal";
    } else {
      lung -= PLAYER.lungDrainPerS * dt;
      if (lung <= 0) {
        lung = 0;
        mode = "exhausted";
        exhaleTimerS = PLAYER.forcedExhaleSwayS;
        holdLocked = true;
      }
    }
  } else {
    if (holdPressed && !holdLocked && lung > 0) {
      mode = "holding";
    } else {
      lung = Math.min(1, lung + PLAYER.lungRecoverPerS * dt);
    }
  }

  const ease = 1 - Math.exp(-dt / SWAY.transitionS);
  const swayScale = state.swayScale + (targetScale(mode) - state.swayScale) * ease;
  const breathTarget = mode === "normal" ? 1 : 0;
  const breathingWeight = state.breathingWeight + (breathTarget - state.breathingWeight) * ease;

  return { lung, mode, exhaleTimerS, holdLocked, swayScale, breathingWeight };
}
