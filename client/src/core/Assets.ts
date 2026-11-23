import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createRockMesh } from "@oneshot/shared";
import type { RockMesh } from "@oneshot/shared";

/** Written by `npm run assets` (tools/assets/fetch-assets.mjs). */
interface Manifest {
  ground: { diff: string; nor: string; rough: string };
  rocks: string[];
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

export interface GameAssets {
  ground: GroundMaps | null;
  rocks: RockAsset[];
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
async function loadRock(loader: GLTFLoader, url: string): Promise<RockAsset | null> {
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  let found: RockAsset | null = null;
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
    geometry.scale(
      1 / Math.max(half.x, 1e-6),
      1 / Math.max(half.y, 1e-6),
      1 / Math.max(half.z, 1e-6),
    );
    geometry.computeVertexNormals();
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material) return;
    found = { geometry, material, mesh: createRockMesh(triangleList(geometry)) };
  });
  return found;
}

/**
 * Loads the real-world assets listed in the manifest. If the manifest is missing (assets not
 * downloaded yet) or a file fails, the game falls back to its procedural look and still runs.
 */
export async function loadAssets(): Promise<GameAssets> {
  const empty: GameAssets = { ground: null, rocks: [] };
  let manifest: Manifest;
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) return empty;
    manifest = (await res.json()) as Manifest;
  } catch {
    return empty;
  }

  let ground: GroundMaps | null = null;
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

  const loader = new GLTFLoader();
  const rocks: RockAsset[] = [];
  for (const url of manifest.rocks) {
    try {
      const rock = await loadRock(loader, url);
      if (rock) rocks.push(rock);
    } catch (err) {
      console.warn(`Rock model failed to load: ${url}`, err);
    }
  }
  return { ground, rocks };
}
