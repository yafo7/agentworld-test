import * as THREE from 'three';
import { initRuntime } from '../../engine/runtime/runtimeProvider.js';
import { installGlobalSync } from '../../backend/index.js';
import { createScene, createRenderer, createLights, ThirdPersonCamera } from '../../engine';
import { Player, StaticEntity } from '../../engine';
import { createUnitEnvironment, getGridWorldPosition, paintUnitArea, worldToGridCoordinates } from '../../engine';
import { createInteractionHint, Input } from '../../engine';
import { setupInteract } from '../../legacy/interaction/interact.js';
import { setupRaycast } from '../../engine';
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

  // ---- unified input (pointer lock + keyboard) ----
  const input = new Input(renderer.domElement);

  const thirdPersonCamera = new ThirdPersonCamera();
  const camera = thirdPersonCamera.camera;
  createLights(scene);

  // ---- single center environment (20×20 grid, terrain only) ----
  const GRID_SIZE = 20;
  const unitEnvironments = [];

  const centerCfg = envGridConfigs[0];
  const unitEnv = createUnitEnvironment(centerCfg.center[0], centerCfg.center[1], GRID_SIZE);
  scene.add(unitEnv);
  unitEnvironments.push(unitEnv);

  // ---- terrain mesh collection for edit mode ----
  const terrainMeshes = [];
  unitEnv.traverse((child) => {
    if (child.userData?.type === 'unitArea') {
      child.userData.envIndex = 0;
      terrainMeshes.push(child);
    }
  });

  // ---- static entities (empty by default; G key can add placeholders) ----
  const staticEntities = [];
  const envEntityGroups = [[]];
  const gridOccupancy = [Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false))];

  function placeStaticEntity(cfg, envIndex = 0) {
    const targetUnitEnv = unitEnvironments[envIndex];
    const centerX = envGridConfigs[envIndex].center[0];
    const centerZ = envGridConfigs[envIndex].center[1];
    const pos = getGridWorldPosition(cfg.grid[0], cfg.grid[1], centerX, centerZ, GRID_SIZE);
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

  const followHintEl = document.createElement('div');
  followHintEl.id = 'follow-hint';
  followHintEl.style.cssText = `position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.6);color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;font-family:"Microsoft YaHei","PingFang SC",sans-serif;pointer-events:none;z-index:100;display:none;backdrop-filter:blur(4px);`;
  document.body.appendChild(followHintEl);

  // Center-screen placement warning
  const placementWarningEl = document.createElement('div');
  placementWarningEl.id = 'placement-warning';
  placementWarningEl.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(233,69,96,0.9);color:#fff;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:bold;font-family:"Microsoft YaHei","PingFang SC",sans-serif;pointer-events:none;z-index:200;display:none;box-shadow:0 4px 20px rgba(0,0,0,0.4);`;
  placementWarningEl.textContent = '该位置已有物品，不可重复放置';
  document.body.appendChild(placementWarningEl);

  function getCurrentEnvIndex(playerPos) {
    const SPACING = 4.05;
    const HALF_WIDTH = (GRID_SIZE * SPACING) / 2;
    const cfg = envGridConfigs[0];
    const dx = Math.abs(playerPos.x - cfg.center[0]);
    const dz = Math.abs(playerPos.z - cfg.center[1]);
    return dx <= HALF_WIDTH && dz <= HALF_WIDTH ? 0 : -1;
  }

  const dynamicTargets = [player, ...items, ...environments, ...staticEntities];

  function addToScene(mesh) {
    scene.add(mesh);
    dynamicTargets.push({ mesh, name: mesh.name, getInfo: null });
  }

  // ---- interaction systems ----
  const interactSystem = setupInteract(player, items, environments, pets, housePetMap, staticEntities, addToScene, allEntitiesForEnv, undefined, input);
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
    if (input.justPressed('KeyG')) {
      placePlaceholder();
    }

    // ---- pointer-lock driven camera ----
    const { dx, dy } = input.consumeMouseDelta();
    if (dx !== 0 || dy !== 0) {
      thirdPersonCamera.applyMouseDelta(dx, dy);
    }

    // ---- game logic ----
    player.update(dt, input, thirdPersonCamera);
    pets.forEach((pet) => pet.move(player.mesh.position, dt));

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

    input.endFrame();
    renderer.render(scene, camera);
  }
  animate();

  // ---- resizer (drag to adjust left/right split) ----
  const resizer = document.getElementById('resizer');
  const editorWrap = document.getElementById('editor-wrap');
  let isResizing = false;
  if (resizer && editorWrap) {
    // Release pointer lock when cursor enters the editor panel so users can interact with UI
    editorWrap.addEventListener('mouseenter', () => input.setPointerLockEnabled(false));
    // Re-enable pointer lock when cursor returns to the game area
    editorWrap.addEventListener('mouseleave', () => input.setPointerLockEnabled(true));

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
