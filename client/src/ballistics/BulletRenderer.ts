import * as THREE from "three/webgpu";
import type { FlyingBullet, ImpactKind } from "./BulletSim";
import { activeImpactEffect, createRng } from "@oneshot/shared";
import type { Vec3 } from "@oneshot/shared";

const TRACER_LENGTH_M = 7;
const TRACER_MIN_WIDTH_M = 0.015;
/** Width grows with distance so the bullet stays visible far away (about 1.5 px). */
const TRACER_WIDTH_PER_M = 0.0011;
const HIDE_NEAR_M = 4;
const PUFF_LIFE_S = 0.7;
const PUFF_SIZE_M = 1.4;

const PUFF_COLORS: Record<ImpactKind, number> = {
  terrain: 0xd9bf94,
  rock: 0x9a8a78,
  wall: 0xb8a58a,
  crate: 0xa07a48,
  body: 0x8a1010,
};

interface Puff {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  bornS: number;
}

/** One flying fragment, spark, or ring of a wood impact effect. */
interface Particle {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  velocity: THREE.Vector3;
  gravity: number;
  bornS: number;
  lifeS: number;
  /** Scale growth per second (rings and flashes), added to the start scale. */
  grow: number;
  startScale: THREE.Vector3;
  startOpacity: number;
}

/**
 * Draws flying bullets as glowing streaks along their velocity, and impact puffs (dust, rock
 * chips, or blood). Presentation only: never affects the simulation.
 */
export class BulletRenderer {
  readonly group = new THREE.Group();
  private readonly tracerGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  private readonly tracerMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xfff2c8).multiplyScalar(3),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  private readonly puffGeometry = new THREE.SphereGeometry(1, 12, 8);
  private readonly tracers = new Map<number, THREE.Mesh>();
  private readonly puffs: Puff[] = [];
  private readonly particles: Particle[] = [];
  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly ringGeometry = new THREE.TorusGeometry(1, 0.1, 6, 20);
  private lastTimeS = 0;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly dir = new THREE.Vector3();

  update(bullets: readonly FlyingBullet[], camera: THREE.Camera, timeS: number): void {
    const dt = Math.max(0, Math.min(0.1, timeS - this.lastTimeS));
    this.lastTimeS = timeS;
    this.updateParticles(timeS, dt);
    const alive = new Set<number>();
    for (const b of bullets) {
      alive.add(b.id);
      let mesh = this.tracers.get(b.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.tracerGeometry, this.tracerMaterial);
        mesh.frustumCulled = false;
        this.tracers.set(b.id, mesh);
        this.group.add(mesh);
      }
      const p = b.state.pos;
      const v = b.state.vel;
      const fromOrigin = Math.hypot(p.x - b.origin.x, p.y - b.origin.y, p.z - b.origin.z);
      mesh.visible = fromOrigin > HIDE_NEAR_M;
      this.dir.set(v.x, v.y, v.z).normalize();
      // Center the streak just behind the bullet tip.
      mesh.position.set(p.x, p.y, p.z).addScaledVector(this.dir, -TRACER_LENGTH_M / 2);
      mesh.quaternion.setFromUnitVectors(this.up, this.dir);
      const toCam = mesh.position.distanceTo(camera.position);
      const width = Math.max(TRACER_MIN_WIDTH_M, toCam * TRACER_WIDTH_PER_M);
      mesh.scale.set(width, TRACER_LENGTH_M, width);
    }
    for (const [id, mesh] of this.tracers) {
      if (!alive.has(id)) {
        this.group.remove(mesh);
        this.tracers.delete(id);
      }
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      if (!puff) continue;
      const f = (timeS - puff.bornS) / PUFF_LIFE_S;
      if (f >= 1) {
        this.group.remove(puff.mesh);
        puff.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      puff.mesh.scale.setScalar(PUFF_SIZE_M * (0.25 + 0.75 * Math.sqrt(f)));
      puff.material.opacity = 0.75 * (1 - f);
    }
  }

  private updateParticles(timeS: number, dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      if (!pt) continue;
      const f = (timeS - pt.bornS) / pt.lifeS;
      if (f >= 1) {
        this.group.remove(pt.mesh);
        pt.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      pt.velocity.y -= pt.gravity * dt;
      pt.mesh.position.addScaledVector(pt.velocity, dt);
      const age = timeS - pt.bornS;
      pt.mesh.scale.copy(pt.startScale).addScalar(pt.grow * age);
      pt.material.opacity = pt.startOpacity * (1 - f);
    }
  }

  private addParticle(
    geometry: THREE.BufferGeometry,
    color: number,
    point: Vec3,
    timeS: number,
    o: {
      velocity: [number, number, number];
      gravity: number;
      lifeS: number;
      scale: [number, number, number];
      grow?: number;
      opacity?: number;
      bright?: boolean;
      rotation?: [number, number, number];
    },
  ): void {
    const material = new THREE.MeshBasicMaterial({
      color: o.bright ? new THREE.Color(color).multiplyScalar(3) : color,
      transparent: true,
      opacity: o.opacity ?? 0.95,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(point.x, point.y, point.z);
    if (o.rotation) mesh.rotation.set(o.rotation[0], o.rotation[1], o.rotation[2]);
    const startScale = new THREE.Vector3(o.scale[0], o.scale[1], o.scale[2]);
    mesh.scale.copy(startScale);
    this.group.add(mesh);
    this.particles.push({
      mesh,
      material,
      velocity: new THREE.Vector3(o.velocity[0], o.velocity[1], o.velocity[2]),
      gravity: o.gravity,
      bornS: timeS,
      lifeS: o.lifeS,
      grow: o.grow ?? 0,
      startScale,
      startOpacity: o.opacity ?? 0.95,
    });
  }

  /**
   * The five wood impact effects (D-037). Which one plays depends only on the simulation time:
   * 0 dust puff, 1 splinter burst, 2 spark flash, 3 chip spray, 4 rising dust ring.
   */
  private woodImpact(effect: number, point: Vec3, timeS: number): void {
    const rng = createRng(
      Math.floor(timeS * 1000) ^ Math.floor(point.x * 100) ^ Math.floor(point.z * 100),
    );
    const spread = (s: number): number => (rng() * 2 - 1) * s;
    switch (effect) {
      case 0: {
        // Dust puff: a soft wood-colored cloud.
        this.addParticle(this.puffGeometry, 0xb89a6e, point, timeS, {
          velocity: [0, 0.4, 0],
          gravity: 0,
          lifeS: 0.8,
          scale: [0.15, 0.15, 0.15],
          grow: 2.2,
          opacity: 0.7,
        });
        break;
      }
      case 1: {
        // Splinter burst: thin pale slivers fly out and tumble down.
        for (let k = 0; k < 14; k++) {
          this.addParticle(this.boxGeometry, 0xe0c690, point, timeS, {
            velocity: [spread(5), 1.5 + rng() * 4, spread(5)],
            gravity: 9.8,
            lifeS: 0.55 + rng() * 0.3,
            scale: [0.02, 0.02, 0.18 + rng() * 0.12],
            rotation: [rng() * 3, rng() * 3, rng() * 3],
          });
        }
        break;
      }
      case 2: {
        // Spark flash: a quick bright flash and hot sparks.
        this.addParticle(this.puffGeometry, 0xffd27a, point, timeS, {
          velocity: [0, 0, 0],
          gravity: 0,
          lifeS: 0.12,
          scale: [0.2, 0.2, 0.2],
          grow: 5,
          opacity: 0.9,
          bright: true,
        });
        for (let k = 0; k < 8; k++) {
          this.addParticle(this.puffGeometry, 0xffb347, point, timeS, {
            velocity: [spread(7), 1 + rng() * 5, spread(7)],
            gravity: 9.8,
            lifeS: 0.3 + rng() * 0.2,
            scale: [0.025, 0.025, 0.025],
            opacity: 1,
            bright: true,
          });
        }
        break;
      }
      case 3: {
        // Chip spray: chunky dark pieces thrown up and out, falling fast.
        for (let k = 0; k < 10; k++) {
          const size = 0.04 + rng() * 0.05;
          this.addParticle(this.boxGeometry, 0x7a5430, point, timeS, {
            velocity: [spread(4), 2.5 + rng() * 3.5, spread(4)],
            gravity: 14,
            lifeS: 0.6 + rng() * 0.3,
            scale: [size, size, size],
            rotation: [rng() * 3, rng() * 3, rng() * 3],
          });
        }
        break;
      }
      default: {
        // Rising dust ring: a ring that spreads out and drifts upward.
        this.addParticle(this.ringGeometry, 0xcdb48c, point, timeS, {
          velocity: [0, 0.9, 0],
          gravity: 0,
          lifeS: 0.9,
          scale: [0.12, 0.12, 0.12],
          grow: 1.6,
          opacity: 0.8,
          rotation: [Math.PI / 2, 0, 0],
        });
        break;
      }
    }
  }

  impact(kind: ImpactKind, point: Vec3, timeS: number): void {
    if (kind === "crate") {
      this.woodImpact(activeImpactEffect(timeS), point, timeS);
      return;
    }
    const material = new THREE.MeshBasicMaterial({
      color: PUFF_COLORS[kind],
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.puffGeometry, material);
    mesh.position.set(point.x, point.y, point.z);
    mesh.scale.setScalar(0.1);
    this.group.add(mesh);
    this.puffs.push({ mesh, material, bornS: timeS });
  }

  dispose(): void {
    this.tracerGeometry.dispose();
    this.tracerMaterial.dispose();
    this.puffGeometry.dispose();
    this.boxGeometry.dispose();
    this.ringGeometry.dispose();
    for (const p of this.puffs) p.material.dispose();
    for (const p of this.particles) p.material.dispose();
  }
}
