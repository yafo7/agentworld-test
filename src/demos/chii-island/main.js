import * as THREE from 'three';
import { initRuntime } from '../../backend/runtimeLoader.js';
import { installGlobalSync } from '../../backend/index.js';
import { createScene, createRenderer, createLights, ThirdPersonCamera } from '../../engine';
import { Player, Pet, Environment, Item, StaticEntity } from '../../engine';
import { createUnitEnvironment, getGridWorldPosition, paintUnitArea, worldToGridCoordinates } from '../../engine';
import { createInteractionHint } from '../../engine';
import { setupInteract } from '../../engine/interaction/interact.js';
import { setupPetDialogue } from './systems/petDialogue.js';
import { createGenerateSystem } from './systems/generateSystem.js';
import { createRefineDialog } from './systems/refineDialog.js';
import { generateAnimation, generateModel, refineModel } from '../../backend/voxelApi.js';
import { setupRaycast } from '../../engine';
import { consumeKeyPress } from '../../engine';
import { ITEM_CONFIGS, HOUSE_PET_CONFIGS } from './data/gameData.js';
import { entityRegistry, gameState, saveScene, loadScene } from '../../storage';
import { envGridConfigs, centerLayout, houseConfigs, ENV_SPACING } from './config.js';
import { getGeneratedAsset } from './data/generatedLibrary.js';

const INTERACT_HINT_RANGE = 1.8;

// ---- bootstrap ----
async function init() {
  window.THREE = THREE; // backward compatibility for legacy runtime

  initRuntime(THREE).then(() => console.log('[Init] Voxel runtime ready')).catch((e) => console.warn('[Init] Voxel runtime unavailable, using placeholders:', e.message));

  installGlobalSync();

  // ---- Three.js setup ----
  const scene = createScene();
  const renderer = createRenderer();
  // Move renderer canvas into left game panel
  const gameWrap = document.getElementById('game-wrap');
  if (gameWrap && renderer.domElement.parentElement !== gameWrap) {
    gameWrap.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
  }
  const thirdPersonCamera = new ThirdPersonCamera();
  const camera = thirdPersonCamera.camera;
  createLights(scene);

  // ---- 3×3 world grid ----
  const unitEnvironments = [];
  const environments = [];

  envGridConfigs.forEach((cfg, idx) => {
    const unitEnv = createUnitEnvironment(cfg.center[0], cfg.center[1], 10);
    scene.add(unitEnv);
    unitEnvironments.push(unitEnv);

    if (idx === 4) {
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
    } else {
      environments.push(null);
    }
  });

  // ---- terrain mesh collection for edit mode ----
  const terrainMeshes = [];
  unitEnvironments.forEach((unitEnv, envIndex) => {
    unitEnv.traverse((child) => {
      if (child.userData?.type === 'unitArea') {
        child.userData.envIndex = envIndex;
        terrainMeshes.push(child);
      }
    });
  });

  // ---- static entities ----
  const staticEntities = [];
  const envEntityGroups = Array.from({ length: 9 }, () => []);
  const envVisibleState = new Array(9).fill(true);
  envVisibleState[4] = true; // center env always visible
  const gridOccupancy = Array.from({ length: 9 }, () => Array.from({ length: 10 }, () => Array(10).fill(false)));

  function placeStaticEntity(cfg, envIndex = 4) {
    const targetUnitEnv = unitEnvironments[envIndex];
    const centerX = envGridConfigs[envIndex].center[0];
    const centerZ = envGridConfigs[envIndex].center[1];
    const pos = getGridWorldPosition(cfg.grid[0], cfg.grid[1], centerX, centerZ);
    const entity = new StaticEntity({
      instanceId: cfg.instanceId,
      id: cfg.id,
      name: cfg.name,
      tags: cfg.tags,
      category: cfg.category || 'decor',
      areaType: cfg.areaType || 'default',
      position: [pos.x, 0, pos.z],
      scale: cfg.scale ?? 1,
      modelJson: cfg.modelJson,
      modelName: cfg.modelName,
    });
    entity._envIndex = envIndex;
    entity._gridX = cfg.grid[0];
    entity._gridZ = cfg.grid[1];
    staticEntities.push(entity);
    scene.add(entity.mesh);
    paintUnitArea(targetUnitEnv, cfg.grid[0], cfg.grid[1], cfg.areaType || 'default');
    envEntityGroups[envIndex].push(entity);
    entityRegistry.add(entity, { envIndex, type: cfg.category });
    gridOccupancy[envIndex][cfg.grid[0]][cfg.grid[1]] = true;
    if (envIndex !== 4) {
      entity.mesh.visible = false;
    }
  }

  // Center environment static entities only
  centerLayout.forEach((cfg) => placeStaticEntity(cfg, 4));

  // ---- pet houses + hidden pets (center env only) ----
  const pets = [];
  const housePetMap = new Map();

  houseConfigs.forEach((hc) => {
    placeStaticEntity(
      { grid: hc.grid, name: hc.houseName, tags: ['温馨', '小家', '守护'], id: 'pet_house', category: 'house', areaType: 'pet', scale: 0.5 },
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

  // Inject world data into pets
  const allPetInstances = Array.from(housePetMap.values()).map(v => v.pet);
  allPetInstances.forEach((pet, idx) => {
    const hc = houseConfigs[idx];
    const sideGridX = hc.grid[0] + 1 < 10 ? hc.grid[0] + 1 : hc.grid[0] - 1;
    const sidePos = getGridWorldPosition(sideGridX, hc.grid[1], 0, 0);
    pet.setWorldData(staticEntities, envGridConfigs, sidePos, 4, allPetInstances, environments.filter(Boolean), []);
  });

  // ---- player ----
  const player = new Player();
  scene.add(player.mesh);
  player.loadModel('generated/models/player-nezha.json');
  player.loadAnimations({
    idle: 'generated/animations/player-nezha-idle.json',
    walk: 'generated/animations/player-nezha-walk.json',
    jump: 'generated/animations/player-nezha-jump.json',
  });

  // ---- items ----
  const items = ITEM_CONFIGS.map((cfg) => new Item(cfg));
  items.forEach((item) => scene.add(item.mesh));
  allPetInstances.forEach((pet) => { pet._items = items; });

  // ---- environment tag collection ----
  let allEntitiesForEnv = [...staticEntities, ...items];
  environments.forEach((env) => { if (env) env.refreshTagsFromEntities(allEntitiesForEnv); });

  // ---- interaction hint UI ----
  const hintSystem = createInteractionHint();

  // ---- env toggle hints (top-right) ----
  const globalHintEl = document.createElement('div');
  globalHintEl.id = 'env-global-hint';
  globalHintEl.style.cssText = `position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.6);color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;font-family:"Microsoft YaHei","PingFang SC",sans-serif;pointer-events:none;z-index:100;backdrop-filter:blur(4px);`;
  document.body.appendChild(globalHintEl);

  const toggleHintEl = document.createElement('div');
  toggleHintEl.id = 'env-toggle-hint';
  toggleHintEl.style.cssText = `position:fixed;top:56px;right:20px;background:rgba(0,0,0,0.6);color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;font-family:"Microsoft YaHei","PingFang SC",sans-serif;pointer-events:none;z-index:100;display:none;backdrop-filter:blur(4px);`;
  document.body.appendChild(toggleHintEl);

  const followHintEl = document.createElement('div');
  followHintEl.id = 'follow-hint';
  followHintEl.style.cssText = `position:fixed;top:92px;right:20px;background:rgba(0,0,0,0.6);color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;font-family:"Microsoft YaHei","PingFang SC",sans-serif;pointer-events:none;z-index:100;display:none;backdrop-filter:blur(4px);`;
  document.body.appendChild(followHintEl);

  // Center-screen placement warning
  const placementWarningEl = document.createElement('div');
  placementWarningEl.id = 'placement-warning';
  placementWarningEl.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(233,69,96,0.9);color:#fff;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:bold;font-family:"Microsoft YaHei","PingFang SC",sans-serif;pointer-events:none;z-index:200;display:none;box-shadow:0 4px 20px rgba(0,0,0,0.4);`;
  placementWarningEl.textContent = '该位置已有物品，不可重复放置';
  document.body.appendChild(placementWarningEl);

  let outerEnvGlobalVisible = false;

  function applyEnvVisibility() {
    for (let i = 0; i < 9; i++) {
      if (i === 4 || !environments[i]) continue;
      const visible = outerEnvGlobalVisible && envVisibleState[i];
      unitEnvironments[i].visible = visible;
      environments[i].mesh.visible = visible;
      for (const entity of envEntityGroups[i]) {
        entity.mesh.visible = visible;
      }
    }
  }
  applyEnvVisibility();

  async function resolveModelSource(modelSource) {
    if (!modelSource) return null;
    if (modelSource.type === 'inline') return modelSource.modelJson || null;
    if (modelSource.type === 'assetId') {
      try {
        const { modelJson } = await getGeneratedAsset(modelSource.assetId);
        return modelJson;
      } catch (err) {
        console.warn('[SceneSnapshot] Failed to load generated asset:', err.message);
        return null;
      }
    }
    if (modelSource.type === 'path') {
      try {
        const resp = await fetch(`/${modelSource.path}`);
        if (!resp.ok) return null;
        return await resp.json();
      } catch (err) {
        console.warn('[SceneSnapshot] Failed to load model path:', err.message);
        return null;
      }
    }
    return null;
  }

  function clearStaticEntities() {
    for (const entity of staticEntities) {
      scene.remove(entity.mesh);
      entityRegistry.remove(entity);
    }
    staticEntities.length = 0;
    for (let i = 0; i < 9; i++) {
      envEntityGroups[i].length = 0;
      for (let x = 0; x < 10; x++) {
        for (let z = 0; z < 10; z++) {
          gridOccupancy[i][x][z] = false;
          paintUnitArea(unitEnvironments[i], x, z, 'default');
        }
      }
    }
  }

  async function applyStaticEntitySnapshot(snap) {
    const modelJson = await resolveModelSource(snap.modelSource);
    placeStaticEntity(
      {
        instanceId: snap.instanceId,
        id: snap.id,
        name: snap.name,
        tags: snap.tags,
        category: snap.category,
        areaType: snap.areaType,
        scale: snap.scale,
        grid: [snap.gridX, snap.gridZ],
        modelJson,
      },
      snap.envIndex
    );
    const entity = staticEntities[staticEntities.length - 1];
    entity.mesh.visible = snap.visible;
    if (snap.interactionPlan && entity.setInteractionAnimation) {
      entity.setInteractionAnimation(snap.interactionPlan, snap.interactionPlan._duration ?? 2.5);
    }
    if (snap.idlePlan && entity.playIdleAnimation) {
      entity.playIdleAnimation(snap.idlePlan, snap.idlePlan._duration ?? 2.5);
    }
  }

  async function applyEnvironmentSnapshot(snap, env) {
    const modelJson = await resolveModelSource(snap.modelSource);
    if (modelJson && env.refineModel) {
      await env.refineModel(modelJson, snap.moreTags || []);
    } else if (snap.moreTags?.length) {
      env.addTags(snap.moreTags);
    }
    if (snap.interactionPlan && env.setInteractionAnimation) {
      env.setInteractionAnimation(snap.interactionPlan, snap.interactionPlan._duration ?? 2.5);
    }
    if (snap.idlePlan && env.playIdleAnimation) {
      env.playIdleAnimation(snap.idlePlan, snap.idlePlan._duration ?? 2.5);
    }
  }

  function rebuildDynamicTargets() {
    dynamicTargets.length = 0;
    dynamicTargets.push(player, ...items, ...environments.filter(Boolean), ...staticEntities, ...pets.filter((p) => p.spawned));
  }

  function persistScene() {
    saveScene({
      staticEntities,
      environments,
      pets: allPetInstances.map((pet) => {
        const houseEntry = Array.from(housePetMap.values()).find((v) => v.pet === pet);
        return { pet, houseEntity: houseEntry?.house };
      }),
      items,
      outerEnvGlobalVisible,
      envVisibleState,
    });
  }

  async function applySceneSnapshot(snapshot) {
    if (!snapshot) return;
    console.log('[SceneSnapshot] Restoring scene...');

    // 1. Static entities
    clearStaticEntities();
    for (const snap of snapshot.staticEntities) {
      await applyStaticEntitySnapshot(snap);
    }

    // 2. Environments (model/tags/animations) — only restore existing envs (center env)
    const envByName = new Map(environments.filter(Boolean).map((e) => [e.name, e]));
    for (const snap of snapshot.environments) {
      let env = envByName.get(snap.name);
      if (!env) continue; // skip peripheral envs that no longer have Environment instances
      await applyEnvironmentSnapshot(snap, env);
    }

    // 3. Re-link pet houses
    const staticByInstanceId = new Map(staticEntities.map((e) => [e._instanceId, e]));
    for (const entry of housePetMap.values()) {
      const snap = snapshot.pets.find((p) => p.name === entry.pet.name);
      const houseInstanceId = snap?.houseInstanceId;
      if (houseInstanceId) {
        const newHouse = staticByInstanceId.get(houseInstanceId);
        if (newHouse) entry.house = newHouse;
      }
    }

    // 4. Pets
    for (const snap of snapshot.pets) {
      const pet = allPetInstances.find((p) => p.name === snap.name);
      if (!pet) continue;
      await pet.fromSnapshot(snap);
      if (pet.spawned && !pets.includes(pet)) {
        addToScene(pet.mesh);
        pets.push(pet);
      }
    }

    // 5. Items
    for (const snap of snapshot.items) {
      let item = items.find((i) => i.id === snap.id);
      if (!item) {
        item = new Item({
          id: snap.id,
          name: snap.name || snap.id,
          tags: snap.tags || [],
          color: snap.color ?? 0xffffff,
          correspondsTo: snap.correspondsTo,
          spawnPosition: snap.position,
        });
        items.push(item);
        scene.add(item.mesh);
      }
      await item.fromSnapshot(snap);
    }

    // 6. Environment visibility
    outerEnvGlobalVisible = snapshot.outerEnvGlobalVisible;
    for (let i = 0; i < 9; i++) {
      envVisibleState[i] = snapshot.envVisibleState[i] ?? (i === 4);
    }
    applyEnvVisibility();

    // 7. Refresh derived collections
    rebuildDynamicTargets();
    allEntitiesForEnv = [...staticEntities, ...items];
    environments.forEach((env) => { if (env) env.refreshTagsFromEntities(allEntitiesForEnv); });
    allPetInstances.forEach((pet) => {
      pet._staticEntities = staticEntities;
      pet._items = items;
    });

    console.log('[SceneSnapshot] Scene restored');
  }

  async function setupSnapshot() {
    const snapshot = loadScene();
    if (snapshot) {
      await applySceneSnapshot(snapshot);
    } else {
      persistScene();
    }
  }

  function getCurrentEnvIndex(playerPos) {
    const HALF_WIDTH = 10 * 2.05 / 2;
    for (let i = 0; i < envGridConfigs.length; i++) {
      const cfg = envGridConfigs[i];
      const dx = Math.abs(playerPos.x - cfg.center[0]);
      const dz = Math.abs(playerPos.z - cfg.center[1]);
      if (dx <= HALF_WIDTH && dz <= HALF_WIDTH) return i;
    }
    return -1;
  }

  const dynamicTargets = [player, ...items, ...environments.filter(Boolean), ...staticEntities];

  function addToScene(mesh) {
    scene.add(mesh);
    dynamicTargets.push({ mesh, name: mesh.name, getInfo: null });
  }

  // ---- interaction systems ----
  const refineDialog = createRefineDialog();

  async function executeRefine(following, target, type) {
    const leadPet = following[0];
    if (!leadPet || !target) return;

    const modelJson = target._originalModelJson;
    const category = target.category || 'object';
    let description = '';
    switch (type) {
      case 'ability':
        description = `为 ${target.name} 添加一个 ${leadPet.ability || '特殊能力'} 主题的动画，让它像 ${leadPet.name} 一样展现 ${leadPet.ability || '能力'} 的动感。保持原模型外形不变。`;
        break;
      case 'species':
        description = `基于 ${leadPet.species || '本能'}，改造 ${target.name}：保留原模型整体形状和颜色，加入 ${leadPet.species || '物种'} 特征。`;
        break;
      case 'effect':
        description = `让 ${target.name} 变得 ${leadPet.personalityTag || '有个性'}，添加 ${leadPet.personalityTag || '性格'} 氛围的粒子特效和动态效果。保持原模型不变。`;
        break;
      case 'material':
        description = `改造 ${target.name} 的材质和表面，让它变得 ${leadPet.feature || '有质感'}，重点是触感/材质表现，不要改变整体结构。`;
        break;
    }

    try {
      if (type === 'ability' || type === 'effect') {
        if (!modelJson) {
          console.warn('[Refine] Target has no modelJson, cannot generate animation');
          return;
        }
        const emitParticles = type === 'effect';
        const { plan } = await generateAnimation(modelJson, description, 2.0, 'fireworks', emitParticles);
        if (target.setInteractionAnimation) {
          target.setInteractionAnimation(plan, plan._duration ?? 2.0);
        }
        console.log(`[Refine] ${target.name} got ${type} animation`);
      } else {
        let newModelJson;
        try {
          if (modelJson?._meta?.ai) {
            const result = await refineModel(modelJson, description);
            newModelJson = result.modelJson;
          } else {
            throw new Error('no_metadata');
          }
        } catch (err) {
          console.warn(`[Refine] refineModel failed (${err.message}), falling back to generateModel`);
          const result = await generateModel(description);
          newModelJson = result.modelJson;
        }

        const newTags = [leadPet.ability, leadPet.species, leadPet.personalityTag, leadPet.feature].filter(Boolean);
        await target.refineModel(newModelJson, newTags);
        target._originalModelJson = newModelJson;
        console.log(`[Refine] ${target.name} refined with ${type}`);
      }
    } catch (err) {
      console.error('[Refine] Failed:', err);
    } finally {
      delete target._refinePromise;
      delete target._pendingRefineTags;
      if (typeof persistScene === 'function') persistScene();
    }
  }

  function onRefineRequest(following, target) {
    const leadPet = following[0];
    if (!leadPet || !target) return;

    const options = [
      { key: 'a', label: '用你的能力去改造它吧！', sub: `能力 - ${leadPet.ability || '特殊能力'} - 动画`, type: 'ability' },
      { key: 'b', label: '根据本能去创作！', sub: `物种 - ${leadPet.species || '本能'} - 模型`, type: 'species' },
      { key: 'c', label: '随你的喜欢吧~', sub: `性格 - ${leadPet.personalityTag || '性格'} - 特效`, type: 'effect' },
      { key: 'd', label: '希望它可以和你一样！', sub: `特征 - ${leadPet.feature || '特征'} - 材质`, type: 'material' },
    ];

    refineDialog.show(
      leadPet.name,
      target.name,
      options,
      (type) => {
        const newTags = [leadPet.ability, leadPet.species, leadPet.personalityTag, leadPet.feature].filter(Boolean);
        target._pendingRefineTags = newTags;
        target._refinePromise = executeRefine(following, target, type);
        for (const pet of following) {
          pet.startRefine(target, { description: '', type });
        }
      },
      () => {
        console.log('[Refine] cancelled');
      }
    );
  }

  const interactSystem = setupInteract(player, items, environments.filter(Boolean), pets, housePetMap, staticEntities, addToScene, persistScene, onRefineRequest);
  const dialogueSystem = setupPetDialogue(pets, player.mesh.position);
  setupRaycast(camera, dynamicTargets);

  // ---- G key: place placeholder as a decor StaticEntity on the unit grid ----
  let placeholderCounter = 0;
  let warningTimer = null;

  function showPlacementWarning(text = '该位置已有物品，不可重复放置') {
    placementWarningEl.textContent = text;
    placementWarningEl.style.display = 'block';
    if (warningTimer) clearTimeout(warningTimer);
    warningTimer = setTimeout(() => {
      placementWarningEl.style.display = 'none';
      warningTimer = null;
    }, 1500);
  }

  async function placePlaceholder() {
    const envIndex = getCurrentEnvIndex(player.mesh.position);
    if (envIndex === -1) {
      showPlacementWarning('请在单位环境内放置');
      return;
    }

    const cfg = envGridConfigs[envIndex];
    const { gridX, gridZ } = worldToGridCoordinates(
      player.mesh.position.x,
      player.mesh.position.z,
      cfg.center[0],
      cfg.center[1],
      10
    );

    if (gridOccupancy[envIndex][gridX][gridZ]) {
      showPlacementWarning('该位置已有物品，不可重复放置');
      return;
    }

    let modelJson = null;
    try {
      const resp = await fetch('/generated/models/placeholder.json');
      if (resp.ok) modelJson = await resp.json();
    } catch (err) {
      console.warn('[Placeholder] Failed to load placeholder.json:', err.message);
    }

    placeholderCounter++;
    const name = `占位符_${placeholderCounter}`;
    placeStaticEntity(
      {
        id: 'placeholder',
        name,
        tags: ['占位符', '装饰'],
        category: 'decor',
        areaType: 'decor',
        scale: 0.5,
        grid: [gridX, gridZ],
        modelJson,
      },
      envIndex
    );

    const entity = staticEntities[staticEntities.length - 1];
    dynamicTargets.push(entity);
    console.log(`[Placeholder] ${name} placed at env ${envIndex} grid [${gridX}, ${gridZ}]`);
    applyEnvVisibility();
    persistScene();
  }

  // ---- F key: remove nearest decor StaticEntity ----
  const REMOVE_DECOR_RANGE = 2.5;

  function removeNearestDecor() {
    let nearest = null;
    let nearestDist = Infinity;
    for (const entity of staticEntities) {
      if (!entity.mesh.visible) continue;
      if (entity.category !== 'decor') continue; // only decors, not houses/trees
      const dist = player.mesh.position.distanceTo(entity.mesh.position);
      if (dist < REMOVE_DECOR_RANGE && dist < nearestDist) {
        nearest = entity;
        nearestDist = dist;
      }
    }
    if (!nearest) {
      console.log('[RemoveDecor] No decor nearby');
      return;
    }

    const envIndex = nearest._envIndex;
    const gridX = nearest._gridX;
    const gridZ = nearest._gridZ;

    // Remove from scene
    scene.remove(nearest.mesh);

    // Remove from staticEntities
    const idx = staticEntities.indexOf(nearest);
    if (idx >= 0) staticEntities.splice(idx, 1);

    // Remove from envEntityGroups
    if (envIndex !== undefined && envEntityGroups[envIndex]) {
      const gidx = envEntityGroups[envIndex].indexOf(nearest);
      if (gidx >= 0) envEntityGroups[envIndex].splice(gidx, 1);
    }

    // Free grid occupancy and repaint area to default
    if (envIndex !== undefined && gridX !== undefined && gridZ !== undefined) {
      gridOccupancy[envIndex][gridX][gridZ] = false;
      const targetUnitEnv = unitEnvironments[envIndex];
      if (targetUnitEnv) paintUnitArea(targetUnitEnv, gridX, gridZ, 'default');
    }

    // Remove from dynamicTargets / raycast targets
    const dtIdx = dynamicTargets.findIndex((t) => t === nearest || t.mesh === nearest.mesh);
    if (dtIdx >= 0) dynamicTargets.splice(dtIdx, 1);

    // Remove from entity registry
    entityRegistry.remove(nearest);

    // Refresh environment tags
    const allEntitiesForEnv = [...staticEntities, ...items];
    environments.forEach((env) => { if (env) env.refreshTagsFromEntities(allEntitiesForEnv); });

    // Clear editor target if it was this entity
    if (generateSystem.getTarget() === nearest) {
      generateSystem.setTargetEntity(null);
    }

    console.log(`[RemoveDecor] Removed ${nearest.name}`);
    persistScene();
  }

  // ---- generate system ----
  const generateSystem = createGenerateSystem(persistScene);

  // ---- snapshot: restore saved scene or save baseline ----
  await setupSnapshot();

  // ---- animation loop ----
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    // ---- side panel preview (always runs) ----
    generateSystem.update(dt);

    // ---- G key: place placeholder ----
    if (consumeKeyPress('g')) {
      placePlaceholder();
    }

    // ---- F key: remove nearest decor ----
    if (consumeKeyPress('f')) {
      removeNearestDecor();
    }

    // ---- game logic ----
    player.update(dt, thirdPersonCamera.getHorizontalAngle());
    pets.forEach((pet) => pet.move(player.mesh.position, dt));

    globalHintEl.textContent = outerEnvGlobalVisible ? '按O隐藏所有外围环境' : '按O显示所有外围环境';
    if (consumeKeyPress('o')) {
      outerEnvGlobalVisible = !outerEnvGlobalVisible;
      applyEnvVisibility();
      persistScene();
    }

    const currentEnvIdx = getCurrentEnvIndex(player.mesh.position);
    if (currentEnvIdx !== -1 && currentEnvIdx !== 4) {
      const isVisible = envVisibleState[currentEnvIdx];
      toggleHintEl.textContent = isVisible ? '按P隐藏该地形内容' : '按P展示该地形内容';
      toggleHintEl.style.display = 'block';
      if (consumeKeyPress('p')) {
        envVisibleState[currentEnvIdx] = !isVisible;
        applyEnvVisibility();
        persistScene();
      }
    } else {
      toggleHintEl.style.display = 'none';
    }

    const followingPets = pets.filter((p) => p.state === 'following');
    if (followingPets.length > 0) {
      followHintEl.style.display = 'block';
      followHintEl.textContent = `${followingPets.length}只宠物跟随中 | 按J解散 | 按R改造环境`;
    } else {
      followHintEl.style.display = 'none';
    }

    items.forEach((item) => item.updateAnimation?.(dt));
    staticEntities.forEach((entity) => {
      entity.updateAnimation?.(dt);
      entity.updateBreathing?.(dt);
    });

    // ---- nearby interaction hints + auto editor target ----
    const nearbyList = [];
    let nearestEditTarget = null;
    let nearestEditDist = Infinity;

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
          if (entity.category === 'decor') {
            nearbyList.push({ name: entity.name, action: '按F清除' });
          }
        }
        if (dist < nearestEditDist) {
          nearestEditTarget = entity;
          nearestEditDist = dist;
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
        if (dist < nearestEditDist) {
          nearestEditTarget = item;
          nearestEditDist = dist;
        }
      }
    }
    for (const env of environments) {
      if (!env || !env.mesh.visible) continue;
      const dist = player.mesh.position.distanceTo(env.mesh.position);
      if (dist < INTERACT_HINT_RANGE * 2 && dist < nearestEditDist) {
        nearestEditTarget = env;
        nearestEditDist = dist;
      }
    }
    if (nearestEditTarget) {
      nearbyList.push({ name: nearestEditTarget.name, action: '右侧编辑器可修改' });
      generateSystem.setTargetEntity(nearestEditTarget);
    } else {
      generateSystem.setTargetEntity(null);
    }
    hintSystem.update(nearbyList);
    interactSystem.update();
    dialogueSystem.update(dt);
    thirdPersonCamera.update(player.mesh.position);

    // Resize renderer to fit left panel
    const gameRect = gameWrap.getBoundingClientRect();
    if (gameRect.width > 0 && gameRect.height > 0) {
      if (renderer.domElement.width !== gameRect.width || renderer.domElement.height !== gameRect.height) {
        camera.aspect = gameRect.width / gameRect.height;
        camera.updateProjectionMatrix();
        renderer.setSize(gameRect.width, gameRect.height);
      }
    }

    renderer.render(scene, camera);
  }
  animate();

  // ---- resizer (drag to adjust left/right split) ----
  const resizer = document.getElementById('resizer');
  const editorWrap = document.getElementById('editor-wrap');
  let isResizing = false;
  if (resizer && editorWrap) {
    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const appRect = document.getElementById('app').getBoundingClientRect();
      const newEditorW = appRect.right - e.clientX;
      const clamped = Math.max(200, Math.min(600, newEditorW));
      editorWrap.style.width = clamped + 'px';
      generateSystem.resizePreview();
    });
    window.addEventListener('mouseup', () => {
      isResizing = false;
      document.body.style.cursor = '';
    });
  }

  console.log(
    '🌲 Chii Island 奇异岛\n' +
    '  WASD = 移动 | 鼠标拖拽 = 旋转 | 滚轮 = 缩放\n' +
    '  E = 捡放物品/宠物互动/在宠物小屋前呼唤宠物/与建筑交互\n' +
    '  H = 呼喊宠物跟随（可多宠） | J = 解散所有跟随宠物 | R = 指使宠物改造环境\n' +
    '  G = 在当前位置放置占位符 | F = 清除最近的装饰\n' +
    '  右侧 = 模型编辑器（自动加载靠近的模型）'
  );
}

init().catch((err) => {
  console.error('[Init] Fatal:', err);
  document.body.innerHTML = '<div style="color:white;padding:20px;font-family:sans-serif">Failed to start:<br>' + err.message + '</div>';
});
