import * as THREE from 'three';
import { initRuntime } from '../../backend/runtimeLoader.js';
import { installGlobalSync } from '../../backend/index.js';
import { createScene, createRenderer, createLights, ThirdPersonCamera } from '../../engine';
import { Player, StaticEntity } from '../../engine';
import { createUnitEnvironment, getGridWorldPosition, paintUnitArea, worldToGridCoordinates } from '../../engine';
import { createInteractionHint } from '../../engine';
import { setupInteract } from '../../engine/interaction/interact.js';
import { setupRaycast } from '../../engine';
import { consumeKeyPress } from '../../engine';
import { createGenerateSystem } from '../chii-island/systems/generateSystem.js';
import { entityRegistry } from '../../storage';
import { envGridConfigs } from './config.js';

const INTERACT_HINT_RANGE = 1.8;

// ---- bootstrap ----
async function init() {
  window.THREE = THREE; // backward compatibility for legacy runtime

  initRuntime(THREE).then(() => console.log('[GhostHome] Voxel runtime ready')).catch((e) => console.warn('[GhostHome] Voxel runtime unavailable, using placeholders:', e.message));

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

  // ---- 3×3 world grid (terrain only, no environment center models) ----
  const unitEnvironments = [];

  envGridConfigs.forEach((cfg) => {
    const unitEnv = createUnitEnvironment(cfg.center[0], cfg.center[1], 10);
    scene.add(unitEnv);
    unitEnvironments.push(unitEnv);
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

  // ---- static entities (empty by default; G key can add placeholders) ----
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
      id: cfg.id,
      name: cfg.name,
      tags: cfg.tags,
      category: cfg.category || 'decor',
      position: [pos.x, 0, pos.z],
      scale: cfg.scale ?? 1,
    });
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

  // ---- player ----
  const player = new Player();
  scene.add(player.mesh);
  player.loadModel('generated/models/player-nezha.json');
  player.loadAnimations({
    idle: 'generated/animations/player-nezha-idle.json',
    walk: 'generated/animations/player-nezha-walk.json',
    jump: 'generated/animations/player-nezha-jump.json',
  });

  // ---- empty collections (kept for API symmetry with Chii Island) ----
  const environments = [];
  const pets = [];
  const items = [];
  const allEntitiesForEnv = [];
  const housePetMap = new Map();

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
      if (i === 4) continue;
      const visible = outerEnvGlobalVisible && envVisibleState[i];
      unitEnvironments[i].visible = visible;
      for (const entity of envEntityGroups[i]) {
        entity.mesh.visible = visible;
      }
    }
  }
  applyEnvVisibility();

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

  const dynamicTargets = [player, ...items, ...environments, ...staticEntities];

  function addToScene(mesh) {
    scene.add(mesh);
    dynamicTargets.push({ mesh, name: mesh.name, getInfo: null });
  }

  // ---- interaction systems ----
  const interactSystem = setupInteract(player, items, environments, pets, housePetMap, staticEntities, addToScene, allEntitiesForEnv);
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

  function placePlaceholder() {
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
      },
      envIndex
    );

    const entity = staticEntities[staticEntities.length - 1];
    dynamicTargets.push(entity);
    generateSystem.setTargetEntity(entity);
    console.log(`[Placeholder] ${name} placed at env ${envIndex} grid [${gridX}, ${gridZ}]`);
  }

  // ---- generate system ----
  const generateSystem = createGenerateSystem();

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

    // ---- game logic ----
    player.update(dt, thirdPersonCamera.getHorizontalAngle());
    pets.forEach((pet) => pet.move(player.mesh.position, dt));

    globalHintEl.textContent = outerEnvGlobalVisible ? '按O隐藏所有外围环境' : '按O显示所有外围环境';
    if (consumeKeyPress('o')) {
      outerEnvGlobalVisible = !outerEnvGlobalVisible;
      applyEnvVisibility();
    }

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
        nearbyList.push({ name: entity.name, action: '按E交互' });
        if (entity._originalModelJson && dist < nearestEditDist) {
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
        if (item._originalModelJson && dist < nearestEditDist) {
          nearestEditTarget = item;
          nearestEditDist = dist;
        }
      }
    }
    for (const env of environments) {
      if (!env.mesh.visible) continue;
      const dist = player.mesh.position.distanceTo(env.mesh.position);
      if (dist < INTERACT_HINT_RANGE * 2 && env._originalModelJson && dist < nearestEditDist) {
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
    '👻 Ghost Home\n' +
    '  WASD = 移动 | 鼠标拖拽 = 旋转 | 滚轮 = 缩放\n' +
    '  E = 交互 | G = 放置占位符\n' +
    '  O = 显示/隐藏所有外围环境 | P = 显示/隐藏当前环境内容\n' +
    '  右侧 = 模型编辑器（自动加载靠近的模型）'
  );
}

init().catch((err) => {
  console.error('[GhostHome] Fatal:', err);
  document.body.innerHTML = '<div style="color:white;padding:20px;font-family:sans-serif">Failed to start Ghost Home:<br>' + err.message + '</div>';
});
