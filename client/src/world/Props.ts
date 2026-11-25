import * as THREE from "three/webgpu";
import { createRng, fbm2, rockHalfHeight } from "@oneshot/shared";
import { CRATE_FACES, crateFaceAt } from "@oneshot/shared";
import type { MapDef, PlayerZone, RockProp, Vec3, WallMaterial } from "@oneshot/shared";
import type { ModelAsset, RockAsset } from "../core/Assets";

const WALL_COLORS: Record<WallMaterial, number> = {
  mudbrick: 0xb38f66,
  stone: 0x9b8f7e,
  concrete: 0xa3a19c,
};

const SHRUB_COLOR = 0x6c6a3c;
const PROCEDURAL_ROCK_VARIANTS = 3;
/** Rocks closer than this to the player's zone cast shadows (the shadow map covers ~90 m). */
const NEAR_ROCK_M = 90;
/** Rocks farther than this from the player's zone use the cheapest detail level. */
const MID_ROCK_M = 200;

/**
 * Fallback rock shape when no photoscanned rock is available: an icosphere pushed in and out by
 * noise (at most 12%), faceted. Already a unit shape, like the normalized photoscanned rocks.
 */
function proceduralRockGeometry(variant: number): THREE.BufferGeometry {
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

/** Size of one crate face in the texture atlas (3 x 2 faces per crate). */
const CELL = 128;
/** Visual bullet hole radius in meters (bigger than a real bullet so it can be seen at range). */
const HOLE_RADIUS_M = 0.07;
/** Most crates that can carry holes at once (each gets its own small textures). */
const MAX_PERFORATED = 80;

/**
 * A unit box with its own UVs: each face uses its own cell of a 3 x 2 atlas, so a bullet hole
 * painted on one face never shows on another.
 */
function crateGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  CRATE_FACES.forEach((f, face) => {
    const cx = face % 3;
    const cy = Math.floor(face / 3);
    const corners: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const base = positions.length / 3;
    for (const [fu, fv] of corners) {
      for (let k = 0; k < 3; k++) {
        positions.push(
          (f.n[k] ?? 0) * 0.5 + (f.u[k] ?? 0) * (fu - 0.5) + (f.v[k] ?? 0) * (fv - 0.5),
        );
        normals.push(f.n[k] ?? 0);
      }
      uvs.push((cx + fu) / 3, 1 - (cy + 1 - fv) / 2);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Weathered plank atlas drawn on a canvas (no image file needed). Pale wood with a darker frame
 * and clear board gaps, so a crate reads as a crate and is easy to tell from rocks at range.
 */
function woodAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CELL * 3;
  canvas.height = CELL * 2;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  const rng = createRng(9001);
  const boards = 5;
  const h = CELL / boards;
  for (let face = 0; face < 6; face++) {
    const ox = (face % 3) * CELL;
    const oy = Math.floor(face / 3) * CELL;
    for (let i = 0; i < boards; i++) {
      const light = 178 + Math.floor(rng() * 40);
      g.fillStyle = `rgb(${light}, ${Math.floor(light * 0.82)}, ${Math.floor(light * 0.58)})`;
      g.fillRect(ox, oy + i * h, CELL, h);
      for (let k = 0; k < 5; k++) {
        const y = oy + i * h + rng() * h;
        g.strokeStyle = `rgba(80, 52, 26, ${0.1 + rng() * 0.15})`;
        g.beginPath();
        g.moveTo(ox, y);
        g.lineTo(ox + CELL, y + (rng() - 0.5) * 3);
        g.stroke();
      }
      g.fillStyle = "rgba(60, 38, 18, 0.7)";
      g.fillRect(ox, oy + i * h, CELL, 2);
    }
    // Darker frame around the face, and a diagonal brace.
    g.strokeStyle = "rgb(112, 78, 44)";
    g.lineWidth = 12;
    g.strokeRect(ox + 6, oy + 6, CELL - 12, CELL - 12);
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(ox + 10, oy + 10);
    g.lineTo(ox + CELL - 10, oy + CELL - 10);
    g.stroke();
  }
  return canvas;
}

function atlasTexture(canvas: HTMLCanvasElement, data: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  return texture;
}

/**
 * Set on every prop InstancedMesh (`mesh.userData.pick`): which map list it draws and the map
 * index of each instance, so the editor can tell what was clicked (D-049).
 */
export interface PropPick {
  kind: "rock" | "crate" | "shrub" | "model";
  indices: number[];
}

export interface PropsView {
  group: THREE.Group;
  /** Shrubs can be hidden on the Low quality preset. */
  shrubs: THREE.Object3D | null;
  /**
   * A bullet went through crate `index`: punch a hole in the entry face and (when known) the
   * exit face, so the world behind the crate can be seen through it.
   */
  perforateCrate(index: number, entry: Vec3, exit?: Vec3): void;
  dispose(): void;
}

/**
 * Builds all map props as InstancedMesh (one draw call per kind and variant, master section 9).
 * Rocks use photoscanned models when available (D-014), scaled to their collider ellipsoids so
 * what you see is what stops a bullet. Rocks near the player cast shadows; far ones do not.
 */
export function createProps(
  map: MapDef,
  rockAssets: readonly RockAsset[],
  playerZone: PlayerZone,
  modelAssets: ReadonlyMap<string, ModelAsset> = new Map(),
): PropsView {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const euler = new THREE.Euler();

  // Walls (maps that have them)
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
  const shapes: Array<{
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    aspect?: number;
    lods?: { mid: THREE.BufferGeometry | null; lo: THREE.BufferGeometry | null };
  }> = [];
  if (rockAssets.length > 0) {
    for (const a of rockAssets) shapes.push(a);
  } else {
    const mat = new THREE.MeshStandardMaterial({
      color: map.atmosphere.rockColor,
      roughness: 0.92,
      flatShading: true,
    });
    disposables.push(mat);
    for (let v = 0; v < PROCEDURAL_ROCK_VARIANTS; v++) {
      const geometry = proceduralRockGeometry(v);
      disposables.push(geometry);
      shapes.push({ geometry, material: mat });
    }
  }
  const zoneDistance = (r: RockProp): number =>
    Math.hypot(r.collider.center.x - playerZone.centerX, r.collider.center.z - playerZone.centerZ);
  shapes.forEach((shape, v) => {
    // Three detail levels by distance from the player's zone (D-044): near rocks are smooth and
    // cast shadows, middle ones are lighter, far ones are cheap.
    const tiers = [
      { min: 0, max: NEAR_ROCK_M, geometry: shape.geometry, near: true },
      {
        min: NEAR_ROCK_M,
        max: MID_ROCK_M,
        geometry: shape.lods?.mid ?? shape.geometry,
        near: false,
      },
      {
        min: MID_ROCK_M,
        max: Infinity,
        geometry: shape.lods?.lo ?? shape.lods?.mid ?? shape.geometry,
        near: false,
      },
    ];
    for (const tier of tiers) {
      const near = tier.near;
      const indices: number[] = [];
      map.rocks.forEach((r, index) => {
        const d = zoneDistance(r);
        if (r.variant % shapes.length === v && d >= tier.min && d < tier.max) indices.push(index);
      });
      const rocks = indices
        .map((index) => map.rocks[index])
        .filter((r): r is RockProp => r !== undefined);
      if (rocks.length === 0) continue;
      const mesh = new THREE.InstancedMesh(tier.geometry, shape.material, rocks.length);
      mesh.userData.pick = { kind: "rock", indices } satisfies PropPick;
      rocks.forEach((r, i) => {
        const c = r.collider;
        p.set(c.center.x, c.center.y, c.center.z);
        euler.set(r.rotX ?? 0, r.rotY, r.rotZ ?? 0, "YXZ");
        q.setFromEuler(euler);
        const halfHeight = shape.aspect === undefined ? c.radiusY : rockHalfHeight(r, shape.aspect);
        s.set(c.radiusXZ, halfHeight, c.radiusXZ);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = near;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  });

  // Wooden crates (D-032): hiding places that bullets pass through. Variant 1 is a little
  // darker and comes with a loose plank lying next to it (a ruined look). A crate that is shot
  // is swapped for its own mesh with its own textures so the bullet holes can be see-through.
  let perforateCrate: (index: number, entry: Vec3, exit?: Vec3) => void = () => undefined;
  if (map.crates.length > 0) {
    const geometry = crateGeometry();
    const baseCanvas = woodAtlasCanvas();
    const baseTexture = atlasTexture(baseCanvas, false);
    disposables.push(geometry, baseTexture);
    const intactMat = new THREE.MeshStandardMaterial({ map: baseTexture, roughness: 0.95 });
    const brokenMat = new THREE.MeshStandardMaterial({
      map: baseTexture,
      color: 0xd9c4ae,
      roughness: 1,
    });
    disposables.push(intactMat, brokenMat);
    const qLean = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const rng = createRng(5150);
    const planks: Array<{ x: number; y: number; z: number; rot: number; tilt: number }> = [];
    const slots = new Map<number, { mesh: THREE.InstancedMesh; instance: number }>();
    const crateMatrix = (c: MapDef["crates"][number], out: THREE.Matrix4): void => {
      p.set(c.box.center.x, c.box.center.y, c.box.center.z);
      q.setFromAxisAngle(up, c.box.rotY);
      qLean.setFromAxisAngle(zAxis, c.lean);
      q.multiply(qLean);
      s.set(c.box.half.x * 2, c.box.half.y * 2, c.box.half.z * 2);
      out.compose(p, q, s);
    };
    for (const variant of [0, 1] as const) {
      const ids: number[] = [];
      map.crates.forEach((c, i) => {
        if (c.variant === variant) ids.push(i);
      });
      if (ids.length === 0) continue;
      const mesh = new THREE.InstancedMesh(
        geometry,
        variant === 0 ? intactMat : brokenMat,
        ids.length,
      );
      mesh.userData.pick = { kind: "crate", indices: ids } satisfies PropPick;
      ids.forEach((crateIndex, i) => {
        const c = map.crates[crateIndex];
        if (!c) return;
        crateMatrix(c, m);
        mesh.setMatrixAt(i, m);
        slots.set(crateIndex, { mesh, instance: i });
        if (variant === 1) {
          const a = rng() * Math.PI * 2;
          const d = Math.max(c.box.half.x, c.box.half.z) + 0.5 + rng() * 0.6;
          planks.push({
            x: c.box.center.x + Math.cos(a) * d,
            y: c.box.center.y - c.box.half.y + 0.1,
            z: c.box.center.z + Math.sin(a) * d,
            rot: rng() * Math.PI,
            tilt: (rng() - 0.5) * 0.4,
          });
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (planks.length > 0) {
      const mesh = new THREE.InstancedMesh(box, brokenMat, planks.length);
      planks.forEach((pl, i) => {
        p.set(pl.x, pl.y, pl.z);
        q.setFromAxisAngle(up, pl.rot);
        qLean.setFromAxisAngle(zAxis, pl.tilt);
        q.multiply(qLean);
        s.set(1.3, 0.05, 0.16);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    interface Perforated {
      mapCanvas: HTMLCanvasElement;
      alphaCanvas: HTMLCanvasElement;
      mapTexture: THREE.CanvasTexture;
      alphaTexture: THREE.CanvasTexture;
    }
    const perforated = new Map<number, Perforated>();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);

    /** Gives a crate its own mesh and textures the first time it is shot. */
    const detach = (index: number): Perforated | null => {
      const existing = perforated.get(index);
      if (existing) return existing;
      const crate = map.crates[index];
      const slot = slots.get(index);
      if (!crate || !slot || perforated.size >= MAX_PERFORATED) return null;
      const mapCanvas = document.createElement("canvas");
      mapCanvas.width = baseCanvas.width;
      mapCanvas.height = baseCanvas.height;
      mapCanvas.getContext("2d")?.drawImage(baseCanvas, 0, 0);
      const alphaCanvas = document.createElement("canvas");
      alphaCanvas.width = baseCanvas.width;
      alphaCanvas.height = baseCanvas.height;
      const ag = alphaCanvas.getContext("2d");
      if (ag) {
        ag.fillStyle = "#fff";
        ag.fillRect(0, 0, alphaCanvas.width, alphaCanvas.height);
      }
      const mapTexture = atlasTexture(mapCanvas, false);
      const alphaTexture = atlasTexture(alphaCanvas, true);
      const material = new THREE.MeshStandardMaterial({
        map: mapTexture,
        alphaMap: alphaTexture,
        alphaTest: 0.5,
        color: crate.variant === 1 ? 0xd9c4ae : 0xffffff,
        roughness: 0.95,
      });
      const own = new THREE.Mesh(geometry, material);
      const mat4 = new THREE.Matrix4();
      crateMatrix(crate, mat4);
      mat4.decompose(own.position, own.quaternion, own.scale);
      own.castShadow = true;
      own.receiveShadow = true;
      group.add(own);
      slot.mesh.setMatrixAt(slot.instance, zero);
      slot.mesh.instanceMatrix.needsUpdate = true;
      disposables.push(material, mapTexture, alphaTexture);
      const entry: Perforated = { mapCanvas, alphaCanvas, mapTexture, alphaTexture };
      perforated.set(index, entry);
      return entry;
    };

    /** Paints one bullet hole where a world point lies on a crate face. */
    const paintHole = (state: Perforated, index: number, point: Vec3): void => {
      const crateBox = map.crates[index]?.box;
      if (!crateBox) return;
      const { face, fu, fv, sizeU, sizeV } = crateFaceAt(crateBox, point);
      const cx = face % 3;
      const cy = Math.floor(face / 3);
      const x = (cx + fu) * CELL;
      const y = (cy + 1 - fv) * CELL;
      const rx = (HOLE_RADIUS_M / sizeU) * CELL;
      const ry = (HOLE_RADIUS_M / sizeV) * CELL;
      const jitter = createRng(Math.floor(point.x * 1000) ^ Math.floor(point.z * 1000));
      const ragged = (g: CanvasRenderingContext2D, scale: number): void => {
        g.beginPath();
        const steps = 14;
        for (let k = 0; k < steps; k++) {
          const a = (k / steps) * Math.PI * 2;
          const r = scale * (0.8 + jitter() * 0.4);
          const px = x + Math.cos(a) * rx * r;
          const py = y + Math.sin(a) * ry * r;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
      };
      const mg = state.mapCanvas.getContext("2d");
      const ag = state.alphaCanvas.getContext("2d");
      for (const g of [mg, ag]) {
        if (!g) continue;
        g.save();
        g.beginPath();
        g.rect(cx * CELL, cy * CELL, CELL, CELL);
        g.clip();
      }
      if (mg) {
        // Burnt, splintered rim around the hole.
        mg.fillStyle = "rgba(34, 22, 12, 0.9)";
        ragged(mg, 1.7);
        mg.fill();
      }
      if (ag) {
        ag.fillStyle = "#000";
        ragged(ag, 1);
        ag.fill();
      }
      for (const g of [mg, ag]) g?.restore();
      state.mapTexture.needsUpdate = true;
      state.alphaTexture.needsUpdate = true;
    };

    perforateCrate = (index, entry, exit): void => {
      const state = detach(index);
      if (!state) return;
      paintHole(state, index, entry);
      if (exit) paintHole(state, index, exit);
    };
  }

  // Shrubs (decoration only, no collider)
  let shrubs: THREE.Object3D | null = null;
  if (map.shrubs.length > 0) {
    const geometry = new THREE.IcosahedronGeometry(0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: SHRUB_COLOR,
      roughness: 1,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, mat, map.shrubs.length);
    mesh.userData.pick = {
      kind: "shrub",
      indices: map.shrubs.map((_, i) => i),
    } satisfies PropPick;
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
    shrubs = mesh;
  }

  // Placed models (D-054): one instanced mesh per model type. A type whose model is not loaded
  // yet is drawn as a plain sand-colored box of the right size, so the layout stays editable.
  const byType = new Map<string, number[]>();
  map.models.forEach((model, index) => {
    const list = byType.get(model.type) ?? [];
    list.push(index);
    byType.set(model.type, list);
  });
  for (const [type, indices] of byType) {
    const asset = modelAssets.get(type);
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;
    if (asset) {
      geometry = asset.geometry;
      material = asset.material;
    } else {
      geometry = new THREE.BoxGeometry(2, 2, 2);
      material = new THREE.MeshStandardMaterial({ color: 0x9c8a6a, roughness: 1 });
      disposables.push(geometry, material);
    }
    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
    mesh.userData.pick = { kind: "model", indices } satisfies PropPick;
    indices.forEach((index, i) => {
      const model = map.models[index];
      if (!model) return;
      p.set(model.center.x, model.center.y, model.center.z);
      euler.set(model.rotX ?? 0, model.rotY, model.rotZ ?? 0, "YXZ");
      q.setFromEuler(euler);
      s.set(model.half.x, model.half.y, model.half.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return {
    group,
    shrubs,
    perforateCrate: (index, entry, exit) => perforateCrate(index, entry, exit),
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
