import * as THREE from "three/webgpu";
import { buildHeightGrid } from "@oneshot/shared";
import type { HeightGrid, MapDef } from "@oneshot/shared";
import { createProps } from "./Props";
import { Sky } from "./Sky";
import { createHorizonMesh, createTerrainMesh } from "./Terrain";

const SHADOW_MAP_SIZE = 2048;
const SHADOW_HALF_EXTENT_M = 60;
const SUN_DISTANCE_M = 250;

export interface World {
  grid: HeightGrid;
  /** Call once per frame with the camera position (sky follows, shadows follow the player). */
  update(cameraPosition: THREE.Vector3): void;
  dispose(): void;
}

/**
 * Builds a whole map into the scene from its data definition (D-018):
 * atmosphere (fog, sky, sun, fill), terrain, distant scenery, and props.
 */
export function buildWorld(scene: THREE.Scene, map: MapDef): World {
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

  const terrain = createTerrainMesh(grid, atm);
  scene.add(terrain);
  const horizon = createHorizonMesh(map.heightAt, atm);
  scene.add(horizon);

  const props = createProps(map);
  scene.add(props.group);

  return {
    grid,
    update(cameraPosition: THREE.Vector3): void {
      sky.follow(cameraPosition);
      // The 2048 shadow map covers only a near range around the player (master section 9).
      sun.target.position.copy(cameraPosition);
      sun.position.copy(cameraPosition).addScaledVector(sunDir, SUN_DISTANCE_M);
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
