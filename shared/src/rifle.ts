/**
 * Rifle state: magazine, bolt cycle, reload (master sections 2 and 13).
 * Pure stepper shared by client and server: the server enforces the fire rate and the
 * rounds in the magazine with this same code.
 */
import { RIFLE } from "./constants";

export interface RifleState {
  rounds: number;
  /** Seconds until the bolt has cycled and the next shot is possible. */
  boltS: number;
  /** Seconds left of a reload in progress (0 = not reloading). */
  reloadS: number;
}

export function initialRifle(): RifleState {
  return { rounds: RIFLE.magazine, boltS: 0, reloadS: 0 };
}

export function canFire(s: RifleState): boolean {
  return s.rounds > 0 && s.boltS <= 0 && s.reloadS <= 0;
}

/** Fires one round. Call only when canFire() is true; otherwise the state is returned unchanged. */
export function fireRifle(s: RifleState): RifleState {
  if (!canFire(s)) return s;
  return { rounds: s.rounds - 1, boltS: RIFLE.boltCycleS, reloadS: 0 };
}

/** Starts a reload if the magazine is not full and no reload is running. */
export function startReload(s: RifleState): RifleState {
  if (s.reloadS > 0 || s.rounds >= RIFLE.magazine) return s;
  return { ...s, reloadS: RIFLE.reloadS };
}

/** Advances timers by dt seconds. A finished reload fills the magazine. */
export function stepRifle(s: RifleState, dt: number): RifleState {
  const boltS = Math.max(0, s.boltS - dt);
  if (s.reloadS > 0) {
    const reloadS = Math.max(0, s.reloadS - dt);
    return reloadS === 0
      ? { rounds: RIFLE.magazine, boltS: 0, reloadS: 0 }
      : { rounds: s.rounds, boltS, reloadS };
  }
  return { rounds: s.rounds, boltS, reloadS: 0 };
}
