import * as THREE from "three/webgpu";
import type { Atmosphere } from "@oneshot/shared";

const SKY_RADIUS_M = 5000;
const SUN_DISTANCE_M = 4800;
const SUN_DISK_RADIUS_M = 60;

/**
 * Procedural sky with no image file (master section 9): a gradient dome from the horizon
 * haze to the zenith, a broad glow around the sun, and a sun disk.
 * The dome follows the camera so it is always at "infinity".
 */
export class Sky {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(atm: Atmosphere) {
    const geometry = new THREE.SphereGeometry(SKY_RADIUS_M, 64, 32);
    const pos = geometry.getAttribute("position");
    const colors = new Float32Array(pos.count * 3);
    const zenith = new THREE.Color(atm.skyZenith);
    const horizon = new THREE.Color(atm.skyHorizon);
    const sun = new THREE.Color(atm.sunColor);
    const sunDir = new THREE.Vector3(atm.sunDirection.x, atm.sunDirection.y, atm.sunDirection.z);
    const dir = new THREE.Vector3();
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const up = Math.max(0, dir.y);
      c.copy(horizon).lerp(zenith, Math.pow(up, 0.45));
      const toSun = Math.max(0, dir.dot(sunDir));
      const glow = 0.55 * Math.pow(toSun, 12) + 0.25 * Math.pow(toSun, 3);
      c.lerp(sun, Math.min(1, glow));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    this.dome = new THREE.Mesh(geometry, material);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    this.group.add(this.dome);

    const diskGeometry = new THREE.CircleGeometry(SUN_DISK_RADIUS_M, 32);
    const diskMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(atm.sunColor).multiplyScalar(4),
      fog: false,
      depthWrite: false,
    });
    const disk = new THREE.Mesh(diskGeometry, diskMaterial);
    disk.position.copy(sunDir).multiplyScalar(SUN_DISTANCE_M);
    disk.lookAt(0, 0, 0);
    disk.frustumCulled = false;
    disk.renderOrder = -1;
    this.group.add(disk);

    this.disposables.push(geometry, material, diskGeometry, diskMaterial);
  }

  /** Keep the sky centered on the camera. */
  follow(cameraPosition: THREE.Vector3): void {
    this.group.position.copy(cameraPosition);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
