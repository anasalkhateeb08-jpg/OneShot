import { PLAYER, SCOPE, fovForZoom } from "@oneshot/shared";
import type { BreathMode, ZoomRange } from "@oneshot/shared";

const DEG = Math.PI / 180;

/**
 * Scope optics (master section 7: no second camera, no off-screen render target).
 * The scope only changes the main camera's field of view; the circular overlay with the
 * mil-dot reticle is drawn by the HUD. Breath-hold narrows the view slightly (extra zoom).
 *
 * Variable zoom (D-023): the player picks a level with V (cycle) or the mouse wheel.
 * The lowest level still shows at most half of the enemy zone (owner rule).
 */
export class ScopeView {
  /** Current vertical field of view, degrees (eases toward the target). */
  fovDeg: number = SCOPE.unscopedFovDeg;
  scoped = false;
  /** Index into range.levels; remembered between scope uses. */
  level = 0;

  private readonly unscopedHalfTan = Math.tan((SCOPE.unscopedFovDeg * DEG) / 2);

  constructor(readonly range: ZoomRange) {}

  /** Magnification of the selected level (before breath-hold). */
  get selectedZoom(): number {
    return this.range.levels[this.level] ?? this.range.min;
  }

  /** Current magnification relative to the unscoped view. */
  get zoom(): number {
    return this.unscopedHalfTan / Math.tan((this.fovDeg * DEG) / 2);
  }

  /** +1 = more zoom, -1 = less zoom. Clamped to the available levels. */
  changeLevel(delta: number): void {
    const last = this.range.levels.length - 1;
    this.level = Math.min(last, Math.max(0, this.level + delta));
  }

  /** Next level, wrapping from the highest back to the lowest. */
  cycleLevel(): void {
    this.level = (this.level + 1) % this.range.levels.length;
  }

  update(scoped: boolean, breathMode: BreathMode, dt: number): void {
    this.scoped = scoped;
    let target: number = SCOPE.unscopedFovDeg;
    if (scoped) {
      const breathZoom = breathMode === "holding" ? 1 / PLAYER.breathHoldFovFactor : 1;
      target = fovForZoom(this.selectedZoom * breathZoom) / DEG;
    }
    const ease = 1 - Math.exp(-dt / SCOPE.transitionS);
    this.fovDeg += (target - this.fovDeg) * ease;
  }
}
