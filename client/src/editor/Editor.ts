import * as THREE from "three/webgpu";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { MODEL_TYPES, ROCK_ABOVE_GROUND, modelType, propsFromLayout } from "@oneshot/shared";
import type { HeightFn, MapLayout } from "@oneshot/shared";
import type { World } from "../world/MapLayout";
import type { PropPick } from "../world/Props";

/**
 * In-game map editor (D-049). Development builds only (F2). The owner builds HIS half of the
 * map (player A, north); the other half is always the mirror, drawn live.
 *
 * Camera like Maya (owner request): the game keys do nothing here.
 *   Mouse wheel: move toward / away from the point under the cursor
 *   Ctrl + left drag: turn around the selected prop (or the point clicked)
 *   Alt + left drag: slide the view left / right / up / down
 *   F: frame the selected prop
 * Props:
 *   Left click: select | left drag on a prop: move it over the ground
 *   D + left drag on a prop: copy it and move the copy
 *   T + left drag on a crate or model: copy it flush against a face, like a brick (up = on top)
 *   N: new model under the cursor (N again: next model type)
 *   W move arrows | E rotate (rocks on every axis, D-051) | S resize (Shift: whole shape)
 *   Delete: remove | Ctrl+Z: undo | Ctrl+S: save to the project (the game reloads) | Esc: deselect
 *
 * Collision is rebuilt from the saved file when the game reloads after saving.
 */

type Kind = PropPick["kind"];

interface Selection {
  kind: Kind;
  index: number;
}

interface SavedView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

const ORBIT_RAD_PER_PX = 0.005;
const PITCH_LIMIT = 1.5;
/** Each wheel notch moves this fraction of the distance to the point under the cursor. */
const DOLLY_STEP = 0.18;
const MIN_DOLLY_M = 0.5;
/** Distance used when the cursor points at the sky. */
const DEFAULT_FOCUS_M = 40;
const MAX_RAY_M = 3000;
const REBUILD_INTERVAL_S = 0.08;
const MAX_UNDO = 200;
const STATE_KEY = "oneshot.editor.view";
const EDITOR_FOV_DEG = 70;
const RELOAD_DELAY_MS = 600;
/** Mouse travel before a T + drag decides which face the copy goes against (pixels). */
const SNAP_START_PX = 8;

const round = (v: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

/** Layout with short numbers, ready to save. */
function roundedLayout(layout: MapLayout): MapLayout {
  return {
    version: 1,
    map: layout.map,
    rocks: layout.rocks.map((r) => ({
      x: round(r.x, 3),
      z: round(r.z, 3),
      radiusXZ: round(r.radiusXZ, 3),
      radiusY: round(r.radiusY, 3),
      lift: round(r.lift, 3),
      rotY: round(r.rotY, 4),
      ...(r.rotX ? { rotX: round(r.rotX, 4) } : {}),
      ...(r.rotZ ? { rotZ: round(r.rotZ, 4) } : {}),
      variant: r.variant,
    })),
    crates: layout.crates.map((c) => ({
      x: round(c.x, 3),
      z: round(c.z, 3),
      base: round(c.base, 3),
      half: { x: round(c.half.x, 3), y: round(c.half.y, 3), z: round(c.half.z, 3) },
      rotY: round(c.rotY, 4),
      lean: round(c.lean, 4),
      variant: c.variant,
    })),
    shrubs: layout.shrubs.map((s) => ({
      x: round(s.x, 3),
      z: round(s.z, 3),
      scale: round(s.scale, 3),
    })),
    models: layout.models.map((m) => ({
      type: m.type,
      x: round(m.x, 3),
      z: round(m.z, 3),
      lift: round(m.lift, 3),
      rotY: round(m.rotY, 4),
      ...(m.rotX ? { rotX: round(m.rotX, 4) } : {}),
      ...(m.rotZ ? { rotZ: round(m.rotZ, 4) } : {}),
      scale: { x: round(m.scale.x, 3), y: round(m.scale.y, 3), z: round(m.scale.z, 3) },
    })),
  };
}

/** Half size of a placed model in meters (its type's real size times its scale). */
function modelHalf(m: { type: string; scale: { x: number; y: number; z: number } }): {
  x: number;
  y: number;
  z: number;
} {
  const size = modelType(m.type)?.size ?? { x: 1, y: 1, z: 1 };
  return { x: (size.x * m.scale.x) / 2, y: (size.y * m.scale.y) / 2, z: (size.z * m.scale.z) / 2 };
}

export interface EditorOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  world: World;
  layout: MapLayout;
  heightAt: HeightFn;
  /** Called when the editor opens (true) or closes (false): turn the game controls off/on. */
  onToggle(active: boolean): void;
}

export class Editor {
  active = false;
  private layout: MapLayout;
  private readonly controls: TransformControls;
  private readonly helper: THREE.Object3D;
  private readonly proxy = new THREE.Object3D();
  /** Size of the selected prop when a resize drag started (for Shift = whole shape). */
  private readonly scaleStart = new THREE.Vector3(1, 1, 1);
  private readonly raycaster = new THREE.Raycaster();
  private readonly panel: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private selection: Selection | null = null;
  private readonly position = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private readonly keys = new Set<string>();
  private drag: { plane: THREE.Plane; offset: THREE.Vector3 } | null = null;
  /** Camera move in progress: turning around a point, or sliding the view. */
  private nav: {
    kind: "orbit" | "pan";
    pivot: THREE.Vector3;
    lastX: number;
    lastY: number;
  } | null = null;
  private readonly undoStack: string[] = [];
  private dirty = false;
  private sinceRebuild = 0;
  private unsaved = false;
  private saving = false;
  /** T + drag on a crate: a copy that snaps against one of its faces, like a brick. */
  private snap: {
    kind: "crate" | "model";
    source: number;
    copy: number | null;
    x: number;
    y: number;
  } | null = null;
  /** Last mouse position over the game (where N puts a new model). */
  private lastPointer: MouseEvent | null = null;
  /** Index of the model the last N press created (N again changes its type). */
  private lastSpawn: number | null = null;
  private message = "";

  constructor(private readonly o: EditorOptions) {
    this.layout = structuredClone(o.layout);
    // Same turn order as the game's rocks: Y first, then tilt (D-051).
    this.proxy.rotation.order = "YXZ";
    o.scene.add(this.proxy);
    this.controls = new TransformControls(o.camera, o.canvas);
    this.controls.enabled = false;
    this.controls.setSpace("world");
    this.helper = this.controls.getHelper();
    this.helper.visible = false;
    o.scene.add(this.helper);
    this.controls.addEventListener("mouseDown", () => {
      this.pushUndo();
      this.scaleStart.copy(this.proxy.scale);
    });
    this.controls.addEventListener("objectChange", () => this.fromProxy());

    this.panel = document.createElement("div");
    this.panel.style.cssText =
      "position:fixed;left:16px;top:56px;z-index:20;max-width:560px;padding:10px 12px;" +
      "background:rgba(20,16,12,0.82);color:#f3e9da;font:13px/1.5 system-ui,sans-serif;" +
      "border-radius:8px;pointer-events:none;display:none;white-space:pre-line";
    this.panel.textContent =
      "MAP EDITOR (F2 to leave)\n" +
      "Wheel: closer / farther | Ctrl + left drag: turn around | Alt + left drag: slide | F: frame\n" +
      "Click select | drag move on the ground | D + drag copy | T + drag: brick copy | N new model\n" +
      "W arrows | E rotate | S resize (Shift: whole shape) | Delete remove | Ctrl+Z undo | Esc deselect\n" +
      "Ctrl+S save | F2 saves and goes back to the game\n" +
      "You build the north half; the south half is its mirror.";
    this.status = document.createElement("div");
    this.status.style.cssText = "margin-top:6px;color:#ffd27a;font-weight:600";
    this.panel.appendChild(this.status);
    document.body.appendChild(this.panel);

    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "KeyD" || e.code === "KeyT") this.controls.enabled = this.active;
      // A lone Alt press would move the focus to the browser menu.
      if (this.active && e.key === "Alt") e.preventDefault();
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.drag = null;
      this.nav = null;
    });
    o.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => {
      if (e.button === 0) {
        this.drag = null;
        this.nav = null;
        this.snap = null;
      }
    });
    o.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });

    // Back in the editor after the reload that follows a save.
    const view = this.loadView();
    if (view) this.open(view);
  }

  /** Called every fixed step while the editor is open: camera and live redraw. */
  update(dt: number): void {
    if (!this.active) return;
    const ground = this.o.heightAt(this.position.x, this.position.z) + 1;
    if (this.position.y < ground) this.position.y = ground;
    this.applyCamera();

    this.sinceRebuild += dt;
    if (this.dirty && this.sinceRebuild >= REBUILD_INTERVAL_S) {
      this.o.world.rebuildProps(propsFromLayout(this.layout, this.o.heightAt));
      this.dirty = false;
      this.sinceRebuild = 0;
    }
    this.showStatus();
  }

  private open(view?: SavedView): void {
    const cam = this.o.camera;
    if (view) {
      this.position.set(view.x, view.y, view.z);
      this.yaw = view.yaw;
      this.pitch = view.pitch;
    } else {
      this.position.copy(cam.position);
      this.yaw = cam.rotation.y;
      this.pitch = cam.rotation.x;
    }
    this.active = true;
    this.controls.enabled = true;
    this.helper.visible = true;
    this.panel.style.display = "block";
    cam.fov = EDITOR_FOV_DEG;
    cam.updateProjectionMatrix();
    this.o.onToggle(true);
    this.storeView();
  }

  private close(): void {
    if (this.unsaved) {
      // Leaving saves automatically (owner request, D-053); the game reloads with the new
      // layout and its collision, outside the editor.
      void this.save(false);
      return;
    }
    this.select(null);
    this.active = false;
    this.drag = null;
    this.nav = null;
    this.controls.enabled = false;
    this.helper.visible = false;
    this.panel.style.display = "none";
    this.o.onToggle(false);
    this.forgetView();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === "F2") {
      e.preventDefault();
      if (this.active) this.close();
      else this.open();
      return;
    }
    if (!this.active) return;
    if (e.key === "Alt") e.preventDefault();
    this.keys.add(e.code);
    // While D is held a click on a prop copies it, even where the arrows cover the prop.
    if (e.code === "KeyD" || e.code === "KeyT") this.controls.enabled = false;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === "KeyS") {
      e.preventDefault();
      void this.save();
      return;
    }
    if (ctrl && e.code === "KeyZ") {
      e.preventDefault();
      this.undo();
      return;
    }
    if (ctrl || e.altKey) return;
    switch (e.code) {
      case "KeyF":
        this.frameSelected();
        break;
      case "KeyN":
        this.spawnModel();
        break;
      case "KeyW":
        this.setMode("translate");
        break;
      case "KeyE":
        this.setMode("rotate");
        break;
      case "KeyS":
      case "KeyR":
        this.setMode("scale");
        break;
      case "Delete":
      case "Backspace":
        this.removeSelected();
        break;
      case "Escape":
        this.select(null);
        break;
      default:
        break;
    }
  }

  private setMode(mode: "translate" | "rotate" | "scale"): void {
    this.controls.setMode(mode);
    this.updateAxes();
  }

  /** Rocks turn freely on every axis (D-051); crates and shrubs only around the vertical. */
  private updateAxes(): void {
    const kind = this.selection?.kind;
    const all = this.controls.mode !== "rotate" || kind === "rock" || kind === "model";
    this.controls.showX = all;
    this.controls.showZ = all;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.active || e.button !== 0) return;
    if (e.ctrlKey || e.altKey) {
      e.preventDefault();
      const kind = e.ctrlKey ? "orbit" : "pan";
      const pivot =
        kind === "orbit" && this.selection ? this.proxy.position.clone() : this.pointUnder(e);
      this.nav = { kind, pivot, lastX: e.clientX, lastY: e.clientY };
      return;
    }
    const snapping = this.keys.has("KeyT");
    const copying = this.keys.has("KeyD") || snapping;
    // A click on the arrows belongs to the arrows (except while copying with D).
    if (!copying && (this.controls.dragging || this.controls.axis !== null)) return;
    const hit = this.pick(e);
    if (!hit) {
      this.select(null);
      return;
    }
    if (hit.mirror) {
      this.message = "That is the mirrored half: edit the same prop on your own (north) side.";
      return;
    }
    if (snapping && (hit.sel.kind === "crate" || hit.sel.kind === "model")) {
      this.pushUndo();
      this.select(hit.sel);
      this.snap = {
        kind: hit.sel.kind,
        source: hit.sel.index,
        copy: null,
        x: e.clientX,
        y: e.clientY,
      };
      return;
    }
    this.pushUndo();
    let sel = hit.sel;
    if (copying) {
      sel = this.duplicate(sel);
      this.message = "Copied.";
    }
    this.select(sel);
    const ground = this.o.heightAt(hit.point.x, hit.point.z);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ground);
    const pos = this.entryXZ(sel);
    this.drag = { plane, offset: new THREE.Vector3(pos.x - hit.point.x, 0, pos.z - hit.point.z) };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.active) return;
    if (e.target === this.o.canvas) this.lastPointer = e;
    if (this.nav) {
      const dx = e.clientX - this.nav.lastX;
      const dy = e.clientY - this.nav.lastY;
      this.nav.lastX = e.clientX;
      this.nav.lastY = e.clientY;
      if (this.nav.kind === "orbit") this.orbit(this.nav.pivot, dx, dy);
      else this.pan(this.nav.pivot, dx, dy);
      return;
    }
    if (this.snap) {
      this.moveSnap(e);
      return;
    }
    if (!this.drag || !this.selection) return;
    this.setRay(e);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.drag.plane, point)) return;
    this.setEntryXZ(this.selection, point.x + this.drag.offset.x, point.z + this.drag.offset.z);
    this.toProxy();
    this.changed();
  }

  /**
   * T + drag: the copy sits flush against the face of the crate that best matches the mouse
   * direction: on top when dragging up, beside it when dragging sideways (D-053).
   */
  private moveSnap(e: PointerEvent): void {
    const snap = this.snap;
    if (!snap) return;
    const dx = e.clientX - snap.x;
    const dy = e.clientY - snap.y;
    if (Math.hypot(dx, dy) < SNAP_START_PX) return;
    const kind = snap.kind;
    const box = this.boxOf(kind, snap.source);
    if (!box) return;
    if (snap.copy === null) {
      snap.copy = this.duplicate({ kind, index: snap.source }).index;
      this.message = "Snapped copy.";
    }
    const h = this.o.heightAt;
    const src = { x: box.x, z: box.z, rotY: box.rotY, half: box.half };
    const center = new THREE.Vector3(src.x, box.bottom + src.half.y, src.z);
    const ax = new THREE.Vector3(Math.cos(src.rotY), 0, -Math.sin(src.rotY));
    const az = new THREE.Vector3(Math.sin(src.rotY), 0, Math.cos(src.rotY));
    const faces = [
      ax.clone().multiplyScalar(2 * src.half.x),
      ax.clone().multiplyScalar(-2 * src.half.x),
      az.clone().multiplyScalar(2 * src.half.z),
      az.clone().multiplyScalar(-2 * src.half.z),
      new THREE.Vector3(0, 2 * src.half.y, 0),
    ];
    const rect = this.o.canvas.getBoundingClientRect();
    const toScreen = (v: THREE.Vector3): THREE.Vector2 => {
      const n = v.clone().project(this.o.camera);
      return new THREE.Vector2((n.x * rect.width) / 2, (-n.y * rect.height) / 2);
    };
    const origin = toScreen(center);
    const mouse = new THREE.Vector2(dx, dy).normalize();
    let best = faces[0] ?? new THREE.Vector3();
    let bestScore = -Infinity;
    for (const f of faces) {
      const dir = toScreen(center.clone().add(f)).sub(origin);
      if (dir.lengthSq() < 1e-6) continue;
      const score = dir.normalize().dot(mouse);
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
    const x = src.x + best.x;
    const z = src.z + best.z;
    // Same height in the world as the source (plus one box when stacking): straight rows.
    const above = box.bottom + best.y - h(x, z);
    if (kind === "crate") {
      const from = this.layout.crates[snap.source];
      const copy = this.layout.crates[snap.copy];
      if (!from || !copy) return;
      Object.assign(copy, structuredClone(from), { x, z, base: above });
    } else {
      const from = this.layout.models[snap.source];
      const copy = this.layout.models[snap.copy];
      if (!from || !copy) return;
      Object.assign(copy, structuredClone(from), { x, z, lift: above });
    }
    this.select({ kind, index: snap.copy });
    this.changed();
  }

  /** Box of a crate or model in the world: center x, z, bottom height, half size, turn. */
  private boxOf(
    kind: "crate" | "model",
    index: number,
  ): {
    x: number;
    z: number;
    bottom: number;
    half: { x: number; y: number; z: number };
    rotY: number;
  } | null {
    const h = this.o.heightAt;
    if (kind === "crate") {
      const c = this.layout.crates[index];
      return c
        ? { x: c.x, z: c.z, bottom: h(c.x, c.z) + c.base, half: c.half, rotY: c.rotY }
        : null;
    }
    const m = this.layout.models[index];
    return m
      ? { x: m.x, z: m.z, bottom: h(m.x, m.z) + m.lift, half: modelHalf(m), rotY: m.rotY }
      : null;
  }

  /** N: puts a new model under the cursor; pressing N again switches to the next type. */
  private spawnModel(): void {
    const types = MODEL_TYPES;
    if (types.length === 0 || !this.lastPointer) return;
    const sel = this.selection;
    const current = sel?.kind === "model" ? this.layout.models[sel.index] : undefined;
    let typeIndex = 0;
    if (current && this.lastSpawn === sel?.index) {
      typeIndex = (types.findIndex((t) => t.id === current.type) + 1) % types.length;
    }
    const type = types[typeIndex];
    if (!type) return;
    this.pushUndo();
    if (current && this.lastSpawn === sel?.index) {
      current.type = type.id;
    } else {
      const point = this.pointUnder(this.lastPointer);
      this.layout.models.push({
        type: type.id,
        x: point.x,
        z: point.z,
        lift: 0,
        rotY: this.yaw,
        scale: { x: 1, y: 1, z: 1 },
      });
      this.select({ kind: "model", index: this.layout.models.length - 1 });
      this.lastSpawn = this.layout.models.length - 1;
    }
    this.toProxy();
    this.changed();
    this.message = `New: ${type.label} (N again: next type)`;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.active) return;
    e.preventDefault(); // also stops Ctrl + wheel from zooming the page
    const target = this.pointUnder(e);
    const toTarget = target.clone().sub(this.position);
    const dist = toTarget.length();
    if (dist < 1e-6) return;
    const step = e.deltaY < 0 ? DOLLY_STEP : -DOLLY_STEP / (1 - DOLLY_STEP);
    const move = dist * step;
    if (dist - move < MIN_DOLLY_M) return;
    this.position.addScaledVector(toTarget.normalize(), move);
  }

  /** Turns the camera around a point, always looking at it. */
  private orbit(pivot: THREE.Vector3, dx: number, dy: number): void {
    const offset = this.position.clone().sub(pivot);
    const radius = offset.length();
    if (radius < 1e-6) return;
    let yaw = Math.atan2(offset.x, offset.z) - dx * ORBIT_RAD_PER_PX;
    let elevation = Math.asin(Math.max(-1, Math.min(1, offset.y / radius))) + dy * ORBIT_RAD_PER_PX;
    elevation = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, elevation));
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    const flat = radius * Math.cos(elevation);
    this.position.set(
      pivot.x + flat * Math.sin(yaw),
      pivot.y + radius * Math.sin(elevation),
      pivot.z + flat * Math.cos(yaw),
    );
    this.lookAt(pivot);
  }

  /** Slides the view so the point under the cursor follows the mouse. */
  private pan(pivot: THREE.Vector3, dx: number, dy: number): void {
    const cam = this.o.camera;
    const dist = Math.max(1, this.position.distanceTo(pivot));
    const height = this.o.canvas.getBoundingClientRect().height || 1;
    const metersPerPx = (2 * dist * Math.tan((cam.fov * Math.PI) / 180 / 2)) / height;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = new THREE.Vector3(
      Math.sin(this.yaw) * Math.sin(this.pitch),
      Math.cos(this.pitch),
      Math.cos(this.yaw) * Math.sin(this.pitch),
    );
    this.position.addScaledVector(right, -dx * metersPerPx).addScaledVector(up, dy * metersPerPx);
  }

  private lookAt(point: THREE.Vector3): void {
    const dir = point.clone().sub(this.position);
    const len = dir.length();
    if (len < 1e-6) return;
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.asin(dir.y / len)));
  }

  /** Brings the camera close to the selected prop (Maya's F). */
  private frameSelected(): void {
    if (!this.selection) return;
    const target = this.proxy.position.clone();
    const size = Math.max(this.proxy.scale.x, this.proxy.scale.y, this.proxy.scale.z, 0.5);
    const dir = this.position.clone().sub(target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.5, 1);
    this.position.copy(target).addScaledVector(dir.normalize(), size * 4 + 3);
    this.lookAt(target);
  }

  /** The point under the cursor: a prop, else the ground, else a point straight ahead. */
  private pointUnder(e: MouseEvent): THREE.Vector3 {
    this.setRay(e);
    const ray = this.raycaster.ray;
    const hits = this.raycaster.intersectObjects(this.o.world.propsGroup.children, false);
    const prop = hits[0]?.point;
    const ground = this.groundHit(ray);
    if (prop && (!ground || prop.distanceTo(ray.origin) < ground.distanceTo(ray.origin))) {
      return prop.clone();
    }
    return ground ?? ray.origin.clone().addScaledVector(ray.direction, DEFAULT_FOCUS_M);
  }

  /** First point where the ray meets the terrain (coarse march, then refined). */
  private groundHit(ray: THREE.Ray): THREE.Vector3 | null {
    const h = this.o.heightAt;
    const p = new THREE.Vector3();
    let prev = 0;
    // Steps grow with distance: precise near the camera, cheap far away.
    for (let t = 0; t <= MAX_RAY_M; t += Math.max(1, t * 0.02)) {
      ray.at(t, p);
      if (p.y <= h(p.x, p.z)) {
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2;
          ray.at(mid, p);
          if (p.y <= h(p.x, p.z)) hi = mid;
          else lo = mid;
        }
        return ray.at(hi, new THREE.Vector3());
      }
      prev = t;
    }
    return null;
  }

  private setRay(e: MouseEvent): void {
    const rect = this.o.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.o.camera);
  }

  private pick(e: PointerEvent): { sel: Selection; mirror: boolean; point: THREE.Vector3 } | null {
    this.setRay(e);
    const hits = this.raycaster.intersectObjects(this.o.world.propsGroup.children, false);
    for (const h of hits) {
      const pick = h.object.userData.pick as PropPick | undefined;
      if (!pick || h.instanceId === undefined) continue;
      const index = pick.indices[h.instanceId];
      if (index === undefined) continue;
      const half = this.list(pick.kind).length;
      return {
        sel: { kind: pick.kind, index: index % half },
        mirror: index >= half,
        point: h.point,
      };
    }
    return null;
  }

  private list(kind: Kind): unknown[] {
    if (kind === "rock") return this.layout.rocks;
    if (kind === "crate") return this.layout.crates;
    if (kind === "model") return this.layout.models;
    return this.layout.shrubs;
  }

  private entryXZ(sel: Selection): { x: number; z: number } {
    const e = this.list(sel.kind)[sel.index] as { x: number; z: number };
    return { x: e.x, z: e.z };
  }

  private setEntryXZ(sel: Selection, x: number, z: number): void {
    const e = this.list(sel.kind)[sel.index] as { x: number; z: number };
    e.x = x;
    e.z = z;
  }

  private duplicate(sel: Selection): Selection {
    const list = this.list(sel.kind);
    list.push(structuredClone(list[sel.index]));
    return { kind: sel.kind, index: list.length - 1 };
  }

  private removeSelected(): void {
    const sel = this.selection;
    if (!sel) return;
    this.pushUndo();
    this.list(sel.kind).splice(sel.index, 1);
    this.select(null);
    this.changed();
    this.message = "Removed.";
  }

  private select(sel: Selection | null): void {
    if (!sel || sel.kind !== "model" || sel.index !== this.lastSpawn) this.lastSpawn = null;
    this.selection = sel;
    this.updateAxes();
    if (sel) {
      this.toProxy();
      this.controls.attach(this.proxy);
    } else {
      this.controls.detach();
    }
  }

  /** Puts the gizmo object where the selected prop is. */
  private toProxy(): void {
    const sel = this.selection;
    if (!sel) return;
    const h = this.o.heightAt;
    const p = this.proxy;
    if (sel.kind === "rock") {
      const r = this.layout.rocks[sel.index];
      if (!r) return;
      p.position.set(r.x, h(r.x, r.z) + r.radiusY * (2 * ROCK_ABOVE_GROUND - 1) + r.lift, r.z);
      p.rotation.set(r.rotX ?? 0, r.rotY, r.rotZ ?? 0);
      p.scale.set(r.radiusXZ, r.radiusY, r.radiusXZ);
    } else if (sel.kind === "crate") {
      const c = this.layout.crates[sel.index];
      if (!c) return;
      p.position.set(c.x, h(c.x, c.z) + c.base + c.half.y, c.z);
      p.rotation.set(0, c.rotY, 0);
      p.scale.set(c.half.x * 2, c.half.y * 2, c.half.z * 2);
    } else if (sel.kind === "model") {
      const md = this.layout.models[sel.index];
      if (!md) return;
      const half = modelHalf(md);
      p.position.set(md.x, h(md.x, md.z) + md.lift + half.y, md.z);
      p.rotation.set(md.rotX ?? 0, md.rotY, md.rotZ ?? 0);
      p.scale.set(md.scale.x, md.scale.y, md.scale.z);
    } else {
      const s = this.layout.shrubs[sel.index];
      if (!s) return;
      p.position.set(s.x, h(s.x, s.z), s.z);
      p.rotation.set(0, 0, 0);
      p.scale.setScalar(s.scale);
    }
    p.updateMatrixWorld(true);
  }

  /** The arrows moved the gizmo object: copy its new place into the layout. */
  private fromProxy(): void {
    const sel = this.selection;
    if (!sel) return;
    const p = this.proxy;
    const ground = this.o.heightAt(p.position.x, p.position.z);
    const mode = this.controls.mode;
    // Shift while resizing: the whole shape grows or shrinks, keeping its proportions.
    if (mode === "scale" && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"))) {
      const axis = (this.controls.axis ?? "X").charAt(0).toLowerCase() as "x" | "y" | "z";
      const start = this.scaleStart[axis];
      if (start > 1e-6) p.scale.copy(this.scaleStart).multiplyScalar(p.scale[axis] / start);
    }
    // Only the up arrow changes the height; sideways moves keep the prop on the sand.
    const vertical = mode === "translate" && (this.controls.axis ?? "").includes("Y");
    if (sel.kind === "rock") {
      const r = this.layout.rocks[sel.index];
      if (!r) return;
      r.x = p.position.x;
      r.z = p.position.z;
      r.rotY = p.rotation.y;
      if (mode === "rotate") {
        r.rotX = p.rotation.x;
        r.rotZ = p.rotation.z;
      }
      if (mode === "scale") {
        r.radiusXZ = Math.max(0.2, (p.scale.x + p.scale.z) / 2);
        r.radiusY = Math.max(0.1, p.scale.y);
      }
      if (vertical) r.lift = p.position.y - ground - r.radiusY * (2 * ROCK_ABOVE_GROUND - 1);
    } else if (sel.kind === "crate") {
      const c = this.layout.crates[sel.index];
      if (!c) return;
      c.x = p.position.x;
      c.z = p.position.z;
      c.rotY = p.rotation.y;
      if (mode === "scale") {
        c.half = {
          x: Math.max(0.1, p.scale.x / 2),
          y: Math.max(0.1, p.scale.y / 2),
          z: Math.max(0.1, p.scale.z / 2),
        };
      }
      if (vertical) c.base = p.position.y - ground - c.half.y;
    } else if (sel.kind === "model") {
      const md = this.layout.models[sel.index];
      if (!md) return;
      md.x = p.position.x;
      md.z = p.position.z;
      md.rotY = p.rotation.y;
      if (mode === "rotate") {
        md.rotX = p.rotation.x;
        md.rotZ = p.rotation.z;
      }
      if (mode === "scale") {
        md.scale = {
          x: Math.max(0.05, p.scale.x),
          y: Math.max(0.05, p.scale.y),
          z: Math.max(0.05, p.scale.z),
        };
      }
      if (vertical) md.lift = p.position.y - ground - modelHalf(md).y;
    } else {
      const s = this.layout.shrubs[sel.index];
      if (!s) return;
      s.x = p.position.x;
      s.z = p.position.z;
      if (mode === "scale") s.scale = Math.max(0.2, (p.scale.x + p.scale.y + p.scale.z) / 3);
    }
    if (!vertical) this.toProxy();
    this.changed();
  }

  private changed(): void {
    this.dirty = true;
    this.unsaved = true;
  }

  private pushUndo(): void {
    this.undoStack.push(JSON.stringify(this.layout));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  private undo(): void {
    const last = this.undoStack.pop();
    if (!last) {
      this.message = "Nothing to undo.";
      return;
    }
    this.layout = JSON.parse(last) as MapLayout;
    this.select(null);
    this.changed();
    this.message = "Undone.";
  }

  /** Saves the layout, then reloads the game (in the editor again if `stay`). */
  private async save(stay = true): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.message = "Saving...";
    if (stay) this.storeView();
    else this.forgetView();
    try {
      const res = await fetch("/__editor/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roundedLayout(this.layout)),
      });
      if (!res.ok) throw new Error(await res.text());
      this.unsaved = false;
      this.message = "Saved. The game reloads with your layout...";
      // Vite usually reloads by itself when the file changes; make sure it happens.
      window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    } catch (err) {
      this.saving = false;
      if (!stay) this.storeView();
      this.message = `Save failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private forgetView(): void {
    try {
      sessionStorage.removeItem(STATE_KEY);
    } catch {
      // storage unavailable: nothing to forget
    }
  }

  private applyCamera(): void {
    const cam = this.o.camera;
    cam.position.copy(this.position);
    cam.rotation.set(this.pitch, this.yaw, 0);
    if (cam.fov !== EDITOR_FOV_DEG) {
      cam.fov = EDITOR_FOV_DEG;
      cam.updateProjectionMatrix();
    }
  }

  private storeView(): void {
    const view: SavedView = {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
    };
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(view));
    } catch {
      // storage unavailable: the editor simply opens closed after a reload
    }
  }

  private loadView(): SavedView | null {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      return raw ? (JSON.parse(raw) as SavedView) : null;
    } catch {
      return null;
    }
  }

  private showStatus(): void {
    const sel = this.selection;
    const parts: string[] = [];
    parts.push(sel ? `Selected: ${sel.kind} ${sel.index + 1}` : "Nothing selected");
    parts.push(`mode: ${this.controls.mode}`);
    if (this.unsaved) parts.push("UNSAVED");
    const text = parts.join(" | ") + (this.message ? `\n${this.message}` : "");
    if (this.status.textContent !== text) this.status.textContent = text;
  }
}
