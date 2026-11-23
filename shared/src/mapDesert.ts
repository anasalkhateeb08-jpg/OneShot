/**
 * Map 1: desert canyon with a ruined outpost (master section 9).
 * Everything is mirrored through the map center, (x, z) -> (-x, -z), so neither side has
 * an advantage. Player A sits in the north zone looking south (-Z), player B the reverse.
 * The sun comes from the side (+X), so it is side-light for both players.
 */
import { createRng, normalize } from "./geometry";
import type { Aabb } from "./geometry";
import { isInZone, mirrorBox, mirrorXZ, zoneBlend } from "./maps";
import type { MapDef, PlayerZone, RockProp, ShrubProp, WallMaterial, WallProp } from "./maps";
import { fbm2, smoothstep } from "./noise";

const SEED = 7301;
const ZONE_HALF_WIDTH = 30;
const ZONE_HALF_DEPTH = 15;
const ZONE_CENTER_Z = 200;
const ZONE_RAISE_M = 3;
const ZONE_BLEND_M = 25;

/** Noise made symmetric under (x, z) -> (-x, -z). */
function sym(x: number, z: number, seed: number, octaves: number): number {
  return 0.5 * (fbm2(x, z, seed, octaves) + fbm2(-x, -z, seed, octaves));
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

/** Box standing on the ground at (cx, cz), sunk 0.4 m so it never floats. */
function standingBox(cx: number, cz: number, halfX: number, halfZ: number, heightM: number): Aabb {
  const ground = Math.min(
    heightAt(cx - halfX, cz - halfZ),
    heightAt(cx + halfX, cz - halfZ),
    heightAt(cx - halfX, cz + halfZ),
    heightAt(cx + halfX, cz + halfZ),
  );
  const y0 = ground - 0.4;
  return {
    min: { x: cx - halfX, y: y0, z: cz - halfZ },
    max: { x: cx + halfX, y: y0 + 0.4 + heightM, z: cz + halfZ },
  };
}

function buildWalls(): WallProp[] {
  const half: WallProp[] = [];
  const add = (box: Aabb, material: WallMaterial): void => {
    half.push({ box, material });
  };

  // Spawn cover in front of each spawn (blocks the spawn-to-spawn view at the start).
  add(standingBox(0, ZONE_CENTER_Z - 7, 4, 0.3, 2.6), "stone");
  // Low side walls inside the zone (crouch and prone cover).
  add(standingBox(-18, ZONE_CENTER_Z - 4, 2.5, 0.3, 1.2), "stone");
  add(standingBox(18, ZONE_CENTER_Z - 4, 2.5, 0.3, 1.2), "stone");

  // Ruined outpost at the center: half of a 24 x 24 compound (the mirror adds the rest).
  add(standingBox(-6, 12, 6, 0.4, 3.2), "mudbrick");
  add(standingBox(9, 12, 3, 0.4, 1.8), "mudbrick");
  add(standingBox(12, 4, 0.4, 6, 2.6), "mudbrick");
  add(standingBox(3, 3, 2, 2, 5.5), "mudbrick");

  // Scattered ruins in the midfield.
  const rng = createRng(SEED + 31);
  for (let i = 0; i < 6; i++) {
    const x = (rng() * 2 - 1) * 190;
    const z = 40 + rng() * 110;
    const alongX = rng() < 0.5;
    const len = 2 + rng() * 4;
    const h = 1.2 + rng() * 2.2;
    add(standingBox(x, z, alongX ? len : 0.35, alongX ? 0.35 : len, h), "mudbrick");
  }

  const mirrored = half.map((w) => ({ box: mirrorBox(w.box), material: w.material }));
  return [...half, ...mirrored];
}

function insideAnyBox(walls: readonly WallProp[], x: number, z: number, margin: number): boolean {
  return walls.some(
    (w) =>
      x > w.box.min.x - margin &&
      x < w.box.max.x + margin &&
      z > w.box.min.z - margin &&
      z < w.box.max.z + margin,
  );
}

function buildRocks(walls: readonly WallProp[]): RockProp[] {
  const rng = createRng(SEED + 41);
  const half: RockProp[] = [];
  let guard = 0;
  while (half.length < 55 && guard++ < 2000) {
    const x = (rng() * 2 - 1) * 260;
    const z = 15 + rng() * 235;
    const radius = 0.8 + rng() ** 2 * 3.2;
    const squashY = 0.6 + rng() * 0.3;
    const variant = Math.floor(rng() * 3);
    const rotY = rng() * Math.PI * 2;
    if (isInZone(zoneA, x, z) && rng() < 0.7) continue;
    if (insideAnyBox(walls, x, z, radius + 1)) continue;
    const r = radius * squashY;
    const y = heightAt(x, z) + r * 0.45;
    half.push({ collider: { center: { x, y, z }, radius: r }, variant, rotY, squashY });
  }
  const mirrored = half.map((r) => ({
    ...r,
    collider: { center: mirrorXZ(r.collider.center), radius: r.collider.radius },
    rotY: r.rotY + Math.PI,
  }));
  return [...half, ...mirrored];
}

function buildShrubs(walls: readonly WallProp[]): ShrubProp[] {
  const rng = createRng(SEED + 53);
  const half: ShrubProp[] = [];
  let guard = 0;
  while (half.length < 220 && guard++ < 4000) {
    const x = (rng() * 2 - 1) * 280;
    const z = 2 + rng() * 260;
    if (insideAnyBox(walls, x, z, 1)) continue;
    half.push({ pos: { x, y: heightAt(x, z), z }, scale: 0.6 + rng() * 1.0 });
  }
  const mirrored = half.map((s) => ({ pos: mirrorXZ(s.pos), scale: s.scale }));
  return [...half, ...mirrored];
}

const walls = buildWalls();

export const DESERT_CANYON: MapDef = {
  id: "desert-canyon",
  nameKey: "map.desertCanyon",
  grid: { minX: -400, maxX: 400, minZ: -320, maxZ: 320, step: 4 },
  heightAt,
  zones: [zoneA, zoneB],
  walls,
  rocks: buildRocks(walls),
  shrubs: buildShrubs(walls),
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
