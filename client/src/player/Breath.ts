import { initialBreath, stepBreath } from "@oneshot/shared";
import type { BreathState } from "@oneshot/shared";

/**
 * The local player's breath, run with the SHARED rules (the server runs the same code and
 * never trusts the client). Breath-hold only works while scoped.
 */
export class Breath {
  state: BreathState = initialBreath();

  update(holdPressed: boolean, scoped: boolean, dt: number): void {
    this.state = stepBreath(this.state, holdPressed && scoped, dt);
  }
}
