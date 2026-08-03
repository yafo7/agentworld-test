import * as THREE from 'three';
import { buildModelFromJson } from '../../../engine/model/builder.js';

export async function renderEquipmentThumbnails(items, {
  loadModelJson,
  size = 144,
} = {}) {
  if (!globalThis.document || typeof loadModelJson !== 'function') return new Map();

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xffffff, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x87957e, 2.4));
  const light = new THREE.DirectionalLight(0xfff0d2, 3.1);
  light.position.set(-4, 7, 6);
  scene.add(light);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  camera.position.set(3.2, 2.5, 4.6);
  camera.lookAt(0, 0, 0);

  const thumbnails = new Map();
  for (const item of items) {
    const modelJson = await loadModelJson(item.id);
    const model = buildModelFromJson(modelJson);
    model.rotation.y = -0.45;
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const sizeVector = box.getSize(new THREE.Vector3());
    const scale = 2.5 / Math.max(sizeVector.x, sizeVector.y, sizeVector.z, 0.001);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const scaledBox = new THREE.Box3().setFromObject(model);
    const center = scaledBox.getCenter(new THREE.Vector3());
    model.position.sub(center);

    scene.add(model);
    renderer.render(scene, camera);
    thumbnails.set(item.id, canvas.toDataURL('image/png'));
    scene.remove(model);
  }

  renderer.dispose();
  return thumbnails;
}
