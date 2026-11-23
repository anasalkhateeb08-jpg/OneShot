import * as THREE from "three/webgpu";
import { fbm2, smoothstep } from "@oneshot/shared";
import type { Atmosphere, HeightGrid } from "@oneshot/shared";
import type { GroundMaps } from "../core/Assets";

/** Meters covered by one repeat of the ground texture. */
const GROUND_TILE_M = 6;

const HORIZON_INNER_M = 380;
const HORIZON_OUTER_M = 3600;
const HORIZON_ANGULAR = 160;
const HORIZON_RADIAL = 28;
const HORIZON_SINK_M = 3;

/** Shared ground coloring: sand variation, rock on steep slopes. Writes linear RGB. */
function groundColor(
  out: THREE.Color,
  x: number,
  z: number,
  normalY: number,
  low: THREE.Color,
  high: THREE.Color,
  rock: THREE.Color,
): void {
  const n = 0.5 + 0.5 * fbm2(x * 0.03, z * 0.03, 991, 3);
  out.copy(low).lerp(high, n);
  const slope = 1 - normalY;
  out.lerp(rock, smoothstep(0.18, 0.45, slope));
  const speckle = 0.94 + 0.12 * (0.5 + 0.5 * fbm2(x * 0.4, z * 0.4, 773, 2));
  out.multiplyScalar(speckle);
}

/**
 * Tint for a textured ground: white (texture as is) on flat sand, toward the rock color on
 * steep slopes, with a gentle large-scale variation that breaks up texture repetition.
 */
function groundTint(
  out: THREE.Color,
  x: number,
  z: number,
  normalY: number,
  rock: THREE.Color,
): void {
  const macro = 0.86 + 0.22 * (0.5 + 0.5 * fbm2(x * 0.02, z * 0.02, 991, 3));
  out
    .setRGB(1, 1, 1)
    .lerp(rock, 0.65 * smoothstep(0.18, 0.45, 1 - normalY))
    .multiplyScalar(macro);
}

/**
 * Terrain mesh built from the SAME height grid and triangulation used for collision
 * (shared/src/terrain.ts), so the rendered ground is exactly what bullets hit.
 * With ground textures (photoscanned, D-014) the vertex colors only tint them.
 */
export function createTerrainMesh(
  grid: HeightGrid,
  atm: Atmosphere,
  ground: GroundMaps | null,
): THREE.Mesh {
  const { cols, rows, step, originX, originZ, heights } = grid;
  const positions = new Float32Array(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      positions[i * 3] = originX + c * step;
      positions[i * 3 + 1] = heights[i] ?? 0;
      positions[i * 3 + 2] = originZ + r * step;
    }
  }

  const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c; // (x0, z0)
      const b = (r + 1) * cols + c; // (x0, z1)
      const cc = r * cols + c + 1; // (x1, z0)
      const d = (r + 1) * cols + c + 1; // (x1, z1)
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = cc;
      indices[k++] = cc;
      indices[k++] = b;
      indices[k++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  // World-space texture coordinates: one repeat every GROUND_TILE_M meters.
  const uvs = new Float32Array(cols * rows * 2);
  for (let i = 0; i < cols * rows; i++) {
    uvs[i * 2] = (positions[i * 3] ?? 0) / GROUND_TILE_M;
    uvs[i * 2 + 1] = (positions[i * 3 + 2] ?? 0) / GROUND_TILE_M;
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  const normals = geometry.getAttribute("normal");
  const colors = new Float32Array(cols * rows * 3);
  const low = new THREE.Color(atm.groundLow);
  const high = new THREE.Color(atm.groundHigh);
  const rock = new THREE.Color(atm.rockColor);
  const c = new THREE.Color();
  for (let i = 0; i < cols * rows; i++) {
    const x = positions[i * 3] ?? 0;
    const z = positions[i * 3 + 2] ?? 0;
    if (ground) groundTint(c, x, z, normals.getY(i), rock);
    else groundColor(c, x, z, normals.getY(i), low, high, rock);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = ground
    ? new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: ground.map,
        normalMap: ground.normalMap,
        roughnessMap: ground.roughnessMap,
        metalness: 0,
      })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Distant scenery around the play area (visual only, no collision): a ring that continues the
 * map's own terrain shape and rises into far mountains, softened by the fog.
 * Inside the play grid it stays a few meters below the real terrain, so it is never seen there.
 */
export function createHorizonMesh(
  heightAt: (x: number, z: number) => number,
  atm: Atmosphere,
): THREE.Mesh {
  const cols = HORIZON_ANGULAR + 1;
  const rows = HORIZON_RADIAL + 1;
  const positions = new Float32Array(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    const f = r / HORIZON_RADIAL;
    const radius = HORIZON_INNER_M + (HORIZON_OUTER_M - HORIZON_INNER_M) * f * f;
    for (let a = 0; a < cols; a++) {
      const theta = (a / HORIZON_ANGULAR) * Math.PI * 2;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      const local = heightAt(x, z) - HORIZON_SINK_M;
      const mountain =
        140 + 160 * (0.5 + 0.5 * fbm2(Math.cos(theta) * 3 + 10, Math.sin(theta) * 3 + 10, 555, 4));
      const blend = smoothstep(650, 1400, radius);
      const i = (r * cols + a) * 3;
      positions[i] = x;
      positions[i + 1] = local * (1 - blend) + mountain * blend;
      positions[i + 2] = z;
    }
  }

  const indices = new Uint32Array(HORIZON_ANGULAR * HORIZON_RADIAL * 6);
  let k = 0;
  for (let r = 0; r < HORIZON_RADIAL; r++) {
    for (let a = 0; a < HORIZON_ANGULAR; a++) {
      const p = r * cols + a;
      const q = (r + 1) * cols + a;
      indices[k++] = p;
      indices[k++] = p + 1;
      indices[k++] = q;
      indices[k++] = q;
      indices[k++] = p + 1;
      indices[k++] = q + 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
  // Winding (p, p+1, q) with the angle increasing from +X toward +Z gives upward normals.
  geometry.computeVertexNormals();

  const normals = geometry.getAttribute("normal");
  const colors = new Float32Array(cols * rows * 3);
  const low = new THREE.Color(atm.groundLow);
  const high = new THREE.Color(atm.groundHigh);
  const rock = new THREE.Color(atm.rockColor);
  const c = new THREE.Color();
  for (let i = 0; i < cols * rows; i++) {
    groundColor(
      c,
      positions[i * 3] ?? 0,
      positions[i * 3 + 2] ?? 0,
      normals.getY(i),
      low,
      high,
      rock,
    );
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  return new THREE.Mesh(geometry, material);
}
