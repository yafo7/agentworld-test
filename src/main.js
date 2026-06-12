import './style.css';
import * as THREE from 'three';

// ★ Runtime 依赖全局 THREE
window.THREE = THREE;

import { initRuntime } from './ai/modelLoader.js';
import { ThirdPersonCamera } from './core/camera.js';
import { createLights } from './core/lights.js';
import { createRenderer } from './core/renderer.js';
import { createScene } from './core/scene.js';
import { Environment } from './entities/Environment.js';
import { Item } from './entities/Item.js';
import { Pet } from './entities/Pet.js';
import { Player } from './entities/Player.js';
import { StaticEntity } from './entities/StaticEntity.js';
import { ITEM_CONFIGS, HOUSE_PET_CONFIGS } from './game/gameData.js';
import { setupInteract } from './interaction/interact.js';
import { createInteractionHint } from './interaction/interactionHint.js';
import { setupPetDialogue } from './interaction/petDialogue.js';
import { setupRaycast } from './interaction/raycast.js';
import { createUnitEnvironment, getGridWorldPosition, paintUnitArea } from './world/terrain.js';

const INTERACT_HINT_RANGE = 1.8;

// ---- bootstrap ----
async function init() {
  // Load Voxel runtime in background (non-blocking — models fall back to placeholders)
  initRuntime().then(() => console.log('[Init] Voxel runtime ready')).catch((e) => console.warn('[Init] Voxel runtime unavailable, using placeholders:', e.message));

  // ---- Three.js setup ----
  const scene = createScene();
  const renderer = createRenderer();
  const thirdPersonCamera = new ThirdPersonCamera();
  const camera = thirdPersonCamera.camera;
  createLights(scene);

  // ---- unit environment (all grey by default) ----
  const unitEnvironment = createUnitEnvironment(0, 0, 10);
  scene.add(unitEnvironment);

  // ---- environment: 玛扣大森林 (center) ----
  const environments = [new Environment({
    name: '玛扣大森林',
    modelName: 'tree_marko',
    color: 0x2d5a1e,
    size: [2, 1, 2],
    position: [0, 0, 0],
    coreTags: ['森林', '古老', '守护', '自然', '沉稳'],
    moreTags: [],
  })];
  environments.forEach((env) => scene.add(env.mesh));

  // ---- static entities ----
  const staticEntities = [];

  function placeStaticEntity(cfg, category, areaType, scale = 1) {
    const pos = getGridWorldPosition(cfg.grid[0], cfg.grid[1]);
    const entity = new StaticEntity({
      id: cfg.id,
      name: cfg.name,
      tags: cfg.tags,
      category,
      position: [pos.x, 0, pos.z],
      scale,
    });
    staticEntities.push(entity);
    scene.add(entity.mesh);
    paintUnitArea(unitEnvironment, cfg.grid[0], cfg.grid[1], areaType);
  }

  // Decorations (half size)
  placeStaticEntity({ grid: [0, 0], name: 'ps5游戏机', tags: ['科技', '娱乐', '白色'], id: 'ps5_console' }, 'decor', 'decor', 0.5);
  placeStaticEntity({ grid: [4, 3], name: 'ns2游戏机', tags: ['便携', '游戏', '彩色'], id: 'ns2_console' }, 'decor', 'decor', 0.5);
  placeStaticEntity({ grid: [9, 9], name: '雷霆大雪绒', tags: ['毛绒', '可爱', '雷电'], id: 'thunder_snow' }, 'decor', 'decor', 0.5);

  // Trees (full size)
  placeStaticEntity({ grid: [8, 0], name: '魔女', tags: ['神秘', '紫色', '魔法'], id: 'tree_witch' }, 'tree', 'tree');
  placeStaticEntity({ grid: [0, 8], name: 'yafo', tags: ['热带', '阳光', '棕榈'], id: 'tree_yafo' }, 'tree', 'tree');
  placeStaticEntity({ grid: [9, 5], name: '金鱼', tags: ['金色', '灵动', '水中影'], id: 'tree_goldfish' }, 'tree', 'tree');

  // ---- pet houses + hidden pets ----
  const pets = [];
  const housePetMap = new Map();

  const houseConfigs = [
    { grid: [1, 3], houseName: '马扣的家', petName: '马扣' },
    { grid: [7, 6], houseName: '扶摇的家', petName: '扶摇' },
    { grid: [2, 7], houseName: 'momo的家', petName: 'momo' },
  ];

  houseConfigs.forEach((hc) => {
    placeStaticEntity(
      { grid: hc.grid, name: hc.houseName, tags: ['温馨', '小家', '守护'], id: 'pet_house' },
      'house',
      'pet',
      0.5
    );
    const house = staticEntities[staticEntities.length - 1];

    const petConfig = HOUSE_PET_CONFIGS[hc.petName];
    const pet = new Pet(petConfig);
    pet.homeEnv = environments[0];
    environments[0]._residents.push(pet);

    housePetMap.set(hc.houseName, { house, pet, summoned: false });
  });

  // Countryside shop near edge between ps5 and 魔女
  placeStaticEntity(
    { grid: [6, 0], name: '田园商店', tags: ['木造', '田园', '交易'], id: 'country_shop' },
    'house',
    'pet',
    0.5
  );

  // ---- player ----
  const player = new Player();
  scene.add(player.mesh);

  // ---- items ----
  const items = ITEM_CONFIGS.map((cfg) => new Item(cfg));
  items.forEach((item) => scene.add(item.mesh));

  // ---- environment tag collection ----
  const allEntitiesForEnv = [...staticEntities, ...items];
  environments.forEach((env) => env.refreshTagsFromEntities(allEntitiesForEnv));

  // ---- interaction hint UI ----
  const hintSystem = createInteractionHint();

  const dynamicTargets = [player, ...items, ...environments, ...staticEntities];

  function addToScene(mesh) {
    scene.add(mesh);
    dynamicTargets.push({ mesh, name: mesh.name, getInfo: null });
  }

  // ---- interaction systems ----
  const interactSystem = setupInteract(player, items, environments, pets, housePetMap, staticEntities, addToScene, allEntitiesForEnv);
  const dialogueSystem = setupPetDialogue(pets, player.mesh.position);
  setupRaycast(camera, dynamicTargets);

  // ---- animation loop ----
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);

    player.update(dt, thirdPersonCamera.getHorizontalAngle());
    pets.forEach((pet) => pet.move(player.mesh.position, dt));

    // Play idle animations on items and static entities
    items.forEach((item) => item.updateAnimation?.(dt));
    staticEntities.forEach((entity) => {
      entity.updateAnimation?.(dt);
      entity.updateBreathing?.(dt);
    });

    // Update interaction hints
    const nearbyList = [];
    for (const entity of staticEntities) {
      const dist = player.mesh.position.distanceTo(entity.mesh.position);
      if (dist < INTERACT_HINT_RANGE) {
        const houseData = housePetMap.get(entity.name);
        if (houseData) {
          if (!houseData.summoned) {
            nearbyList.push({ name: entity.name, action: '按E呼唤' });
          } else if (houseData.pet.spawned && houseData.pet.state !== 'returning_home' && houseData.pet.state !== 'recall_pause') {
            nearbyList.push({ name: entity.name, action: '按E召回' });
          }
        } else {
          nearbyList.push({ name: entity.name, action: '按E交互' });
        }
      }
    }
    for (const pet of pets) {
      if (!pet.spawned) continue;
      const dist = player.mesh.position.distanceTo(pet.mesh.position);
      if (dist < INTERACT_HINT_RANGE) {
        nearbyList.push({ name: pet.name, action: '按E抚摸' });
      }
    }
    for (const item of items) {
      if (item.isHeld) continue;
      const dist = player.mesh.position.distanceTo(item.mesh.position);
      if (dist < INTERACT_HINT_RANGE) {
        nearbyList.push({ name: item.name, action: '按E捡起' });
      }
    }
    hintSystem.update(nearbyList);

    interactSystem.update();
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
    '  E = 捡放物品/宠物互动/在宠物小屋前呼唤宠物/与建筑交互'
  );
}

init().catch((err) => {
  console.error('[Init] Fatal:', err);
  document.body.innerHTML = '<div style="color:white;padding:20px;font-family:sans-serif">Failed to start:<br>' + err.message + '</div>';
});
