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
import { consumeKeyPress } from './input/keyboard.js';
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

  // ---- 3×3 world grid ----
  const ENV_SPACING = 23;
  const envGridConfigs = [
    // row 0 (z = -ENV_SPACING)
    { name: '待售空地', center: [-ENV_SPACING, -ENV_SPACING], modelName: 'sun_stone', color: 0x999999, size: [1.5, 1, 1.5], coreTags: ['空地', '待售', '宁静'] },
    { name: '繁华城市', center: [0, -ENV_SPACING], modelName: 'trainer', color: 0x555566, size: [2, 2, 2], coreTags: ['城市', '繁华', '钢铁', '喧嚣'] },
    { name: '农村池塘', center: [ENV_SPACING, -ENV_SPACING], modelName: 'pond', color: 0x4488aa, size: [2, 0.5, 2], coreTags: ['池塘', '农村', '水边', '宁静'] },
    // row 1 (z = 0)
    { name: '暗黑森林', center: [-ENV_SPACING, 0], modelName: 'forest', color: 0x1a0a2e, size: [2, 1.5, 2], coreTags: ['暗黑', '森林', '神秘', '危险'] },
    { name: '玛扣大森林', center: [0, 0], modelName: 'tree_marko', color: 0x2d5a1e, size: [2, 1, 2], coreTags: ['森林', '古老', '守护', '自然', '沉稳'] },
    { name: '田园牧场', center: [ENV_SPACING, 0], modelName: 'grassland', color: 0x88bb44, size: [2, 1, 2], coreTags: ['田园', '麦田', '河流', '丰收'] },
    // row 2 (z = ENV_SPACING)
    { name: '危险区域', center: [-ENV_SPACING, ENV_SPACING], modelName: 'sun_stone', color: 0xaa3311, size: [2, 1, 2], coreTags: ['岩浆', '危险', '火山', '怪物'] },
    { name: '另一片森林', center: [0, ENV_SPACING], modelName: 'forest', color: 0x2d5a1e, size: [2, 1, 2], coreTags: ['森林', '生机', '清新', '绿意'] },
    { name: '干旱沙地', center: [ENV_SPACING, ENV_SPACING], modelName: 'grassland', color: 0xccaa66, size: [1.5, 0.8, 1.5], coreTags: ['沙漠', '干旱', '荒芜', '炎热'] },
  ];

  const unitEnvironments = [];
  const environments = [];

  envGridConfigs.forEach((cfg) => {
    const unitEnv = createUnitEnvironment(cfg.center[0], cfg.center[1], 10);
    scene.add(unitEnv);
    unitEnvironments.push(unitEnv);

    const env = new Environment({
      name: cfg.name,
      modelName: cfg.modelName,
      color: cfg.color,
      size: cfg.size,
      position: [cfg.center[0], 0, cfg.center[1]],
      coreTags: cfg.coreTags,
      moreTags: [],
    });
    environments.push(env);
    scene.add(env.mesh);
  });

  // ---- static entities ----
  const staticEntities = [];
  const envEntityGroups = Array.from({ length: 9 }, () => []);
  const envVisibleState = new Array(9).fill(true);
  envVisibleState[4] = true; // center env always visible

  function placeStaticEntity(cfg, category, areaType, scale = 1, envIndex = 4) {
    const targetUnitEnv = unitEnvironments[envIndex];
    const centerX = envGridConfigs[envIndex].center[0];
    const centerZ = envGridConfigs[envIndex].center[1];
    const pos = getGridWorldPosition(cfg.grid[0], cfg.grid[1], centerX, centerZ);
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
    paintUnitArea(targetUnitEnv, cfg.grid[0], cfg.grid[1], areaType);
    envEntityGroups[envIndex].push(entity);
    if (envIndex !== 4) {
      entity.mesh.visible = false;
    }
  }

  // Layouts for the 8 new environments
  const envLayouts = [
    // 0: 待售空地
    { trees: [{grid:[2,2],name:'枯木A',id:'tree_rand_1',tags:['枯树','荒凉']},{grid:[7,2],name:'枯木B',id:'tree_rand_2',tags:['枯树','荒凉']},{grid:[2,7],name:'枯木C',id:'tree_rand_3',tags:['枯树','荒凉']}], houses: [{grid:[6,6],name:'空地小屋',id:'pet_house',tags:['待售','简陋']}], decors: [{grid:[1,8],name:'苔藓灯',id:'moss_lamp',tags:['照明','自然']},{grid:[8,1],name:'风铃',id:'wind_chime',tags:['声音','轻盈']}] },
    // 1: 繁华城市
    { trees: [{grid:[1,1],name:'行道树A',id:'tree_rand_4',tags:['城市','绿化']},{grid:[8,1],name:'行道树B',id:'tree_rand_5',tags:['城市','绿化']},{grid:[1,8],name:'行道树C',id:'tree_rand_6',tags:['城市','绿化']}], houses: [{grid:[3,6],name:'公寓A',id:'pet_house',tags:['住宅','高层']},{grid:[6,3],name:'公寓B',id:'pet_house',tags:['住宅','高层']}], decors: [{grid:[2,2],name:'街机',id:'ps5_console',tags:['科技','娱乐']},{grid:[7,7],name:'便携游戏机',id:'ns2_console',tags:['科技','便携']},{grid:[8,8],name:'都市雕像',id:'thunder_snow',tags:['艺术','现代']}] },
    // 2: 农村池塘
    { trees: [{grid:[2,3],name:'垂柳A',id:'tree_yafo',tags:['柳树','水边']},{grid:[7,3],name:'垂柳B',id:'tree_witch',tags:['柳树','水边']},{grid:[3,7],name:'水边树',id:'tree_rand_1',tags:['水生','清新']}], houses: [{grid:[6,6],name:'农舍A',id:'pet_house',tags:['农村','温馨']},{grid:[7,7],name:'农舍B',id:'pet_house',tags:['农村','温馨']}], decors: [{grid:[1,1],name:'池塘风铃',id:'wind_chime',tags:['声音','田园']},{grid:[8,8],name:'水草灯',id:'moss_lamp',tags:['照明','自然']}] },
    // 3: 暗黑森林
    { trees: [{grid:[1,1],name:'暗黑树A',id:'tree_witch',tags:['暗黑','魔法']},{grid:[8,1],name:'暗黑树B',id:'tree_rand_2',tags:['暗黑','扭曲']},{grid:[1,8],name:'暗黑树C',id:'tree_rand_3',tags:['暗黑','扭曲']},{grid:[8,8],name:'暗黑树D',id:'tree_rand_4',tags:['暗黑','扭曲']}], houses: [{grid:[3,5],name:'暗木屋A',id:'pet_house',tags:['暗黑','神秘']},{grid:[5,3],name:'暗木屋B',id:'pet_house',tags:['暗黑','神秘']}], decors: [{grid:[2,7],name:'太阳石',id:'sun_stone',tags:['神秘','古老']},{grid:[7,2],name:'训练桩',id:'trainer',tags:['战斗','训练']},{grid:[6,6],name:'雷电绒',id:'thunder_snow',tags:['雷电','力量']}] },
    // 4: 玛扣大森林 (center) — handled separately
    null,
    // 5: 田园牧场
    { trees: [{grid:[2,2],name:'果树A',id:'tree_yafo',tags:['果树','丰收']},{grid:[7,2],name:'果树B',id:'tree_goldfish',tags:['果树','金黄']},{grid:[2,7],name:'果树C',id:'tree_rand_5',tags:['果树','甜美']}], houses: [{grid:[6,6],name:'田园小屋A',id:'pet_house',tags:['农村','温馨']},{grid:[7,7],name:'田园小屋B',id:'pet_house',tags:['农村','温馨']}], decors: [{grid:[1,8],name:'牧场风铃',id:'wind_chime',tags:['声音','田园']},{grid:[8,1],name:'牧场灯',id:'moss_lamp',tags:['照明','自然']},{grid:[3,3],name:'太阳石',id:'sun_stone',tags:['光明','温暖']}] },
    // 6: 危险区域
    { trees: [{grid:[2,2],name:'焦炭树',id:'tree_witch',tags:['烧焦','死亡']},{grid:[7,7],name:'枯骨树',id:'tree_rand_6',tags:['枯骨','危险']}], houses: [{grid:[5,3],name:'避难所',id:'pet_house',tags:['避难','坚固']}], decors: [{grid:[1,8],name:'训练桩',id:'trainer',tags:['战斗','训练']},{grid:[8,1],name:'雷电绒',id:'thunder_snow',tags:['雷电','力量']},{grid:[3,7],name:'残骸',id:'ps5_console',tags:['废墟','科技']}] },
    // 7: 另一片森林
    { trees: [{grid:[1,1],name:'森林树A',id:'tree_rand_1',tags:['森林','生机']},{grid:[8,1],name:'森林树B',id:'tree_rand_2',tags:['森林','生机']},{grid:[1,8],name:'森林树C',id:'tree_rand_3',tags:['森林','生机']},{grid:[8,8],name:'森林树D',id:'tree_rand_4',tags:['森林','生机']}], houses: [{grid:[3,6],name:'林中小屋A',id:'pet_house',tags:['森林','温馨']},{grid:[6,3],name:'林中小屋B',id:'pet_house',tags:['森林','温馨']}], decors: [{grid:[2,2],name:'森林灯',id:'moss_lamp',tags:['照明','自然']},{grid:[7,7],name:'森林风铃',id:'wind_chime',tags:['声音','轻盈']}] },
    // 8: 干旱沙地
    { trees: [{grid:[2,2],name:'沙地树A',id:'tree_rand_5',tags:['耐旱','坚韧']},{grid:[7,7],name:'沙地树B',id:'tree_rand_6',tags:['耐旱','坚韧']}], houses: [{grid:[4,6],name:'沙漠帐篷',id:'pet_house',tags:['沙漠','临时']}], decors: [{grid:[1,8],name:'遗迹桩',id:'trainer',tags:['遗迹','古老']},{grid:[8,1],name:'微光灯',id:'moss_lamp',tags:['遗迹','微光']}] },
  ];

  envLayouts.forEach((layout, idx) => {
    if (!layout) return;
    layout.trees.forEach((t) => placeStaticEntity({ grid: t.grid, name: t.name, tags: t.tags, id: t.id }, 'tree', 'tree', 1, idx));
    layout.houses.forEach((h) => placeStaticEntity({ grid: h.grid, name: h.name, tags: h.tags, id: h.id }, 'house', 'pet', 0.5, idx));
    layout.decors.forEach((d) => placeStaticEntity({ grid: d.grid, name: d.name, tags: d.tags, id: d.id }, 'decor', 'decor', 0.5, idx));
  });

  // 4: 玛扣大森林 (center) — existing content
  placeStaticEntity({ grid: [0, 0], name: 'ps5游戏机', tags: ['科技', '娱乐', '白色'], id: 'ps5_console' }, 'decor', 'decor', 0.5, 4);
  placeStaticEntity({ grid: [4, 3], name: 'ns2游戏机', tags: ['便携', '游戏', '彩色'], id: 'ns2_console' }, 'decor', 'decor', 0.5, 4);
  placeStaticEntity({ grid: [9, 9], name: '雷霆大雪绒', tags: ['毛绒', '可爱', '雷电'], id: 'thunder_snow' }, 'decor', 'decor', 0.5, 4);
  placeStaticEntity({ grid: [8, 0], name: '魔女', tags: ['神秘', '紫色', '魔法'], id: 'tree_witch' }, 'tree', 'tree', 1, 4);
  placeStaticEntity({ grid: [0, 8], name: 'yafo', tags: ['热带', '阳光', '棕榈'], id: 'tree_yafo' }, 'tree', 'tree', 1, 4);
  placeStaticEntity({ grid: [9, 5], name: '金鱼', tags: ['金色', '灵动', '水中影'], id: 'tree_goldfish' }, 'tree', 'tree', 1, 4);
  placeStaticEntity({ grid: [6, 0], name: '田园商店', tags: ['木造', '田园', '交易'], id: 'country_shop' }, 'house', 'pet', 0.5, 4);

  // ---- pet houses + hidden pets (center env only) ----
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
      0.5,
      4
    );
    const house = staticEntities[staticEntities.length - 1];

    const sideGridX = hc.grid[0] + 1 < 10 ? hc.grid[0] + 1 : hc.grid[0] - 1;
    const sidePos = getGridWorldPosition(sideGridX, hc.grid[1], 0, 0);

    const petConfig = HOUSE_PET_CONFIGS[hc.petName];
    const pet = new Pet(petConfig);
    pet.homeEnv = environments[4];
    environments[4]._residents.push(pet);

    housePetMap.set(hc.houseName, { house, pet, summoned: false, sidePos });
  });

  // Inject world data into pets (basic)
  const allPetInstances = Array.from(housePetMap.values()).map(v => v.pet);
  allPetInstances.forEach((pet, idx) => {
    const hc = houseConfigs[idx];
    const sideGridX = hc.grid[0] + 1 < 10 ? hc.grid[0] + 1 : hc.grid[0] - 1;
    const sidePos = getGridWorldPosition(sideGridX, hc.grid[1], 0, 0);
    pet.setWorldData(staticEntities, envGridConfigs, sidePos, 4, allPetInstances, environments, []);
  });

  // ---- player ----
  const player = new Player();
  scene.add(player.mesh);

  // ---- items ----
  const items = ITEM_CONFIGS.map((cfg) => new Item(cfg));
  items.forEach((item) => scene.add(item.mesh));

  // Update pets with items reference
  allPetInstances.forEach((pet) => {
    pet._items = items;
  });

  // ---- environment tag collection ----
  const allEntitiesForEnv = [...staticEntities, ...items];
  environments.forEach((env) => env.refreshTagsFromEntities(allEntitiesForEnv));

  // ---- interaction hint UI ----
  const hintSystem = createInteractionHint();

  // ---- env toggle hints (top-right) ----
  const globalHintEl = document.createElement('div');
  globalHintEl.id = 'env-global-hint';
  globalHintEl.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0,0,0,0.6);
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
    pointer-events: none;
    z-index: 100;
    backdrop-filter: blur(4px);
  `;
  document.body.appendChild(globalHintEl);

  const toggleHintEl = document.createElement('div');
  toggleHintEl.id = 'env-toggle-hint';
  toggleHintEl.style.cssText = `
    position: fixed;
    top: 56px;
    right: 20px;
    background: rgba(0,0,0,0.6);
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
    pointer-events: none;
    z-index: 100;
    display: none;
    backdrop-filter: blur(4px);
  `;
  document.body.appendChild(toggleHintEl);

  const followHintEl = document.createElement('div');
  followHintEl.id = 'follow-hint';
  followHintEl.style.cssText = `
    position: fixed;
    top: 92px;
    right: 20px;
    background: rgba(0,0,0,0.6);
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
    pointer-events: none;
    z-index: 100;
    display: none;
    backdrop-filter: blur(4px);
  `;
  document.body.appendChild(followHintEl);

  let outerEnvGlobalVisible = false;

  function applyEnvVisibility() {
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      const visible = outerEnvGlobalVisible && envVisibleState[i];
      unitEnvironments[i].visible = visible;
      environments[i].mesh.visible = visible;
      for (const entity of envEntityGroups[i]) {
        entity.mesh.visible = visible;
      }
    }
  }

  function getCurrentEnvIndex(playerPos) {
    const HALF_WIDTH = 10 * 2.05 / 2; // 10.25
    for (let i = 0; i < envGridConfigs.length; i++) {
      const cfg = envGridConfigs[i];
      const dx = Math.abs(playerPos.x - cfg.center[0]);
      const dz = Math.abs(playerPos.z - cfg.center[1]);
      if (dx <= HALF_WIDTH && dz <= HALF_WIDTH) {
        return i;
      }
    }
    return -1;
  }

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

    // Global outer env toggle (O key)
    globalHintEl.textContent = outerEnvGlobalVisible ? '按O隐藏所有外围环境' : '按O显示所有外围环境';
    if (consumeKeyPress('o')) {
      outerEnvGlobalVisible = !outerEnvGlobalVisible;
      applyEnvVisibility();
    }

    // Per-env visibility toggle (P key)
    const currentEnvIdx = getCurrentEnvIndex(player.mesh.position);
    if (currentEnvIdx !== -1 && currentEnvIdx !== 4) {
      const isVisible = envVisibleState[currentEnvIdx];
      toggleHintEl.textContent = isVisible ? '按P隐藏该地形内容' : '按P展示该地形内容';
      toggleHintEl.style.display = 'block';
      if (consumeKeyPress('p')) {
        envVisibleState[currentEnvIdx] = !isVisible;
        applyEnvVisibility();
      }
    } else {
      toggleHintEl.style.display = 'none';
    }

    // Follow hint (J/R keys)
    const followingPets = pets.filter((p) => p.state === 'following');
    if (followingPets.length > 0) {
      followHintEl.style.display = 'block';
      followHintEl.textContent = `${followingPets.length}只宠物跟随中 | 按J解散 | 按R改造环境`;
    } else {
      followHintEl.style.display = 'none';
    }

    // Play idle animations on items and static entities
    items.forEach((item) => item.updateAnimation?.(dt));
    staticEntities.forEach((entity) => {
      entity.updateAnimation?.(dt);
      entity.updateBreathing?.(dt);
    });

    // Update interaction hints
    const nearbyList = [];
    for (const entity of staticEntities) {
      if (!entity.mesh.visible) continue;
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
        if (
          pet.state !== 'following' &&
          pet.state !== 'chatting' &&
          pet.state !== 'seeking_player' &&
          pet.state !== 'returning_home' &&
          pet.state !== 'recall_pause' &&
          pet.state !== 'refining'
        ) {
          nearbyList.push({ name: pet.name, action: '按H呼喊跟随' });
        }
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
    '  E = 捡放物品/宠物互动/在宠物小屋前呼唤宠物/与建筑交互\n' +
    '  H = 呼喊宠物跟随（可多宠） | J = 解散所有跟随宠物 | R = 指使宠物改造环境'
  );
}

init().catch((err) => {
  console.error('[Init] Fatal:', err);
  document.body.innerHTML = '<div style="color:white;padding:20px;font-family:sans-serif">Failed to start:<br>' + err.message + '</div>';
});
