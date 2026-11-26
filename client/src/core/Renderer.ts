import * as THREE from "three/webgpu";

const MAX_PIXEL_RATIO = 2;
const CAMERA_FAR_M = 6000;

export type GfxBackend = "WebGPU" | "WebGL2";

export interface RendererOptions {
  /** Force the WebGL2 backend (for comparison measurements: add ?gfx=webgl to the URL). */
  forceWebGL: boolean;
}

/**
 * Owns the renderer (WebGPU with automatic WebGL2 fallback, D-012), the scene,
 * and the single main camera.
 */
export class GameRenderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.1, CAMERA_FAR_M);

  private constructor(
    readonly renderer: THREE.WebGPURenderer,
    readonly backend: GfxBackend,
  ) {
    this.camera.rotation.order = "YXZ";
    this.resize();
  }

  static async create(parent: HTMLElement, options: RendererOptions): Promise<GameRenderer> {
    const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: options.forceWebGL });
    await renderer.init();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    // Neutral keeps the stylized colors as painted (ACES shifts and desaturates them, D-058).
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(renderer.domElement);
    const backendInfo = renderer.backend as unknown as { isWebGPUBackend?: boolean };
    const backend: GfxBackend = backendInfo.isWebGPUBackend === true ? "WebGPU" : "WebGL2";
    return new GameRenderer(renderer, backend);
  }

  /** Render resolution relative to the device pixel ratio (adaptive quality, master 9). */
  setResolutionScale(scale: number): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) * scale);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
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
    const r = this.renderer.info.render as unknown as Record<string, number | undefined>;
    return { drawCalls: r.drawCalls ?? r.calls ?? 0, triangles: r.triangles ?? 0 };
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
