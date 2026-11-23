/**
 * Map 1: desert canyon (master section 9, natural cover per D-025).
 * All cover comes from the desert itself: boulders, rock outcrops, and sand dunes. No walls.
 * Everything is mirrored through the map center, (x, z) -> (-x, -z), so neither side has
 * an advantage. Player A sits in the north zone looking south (-Z), player B the reverse.
 * The sun comes from the side (+X), so it is side-light for both players.
 */
import { createRng, normalize } from "./geometry";
import { isInZone, mirrorCrate, mirrorXZ, zoneBlend } from "./maps";
import type { CrateProp, MapDef, PlayerZone, RockProp, ShrubProp } from "./maps";
import { fbm2, smoothstep } from "./noise";

const SEED = 7301;
const ZONE_HALF_WIDTH = 30;
const ZONE_HALF_DEPTH = 15;
const ZONE_CENTER_Z = 200;
const ZONE_RAISE_M = 3;
const ZONE_BLEND_M = 25;
/** Fraction of a rock's height kept above the ground (the rest is buried). */
const ROCK_ABOVE_GROUND = 0.65;

/** Noise made symmetric under (x, z) -> (-x, -z). */
function sym(x: number, z: number, seed: number, octaves: number): number {
  return 0.5 * (fbm2(x, z, seed, octaves) + fbm2(-x, -z, seed, octaves));
}

interface Dune {
  x: number;
  z: number;
  height: number;
  /** Half-length along the crest and half-width across it. */
  along: number;
  across: number;
  /** Crest direction, radians from +X. */
  angle: number;
}

/** Sand dunes in the north half; the height function adds their mirror automatically. */
const DUNES: readonly Dune[] = (() => {
  const rng = createRng(SEED + 61);
  const list: Dune[] = [];
  for (let i = 0; i < 9; i++) {
    list.push({
      x: (rng() * 2 - 1) * 200,
      z: 35 + rng() * 120,
      height: 2.5 + rng() * 3.5,
      along: 18 + rng() * 20,
      across: 7 + rng() * 6,
      angle: (rng() - 0.5) * 0.9,
    });
  }
  return list;
})();

function duneHeight(x: number, z: number): number {
  let h = 0;
  for (const d of DUNES) {
    for (const sign of [1, -1]) {
      const dx = x - sign * d.x;
      const dz = z - sign * d.z;
      const c = Math.cos(d.angle);
      const s = Math.sin(d.angle);
      const u = (dx * c + dz * s) / d.along;
      const v = (-dx * s + dz * c) / d.across;
      const r2 = u * u + v * v;
      if (r2 < 9) h += d.height * Math.exp(-r2);
    }
  }
  return h;
}

/** Natural ground before the zone plateaus are blended in. */
function baseHeight(x: number, z: number): number {
  let h = 2.2 * sym(x * 0.01, z * 0.01, SEED, 4) + 0.5 * sym(x * 0.045, z * 0.045, SEED + 7, 3);
  const edgeNoise = sym(x * 0.02, z * 0.02, SEED + 13, 3);
  const side = smoothstep(210, 320, Math.abs(x) + 30 * edgeNoise);
  h += side * (50 + 18 * sym(x * 0.008, z * 0.008, SEED + 19, 3));
  const back = smoothstep(250, 330, Math.abs(z) + 20 * edgeNoise);
  h += back * 35;
  const ridgeMask = smoothstep(0.05, 0.45, sym(x * 0.025, 0, SEED + 23, 2));
  h += 6 * Math.exp(-((z / 28) ** 2)) * ridgeMask;
  h += duneHeight(x, z);
  return h;
}

const zoneA: PlayerZone = {
  centerX: 0,
  centerZ: ZONE_CENTER_Z,
  halfWidth: ZONE_HALF_WIDTH,
  halfDepth: ZONE_HALF_DEPTH,
  facingYaw: 0,
  spawnX: 0,
  spawnZ: ZONE_CENTER_Z + 5,
};

const zoneB: PlayerZone = {
  centerX: 0,
  centerZ: -ZONE_CENTER_Z,
  halfWidth: ZONE_HALF_WIDTH,
  halfDepth: ZONE_HALF_DEPTH,
  facingYaw: Math.PI,
  spawnX: 0,
  spawnZ: -(ZONE_CENTER_Z + 5),
};

/** Both plateaus share one height (the base terrain is symmetric). */
const ZONE_HEIGHT = baseHeight(0, ZONE_CENTER_Z) + ZONE_RAISE_M;

function heightAt(x: number, z: number): number {
  let h = baseHeight(x, z);
  for (const zone of [zoneA, zoneB]) {
    const w = zoneBlend(zone, x, z, ZONE_BLEND_M);
    if (w > 0) h = h * (1 - w) + ZONE_HEIGHT * w;
  }
  return h;
}

/** A rock sitting on the ground, partly buried. */
function rockAt(
  x: number,
  z: number,
  radiusXZ: number,
  radiusY: number,
  variant: number,
  rotY: number,
): RockProp {
  const y = heightAt(x, z) + radiusY * (2 * ROCK_ABOVE_GROUND - 1);
  return { collider: { center: { x, y, z }, radiusXZ, radiusY }, variant, rotY };
}

/** Hand-placed cover for the north half (the mirror adds the south half). */
function coverRocks(): RockProp[] {
  return [
    // Spawn cover: a big boulder with two smaller ones (hides the spawn at the start).
    rockAt(0, ZONE_CENTER_Z - 8, 3.4, 2.6, 0, 0.3),
    rockAt(-3.6, ZONE_CENTER_Z - 7, 1.8, 1.4, 1, 1.2),
    rockAt(3.8, ZONE_CENTER_Z - 9, 1.6, 1.2, 2, 2.4),
    // Low boulders inside the zone (crouch and prone cover).
    rockAt(-18, ZONE_CENTER_Z - 5, 2.2, 1.0, 1, 0.8),
    rockAt(18, ZONE_CENTER_Z - 4, 2.0, 1.0, 2, 2.0),
    rockAt(-27, ZONE_CENTER_Z + 6, 1.8, 1.3, 0, 1.6),
    rockAt(26, ZONE_CENTER_Z + 8, 2.0, 1.5, 1, 0.4),
    // Central rock formation (half of it).
    rockAt(-7, 6, 6.5, 5.0, 0, 0.2),
    rockAt(5, 10, 4.5, 3.2, 1, 1.4),
    rockAt(12, 3, 3.0, 2.2, 2, 2.9),
  ];
}

/** Rock outcrops in the midfield: clusters of 3 to 4 boulders. */
function outcrops(): RockProp[] {
  const rng = createRng(SEED + 31);
  const list: RockProp[] = [];
  for (let i = 0; i < 7; i++) {
    const cx = (rng() * 2 - 1) * 190;
    const cz = 40 + rng() * 110;
    const count = 3 + Math.floor(rng() * 2);
    for (let k = 0; k < count; k++) {
      const r = 1.6 + rng() * 2.4;
      list.push(
        rockAt(
          cx + (rng() * 2 - 1) * 5,
          cz + (rng() * 2 - 1) * 5,
          r,
          r * (0.6 + rng() * 0.3),
          Math.floor(rng() * 3),
          rng() * Math.PI * 2,
        ),
      );
    }
  }
  return list;
}

/** Scattered rocks of all sizes. */
function scattered(avoid: readonly RockProp[]): RockProp[] {
  const rng = createRng(SEED + 41);
  const list: RockProp[] = [];
  let guard = 0;
  while (list.length < 55 && guard++ < 2000) {
    const x = (rng() * 2 - 1) * 260;
    const z = 15 + rng() * 235;
    const r = 0.8 + rng() ** 2 * 3.0;
    const ry = r * (0.55 + rng() * 0.35);
    const variant = Math.floor(rng() * 3);
    const rotY = rng() * Math.PI * 2;
    if (isInZone(zoneA, x, z) && rng() < 0.8) continue;
    const tooClose = avoid.some(
      (o) =>
        Math.hypot(o.collider.center.x - x, o.collider.center.z - z) < o.collider.radiusXZ + r + 1,
    );
    if (tooClose) continue;
    list.push(rockAt(x, z, r, ry, variant, rotY));
  }
  return list;
}

function buildRocks(): RockProp[] {
  const fixed = [...coverRocks(), ...outcrops()];
  const half = [...fixed, ...scattered(fixed)];
  const mirrored = half.map((r) => ({
    ...r,
    collider: { ...r.collider, center: mirrorXZ(r.collider.center) },
    rotY: r.rotY + Math.PI,
  }));
  return [...half, ...mirrored];
}

const SMALL_CRATE = { x: 0.4, y: 0.4, z: 0.4 };

/** Crate sizes (half extents, meters): small, medium, long. */
const CRATE_SIZES: ReadonlyArray<{ x: number; y: number; z: number }> = [
  SMALL_CRATE,
  { x: 0.55, y: 0.5, z: 0.55 },
  { x: 1.0, y: 0.45, z: 0.45 },
];

/** Z of each crate row in the north half (rows run along X; the first is inside the zone). */
const CRATE_ROWS_Z: readonly number[] = [ZONE_CENTER_Z - 9, 172, 150, 128, 104, 78, 52];

/**
 * A ruined yard (D-033): crates in loose rows with gaps, some single and low (exposed), some
 * stacked (hiding). Crates hide a player but bullets pass through them (D-032). Built for the
 * north half; the mirror adds the south half, so both players see the same yard.
 */
function buildCrates(rocks: readonly RockProp[]): CrateProp[] {
  const rng = createRng(SEED + 71);
  const half: CrateProp[] = [];
  const blocked = (x: number, z: number, margin: number): boolean =>
    rocks.some(
      (o) =>
        Math.hypot(o.collider.center.x - x, o.collider.center.z - z) < o.collider.radiusXZ + margin,
    );
  CRATE_ROWS_Z.forEach((rowZ, row) => {
    const inZone = row === 0;
    const span = inZone ? ZONE_HALF_WIDTH - 3 : 120;
    let x = -span + rng() * 4;
    while (x < span) {
      // Gaps keep part of every row open (exposed ground between the cover).
      if (rng() < 0.35) {
        x += 5 + rng() * 6;
        continue;
      }
      const z = rowZ + (rng() - 0.5) * 3;
      const sizeIndex = Math.floor(rng() * CRATE_SIZES.length);
      const size = CRATE_SIZES[sizeIndex] ?? SMALL_CRATE;
      // Keep the spawn lane free of crates so the player is not boxed in at the start.
      const nearSpawn = inZone && Math.abs(x) < 6;
      if (!nearSpawn && !blocked(x, z, 1.8)) {
        const rotY = rng() < 0.5 ? (rng() - 0.5) * 0.5 : Math.PI / 2 + (rng() - 0.5) * 0.5;
        const ground = heightAt(x, z);
        const variant = rng() < 0.45 ? 1 : 0;
        const lean = (rng() - 0.5) * 0.08;
        half.push({
          box: {
            center: { x, y: ground + size.y - 0.05, z },
            half: { x: size.x, y: size.y, z: size.z },
            rotY,
          },
          lean,
          variant,
        });
        // About one crate in three carries a second crate on top (a taller hiding spot).
        if (rng() < 0.33) {
          const top = SMALL_CRATE;
          half.push({
            box: {
              center: { x: x + (rng() - 0.5) * 0.2, y: ground + size.y * 2 + top.y - 0.1, z },
              half: { x: top.x, y: top.y, z: top.z },
              rotY: rotY + (rng() - 0.5) * 0.6,
            },
            lean: (rng() - 0.5) * 0.08,
            variant: 1,
          });
        }
      }
      x += 3.5 + rng() * 7;
    }
  });
  return [...half, ...half.map(mirrorCrate)];
}

function buildShrubs(rocks: readonly RockProp[]): ShrubProp[] {
  const rng = createRng(SEED + 53);
  const half: ShrubProp[] = [];
  let guard = 0;
  while (half.length < 220 && guard++ < 4000) {
    const x = (rng() * 2 - 1) * 280;
    const z = 2 + rng() * 260;
    const inRock = rocks.some(
      (o) => Math.hypot(o.collider.center.x - x, o.collider.center.z - z) < o.collider.radiusXZ,
    );
    if (inRock) continue;
    half.push({ pos: { x, y: heightAt(x, z), z }, scale: 0.6 + rng() * 1.0 });
  }
  const mirrored = half.map((s) => ({ pos: mirrorXZ(s.pos), scale: s.scale }));
  return [...half, ...mirrored];
}

const rocks = buildRocks();

export const DESERT_CANYON: MapDef = {
  id: "desert-canyon",
  nameKey: "map.desertCanyon",
  grid: { minX: -400, maxX: 400, minZ: -320, maxZ: 320, step: 4 },
  heightAt,
  zones: [zoneA, zoneB],
  walls: [],
  rocks,
  crates: buildCrates(rocks),
  shrubs: buildShrubs(rocks),
  atmosphere: {
    skyZenith: 0x5f8fc4,
    skyHorizon: 0xe6d6bb,
    fogColor: 0xdccbad,
    fogDensity: 0.0016,
    sunDirection: normalize({ x: 0.82, y: 0.57, z: 0.05 }),
    sunColor: 0xffe2b8,
    sunIntensity: 3.0,
    hemiSky: 0xbfd4ec,
    hemiGround: 0x9a7a55,
    hemiIntensity: 0.55,
    groundLow: 0xcaa16c,
    groundHigh: 0xb58658,
    rockColor: 0x9c7350,
  },
};

/** Height of both zone plateaus (exported for tests). */
export const DESERT_ZONE_HEIGHT = ZONE_HEIGHT;
