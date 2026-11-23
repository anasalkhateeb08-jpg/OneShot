import type * as THREE from "three/webgpu";
import { PLAYER, sampleHeight, stepMovement } from "@oneshot/shared";
import type { ClientInput, HeightGrid, PlayerZone, Posture, Vec3 } from "@oneshot/shared";

/** Seconds for the eye to move most of the way to a new posture height. */
const POSTURE_EASE_S = 0.18;

/**
 * The local player: feet position (moved by the SHARED movement code, so the server can apply
 * the identical rule), view angles, and a smoothed eye height for posture changes.
 * Keeps the previous physics state so rendering can interpolate between steps.
 */
export class LocalPlayer {
  feet: Vec3;
  yaw: number;
  pitch = 0;
  posture: Posture = "stand";
  private prevFeet: Vec3;
  private eye: number = PLAYER.eyeHeight.stand;
  private prevEye: number = PLAYER.eyeHeight.stand;

  constructor(
    private readonly zone: PlayerZone,
    private readonly grid: HeightGrid,
  ) {
    const y = sampleHeight(grid, zone.spawnX, zone.spawnZ);
    this.feet = { x: zone.spawnX, y, z: zone.spawnZ };
    this.prevFeet = this.feet;
    this.yaw = zone.facingYaw;
  }

  /** One fixed physics step. */
  update(input: ClientInput, dt: number): void {
    this.prevFeet = this.feet;
    this.prevEye = this.eye;
    this.yaw = input.yaw;
    this.pitch = input.pitch;
    this.posture = input.posture;
    this.feet = stepMovement(this.feet, input, dt, this.zone, this.grid);
    const target = PLAYER.eyeHeight[this.posture];
    this.eye += (target - this.eye) * (1 - Math.exp(-dt / POSTURE_EASE_S));
  }

  /** Places the camera at the eye, interpolated between the last two physics steps. */
  applyToCamera(camera: THREE.PerspectiveCamera, alpha: number): void {
    const a = this.prevFeet;
    const b = this.feet;
    const eye = this.prevEye + (this.eye - this.prevEye) * alpha;
    camera.position.set(
      a.x + (b.x - a.x) * alpha,
      a.y + (b.y - a.y) * alpha + eye,
      a.z + (b.z - a.z) * alpha,
    );
    camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
