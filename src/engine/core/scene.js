import * as THREE from 'three';

const HORIZON_COLOR = 0x87CEEB; // sky blue

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON_COLOR);
  scene.fog = new THREE.Fog(HORIZON_COLOR, 40, 180);
  return scene;
}
