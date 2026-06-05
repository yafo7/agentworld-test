import './style.css';
import * as THREE from 'three';

import { ThirdPersonCamera } from './core/camera.js';
import { createLights } from './core/lights.js';
import { createRenderer } from './core/renderer.js';
import { createScene } from './core/scene.js';
import { Environment } from './entities/Environment.js';
import { Item } from './entities/Item.js';
import { Pet, PET_CONFIGS } from './entities/Pet.js';
import { Player } from './entities/Player.js';
import { FOREST_CONFIG, ITEM_CONFIGS } from './game/gameData.js';
import { setupGeneration } from './interaction/generation.js';
import { setupPickup } from './interaction/pickup.js';
import { setupRaycast } from './interaction/raycast.js';
import { createTerrain } from './world/terrain.js';

// ---- init ----
const scene = createScene();
const renderer = createRenderer();
const thirdPersonCamera = new ThirdPersonCamera();
const camera = thirdPersonCamera.camera;
createLights(scene);

// ---- terrain ----
const terrain = createTerrain();
scene.add(terrain);

// ---- forest (Environment block) ----
const forest = new Environment(FOREST_CONFIG);
scene.add(forest.mesh);

// ---- player ----
const player = new Player();
scene.add(player.mesh);

// ---- items (3 tetrahedrons scattered around forest) ----
const items = ITEM_CONFIGS.map((cfg) => new Item(cfg));
items.forEach((item) => scene.add(item.mesh));

// ---- pets (3 hidden cubes, spawned via F key) ----
const pets = PET_CONFIGS.map((cfg) => new Pet(cfg));
pets.forEach((pet) => scene.add(pet.mesh));

// ---- interaction systems ----
const pickupSystem = setupPickup(player, items, forest);
const generationSystem = setupGeneration(player, forest, pets);

// ---- click inspection (all game objects) ----
const allTargets = [
  player,
  ...items,
  forest,
  ...pets,
];
setupRaycast(camera, allTargets);

// ---- animation loop ----
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);

  player.update(dt, thirdPersonCamera.getHorizontalAngle());
  pets.forEach((pet) => pet.move());
  pickupSystem.update();
  generationSystem.update();
  thirdPersonCamera.update(player.mesh.position);

  renderer.render(scene, camera);
}
animate();

// ---- resize ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- quick-start hint ----
console.log(
  '🌲 宠物庭院师 — Phase 1 Demo\n' +
  '  WASD = 移动   鼠标拖拽 = 旋转视角   滚轮 = 缩放\n' +
  '  E = 捡起/放下物品    F = 在森林附近生成宠物\n' +
  '  点击任意物体查看 tag 数据\n' +
  `  物品生成位置: ${items.map((i) => i.name + '@' + i.mesh.position.toArray().map(v => v.toFixed(1))).join(', ')}`
);
