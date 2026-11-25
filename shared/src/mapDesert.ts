/**
 * Map 1: desert canyon (master section 9, natural cover per D-025).
 * All cover comes from the desert itself: boulders, rock outcrops, and sand dunes. No walls.
 * Everything is mirrored through the map center, (x, z) -> (-x, -z), so neither side has
 * an advantage. Player A sits in the north zone looking south (-Z), player B the reverse.
 * The sun comes from the side (+X), so it is side-light for both players.
 */
import { createRng, normalize } from "./geometry";
import { zoneBlend } from "./maps";
import type { MapDef, PlayerZone } from "./maps";
import { parseLayout, propsFromLayout } from "./mapLayout";
import { fbm2, smoothstep } from "./noise";
import layoutFile from "./layouts/desert-canyon.json";

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

/**
 * Props come from the hand-editable layout file (D-049): the north half, mirrored to the
 * south half. Edit it with the in-game editor, not by hand.
 */
const props = propsFromLayout(parseLayout(layoutFile), heightAt);

export const DESERT_CANYON: MapDef = {
  id: "desert-canyon",
  nameKey: "map.desertCanyon",
  grid: { minX: -400, maxX: 400, minZ: -320, maxZ: 320, step: 4 },
  heightAt,
  zones: [zoneA, zoneB],
  walls: [],
  rocks: props.rocks,
  crates: props.crates,
  shrubs: props.shrubs,
  atmosphere: {
    skyZenith: 0x5f8fc4,
    skyHorizon: 0xe6d6bb,
    fogColor: 0xdccbad,
    fogDensity: 0.0016,
    sunDirection: normalize({ x: 0.82, y: 0.57, z: 0.05 }),
    sunColor: 0xffe2b8,
    // Sky fill about 40% of direct sun on flat sand: shadows read as shade, not black (D-048).
    sunIntensity: 2.8,
    hemiSky: 0xbfd4ec,
    hemiGround: 0x9a7a55,
    hemiIntensity: 1.2,
    groundLow: 0xcaa16c,
    groundHigh: 0xb58658,
    rockColor: 0x9c7350,
  },
};

/** Height of both zone plateaus (exported for tests). */
export const DESERT_ZONE_HEIGHT = ZONE_HEIGHT;
