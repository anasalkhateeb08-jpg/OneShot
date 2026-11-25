import * as THREE from "three/webgpu";
import { buildHeightGrid } from "@oneshot/shared";
import type { HeightGrid, MapDef, PlayerZone, Vec3 } from "@oneshot/shared";
import type { GameAssets } from "../core/Assets";
import type { QualityPreset } from "../gfx/Quality";
import { createProps } from "./Props";
import { Sky } from "./Sky";
import { createHorizonMesh, createTerrainMesh } from "./Terrain";

const SHADOW_MAP_SIZE = 2048;
/** Half size of the area around the camera that receives sun shadows (D-048: was 60 m). */
const SHADOW_HALF_EXTENT_M = 90;
const SUN_DISTANCE_M = 250;

export interface World {
  grid: HeightGrid;
  /** Call once per frame with the camera position (sky follows, shadows follow the player). */
  update(cameraPosition: THREE.Vector3): void;
  /** Applies a graphics quality preset (shadows, shrubs). */
  setQuality(preset: QualityPreset): void;
  /** A bullet went through a crate: make see-through holes where it entered and left. */
  perforateCrate(index: number, entry: Vec3, exit?: Vec3): void;
  dispose(): void;
}

/**
 * Builds a whole map into the scene from its data definition (D-018):
 * atmosphere (fog, sky, sun, fill), terrain, distant scenery, and props.
 */
export function buildWorld(
  scene: THREE.Scene,
  map: MapDef,
  assets: GameAssets,
  playerZone: PlayerZone,
): World {
  const atm = map.atmosphere;
  const grid = buildHeightGrid(map.grid, map.heightAt);

  scene.background = new THREE.Color(atm.fogColor);
  scene.fog = new THREE.FogExp2(atm.fogColor, atm.fogDensity);

  const sky = new Sky(atm);
  scene.add(sky.group);

  const fill = new THREE.HemisphereLight(atm.hemiSky, atm.hemiGround, atm.hemiIntensity);
  scene.add(fill);

  const sunDir = new THREE.Vector3(
    atm.sunDirection.x,
    atm.sunDirection.y,
    atm.sunDirection.z,
  ).normalize();
  const sun = new THREE.DirectionalLight(atm.sunColor, atm.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  const cam = sun.shadow.camera;
  cam.left = -SHADOW_HALF_EXTENT_M;
  cam.right = SHADOW_HALF_EXTENT_M;
  cam.top = SHADOW_HALF_EXTENT_M;
  cam.bottom = -SHADOW_HALF_EXTENT_M;
  cam.near = 1;
  cam.far = SUN_DISTANCE_M * 2;
  cam.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // Light-space axes of the shadow camera (it looks along -sunDir with world up, D-048).
  const lightRight = new THREE.Vector3(0, 1, 0).cross(sunDir).normalize();
  const lightUp = new THREE.Vector3().crossVectors(sunDir, lightRight).normalize();
  const snapped = new THREE.Vector3();
  let shadowMapSize = SHADOW_MAP_SIZE;

  const terrain = createTerrainMesh(grid, atm, assets.ground);
  scene.add(terrain);
  const horizon = createHorizonMesh(map.heightAt, atm);
  scene.add(horizon);

  const props = createProps(map, assets.rocks, playerZone);
  scene.add(props.group);

  return {
    grid,
    update(cameraPosition: THREE.Vector3): void {
      sky.follow(cameraPosition);
      // The shadow map covers a near range around the player (master section 9). Its center
      // moves in whole shadow-map pixels only, so shadow edges do not crawl or shimmer while
      // the player moves (the standard "texel snapping" fix, D-048).
      const texel = (SHADOW_HALF_EXTENT_M * 2) / shadowMapSize;
      const a = Math.round(cameraPosition.dot(lightRight) / texel) * texel;
      const b = Math.round(cameraPosition.dot(lightUp) / texel) * texel;
      const d = cameraPosition.dot(sunDir);
      snapped
        .copy(lightRight)
        .multiplyScalar(a)
        .addScaledVector(lightUp, b)
        .addScaledVector(sunDir, d);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(sunDir, SUN_DISTANCE_M);
    },
    perforateCrate: (index, entry, exit) => props.perforateCrate(index, entry, exit),
    setQuality(preset: QualityPreset): void {
      if (preset.shadowMapSize !== shadowMapSize) {
        shadowMapSize = preset.shadowMapSize;
        // The renderer's shadow node resizes its map to mapSize on the next frame.
        sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      }
      if (props.shrubs) props.shrubs.visible = preset.shrubs;
    },
    dispose(): void {
      sky.dispose();
      props.dispose();
      for (const mesh of [terrain, horizon]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
  };
}
