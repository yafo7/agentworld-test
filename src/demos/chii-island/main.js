import * as THREE from 'three';
import { initRuntime } from '../../backend/runtimeLoader.js';
import { installGlobalSync } from '../../backend/index.js';
import { createScene, createRenderer, createLights, ThirdPersonCamera } from '../../engine';
import { Player, StaticEntity } from '../../engine';
import { buildModelFromJson } from '../../engine/model/builder.js';
import { ParticleSystem } from '../../engine/animation/particles.js';
import { createUnitEnvironment, getGridWorldPosition, preloadBlocks, generateTerrainLayout } from '../../engine';
import { Input } from '../../engine';
import { PhysicsWorld } from '../../engine/physics/PhysicsWorld.js';
import { RapierDebugRenderer } from '../../engine/physics/RapierDebugRenderer.js';
import { createGenerateSystem } from './systems/generateSystem.js';
import { setupRaycast } from '../../engine';
import { envGridConfigs } from './config.js';
import { generateSceneLayout } from './systems/sceneLayout.js';
import { loadStudioModel, loadStudioAnimations } from './data/studioLibrary.js';
import { ArchitectNPC } from './entities/ArchitectNPC.js';
import { createDialogueSystem } from './systems/DialogueSystem.js';
import { createConstructionEffect } from './systems/ConstructionEffect.js';
import { PetManager } from './systems/PetManager.js';
import { createPastoralSlice } from './systems/pastoralSlice.js';
import { PetPartyEvent } from './systems/PetPartyEvent.js';
import { ForestTempleSystem } from './systems/ForestTempleSystem.js';
import { getPetProfile } from './data/petProfiles.js';

// ---- bootstrap ----
async function init() {
  window.THREE = THREE;

  // Wait for voxel runtime before building terrain (needed for geometry)
  await initRuntime(THREE).then(() => console.log('[Init] Voxel runtime ready')).catch((e) => console.warn('[Init] Voxel runtime unavailable:', e.message));

  installGlobalSync();

  // Init Rapier physics
  const physics = new PhysicsWorld();
  await physics.init();
  physics.addGroundPlane(0);
  console.log('[Init] Physics ready');

  // ---- Three.js setup ----
  const scene = createScene();
  const renderer = createRenderer();
  window.__renderer = renderer; // for perf debugging
  const gameWrap = document.getElementById('game-wrap');
  if (gameWrap && renderer.domElement.parentElement !== gameWrap) {
    gameWrap.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
  }

  const input = new Input(renderer.domElement);
  const thirdPersonCamera = new ThirdPersonCamera();
  const camera = thirdPersonCamera.camera;
  createLights(scene);

  // ---- terrain grid (50×50, procedural forest biome) ----
  const GRID_SIZE = 50;
  preloadBlocks({});
  const layout = generateTerrainLayout(GRID_SIZE, 42);
  const centerCfg = envGridConfigs[0];

  function countBlockTypes(l) {
    const c = {}; l.flat().forEach(t => { c[t] = (c[t] || 0) + 1; }); return c;
  }

  // ---- fetch studio models + generate scene layout ----
  const STUDIO_MODELS = [
    { key: 'oak',      commit: '2026-07-01_18-40-24', folder: '一颗高大的橡树_4.3m' },
    { key: 'normal',   commit: '2026-07-01_18-45-21', folder: '一颗树_1.5m' },
    { key: 'apple',    commit: '2026-07-01_18-47-39', folder: '一颗苹果树_1.7m' },
    { key: 'glowgrass',commit: '2026-07-01_18-50-19', folder: '一丛荧光草_1.9m' },
    { key: 'windmill', commit: '2026-07-01_18-58-41', folder: '一个巨大的风车，底部长宽比是2/2_2.4m' },
    { key: 'church',   commit: '2026-07-01_18-53-35', folder: '一个巨大的哥特教堂，底部长宽比是5/8_3.4m' },
    { key: 'temple',   commit: '2026-07-02_14-42-30', folder: '一座西方的古老神殿，占地的长宽比是8/5_1.3m' },
    { key: 'pinkFlower',    path: 'generated/models/pink_flower.json' },
    { key: 'grassClump',    path: 'generated/models/grass_clump.json' },
    { key: 'trumpetFlower', path: 'generated/models/trumpet_flower.json' },
    { key: 'blueTulips',    path: 'generated/models/blue_tulips.json' },
    { key: 'wheatField',    path: 'generated/models/wheat_field.json' },
    { key: 'flowerPot',     path: 'generated/models/flower_pot.json' },
    { key: 'giantCarrot',   path: 'generated/models/giant_carrot.json' },
    { key: 'campfire',      path: 'generated/models/campfire.json' },
    { key: 'forestTrophy',  path: 'generated/models/forest_temple_trophy.json' },
    { key: 'forestTent',    path: 'generated/models/forest_temple_tent.json' },
  ];

  async function fetchLocalModel(path) {
    try {
      const resp = await fetch(`/${path}`);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      console.warn(`[Init] Failed to load local model: ${path}`, err.message);
      return null;
    }
  }

  async function fetchAllStudioModels() {
    const entries = await Promise.all(
      STUDIO_MODELS.map(async (m) => {
        let json = m.path ? await fetchLocalModel(m.path) : null;
        if (!json && m.commit && m.folder) json = await loadStudioModel(m.commit, m.folder);
        return { key: m.key, json };
      })
    );
    const map = {};
    for (const e of entries) {
      if (e.json) map[e.key] = e.json;
      else console.warn(`[Init] Failed to load studio model: ${e.key}`);
    }
    return map;
  }

  console.log('[Init] Loading studio models...');
  const modelJsons = await fetchAllStudioModels();
  console.log('[Init] Studio models loaded:', Object.keys(modelJsons).join(', '));

  const scenePlan = generateSceneLayout(layout, GRID_SIZE, 99);
  console.log('[SceneLayout]', `${scenePlan.buildings.length} buildings, ${scenePlan.trees.length} trees, ${scenePlan.grasses.length} grasses`);

  const unitEnv = createUnitEnvironment(centerCfg.center[0], centerCfg.center[1], GRID_SIZE, scenePlan.modifiedLayout);
  console.log('[Terrain] 50×50 terrain:', countBlockTypes(scenePlan.modifiedLayout));
  scene.add(unitEnv);

  function gridSpawn(name, fallback) {
    const spawn = scenePlan.pastoral?.petSpawns?.[name];
    if (!spawn) return fallback;
    const pos = getGridWorldPosition(spawn.gridX, spawn.gridZ, centerCfg.center[0], centerCfg.center[1], GRID_SIZE);
    return [pos.x, 0, pos.z];
  }

  function townGridSpawn(name, fallback) {
    const spawn = scenePlan.town?.petSpawns?.[name];
    if (!spawn) return fallback;
    const pos = getGridWorldPosition(spawn.gridX, spawn.gridZ, centerCfg.center[0], centerCfg.center[1], GRID_SIZE);
    return [pos.x, 0, pos.z];
  }

  function gridBoundsToWorld(bounds) {
    if (!bounds) return null;
    const min = getGridWorldPosition(bounds.minX, bounds.minZ, centerCfg.center[0], centerCfg.center[1], GRID_SIZE);
    const max = getGridWorldPosition(bounds.maxX, bounds.maxZ, centerCfg.center[0], centerCfg.center[1], GRID_SIZE);
    return { minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z };
  }

  // ---- place scene entities (buildings, trees, grass) ----
  const staticEntities = [];

  // Seeded random for visual variety (scale + rotation)
  let _vegSeed = 42;
  function _vegRand() {
    _vegSeed = (_vegSeed * 16807 + 0) % 2147483647;
    return (_vegSeed - 1) / 2147483646;
  }

  function placeEntity(gridX, gridZ, modelJson, name, tags, category, scale = 1, extra = {}) {
    const pos = getGridWorldPosition(gridX, gridZ, centerCfg.center[0], centerCfg.center[1], GRID_SIZE);
    const entity = new StaticEntity({
      id: extra.id || `${category}_${gridX}_${gridZ}`,
      name,
      tags,
      category,
      position: [
        pos.x + (extra.offsetX || 0),
        extra.offsetY || 0,
        pos.z + (extra.offsetZ || 0),
      ],
      scale,
      modelJson,
      mergeGeometry: extra.mergeGeometry !== false,
    });
    // Random Y rotation for natural variety
    if (extra.randomRotate && entity.mesh) {
      entity.mesh.rotation.y = _vegRand() * Math.PI * 2;
    }
    if (extra.rotation !== undefined && entity.mesh) {
      entity.mesh.rotation.y = extra.rotation;
    }
    if (extra.noCollider && entity.mesh) {
      entity.mesh.userData.noCollider = true;
    }
    staticEntities.push(entity);
    scene.add(entity.mesh);
    return entity;
  }

  // Buildings (3x scale, centered on footprint)
  const SPACING = 4; // matches UNIT_SIZE + GAP in terrain.js
  for (const b of scenePlan.buildings) {
    const modelJson = modelJsons[b.type];
    if (!modelJson) { console.warn(`[Init] Missing model for building: ${b.type}`); continue; }
    const names = { windmill: '风车', church: '哥特教堂', temple: '古老神殿' };
    // Center the model on its footprint (offset = half width/depth in world units)
    const offX = ((b.width - 1) / 2) * SPACING;
    const offZ = ((b.depth - 1) / 2) * SPACING;
    placeEntity(b.gridX, b.gridZ, modelJson, names[b.type], ['建筑', b.type], 'house', 3, {
      offsetX: offX, offsetZ: offZ,
    });
    console.log(`[Init] Placed ${names[b.type]} at (${b.gridX}, ${b.gridZ}) ${b.width}×${b.depth}`);
  }

  // Building clearance set for tree removal (footprint + generous margin)
  const _bldClear = new Set();
  for (const b of scenePlan.buildings) {
    for (let dz = -3; dz < b.depth + 3; dz++) {
      for (let dx = -3; dx < b.width + 3; dx++) {
        _bldClear.add(`${b.gridX + dx},${b.gridZ + dz}`);
      }
    }
  }

  // Trees (random scale 0.7–1.3, random Y rotation)
  for (const t of scenePlan.trees) {
    if (_bldClear.has(`${t.gridX},${t.gridZ}`)) continue; // skip trees too close to buildings
    const modelJson = modelJsons[t.type];
    if (!modelJson) continue;
    const s = 0.7 + _vegRand() * 0.6;
    placeEntity(t.gridX, t.gridZ, modelJson, '树', ['树木', '自然', t.type], 'tree', s, { randomRotate: true });
  }

  // Glowing grass (random scale 0.5–1.0, random Y rotation, no shadows)
  for (const g of scenePlan.grasses) {
    if (_bldClear.has(`${g.gridX},${g.gridZ}`)) continue;
    const roll = _vegRand();
    const modelKey = roll < 0.58 ? 'glowgrass' : roll < 0.82 ? 'grassClump' : 'pinkFlower';
    const modelJson = modelJsons[modelKey] || modelJsons.glowgrass;
    if (!modelJson) continue;
    const s = (modelKey === 'glowgrass' ? 0.5 : 0.35) + _vegRand() * 0.35;
    const entity = placeEntity(g.gridX, g.gridZ, modelJson, '荧光草', ['植物', '发光'], 'decor', s, { randomRotate: true });
    entity.mesh.userData.noCollider = true;
    entity.mesh.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
  }

  const decorMeta = {
    pinkFlower:    { name: 'pink flower',    scale: 0.58, tags: ['plant', 'flower', 'garden'] },
    grassClump:    { name: 'grass clump',    scale: 0.42, tags: ['plant', 'grass'] },
    trumpetFlower: { name: 'trumpet flower', scale: 0.48, tags: ['plant', 'flower', 'garden'] },
    blueTulips:    { name: 'blue tulips',    scale: 0.55, tags: ['plant', 'flower', 'garden'] },
    wheatField:    { name: 'wheat field',    scale: 0.38, tags: ['plant', 'wheat', 'farm'] },
    flowerPot:     { name: 'flower pot',     scale: 0.52, tags: ['decor', 'garden'] },
    giantCarrot:   { name: 'giant carrot',   scale: 0.34, tags: ['crop', 'farm'] },
  };

  for (const d of scenePlan.decorations || []) {
    if (_bldClear.has(`${d.gridX},${d.gridZ}`)) continue;
    const meta = decorMeta[d.type];
    const modelJson = modelJsons[d.type];
    if (!meta || !modelJson) continue;
    const entity = placeEntity(d.gridX, d.gridZ, modelJson, meta.name, meta.tags, 'decor', meta.scale * (d.scale || 1), {
      offsetX: d.offsetX || 0,
      offsetY: d.offsetY || 0,
      offsetZ: d.offsetZ || 0,
      rotation: d.rotation,
      noCollider: true,
    });
    entity.mesh.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
  }

  let campfireParticles = null;
  const campfireCell = scenePlan.town?.campfire;
  if (campfireCell && modelJsons.campfire) {
    const campfire = placeEntity(
      campfireCell.gridX,
      campfireCell.gridZ,
      modelJsons.campfire,
      '篝火',
      ['城镇', '篝火', '聚会'],
      'decor',
      1.6,
      { mergeGeometry: false }
    );
    const rawBurnPlan = await fetchLocalModel('generated/animations/campfire_burn.json');
    if (rawBurnPlan) {
      const burnPlan = rawBurnPlan.motionPlan
        ? { ...rawBurnPlan.motionPlan, _duration: rawBurnPlan.duration || 2.5, _loop: true }
        : rawBurnPlan;
      campfire.playIdleAnimation(burnPlan, burnPlan._duration || 2.5);
      if (campfire._modelGroup) {
        campfireParticles = new ParticleSystem(scene);
        campfireParticles.setup(burnPlan, campfire._modelGroup);
      }
    }
  }

  let forestTrophy = null;
  let forestTent = null;
  let forestTrophyWaitPlan = null;
  const forestPlan = scenePlan.forestTemple;
  if (forestPlan?.trophy && modelJsons.forestTrophy) {
    forestTrophy = placeEntity(
      forestPlan.trophy.gridX,
      forestPlan.trophy.gridZ,
      modelJsons.forestTrophy,
      '森林神殿奖杯',
      ['森林神殿', '召唤装置'],
      'decor',
      0.4,
      {
        id: 'forest_temple_trophy',
        mergeGeometry: false,
      }
    );
    forestTrophy.mesh.userData.interactionType = 'summon_pet_device';
    forestTrophyWaitPlan = await fetchLocalModel('generated/animations/forest_trophy_wait.json');
  }
  if (forestPlan?.tent && modelJsons.forestTent) {
    forestTent = placeEntity(
      forestPlan.tent.gridX,
      forestPlan.tent.gridZ,
      modelJsons.forestTent,
      '森林神殿帐篷',
      ['森林神殿', '露营'],
      'decor',
      0.9,
      {
        id: 'forest_temple_tent',
        mergeGeometry: false,
      }
    );
    forestTent.mesh.userData.interactionType = 'camping_tent';
  }

  console.log(`[Init] Created ${staticEntities.length} static entities`);

  // ---- create Rapier static colliders from entity world-space AABBs ----
  let colliderCount = 0;
  for (const e of staticEntities) {
    if (e.mesh?.userData?.noCollider) continue;
    const box = e.getWorldBBox();
    if (!box) continue;
    const hx = (box.max.x - box.min.x) / 2;
    const hy = (box.max.y - box.min.y) / 2;
    const hz = (box.max.z - box.min.z) / 2;
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    physics.addStaticBox(hx, hy, hz, cx, cy, cz);
    colliderCount++;
  }
  console.log(`[Init] Physics colliders: ${colliderCount}`);

  // ---- Rapier debug renderer (wireframe, hidden by default) ----
  const debugRenderer = new RapierDebugRenderer(physics.world);
  debugRenderer.enabled = false;
  scene.add(debugRenderer.mesh);

  // ---- player (nailong model from voxel studio) ----
  const player = new Player();
  player.setTerrainLayout(centerCfg.center[0], centerCfg.center[1], GRID_SIZE, layout);
  const townDemoEnabled = new URLSearchParams(window.location.search).has('church-town');
  const forestDemoEnabled = new URLSearchParams(window.location.search).has('forest-temple');
  const townDemoCell = scenePlan.town?.petSpawns?.fangk;
  const forestDemoCell = scenePlan.forestTemple?.trophy;
  let demoSpawn = { x: 0, z: 0 };
  if (forestDemoEnabled && forestDemoCell) {
    demoSpawn = getGridWorldPosition(forestDemoCell.gridX, forestDemoCell.gridZ - 1, centerCfg.center[0], centerCfg.center[1], GRID_SIZE);
  } else if (townDemoEnabled && townDemoCell) {
    demoSpawn = getGridWorldPosition(townDemoCell.gridX - 1, townDemoCell.gridZ, centerCfg.center[0], centerCfg.center[1], GRID_SIZE);
  }
  player.initPhysics(physics, demoSpawn.x, 0, demoSpawn.z);
  window.__player = player;
  player._scene = scene; // for particle emitters
  scene.add(player.mesh);
  player.loadModel('generated/models/nailong.json');
  // Base locomotion animations
  player.loadAnimations({
    idle: 'generated/animations/nailong_idle.json',    // 呼吸摇摆
    walk: 'generated/animations/nailong_walk.json',    // 行走
    run:  'generated/animations/nailong_run.json',     // 奔跑
    jump: 'generated/animations/nailong_jump.json',    // 跳跃
  });
  // Special one-shot animations
  player.loadAnimation('wave_left', 'generated/animations/nailong_wave_left.json');   // H: 挥舞左手
  player.loadAnimation('fan_spark', 'generated/animations/nailong_fan_spark.json');   // J: 挥舞扇子+特效

  // ---- architect NPC ----
  const architect = new ArchitectNPC();
  architect.mesh.name = 'fangk';
  architect._petName = 'fangke';
  architect._petId = 'fangk';
  architect._profile = getPetProfile('fangke');
  architect._petState = 'free_roam';
  architect._petRegion = 'church_town';
  const architectSpawn = townGridSpawn('fangk', [0, 0, 30]);
  architect.setPosition(...architectSpawn);
  architect.setOrigin(...architectSpawn);
  architect.initPhysics(physics);
  scene.add(architect.mesh);

  // Load architect model + animations from voxel studio backend
  const ARCHITECT_COMMIT = '2026-07-02_16-32-30';
  const ARCHITECT_FOLDER = '一位穿着黑色西装的建筑设计师_2.8m';

  (async () => {
    try {
      const archModel = await fetchLocalModel('generated/models/fangk.json')
        || await loadStudioModel(ARCHITECT_COMMIT, ARCHITECT_FOLDER);
      if (archModel) {
        architect.loadModelFromJson(archModel);
        if (architect._modelGroup) {
          architect._modelGroup.userData._baseScale = architect._modelGroup.scale.x;
          architect._modelGroup.userData._baseY = architect._modelGroup.position.y;
        }
        console.log('[Init] Architect model loaded from studio');
      }
      const localAnimations = {
        idle: 'generated/animations/fangk_idle.json',
        run: 'generated/animations/fangk_run.json',
        construct: 'generated/animations/fangk_construct.json',
        dance: 'generated/animations/fangk_dance.json',
      };
      for (const [name, path] of Object.entries(localAnimations)) {
        const plan = await fetchLocalModel(path);
        if (plan) architect.loadAnimation(name, plan);
      }

      // Studio remains a compatibility fallback for missing local animations.
      const anims = await loadStudioAnimations(ARCHITECT_COMMIT, ARCHITECT_FOLDER);
      for (const anim of anims) {
        const name = anim.name || '';
        if (!architect._animPlans.idle && /idle|待机/i.test(name)) architect.loadAnimation('idle', anim.plan || anim);
        else if (!architect._animPlans.run && /run|奔跑|走/i.test(name)) architect.loadAnimation('run', anim.plan || anim);
        else if (!architect._animPlans.construct && /construct|建造|挥舞|施工/i.test(name)) architect.loadAnimation('construct', anim.plan || anim);
      }
      console.log('[Init] Architect ready from runtime assets');
    } catch (e) {
      console.warn('[Init] Architect studio load failed, using placeholder:', e.message);
    }
  })();

  // ---- bear NPC (wanders near windmill river side) ----
  const bear = new ArchitectNPC();
  window.__bear = bear;
  bear.mesh.name = 'momo';
  bear._petName = 'momo';
  bear._profile = getPetProfile('momo');
  bear._petState = 'idle';
  bear._initialInteractionDone = false;
  bear.initPhysics(physics);
  const [bearSpawnX, , bearSpawnZ] = gridSpawn('momo', [-60, 0, 15]);
  bear.setPosition(bearSpawnX, 0, bearSpawnZ);
  bear.setOrigin(bearSpawnX, 0, bearSpawnZ);
  scene.add(bear.mesh);

  const BEAR_COMMIT = '2026-07-02_14-47-47';
  const BEAR_FOLDER = '一只粉色，圆滚滚的小熊_2.3m';

  (async () => {
    try {
      const bearModel = await loadStudioModel(BEAR_COMMIT, BEAR_FOLDER);
      if (bearModel) {
        bear.loadModelFromJson(bearModel);
        if (bear._modelGroup) {
          bear._modelGroup.userData._baseScale = bear._modelGroup.scale.x;
          bear._modelGroup.userData._baseY = bear._modelGroup.position.y;
        }
        console.log('[Init] Bear model loaded from studio');
      }
      // Load bear animations from studio
      const bearAnims = await loadStudioAnimations(BEAR_COMMIT, BEAR_FOLDER);
      for (const anim of bearAnims) {
        const name = anim.name || '';
        if (/呼吸|idle|待机/i.test(name)) bear.loadAnimation('idle', anim.plan || anim);
        else if (/行走/i.test(name)) bear.loadAnimation('walk', anim.plan || anim);
        else if (/奔跑/i.test(name)) bear.loadAnimation('run', anim.plan || anim);
        else if (/伸手向前攻击/i.test(name)) bear.loadAnimation('chop', anim.plan || anim);
        else if (/拍击|闪光/i.test(name)) bear.loadAnimation('smash', anim.plan || anim);
        else if (/挥舞左手/i.test(name)) bear.loadAnimation('wave', anim.plan || anim);
        else if (/烟雾/i.test(name)) bear.loadAnimation('magic', anim.plan || anim);
        // Fallback matches (only if specific names didn't match)
        else if (/walk|走|行/i.test(name) && !bear._animPlans.walk) bear.loadAnimation('walk', anim.plan || anim);
        else if (/run|奔跑/i.test(name) && !bear._animPlans.run) bear.loadAnimation('run', anim.plan || anim);
        else if (/idle/i.test(name) && !bear._animPlans.idle) bear.loadAnimation('idle', anim.plan || anim);
      }
      // Last-resort fallbacks
      if (!bear._animPlans.walk && bear._animPlans.run) bear._animPlans.walk = bear._animPlans.run;
      if (!bear._animPlans.chop && bear._animPlans.smash) bear._animPlans.chop = bear._animPlans.smash;
      if (!bear._animPlans.chop && bear._animPlans.run) bear._animPlans.chop = bear._animPlans.run;
      console.log('[Init] Bear ready with animations:', Object.keys(bear._animPlans).join(', '));
    } catch (e) {
      console.warn('[Init] Bear studio load failed:', e.message);
    }
  })();

  // ---- polished pet NPCs ----
  const townPetBounds = gridBoundsToWorld(scenePlan.town?.roamBounds);
  const petManager = new PetManager({
    scene,
    physics,
    petSpawns: {
      yafo: gridSpawn('yafo', [-30, 0, 30]),
      mok: gridSpawn('mok', [38, 0, 18]),
      mako: townGridSpawn('mako', [-38, 0, -18]),
      lingq: townGridSpawn('lingq', [26, 0, -24]),
    },
    petBehaviors: {
      mako: { initialState: 'free_roam', region: 'church_town', bounds: townPetBounds },
      lingq: { initialState: 'free_roam', region: 'church_town', bounds: townPetBounds },
    },
  });
  await petManager.load();
  petManager.registerPet(architect, {
    name: 'fangke',
    spawn: architectSpawn,
    initialState: 'free_roam',
    region: 'church_town',
    bounds: townPetBounds,
    updateExternally: true,
  });
  window.__petManager = petManager;

  // ---- dialogue / construction state flags ----
  let dialogueActive = false;
  let constructionActive = false;
  let architectGraphState = 'intro'; // 'intro' | 'busy' | 'followup'
  let bearDialogueActive = false; // tracks whether bear is in dialogue mode
  let activePetNpc = null;
  let pastoralDialogueLock = false;
  let pastoralWorkCameraTimer = null;

  // ---- dynamic targets for raycast ----
  const dynamicTargets = [...new Set([player, architect, bear, ...staticEntities, ...petManager.pets])];

  setupRaycast(camera, dynamicTargets);

  // ---- ESC management panel ----
  const mgmtPanel = document.getElementById('mgmt-panel');
  const chkCollision = document.getElementById('chk-collision');
  let panelOpen = false;

  function setPanelOpen(open) {
    panelOpen = open;
    if (open) {
      mgmtPanel.classList.add('visible');
      document.exitPointerLock();
    } else {
      mgmtPanel.classList.remove('visible');
    }
  }

  chkCollision.addEventListener('change', () => {
    debugRenderer.enabled = chkCollision.checked;
  });

  // Click outside card to close
  mgmtPanel.addEventListener('click', (e) => {
    if (e.target === mgmtPanel) setPanelOpen(false);
  });

  // ---- generate system (hidden for now) ----
  const editorWrap = document.getElementById('editor-wrap');
  const resizer = document.getElementById('resizer');
  if (editorWrap) editorWrap.style.display = 'none';
  if (resizer) resizer.style.display = 'none';
  const generateSystem = createGenerateSystem(() => {});

  // ---- dialogue system ----
  const dialogueSystem = createDialogueSystem();

  function getNpcPosition(npc) {
    return npc?.getPosition?.() || npc?.mesh?.position?.clone?.() || new THREE.Vector3();
  }

  function framePastoralPair(npc, targetPosition = null, distance = 9.0, height = 1.25, fov = 52) {
    const playerPos = player.mesh.position.clone();
    const npcPos = getNpcPosition(npc);
    const targetPos = targetPosition ? targetPosition.clone() : npcPos;
    const midPoint = new THREE.Vector3()
      .add(playerPos)
      .add(npcPos)
      .add(targetPos)
      .multiplyScalar(1 / 3);
    midPoint.y = 1.35;

    const spanA = new THREE.Vector3().subVectors(npcPos, playerPos);
    const spanB = new THREE.Vector3().subVectors(targetPos, playerPos);
    let dir = spanA.lengthSq() > spanB.lengthSq() ? spanA : spanB;
    dir.y = 0;
    if (dir.lengthSq() < 0.001) dir = new THREE.Vector3(0, 0, 1);
    dir.normalize();
    const sideDir = new THREE.Vector3(-dir.z, 0, dir.x);

    const span = Math.max(
      playerPos.distanceTo(npcPos),
      playerPos.distanceTo(targetPos),
      npcPos.distanceTo(targetPos),
      4
    );
    const camPos = midPoint.clone()
      .addScaledVector(sideDir, distance + span * 0.45)
      .addScaledVector(dir, distance * 0.35);
    camPos.y += height + span * 0.03;
    thirdPersonCamera.lockTo(camPos, midPoint, fov);
  }

  function setPastoralDialogueLock(locked, npc = activePetNpc) {
    pastoralDialogueLock = locked;
    if (locked) {
      if (pastoralWorkCameraTimer) {
        clearTimeout(pastoralWorkCameraTimer);
        pastoralWorkCameraTimer = null;
      }
      const npcPos = getNpcPosition(npc);
      document.exitPointerLock();
      player.lockTo(npcPos.x, npcPos.z);
      npc?.lockFacing?.(player.mesh.position.x, player.mesh.position.z);
      framePastoralPair(npc, null, 9.5, 1.25, 54);
    } else {
      pastoralDialogueLock = false;
      player.unlock();
      npc?.unlockFacing?.();
      thirdPersonCamera.unlock(60);
    }
  }

  function focusPastoralWorkCamera(pet, targetPos) {
    framePastoralPair(pet, targetPos, 11.5, 1.45, 58);
    if (pastoralWorkCameraTimer) clearTimeout(pastoralWorkCameraTimer);
    pastoralWorkCameraTimer = setTimeout(() => {
      if (!pastoralDialogueLock && !dialogueSystem.isActive()) {
        thirdPersonCamera.unlock(60);
      }
      pastoralWorkCameraTimer = null;
    }, 3600);
  }

  const pastoralSlice = createPastoralSlice({
    scene,
    player,
    staticEntities,
    pets: [bear, ...petManager.pets.filter(pet => pet._petRegion !== 'church_town')],
    dialogueSystem,
    center: [centerCfg.center[0], centerCfg.center[1]],
    gridSize: GRID_SIZE,
    terrainLayout: scenePlan.modifiedLayout,
    setDialogueLock: setPastoralDialogueLock,
    focusDialogueCamera: (pet) => framePastoralPair(pet, null, 9.5, 1.25, 54),
    focusWorkCamera: focusPastoralWorkCamera,
  });

  const townCenterGrid = scenePlan.town?.center;
  const townCenterWorld = townCenterGrid
    ? getGridWorldPosition(townCenterGrid.x, townCenterGrid.z, centerCfg.center[0], centerCfg.center[1], GRID_SIZE)
    : { x: 0, z: -30 };
  const townPets = [
    architect,
    petManager.pets.find(pet => pet._petName === 'lingq'),
    petManager.pets.find(pet => pet._petName === 'mako'),
  ].filter(Boolean);
  const petPartyEvent = new PetPartyEvent({
    scene,
    player,
    petManager,
    participants: townPets,
    center: new THREE.Vector3(townCenterWorld.x, 0, townCenterWorld.z),
  });
  window.__petPartyEvent = petPartyEvent;

  const forestTempleSystem = new ForestTempleSystem({
    scene,
    physics,
    player,
    petManager,
    dialogueSystem,
    trophyEntity: forestTrophy,
    tentEntity: forestTent,
    trophyWaitPlan: forestTrophyWaitPlan,
    getPets: () => [bear, ...petManager.pets],
  });
  window.__forestTempleSystem = forestTempleSystem;
  if (forestDemoEnabled) {
    const demoPet = petManager.pets.find(pet => pet._petName === 'yafo');
    if (demoPet) {
      demoPet.setPosition(demoSpawn.x - 3, 0, demoSpawn.z - 3);
      demoPet.setOrigin(demoSpawn.x - 3, 0, demoSpawn.z - 3);
      pastoralSlice.startFollowing(demoPet);
    }
  }

  function resumePetNpc(npc) {
    if (!npc) return;
    npc.unlockFacing?.();
    if (npc === bear) {
      if (!bear._followEnabled && bear._petState === 'free_roam') {
        bear.enableWander(2.0, { minX: bearSpawnX - 10, maxX: bearSpawnX + 10, minZ: bearSpawnZ - 10, maxZ: bearSpawnZ + 10 });
      }
      return;
    }
    petManager.resumePet(npc);
  }

  function beginPetDialogue(npc, npcPos, playerPos, dx, dz, graph = 'bear_greet', context = null) {
    activePetNpc = npc;
    dialogueSystem.setPetSpeakerName(npc._petName || 'momo');
    dialogueActive = true;
    bearDialogueActive = true;
    document.exitPointerLock();
    player.lockTo(npcPos.x, npcPos.z);
    npc.lockFacing?.(playerPos.x, playerPos.z);

    const midPoint = new THREE.Vector3(
      (playerPos.x + npcPos.x) / 2, 1.5,
      (playerPos.z + npcPos.z) / 2
    );
    const camDir = new THREE.Vector3(dx, 0, dz).normalize();
    const sideDir = new THREE.Vector3(-camDir.z, 0, camDir.x);
    const camPos = midPoint.clone().addScaledVector(sideDir, 3.5);
    camPos.y += 0.5;
    thirdPersonCamera.lockTo(camPos, midPoint, 45);

    dialogueSystem.show(graph, context);
  }

  function beginPastoralPetDialogue(npc, npcPos, playerPos, dx, dz) {
    activePetNpc = npc;
    dialogueSystem.setPetSpeakerName(npc._petName || '宠物');
    framePastoralPair(npc, null, 9.5, 1.25, 54);

    pastoralSlice.interact(npc)
      .catch((err) => console.warn('[Pastoral] interaction failed:', err.message))
      .finally(() => {
        pastoralDialogueLock = false;
        if (pastoralWorkCameraTimer) {
          clearTimeout(pastoralWorkCameraTimer);
          pastoralWorkCameraTimer = null;
        }
        thirdPersonCamera.unlock(60);
        player.unlock();
        npc.unlockFacing?.();
        activePetNpc = null;
      });
  }

  function beginTownPetDialogue(npc) {
    activePetNpc = npc;
    dialogueActive = true;
    dialogueSystem.setPetSpeakerName(npc._petName || '宠物');
    setPastoralDialogueLock(true, npc);

    petPartyEvent.interact(npc, dialogueSystem)
      .catch((err) => console.warn('[ChurchTown] interaction failed:', err.message))
      .finally(() => {
        dialogueActive = false;
        setPastoralDialogueLock(false, npc);
        activePetNpc = null;
      });
  }

  function beginForestInteraction(hit) {
    activePetNpc = hit.pet || null;
    dialogueActive = true;
    pastoralDialogueLock = true;
    document.exitPointerLock();
    player.lockTo(hit.type === 'trophy' ? forestTrophy.mesh.position.x : forestTent.mesh.position.x,
      hit.type === 'trophy' ? forestTrophy.mesh.position.z : forestTent.mesh.position.z);
    hit.pet?.lockFacing?.(
      hit.type === 'trophy' ? forestTrophy.mesh.position.x : forestTent.mesh.position.x,
      hit.type === 'trophy' ? forestTrophy.mesh.position.z : forestTent.mesh.position.z
    );

    forestTempleSystem.interact(hit)
      .catch((err) => console.warn('[ForestTemple] interaction failed:', err.message))
      .finally(() => {
        dialogueActive = false;
        pastoralDialogueLock = false;
        player.unlock();
        hit.pet?.unlockFacing?.();
        activePetNpc = null;
      });
  }

  function beginGeneratedPetIntroduction(pet) {
    activePetNpc = pet;
    dialogueActive = true;
    setPastoralDialogueLock(true, pet);

    forestTempleSystem.introducePet(pet)
      .catch((err) => console.warn('[ForestTemple] introduction failed:', err.message))
      .finally(() => {
        dialogueActive = false;
        setPastoralDialogueLock(false, pet);
        activePetNpc = null;
      });
  }

  dialogueSystem.setOnConstructionTrigger((buildingEntity, description) => {
    constructionActive = true;
    constructionEffect.start(buildingEntity, description);
    architectGraphState = 'busy';
  });
  dialogueSystem.setOnPanCamera((buildingEntity) => {
    const box = new THREE.Box3().setFromObject(buildingEntity.mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const camPos = new THREE.Vector3(
      center.x + Math.max(size.x, size.z) * 1.2,
      center.y + size.y * 0.5,
      center.z + Math.max(size.x, size.z) * 1.2
    );
    thirdPersonCamera.lockTo(camPos, center, 45);
  });
  dialogueSystem.setOnSwitchToIntro(() => {
    architectGraphState = 'intro';
  });
  dialogueSystem.setOnBearFollow(() => {
    const pet = activePetNpc || bear;
    pet.disableWander?.();
    pet.followTarget(player.mesh, 3.0, 6.0);
  });
  dialogueSystem.setOnBearResume(() => {
    const pet = activePetNpc || bear;
    pet.stopFollow();
    resumePetNpc(pet);
  });
  dialogueSystem.setOnBearChopTree(async () => {
    const tree = window.__chopTree;
    if (!tree) return;
    window.__chopTree = null;

    // Load stump model from studio
    let stumpJson = null;
    try {
      stumpJson = await loadStudioModel('2026-07-05_14-40-00', '一个树桩_2.6m');
    } catch (_) {}

    // Create spark particles (ParticleSystem on tree)
    const chopDummy = new THREE.Object3D(); chopDummy.name = '_chopEmitter';
    tree.mesh.add(chopDummy);
    const cbox = new THREE.Box3().setFromObject(tree.mesh);
    const csz = new THREE.Vector3(); cbox.getSize(csz);
    chopDummy.position.set(0, csz.y * 0.5, 0);
    const CHOP_SPARK_PLAN = {
      _chopEmitter: {
        emit: {
          emitMode: 'volume', mesh: 'sphere', meshSize: 0.1, rate: 30,
          lifetime: [0.4, 0.9],
          velocity: { dir: [0, 0.5, 0], speed: [0.5, 2], spread: 0.7 },
          acceleration: [0, -1.5, 0],
          colorStart: [1, 0.6, 0.1], colorEnd: [1, 0.2, 0, 0],
          scaleStart: [0.5, 0.5, 0.5], scaleEnd: [0.05, 0.05, 0.05],
        },
      },
    };
    const chopPS = new ParticleSystem(scene);
    chopPS.setup(CHOP_SPARK_PLAN, tree.mesh);
    window.__chopPS = chopPS;

    // Start chop sequence
    bear.chopTree(tree, () => {
      // Remove chop particle system
      if (window.__chopPS) { window.__chopPS.dispose(); window.__chopPS = null; }
      chopDummy.removeFromParent();

      // Replace tree with stump (voxel-game reveal animation)
      if (stumpJson) {
        try {
          const stumps = buildModelFromJson(stumpJson);
          if (stumps) {
            _revealStump(tree, stumps, stumpJson, () => {
              console.log('[Bear] Tree chopped → stump');
            });
          }
        } catch (e) { console.warn('[Bear] Stump build failed:', e.message); }
      } else {
        console.log('[Bear] No stump model, scaling tree down');
        if (tree._content) tree._content.scale.set(0.3, 0.3, 0.3);
      }

      // Resume following player
      bear.followTarget(player.mesh, 3.0, 6.0);
    });
  });
  // When dialogue ends (Esc or natural end node), unlock player + camera
  dialogueSystem.setOnDialogueEnd(() => {
    dialogueActive = false;
    thirdPersonCamera.unlock(60);
    player.unlock();
    if (bearDialogueActive) {
      bearDialogueActive = false;
      resumePetNpc(activePetNpc || bear);
      activePetNpc = null;
    }
  });

  // ---- construction effect ----
  const constructionEffect = createConstructionEffect({ scene, architect });
  constructionEffect.onComplete = () => {
    architectGraphState = 'followup';
    constructionActive = false;
    dialogueActive = false;
    dialogueSystem.hide();
    // Restore camera after construction reveal
    setTimeout(() => {
      thirdPersonCamera.unlock(60);
    }, 1200);
  };

  // ---- run dust (using proven ParticleSystem) ----
  const _bearFeetDummy = new THREE.Object3D();
  _bearFeetDummy.name = 'bearFeetEmitter';
  bear.mesh.add(_bearFeetDummy);
  _bearFeetDummy.position.set(0, 0.1, 0);

  const RUN_DUST_PLAN = {
    _bearFeet: {
      emit: {
        emitMode: 'point',
        mesh: 'sphere',
        meshSize: 0.08,
        rate: 10,
        lifetime: [0.3, 0.6],
        velocity: { dir: [0, 0.3, 0], speed: [0.2, 0.6], spread: 0.5 },
        acceleration: [0, -0.5, 0],
        colorStart: [0.75, 0.65, 0.45],
        colorEnd: [0.5, 0.4, 0.3, 0],
        scaleStart: [0.4, 0.4, 0.4],
        scaleEnd: [0.05, 0.05, 0.05],
      },
    },
  };
  const _runDustPS = new ParticleSystem(scene);
  _runDustPS.setup(RUN_DUST_PLAN, bear.mesh);
  bear.onRunDust(() => {}); // no-op: ParticleSystem handles spawning via rate

  // ---- stump reveal burst (using proven ParticleSystem) ----
  function _burstStumpReveal(treeEntity) {
    const dummyBone = new THREE.Object3D();
    dummyBone.name = '_burstEmitter';
    treeEntity.mesh.add(dummyBone);
    const box = new THREE.Box3().setFromObject(treeEntity.mesh);
    const size = new THREE.Vector3(); box.getSize(size);
    dummyBone.position.set(0, size.y * 0.5, 0);

    const BURST_PLAN = {
      _burstEmitter: {
        emit: {
          emitMode: 'volume',
          mesh: 'sphere',
          meshSize: 0.12,
          rate: 200, // rapid burst
          lifetime: [0.5, 1.0],
          velocity: { dir: [0, 1, 0], speed: [1, 3], spread: 0.8 },
          acceleration: [0, -2, 0],
          colorStart: [0.5, 0.8, 0.3],
          colorEnd: [0.2, 0.5, 0.1, 0],
          scaleStart: [0.3, 0.3, 0.3],
          scaleEnd: [0.05, 0.05, 0.05],
        },
      },
    };
    const burstPS = new ParticleSystem(scene);
    burstPS.setup(BURST_PLAN, treeEntity.mesh);
    // Run for 0.3s then dispose
    let burstTime = 0;
    function tickBurst(dt) {
      burstTime += dt;
      burstPS.update(dt, treeEntity.mesh);
      if (burstTime >= 0.3) {
        burstPS.dispose();
        dummyBone.removeFromParent();
      } else {
        requestAnimationFrame(() => tickBurst(0.016));
      }
    }
    tickBurst(0.016);
  }

  // ---- tree chop: reveal stump with scale-in animation (voxel-game style) ----
  const _revealAnimations = [];

  function _revealStump(tree, stumpGroup, stumpJson, onDone) {
    // Burst particles at start of reveal
    _burstStumpReveal(tree);

    // Start scale at 0.82 like voxel-game reveal
    stumpGroup.scale.setScalar(0.82);
    tree._content.add(stumpGroup);

    // Ground-align
    const box = new THREE.Box3().setFromObject(stumpGroup);
    stumpGroup.position.y = -box.min.y * 0.82;

    _revealAnimations.push({
      group: stumpGroup,
      tree,
      stumpJson,
      timer: 0,
      duration: 1.0,
      onDone: onDone || null,
    });
  }

  function _updateRevealAnimations(dt) {
    for (let i = _revealAnimations.length - 1; i >= 0; i--) {
      const a = _revealAnimations[i];
      a.timer += dt;
      const t = Math.min(a.timer / a.duration, 1.0);
      // Ease-out cubic: 1 - (1-t)^3
      const ease = 1 - Math.pow(1 - t, 3);
      const s = 0.82 + (1 - 0.82) * ease;
      a.group.scale.setScalar(s);
      // Rotation wiggle (same as voxel-game)
      a.group.rotation.y = Math.sin((1 - t) * Math.PI) * 0.035;

      if (t >= 1.0) {
        a.group.scale.setScalar(1.0);
        a.group.rotation.y = 0;
        a.tree.replaceModel(a.group, a.stumpJson);
        if (a.onDone) a.onDone();
        _revealAnimations.splice(i, 1);
      }
    }
  }

  // ---- animation loop ----
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    // Side panel preview
    generateSystem.update(dt);

    // Pointer-lock camera (skip when dialogue or panel are active)
    if (!dialogueActive && !pastoralDialogueLock && !dialogueSystem.isActive() && !panelOpen) {
      const { dx, dy } = input.consumeMouseDelta();
      if (dx !== 0 || dy !== 0) {
        thirdPersonCamera.applyMouseDelta(dx, dy);
      }
    }

    // ESC: close dialogue first, then toggle management panel
    if (input.justPressed('Escape')) {
      if (dialogueSystem.isActive()) {
        dialogueSystem.hide();
      } else if (dialogueActive) {
        dialogueSystem.hide(); // onDialogueEnd callback handles unlock
      } else if (!document.pointerLockElement) {
        setPanelOpen(!panelOpen);
      }
    }

    // E-key: interact with architect or bear NPC
    if (!dialogueActive && !pastoralDialogueLock && !dialogueSystem.isActive() && !panelOpen && !constructionActive) {
      const playerPos = player.mesh.position;
      const INTERACT_RANGE = 5.2;
      const promptEl = document.getElementById('interact-prompt');

      // Check architect
      const archPos = architect.getPosition();
      const archDx = archPos.x - playerPos.x;
      const archDz = archPos.z - playerPos.z;
      const archDist = Math.sqrt(archDx * archDx + archDz * archDz);

      // Check bear
      const bearPos = bear.getPosition();
      const bearDx = bearPos.x - playerPos.x;
      const bearDz = bearPos.z - playerPos.z;
      const bearDist = Math.sqrt(bearDx * bearDx + bearDz * bearDz);
      const forestHit = forestTempleSystem.findInteraction(playerPos, INTERACT_RANGE + 0.8);
      const petHit = petManager.findNearest(playerPos, INTERACT_RANGE);
      const townPetHit = petHit && petPartyEvent.canInteract(petHit.pet) ? petHit : null;
      const regularPetHit = petHit && !petPartyEvent.isTownPet(petHit.pet) ? petHit : null;
      const petDist = (townPetHit || regularPetHit)?.dist ?? Infinity;

      // Pick closest NPC in range
      let targetNpc = null;
      if (forestHit) {
        targetNpc = 'forest';
      } else if (townPetHit && townPetHit.dist <= bearDist) {
        targetNpc = 'town-pet';
      } else if (!petPartyEvent.isTownPet(architect) && archDist <= INTERACT_RANGE && archDist <= bearDist && archDist <= petDist) {
        targetNpc = 'architect';
      } else if (bearDist <= INTERACT_RANGE && bearDist <= archDist && bearDist <= petDist) {
        targetNpc = 'bear';
      } else if (regularPetHit) {
        targetNpc = 'pet';
      }

      // Pause momo wandering when player is near, unless it is working.
      if (bearDist <= INTERACT_RANGE + 2 && bear._wanderEnabled && !bear._pastoralBusy && bear._petState !== 'working') {
        bear.stopWalking();
        bear.lockFacing(playerPos.x, playerPos.z);
      } else if (bearDist > INTERACT_RANGE + 3 && bear._wanderEnabled && !bear._followEnabled && bear._petState !== 'working') {
        bear.unlockFacing();
      }
      petManager.pauseNear(playerPos, INTERACT_RANGE + 2);

      if (targetNpc === 'forest') {
        promptEl.classList.add('visible');
        document.getElementById('interact-prompt-text').textContent = forestHit.label;
        if (input.justPressed('KeyE')) {
          beginForestInteraction(forestHit);
        }
      } else if (targetNpc === 'town-pet') {
        const pet = townPetHit.pet;
        promptEl.classList.add('visible');
        document.getElementById('interact-prompt-text').textContent = `与${pet._petName || '宠物'}对话`;
        pet.stopWalking();
        pet.lockFacing(playerPos.x, playerPos.z);

        if (input.justPressed('KeyE')) {
          beginTownPetDialogue(pet);
        }
      } else if (targetNpc === 'architect') {
        promptEl.classList.add('visible');
        document.getElementById('interact-prompt-text').textContent = '与fangk对话';

        if (input.justPressed('KeyE')) {
          dialogueActive = true;
          document.exitPointerLock();
          player.lockTo(archPos.x, archPos.z);

          const midPoint = new THREE.Vector3(
            (playerPos.x + archPos.x) / 2, 1.5,
            (playerPos.z + archPos.z) / 2
          );
          const camDir = new THREE.Vector3(archDx, 0, archDz).normalize();
          const sideDir = new THREE.Vector3(-camDir.z, 0, camDir.x);
          const camPos = midPoint.clone().addScaledVector(sideDir, 4.5);
          camPos.y += 0.8;
          thirdPersonCamera.lockTo(camPos, midPoint, 40);

          const temple = staticEntities.find(e => e.name === '古老神殿');
          dialogueSystem.show('architect_' + architectGraphState, temple || staticEntities[0]);
        }
      } else if (targetNpc === 'bear') {
        promptEl.classList.add('visible');
        document.getElementById('interact-prompt-text').textContent = '与momo对话';
        if (!bear._pastoralBusy && bear._petState !== 'working') {
          if (!bear._followEnabled && bear._petState !== 'free_roam') bear.stopWalking();
          bear.lockFacing(playerPos.x, playerPos.z);
        }

        if (input.justPressed('KeyE')) {
          beginPastoralPetDialogue(bear, bearPos, playerPos, bearDx, bearDz);
        }
      } else if (targetNpc === 'pet') {
        const pet = regularPetHit.pet;
        const petPos = regularPetHit.position;
        promptEl.classList.add('visible');
        document.getElementById('interact-prompt-text').textContent = `与${pet._petName || '宠物'}对话`;
        if (!pet._pastoralBusy && pet._petState !== 'working') {
          pet.stopWalking();
          pet.lockFacing(playerPos.x, playerPos.z);
        }

        if (input.justPressed('KeyE')) {
          if (pet._hasIntroduced === false) {
            beginGeneratedPetIntroduction(pet);
          } else {
            beginPastoralPetDialogue(pet, petPos, playerPos, regularPetHit.dx, regularPetHit.dz);
          }
        }
      } else {
        // Re-enable wander if player walks away and momo is in free roam.
        if (bearDist > INTERACT_RANGE + 3 && !bear._wanderEnabled && !bear._followEnabled && bear._petState === 'free_roam') {
          bear.enableWander(2.0, { minX: bearSpawnX - 10, maxX: bearSpawnX + 10, minZ: bearSpawnZ - 10, maxZ: bearSpawnZ + 10 });
        }
        promptEl.classList.remove('visible');
      }
    } else {
      const promptEl = document.getElementById('interact-prompt');
      if (promptEl) promptEl.classList.remove('visible');
    }

    // H key: 挥舞左手 (one-shot)
    if (!dialogueActive && !pastoralDialogueLock && !dialogueSystem.isActive() && !panelOpen && input.justPressed('KeyH')) {
      player.playOneShot('wave_left', 2.0);
    }
    // J key: 挥舞扇子+特效 (one-shot)
    if (!dialogueActive && !pastoralDialogueLock && !dialogueSystem.isActive() && !panelOpen && input.justPressed('KeyJ')) {
      player.playOneShot('fan_spark', 2.0);
    }

    // Entity animation updates
    for (const e of staticEntities) {
      e.updateAnimation?.(dt);
      e.updateBreathing?.(dt);
    }

    // Player update: fully freeze movement while any dialogue/input UI is active.
    if (!panelOpen && !dialogueActive && !pastoralDialogueLock && !dialogueSystem.isActive()) {
      player.update(dt, input, thirdPersonCamera);
    }

    // Architect update (always runs)
    architect.update(dt);

    // Bear update (always runs)
    bear.update(dt);
    petManager.update(dt);
    pastoralSlice.update(dt);
    petPartyEvent.update(dt);
    forestTempleSystem.update(dt);

    // Particle systems + reveal animations
    _runDustPS.update(dt, bear.mesh);
    if (window.__chopPS) window.__chopPS.update(dt, bear.mesh);
    if (campfireParticles) campfireParticles.update(dt, null);
    _updateRevealAnimations(dt);

    // (chop sparks handled by ParticleSystem via window.__chopPS)

    // Construction effect update
    if (constructionActive) {
      constructionEffect.update(dt);
    }

    // Dialogue system update (handles typewriter)
    if (dialogueActive) {
      dialogueSystem.update(dt);
    }

    // Camera update
    thirdPersonCamera.update(player.mesh.position);

    // Physics step
    physics.step();
    debugRenderer.update();

    input.endFrame();
    renderer.render(scene, camera);
  }
  animate();

  // ---- resize via observer (avoids layout thrash from polling getBoundingClientRect) ----
  if (gameWrap) {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          thirdPersonCamera.resize(width / height);
          renderer.setSize(width, height);
        }
      }
    });
    ro.observe(gameWrap);
  }

  // ---- resizer hidden (editor panel disabled) ----

  console.log(
    '🐉 Chii Island 奇异岛 — 奶龙主角\n' +
    '  点击画面锁定鼠标，移动鼠标 = 旋转视角 | Esc 释放鼠标 | 滚轮 = 缩放\n' +
    '  WASD = 移动（A/D 转向）| Shift = 加速\n' +
    '  空格 = 切换飞行模式 | Q/E = 上升/下降\n' +
    '  H = 挥舞左手 | J = 挥舞扇子+闪光特效\n' +
    '  停止不动 = 呼吸摇摆 | 移动 = 奔跑动画 | 飞行 = 跳跃动画\n' +
    '  右侧 = 模型编辑器'
  );
}

init().catch((err) => {
  console.error('[Init] Fatal:', err);
  document.body.innerHTML = '<div style="color:white;padding:20px;font-family:sans-serif">Failed to start:<br>' + err.message + '</div>';
});
