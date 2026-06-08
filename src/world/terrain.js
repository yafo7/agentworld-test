import * as THREE from 'three';

export function createTerrain() {
  const geometry = new THREE.PlaneGeometry(20, 20);
  const material = new THREE.MeshStandardMaterial({
    color: 0x808080,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.02; // slight offset below entities at y=0
  return plane;
}
