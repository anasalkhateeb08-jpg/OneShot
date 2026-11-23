/**
 * Rotating impact effects for wood (D-037). Five looks take turns: the active one changes every
 * second, and a bullet that hits a crate plays whichever look is active at that moment.
 * The index depends only on the simulation time, so in online duels both players (and the
 * server) agree on it for the same moment.
 */
export const IMPACT_EFFECTS = { count: 5, switchEveryS: 1 } as const;

/** Which of the five wood impact effects is active at a simulation time (0 to 4). */
export function activeImpactEffect(timeS: number): number {
  const slot = Math.floor(Math.max(0, timeS) / IMPACT_EFFECTS.switchEveryS);
  return slot % IMPACT_EFFECTS.count;
}
