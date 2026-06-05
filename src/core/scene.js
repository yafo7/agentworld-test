import * as THREE from 'three';

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa0a0a0);
  return scene;
}
