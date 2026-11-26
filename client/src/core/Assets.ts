import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createRockMesh, modelType } from "@oneshot/shared";
import type { RockMesh } from "@oneshot/shared";

/** Written by `npm run assets` (tools/assets/fetch-assets.mjs). */
interface Manifest {
  ground: { diff: string; nor: string; rough: string };
  rocks: string[];
  /** Optional lower-detail copies for rocks at middle distance and far away (D-044). */
  rocksMid?: string[];
  rocksLo?: string[];
  /** Placed model types by id (D-054), written by `npm run assets:models`. */
  models?: Record<string, { near: string; mid?: string; lo?: string }>;
}

/** A placed model's shape, scaled so its box spans -1..1 on every axis (D-054). */
export interface ModelAsset {
  geometry: THREE.BufferGeometry;
  /** One material, or one per merged piece (geometry groups). */
  material: THREE.Material | THREE.Material[];
  /** The same triangles, for exact bullet collision. */
  mesh: RockMesh;
}

export interface GroundMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/** A rock shape normalized to a unit sphere (radius 1 on every axis), plus its material. */
export interface RockAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** The same triangles as the drawn rock, for exact bullet and laser collision (D-038). */
  mesh: RockMesh;
  /** Natural half height over half width (see rockHalfHeight in shared). */
  aspect: number;
  /** Cheaper copies of the same rock, scaled the same way (null if not available). */
  lods: { mid: THREE.BufferGeometry | null; lo: THREE.BufferGeometry | null };
}

/** Flat x, y, z triples of every triangle of a geometry (9 numbers per triangle). */
function triangleList(geometry: THREE.BufferGeometry): number[] {
  const pos = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index ? index.count : pos.count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = index ? index.getX(i) : i;
    out.push(pos.getX(v), pos.getY(v), pos.getZ(v));
  }
  return out;
}

/**
 * Keeps the normals exported by Blender (D-046): the baked normal map was made against them, so
 * recomputing them would show seams. `scale()` already corrects them for the new proportions.
 * Only a model without normals gets computed ones.
 */
function keepNormals(geometry: THREE.BufferGeometry): void {
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
}

export interface GameAssets {
  ground: GroundMaps | null;
  rocks: RockAsset[];
  /** Loaded model types by id; a type without a loaded model is drawn as a plain box. */
  models: Map<string, ModelAsset>;
}

const MODEL_ATTRIBUTES = ["position", "normal", "uv"];

/**
 * Loads one placed model and scales it to the unit box (every axis -1..1). Kit models are made
 * of several parts (a tank: hull, turret, tracks); all parts are merged into one shape, one
 * piece per material, so a copy is still a single draw (D-057).
 */
async function loadModel(loader: GLTFLoader, url: string): Promise<ModelAsset | null> {
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material) return;
    let g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) {
      if (!MODEL_ATTRIBUTES.includes(name)) g.deleteAttribute(name);
    }
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (!g.getAttribute("uv")) {
      const count = g.getAttribute("position").count;
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    g.clearGroups();
    const list = byMaterial.get(material) ?? [];
    list.push(g);
    byMaterial.set(material, list);
  });
  if (byMaterial.size === 0) return null;
  const materials = [...byMaterial.keys()];
  const pieces = [...byMaterial.values()].map((list) =>
    list.length === 1 ? list[0] : mergeGeometries(list, false),
  );
  if (pieces.some((p) => !p)) return null;
  const merged =
    pieces.length === 1 ? pieces[0] : mergeGeometries(pieces as THREE.BufferGeometry[], true);
  if (!merged) return null;
  merged.computeBoundingBox();
  const box = merged.boundingBox;
  if (!box) return null;
  const center = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  merged.translate(-center.x, -center.y, -center.z);
  merged.scale(1 / Math.max(half.x, 1e-6), 1 / Math.max(half.y, 1e-6), 1 / Math.max(half.z, 1e-6));
  return {
    geometry: merged,
    material: materials.length === 1 ? (materials[0] as THREE.Material) : materials,
    mesh: createRockMesh(triangleList(merged)),
  };
}

const MANIFEST_URL = "/assets/manifest.json";

async function loadTexture(url: string, color: boolean): Promise<THREE.Texture> {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

/** Loads one rock model and rescales it so its bounding box spans -1..1 on every axis. */
interface RockNorm {
  center: THREE.Vector3;
  width: number;
  height: number;
}

/** Loads a lower-detail rock and puts it in the same frame as the detailed rock. */
async function loadRockLod(
  loader: GLTFLoader,
  url: string,
  norm: RockNorm,
): Promise<THREE.BufferGeometry | null> {
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  let out: THREE.BufferGeometry | null = null;
  gltf.scene.traverse((obj) => {
    if (out) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.translate(-norm.center.x, -norm.center.y, -norm.center.z);
    geometry.scale(1 / norm.width, 1 / norm.height, 1 / norm.width);
    keepNormals(geometry);
    out = geometry;
  });
  return out;
}

async function loadRock(
  loader: GLTFLoader,
  url: string,
  lodUrls: { mid?: string; lo?: string },
): Promise<RockAsset | null> {
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  let found: RockAsset | null = null;
  let norm: RockNorm | null = null;
  gltf.scene.traverse((obj) => {
    if (found) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;
    const center = box.getCenter(new THREE.Vector3());
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    geometry.translate(-center.x, -center.y, -center.z);
    // Same scale on both horizontal axes keeps the rock's natural shape (D-043).
    const width = Math.max(half.x, half.z, 1e-6);
    const height = Math.max(half.y, 1e-6);
    geometry.scale(1 / width, 1 / height, 1 / width);
    const aspect = height / width;
    norm = { center, width, height };
    keepNormals(geometry);
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material) return;
    found = {
      geometry,
      material,
      mesh: createRockMesh(triangleList(geometry), aspect),
      aspect,
      lods: { mid: null, lo: null },
    };
  });
  const asset = found as RockAsset | null;
  const n = norm as RockNorm | null;
  if (asset && n) {
    const lod = async (lodUrl?: string): Promise<THREE.BufferGeometry | null> => {
      if (!lodUrl) return null;
      try {
        return await loadRockLod(loader, lodUrl, n);
      } catch (err) {
        console.warn(`Rock detail level failed to load: ${lodUrl}`, err);
        return null;
      }
    };
    asset.lods = { mid: await lod(lodUrls.mid), lo: await lod(lodUrls.lo) };
  }
  return asset;
}

/**
 * Loads the real-world assets listed in the manifest. If the manifest is missing (assets not
 * downloaded yet) or a file fails, the game falls back to its procedural look and still runs.
 */
/**
 * Stylized look (D-055, D-058): the photoscanned ground textures and rocks are not loaded; the
 * ground is painted by the terrain colors and rocks are the faceted low-poly shapes.
 */
const STYLIZED_LOOK = true;

export async function loadAssets(): Promise<GameAssets> {
  const empty: GameAssets = { ground: null, rocks: [], models: new Map() };
  let manifest: Manifest;
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) return empty;
    manifest = (await res.json()) as Manifest;
  } catch {
    return empty;
  }

  let ground: GroundMaps | null = null;
  if (!STYLIZED_LOOK) {
    try {
      const [map, normalMap, roughnessMap] = await Promise.all([
        loadTexture(manifest.ground.diff, true),
        loadTexture(manifest.ground.nor, false),
        loadTexture(manifest.ground.rough, false),
      ]);
      ground = { map, normalMap, roughnessMap };
    } catch (err) {
      console.warn("Ground textures failed to load; using the procedural ground.", err);
    }
  }

  const loader = new GLTFLoader();
  const rocks: RockAsset[] = [];
  for (const [i, url] of STYLIZED_LOOK ? [] : manifest.rocks.entries()) {
    try {
      const rock = await loadRock(loader, url, {
        mid: manifest.rocksMid?.[i],
        lo: manifest.rocksLo?.[i],
      });
      if (rock) rocks.push(rock);
    } catch (err) {
      console.warn(`Rock model failed to load: ${url}`, err);
    }
  }
  const models = new Map<string, ModelAsset>();
  for (const [id, files] of Object.entries(manifest.models ?? {})) {
    if (!modelType(id)) continue; // a retired model type (e.g. the photoreal sandbags)
    try {
      const model = await loadModel(loader, files.near);
      if (model) models.set(id, model);
    } catch (err) {
      console.warn(`Model failed to load: ${files.near}`, err);
    }
  }
  return { ground, rocks, models };
}
