import { RANGEFINDER, raycastWorld, windSpeedAndDirection } from "@oneshot/shared";
import type { Vec3, WorldColliders } from "@oneshot/shared";

export interface RangeReading {
  /** Distance to the aimed point in meters, or null if nothing is in range. */
  distanceM: number | null;
  windSpeed: number;
  windDirectionRad: number;
}

/**
 * Laser rangefinder (master section 2): distance to the aimed point plus wind speed and
 * direction. Local only: nothing here is sent to the server or shown to the opponent.
 */
export class Rangefinder {
  constructor(private readonly world: WorldColliders) {}

  read(eye: Vec3, aimDirection: Vec3, timeS: number, matchSeed: number): RangeReading {
    const hit = raycastWorld(this.world, eye, aimDirection, RANGEFINDER.maxRangeM, 0.5);
    const wind = windSpeedAndDirection(timeS, matchSeed);
    return {
      distanceM: hit ? hit.distance : null,
      windSpeed: wind.speed,
      windDirectionRad: wind.directionRad,
    };
  }
}
