import * as THREE from 'three';

export function createLights(scene) {
  // Soft ambient fill
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  // Hemisphere for natural sky/ground lighting
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(hemi);

  // Main directional light (sun)
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 10, 7.5);
  scene.add(dir);
}
