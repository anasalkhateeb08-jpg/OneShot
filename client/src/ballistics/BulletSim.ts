import {
  BALLISTICS,
  BULLET_DT,
  CRATE,
  distance,
  lerpVec3,
  normalize,
  rayBoxSpan,
  segmentHitbox,
  stepBullet,
  traceCrates,
  traceSegment,
  windAt,
} from "@oneshot/shared";
import type { BulletState, HitZone, HitboxPart, Vec3, WorldColliders } from "@oneshot/shared";

export type ImpactKind = "terrain" | "rock" | "wall" | "crate" | "body";

export interface BulletImpact {
  kind: ImpactKind;
  point: Vec3;
  /** Straight-line distance from the muzzle to the impact. */
  distanceM: number;
  flightS: number;
  zone?: HitZone;
  targetId?: number;
  /** Crate impacts: which crate, and where the bullet leaves it (for the exit hole). */
  crateIndex?: number;
  exitPoint?: Vec3;
}

export interface FlyingBullet {
  id: number;
  state: BulletState;
  origin: Vec3;
  ageS: number;
  /** Crates already passed through (each slows the bullet once). */
  passedCrates: Set<number>;
}

export type HitboxProvider = (timeS: number) => Array<{ id: number; parts: HitboxPart[] }>;

/**
 * Local bullet simulation for practice (phase 1). Uses the SHARED bullet step at 240 Hz and
 * tests every substep's path SEGMENT against terrain, rocks, walls, and bodies (master
 * section 8). In online duels (phase 3) the server runs this same logic and decides hits.
 */
export class BulletSim {
  readonly bullets: FlyingBullet[] = [];
  private nextId = 1;

  constructor(
    private readonly world: WorldColliders,
    private readonly hitboxes: HitboxProvider,
    private readonly matchSeed: number,
  ) {}

  fire(state: BulletState): void {
    this.bullets.push({
      id: this.nextId++,
      state,
      origin: state.pos,
      ageS: 0,
      passedCrates: new Set(),
    });
  }

  /**
   * Advances all bullets by one fixed physics step.
   * @param simTimeS simulation time at the START of this step
   */
  step(dt: number, simTimeS: number): BulletImpact[] {
    const impacts: BulletImpact[] = [];
    const substeps = Math.max(1, Math.round(dt / BULLET_DT));
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) continue;
      let done = false;
      for (let k = 0; k < substeps && !done; k++) {
        const t = simTimeS + k * BULLET_DT;
        const next = stepBullet(b.state, windAt(t, this.matchSeed), BULLET_DT);
        const a = b.state.pos;
        const c = next.pos;

        let bestT = Number.POSITIVE_INFINITY;
        let impact: Omit<BulletImpact, "point" | "distanceM" | "flightS"> | null = null;
        const world = traceSegment(this.world, a, c);
        if (world) {
          bestT = world.t;
          impact = { kind: world.kind };
        }
        for (const body of this.hitboxes(t)) {
          const h = segmentHitbox(a, c, body.parts);
          if (h && h.t < bestT) {
            bestT = h.t;
            impact = { kind: "body", zone: h.zone, targetId: body.id };
          }
        }

        // Crates: the bullet passes through, loses speed once per crate, and leaves splinters.
        let slowed = next;
        for (const hit of traceCrates(this.world, a, c)) {
          if (hit.t >= bestT || b.passedCrates.has(hit.index)) continue;
          b.passedCrates.add(hit.index);
          const entry = lerpVec3(a, c, hit.t);
          const crate = this.world.crates?.[hit.index];
          const dir = normalize(next.vel);
          let exitPoint: Vec3 | undefined;
          if (crate) {
            const back = {
              x: entry.x - dir.x * 0.05,
              y: entry.y - dir.y * 0.05,
              z: entry.z - dir.z * 0.05,
            };
            const span = rayBoxSpan(back, dir, crate.box);
            if (span) {
              exitPoint = {
                x: back.x + dir.x * span.tOut,
                y: back.y + dir.y * span.tOut,
                z: back.z + dir.z * span.tOut,
              };
            }
          }
          impacts.push({
            kind: "crate",
            crateIndex: hit.index,
            ...(exitPoint ? { exitPoint } : {}),
            point: entry,
            distanceM: distance(b.origin, entry),
            flightS: b.ageS + hit.t * BULLET_DT,
          });
          slowed = {
            pos: slowed.pos,
            vel: {
              x: slowed.vel.x * CRATE.speedKeep,
              y: slowed.vel.y * CRATE.speedKeep,
              z: slowed.vel.z * CRATE.speedKeep,
            },
          };
        }

        if (impact) {
          const point = lerpVec3(a, c, bestT);
          impacts.push({
            ...impact,
            point,
            distanceM: distance(b.origin, point),
            flightS: b.ageS + bestT * BULLET_DT,
          });
          done = true;
        } else {
          b.state = slowed;
          b.ageS += BULLET_DT;
          if (b.ageS >= BALLISTICS.maxFlightSeconds) done = true;
        }
      }
      if (done) this.bullets.splice(i, 1);
    }
    return impacts;
  }
}
