import './style.css';
import * as THREE from 'three';

import { ThirdPersonCamera } from './core/camera.js';
import { createLights } from './core/lights.js';
import { createRenderer } from './core/renderer.js';
import { createScene } from './core/scene.js';
import { Environment } from './entities/Environment.js';
import { Item } from './entities/Item.js';
import { Pet } from './entities/Pet.js';
import { Player } from './entities/Player.js';
import { FOREST_CONFIG, ITEM_CONFIGS } from './game/gameData.js';
import { setupGeneration } from './interaction/generation.js';
import { setupInteract } from './interaction/interact.js';
import { setupPetDialogue } from './interaction/petDialogue.js';
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

// ---- environments ----
const environments = [new Environment(FOREST_CONFIG)];
environments.forEach((env) => scene.add(env.mesh));

// ---- player ----
const player = new Player();
scene.add(player.mesh);

// ---- items ----
const items = ITEM_CONFIGS.map((cfg) => new Item(cfg));
items.forEach((item) => scene.add(item.mesh));

// ---- pets (AI-generated, initially empty) ----
const pets = [];
const dynamicTargets = [player, ...items, ...environments];

/** Add a runtime-spawned mesh to scene + raycast. */
function addToScene(mesh) {
  scene.add(mesh);
  dynamicTargets.push({ mesh, name: mesh.name, getInfo: null });
}

// ---- AI pet generation callback ----
function onPetGenerated(config) {
  const pet = new Pet(config);
  pet.spawnAt(
    new THREE.Vector3(
      player.mesh.position.x + (Math.random() - 0.5) * 3,
      0.5,
      player.mesh.position.z + (Math.random() - 0.5) * 3
    )
  );
  pets.push(pet);
  scene.add(pet.mesh);
  dynamicTargets.push(pet);
  console.log(`[Pet] AI-generated: ${pet.name}`, pet.getInfo());
}

// ---- interaction systems ----
const interactSystem = setupInteract(player, items, environments, pets, addToScene);
const generationSystem = setupGeneration(player, environments, items, onPetGenerated);
const dialogueSystem = setupPetDialogue(pets, player.mesh.position);
setupRaycast(camera, dynamicTargets);

// ---- animation loop ----
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);

  player.update(dt, thirdPersonCamera.getHorizontalAngle());
  pets.forEach((pet) => pet.move(player.mesh.position));
  interactSystem.update();
  generationSystem.update();
  dialogueSystem.update(dt);
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

console.log(
  '🌲 宠物庭院师\n' +
  '  WASD = 移动 | 鼠标拖拽 = 旋转 | 滚轮 = 缩放\n' +
  '  E = 捡放物品/宠物互动 | F = AI生成宠物\n' +
  '  物品放环境旁 → F → AI创造独特宠物'
);
