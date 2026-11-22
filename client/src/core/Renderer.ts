import * as THREE from "three";
import { PLAYER } from "@oneshot/shared";

const SKY_COLOR = 0xc9d6df;
const SAND_COLOR = 0xc2a27a;
const MARKER_COLOR = 0x5a4632;
const FOG_DENSITY = 0.0018;
const MAX_PIXEL_RATIO = 2;
const GROUND_SIZE_M = 1200;
const SHADOW_MAP_SIZE = 2048;
const SHADOW_HALF_EXTENT_M = 60;

/** Distance markers (meters ahead of the camera) so depth can be judged in phase 0. */
const MARKERS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -6, z: -100 },
  { x: 5, z: -200 },
  { x: -4, z: -300 },
  { x: 3, z: -400 },
];

/**
 * Owns the WebGL renderer, the scene, and the single main camera.
 * Phase 0 scene: sand ground plane, one sun light (+ a cheap sky fill),
 * exponential fog, and four distance markers.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.FogExp2(SKY_COLOR, FOG_DENSITY);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
    this.camera.position.set(0, PLAYER.eyeHeight.stand, 0);
    this.camera.rotation.order = "YXZ";

    this.buildLights();
    this.buildGround();
    this.buildMarkers();
    this.resize();
  }

  /** Point the camera. yaw: radians around the vertical axis; pitch: radians up/down. */
  applyLook(yaw: number, pitch: number): void {
    this.camera.rotation.set(pitch, yaw, 0);
  }

  resize(): void {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Rough per-frame cost, for the dev overlay and PERF.md. */
  stats(): { drawCalls: number; triangles: number } {
    const info = this.renderer.info.render;
    return { drawCalls: info.calls, triangles: info.triangles };
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private buildLights(): void {
    const fill = new THREE.HemisphereLight(SKY_COLOR, SAND_COLOR, 0.6);
    this.scene.add(fill);

    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.position.set(40, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    const cam = sun.shadow.camera;
    cam.left = -SHADOW_HALF_EXTENT_M;
    cam.right = SHADOW_HALF_EXTENT_M;
    cam.top = SHADOW_HALF_EXTENT_M;
    cam.bottom = -SHADOW_HALF_EXTENT_M;
    cam.near = 1;
    cam.far = 250;
    cam.updateProjectionMatrix();
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  private buildGround(): void {
    const geometry = new THREE.PlaneGeometry(GROUND_SIZE_M, GROUND_SIZE_M);
    const material = new THREE.MeshStandardMaterial({ color: SAND_COLOR, roughness: 1 });
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.disposables.push(geometry, material);
  }

  private buildMarkers(): void {
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({ color: MARKER_COLOR, roughness: 0.9 });
    const markers = new THREE.InstancedMesh(geometry, material, MARKERS.length);
    const matrix = new THREE.Matrix4();
    MARKERS.forEach((m, i) => {
      matrix.makeTranslation(m.x, 1, m.z);
      markers.setMatrixAt(i, matrix);
    });
    markers.instanceMatrix.needsUpdate = true;
    markers.castShadow = true;
    markers.receiveShadow = true;
    this.scene.add(markers);
    this.disposables.push(geometry, material);
  }
}
