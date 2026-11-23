import * as THREE from "three/webgpu";
import { createRng, fbm2 } from "@oneshot/shared";
import type { MapDef, WallMaterial } from "@oneshot/shared";

const WALL_COLORS: Record<WallMaterial, number> = {
  mudbrick: 0xb38f66,
  stone: 0x9b8f7e,
  concrete: 0xa3a19c,
};

const SHRUB_COLOR = 0x6c6a3c;
const ROCK_VARIANTS = 3;

/**
 * A rock shape: an icosphere pushed in and out by noise (at most 12%), faceted for a hard
 * look. Scaled to the collider ellipsoid, so what you see is close to what stops a bullet.
 */
function rockGeometry(variant: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const pos = geometry.getAttribute("position");
  const seed = 1000 + variant * 77;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = fbm2(x * 1.7 + y * 0.9, z * 1.7 - y * 0.6, seed, 3);
    const s = 1 + 0.12 * n;
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds all map props as InstancedMesh (one draw call per kind, master section 9):
 * walls (per material), rocks (per shape variant), and shrubs.
 */
export function createProps(map: MapDef): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // Walls
  const box = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(box);
  for (const material of Object.keys(WALL_COLORS) as WallMaterial[]) {
    const walls = map.walls.filter((w) => w.material === material);
    if (walls.length === 0) continue;
    const mat = new THREE.MeshStandardMaterial({ color: WALL_COLORS[material], roughness: 0.95 });
    const mesh = new THREE.InstancedMesh(box, mat, walls.length);
    walls.forEach((w, i) => {
      p.set(
        (w.box.min.x + w.box.max.x) / 2,
        (w.box.min.y + w.box.max.y) / 2,
        (w.box.min.z + w.box.max.z) / 2,
      );
      s.set(w.box.max.x - w.box.min.x, w.box.max.y - w.box.min.y, w.box.max.z - w.box.min.z);
      m.compose(p, q.identity(), s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(mat);
  }

  // Rocks
  const rockMat = new THREE.MeshStandardMaterial({
    color: map.atmosphere.rockColor,
    roughness: 0.92,
    flatShading: true,
  });
  disposables.push(rockMat);
  for (let v = 0; v < ROCK_VARIANTS; v++) {
    const rocks = map.rocks.filter((r) => r.variant === v);
    if (rocks.length === 0) continue;
    const geometry = rockGeometry(v);
    const mesh = new THREE.InstancedMesh(geometry, rockMat, rocks.length);
    rocks.forEach((r, i) => {
      const c = r.collider;
      p.set(c.center.x, c.center.y, c.center.z);
      q.setFromAxisAngle(up, r.rotY);
      s.set(c.radiusXZ, c.radiusY, c.radiusXZ);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(geometry);
  }

  // Shrubs (decoration only, no collider)
  if (map.shrubs.length > 0) {
    const geometry = new THREE.IcosahedronGeometry(0.5, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: SHRUB_COLOR,
      roughness: 1,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, mat, map.shrubs.length);
    const rng = createRng(4242);
    map.shrubs.forEach((sh, i) => {
      p.set(sh.pos.x, sh.pos.y + 0.18 * sh.scale, sh.pos.z);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      s.set(sh.scale * (0.9 + rng() * 0.4), sh.scale * 0.6, sh.scale * (0.9 + rng() * 0.4));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(geometry, mat);
  }

  return {
    group,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
