import * as THREE from 'three';

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  const app = document.querySelector('#app');
  app.appendChild(renderer.domElement);
  return renderer;
}
