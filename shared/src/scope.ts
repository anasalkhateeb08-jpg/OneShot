/**
 * Scope zoom range (D-023, owner rule): the player can choose the zoom, but even at the LOWEST
 * zoom the lens shows at most half of the enemy zone's width, never all of it.
 * Derived from the map, so every map keeps the same rule.
 */
import { SCOPE } from "./constants";
import type { MapDef } from "./maps";

export interface ZoomRange {
  min: number;
  max: number;
  /** Zoom levels from lowest to highest (geometric steps). */
  levels: readonly number[];
}

/** Distance between the two zone centers (the typical engagement distance). */
export function zoneDistance(map: MapDef): number {
  const [a, b] = map.zones;
  return Math.hypot(a.centerX - b.centerX, a.centerZ - b.centerZ);
}

/** Width in meters seen through the lens at a distance, for a vertical FOV (radians). */
export function lensViewWidth(fovRad: number, distanceM: number): number {
  const lensAngle = fovRad * SCOPE.lensFractionOfHeight;
  return 2 * distanceM * Math.tan(lensAngle / 2);
}

export function scopeZoomRange(map: MapDef): ZoomRange {
  const zone = map.zones[0];
  const width = 2 * zone.halfWidth * SCOPE.maxViewOfEnemyZone;
  const d = zoneDistance(map);
  const lensAngle = 2 * Math.atan(width / 2 / d);
  const fovMax = lensAngle / SCOPE.lensFractionOfHeight;
  const unscopedHalfTan = Math.tan((SCOPE.unscopedFovDeg * Math.PI) / 180 / 2);
  const min = unscopedHalfTan / Math.tan(fovMax / 2);
  const max = min * SCOPE.maxOverMinZoom;
  const n: number = SCOPE.zoomLevels;
  const levels: number[] = [];
  for (let i = 0; i < n; i++) levels.push(min * Math.pow(max / min, n === 1 ? 0 : i / (n - 1)));
  return { min, max, levels };
}

/** Vertical FOV (radians) for a magnification relative to the unscoped view. */
export function fovForZoom(zoom: number): number {
  const unscopedHalfTan = Math.tan((SCOPE.unscopedFovDeg * Math.PI) / 180 / 2);
  return 2 * Math.atan(unscopedHalfTan / zoom);
}
