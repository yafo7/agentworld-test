import * as THREE from 'three';
import { initRuntime } from '../../engine/runtime/runtimeProvider.js';
import { installGlobalSync } from '../../backend/index.js';
import { createScene, createRenderer, createLights, ThirdPersonCamera } from '../../engine';
import { Player } from '../../engine';
import { createUnitEnvironment, getGridWorldPosition, preloadBlocks, generateTerrainLayout } from '../../engine';
import { Input } from '../../engine';
import { PhysicsWorld } from '../../engine/physics/PhysicsWorld.js';
import { RapierDebugRenderer } from '../../engine/physics/RapierDebugRenderer.js';
import { setupRaycast } from '../../engine';
import { envGridConfigs } from './config.js';
import { generateSceneLayout } from './systems/sceneLayout.js';
import { CHII_SCENE_ASSET_IDS, createChiiAssetRepository } from './data/assetCatalog.js';
import { getChiiSceneStyle, setChiiSceneStyle } from './data/sceneStyle.js';
import { defaultContentGeneration } from '../../integrations/content/VoxelContentAdapter.js';
import { generatedAssets } from '../../assets/repositories/GeneratedAssetRepository.js';
import { assembleChiiScene } from './world/ChiiSceneAssembler.js';
import { buildStaticColliders } from '../../world/physics/buildStaticColliders.js';
import { attachPetStateMachine } from '../../gameplay/pets/PetStateMachine.js';
import { ArchitectNPC } from './entities/ArchitectNPC.js';
import { createDialogueSystem } from './systems/DialogueSystem.js';
import { createConstructionEffect } from './systems/ConstructionEffect.js';
import { PetManager } from './systems/PetManager.js';
import { RuntimeHUD } from './systems/RuntimeHUD.js';
import { getPetProfile } from './data/petProfiles.js';
import { DialogueCameraDirector } from './presentation/DialogueCameraDirector.js';
import { TreeChopSequence } from './presentation/TreeChopSequence.js';
import { createChiiRegionGameplay } from './gameplay/createChiiRegionGameplay.js';
import { ChiiInteractionController } from './systems/ChiiInteractionController.js';

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

  // Runtime gameplay only reads the locally synced asset catalog. Studio edit
  // and publish operations happen outside the running game.
  const sceneStyle = getChiiSceneStyle();
  const assetRepository = createChiiAssetRepository({ sceneStyle });
  window.__chiiSceneStyle = sceneStyle;
  console.log(`[Init] Loading local runtime assets (${sceneStyle})...`);
  const modelJsons = await assetRepository.getModels(CHII_SCENE_ASSET_IDS);
  console.log('[Init] Runtime assets loaded:', Object.keys(modelJsons).join(', '));

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

  const assembledScene = await assembleChiiScene({
    scene,
    scenePlan,
    modelJsons,
    assetRepository,
    center: [centerCfg.center[0], centerCfg.center[1]],
    gridSize: GRID_SIZE,
    seed: 42,
  });
  const {
    registry: worldObjects,
    staticEntities,
    campfireParticles,
    forestTrophy,
    forestTent,
    forestTrophyWaitPlan,
    pastoralWorkScaffoldModel,
    pastoralWorkScaffoldPlan,
  } = assembledScene;

  console.log(`[Init] Created ${staticEntities.length} static entities`);

  const { colliderCount } = buildStaticColliders(physics, staticEntities);
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
  thirdPersonCamera.setCollisionWorld(physics.world, player._collider);
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
  attachPetStateMachine(architect, 'free_roam');
  architect._petRegion = 'church_town';
  const architectSpawn = townGridSpawn('fangk', [0, 0, 30]);
  architect.setPosition(...architectSpawn);
  architect.setOrigin(...architectSpawn);
  architect.initPhysics(physics);
  scene.add(architect.mesh);

  async function loadCharacterRuntime(character, assetId) {
    try {
      const [modelJson, animations] = await Promise.all([
        assetRepository.getModel(assetId),
        assetRepository.getAnimations(assetId),
      ]);
      character.loadModelFromJson(modelJson);
      if (character._modelGroup) {
        character._modelGroup.userData._baseScale = character._modelGroup.scale.x;
        character._modelGroup.userData._baseY = character._modelGroup.position.y;
      }
      for (const [name, plan] of Object.entries(animations)) character.loadAnimation(name, plan);
      console.log(`[Init] ${assetId} ready from runtime assets`);
    } catch (error) {
      console.warn(`[Init] ${assetId} runtime load failed, using placeholder:`, error.message);
    }
  }

  await loadCharacterRuntime(architect, 'fangk');

  // ---- bear NPC (wanders near windmill river side) ----
  const bear = new ArchitectNPC();
  window.__bear = bear;
  bear.mesh.name = 'momo';
  bear._petName = 'momo';
  bear._profile = getPetProfile('momo');
  attachPetStateMachine(bear, 'idle');
  bear._initialInteractionDone = false;
  bear.initPhysics(physics);
  const [bearSpawnX, , bearSpawnZ] = gridSpawn('momo', [-60, 0, 15]);
  bear.setPosition(bearSpawnX, 0, bearSpawnZ);
  bear.setOrigin(bearSpawnX, 0, bearSpawnZ);
  scene.add(bear.mesh);

  await loadCharacterRuntime(bear, 'momo');
  if (!bear._animPlans.walk && bear._animPlans.run) bear._animPlans.walk = bear._animPlans.run;
  if (!bear._animPlans.chop && bear._animPlans.smash) bear._animPlans.chop = bear._animPlans.smash;
  if (!bear._animPlans.chop && bear._animPlans.run) bear._animPlans.chop = bear._animPlans.run;

  // ---- polished pet NPCs ----
  const townPetBounds = gridBoundsToWorld(scenePlan.town?.roamBounds);
  const petManager = new PetManager({
    scene,
    physics,
    assetRepository,
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

  // ---- dynamic targets for raycast ----
  const dynamicTargets = [...new Set([player, architect, bear, ...staticEntities, ...petManager.pets])];

  setupRaycast(camera, dynamicTargets);

  // ---- ESC management panel ----
  const mgmtPanel = document.getElementById('mgmt-panel');
  const chkCollision = document.getElementById('chk-collision');
  const chkPerformance = document.getElementById('chk-performance');
  const sceneStyleButtons = [...document.querySelectorAll('[data-scene-style]')];
  const runtimeHUD = new RuntimeHUD({ renderer, physics });
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
  chkPerformance.addEventListener('change', () => {
    runtimeHUD.setPerformanceVisible(chkPerformance.checked);
  });
  for (const button of sceneStyleButtons) {
    const active = button.dataset.sceneStyle === sceneStyle;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', () => {
      const nextStyle = setChiiSceneStyle(button.dataset.sceneStyle);
      if (nextStyle !== sceneStyle) window.location.reload();
    });
  }

  // Click outside card to close
  mgmtPanel.addEventListener('click', (e) => {
    if (e.target === mgmtPanel) setPanelOpen(false);
  });

  // The legacy editor remains available to Ghost Home, but is not mounted or
  // updated by the Chii runtime.
  const editorWrap = document.getElementById('editor-wrap');
  const resizer = document.getElementById('resizer');
  if (editorWrap) editorWrap.style.display = 'none';
  if (resizer) resizer.style.display = 'none';

  // ---- dialogue system ----
  const dialogueSystem = createDialogueSystem();
  const dialogueCamera = new DialogueCameraDirector({ player, thirdPersonCamera, dialogueSystem });
  const regionGameplay = await createChiiRegionGameplay({
    scene,
    physics,
    player,
    petManager,
    architect,
    bear,
    staticEntities,
    worldObjects,
    dialogueSystem,
    scenePlan,
    center: [centerCfg.center[0], centerCfg.center[1]],
    gridSize: GRID_SIZE,
    dialogueCamera,
    forest: {
      trophy: forestTrophy,
      tent: forestTent,
      trophyWaitPlan: forestTrophyWaitPlan,
    },
    pastoralWork: {
      modelJson: pastoralWorkScaffoldModel,
      animationPlan: pastoralWorkScaffoldPlan,
    },
    runtimeStatus: runtimeHUD,
    contentPort: defaultContentGeneration,
    generatedAssetRepository: generatedAssets,
  });
  const { pastoralSlice, petPartyEvent, forestTempleSystem } = regionGameplay;
  window.__petPartyEvent = petPartyEvent;
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
      if (!bear._followEnabled && bear.petState.is('free_roam')) {
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
    dialogueCamera.focusDialogue(npc);

    pastoralSlice.interact(npc)
      .catch((err) => console.warn('[Pastoral] interaction failed:', err.message))
      .finally(() => {
        dialogueCamera.release(npc);
        activePetNpc = null;
      });
  }

  function beginTownPetDialogue(npc) {
    activePetNpc = npc;
    dialogueActive = true;
    dialogueSystem.setPetSpeakerName(npc._petName || '宠物');
    dialogueCamera.setDialogueLock(true, npc);

    const interaction = npc._hasIntroduced === false
      ? forestTempleSystem.introducePet(npc)
      : petPartyEvent.interact(npc, dialogueSystem);
    interaction
      .catch((err) => console.warn('[ChurchTown] interaction failed:', err.message))
      .finally(() => {
        dialogueActive = false;
        dialogueCamera.setDialogueLock(false, npc);
        activePetNpc = null;
      });
  }

  function beginForestInteraction(hit) {
    activePetNpc = hit.pet || null;
    dialogueActive = true;
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
        player.unlock();
        hit.pet?.unlockFacing?.();
        activePetNpc = null;
      });
  }

  function beginGeneratedPetIntroduction(pet) {
    activePetNpc = pet;
    dialogueActive = true;
    dialogueCamera.setDialogueLock(true, pet);

    forestTempleSystem.introducePet(pet)
      .catch((err) => console.warn('[ForestTemple] introduction failed:', err.message))
      .finally(() => {
        dialogueActive = false;
        dialogueCamera.setDialogueLock(false, pet);
        activePetNpc = null;
      });
  }

  const treeChopSequence = new TreeChopSequence({
    scene,
    bear,
    player,
    assetRepository,
  });

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
    await treeChopSequence.start(tree);
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
  const constructionEffect = createConstructionEffect({ scene, architect, contentPort: defaultContentGeneration });
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

  function beginArchitectDialogue({ architectPosition, playerPosition, dx, dz }) {
    dialogueActive = true;
    document.exitPointerLock();
    player.lockTo(architectPosition.x, architectPosition.z);

    const midPoint = new THREE.Vector3(
      (playerPosition.x + architectPosition.x) / 2,
      1.5,
      (playerPosition.z + architectPosition.z) / 2,
    );
    const cameraDirection = new THREE.Vector3(dx, 0, dz).normalize();
    const sideDirection = new THREE.Vector3(-cameraDirection.z, 0, cameraDirection.x);
    const cameraPosition = midPoint.clone().addScaledVector(sideDirection, 4.5);
    cameraPosition.y += 0.8;
    thirdPersonCamera.lockTo(cameraPosition, midPoint, 40);

    const temple = worldObjects.findByName('古老神殿');
    dialogueSystem.show(`architect_${architectGraphState}`, temple || staticEntities[0]);
  }

  const interactionController = new ChiiInteractionController({
    input,
    player,
    architect,
    bear,
    petManager,
    petPartyEvent,
    forestTempleSystem,
    bearHome: { x: bearSpawnX, z: bearSpawnZ },
    handlers: {
      onForest: beginForestInteraction,
      onTownPet: beginTownPetDialogue,
      onArchitect: beginArchitectDialogue,
      onBear: ({ pet, petPosition, playerPosition, dx, dz }) => {
        beginPastoralPetDialogue(pet, petPosition, playerPosition, dx, dz);
      },
      onPet: ({ pet, hit, playerPosition }) => {
        if (pet._hasIntroduced === false) {
          beginGeneratedPetIntroduction(pet);
        } else {
          beginPastoralPetDialogue(pet, hit.position, playerPosition, hit.dx, hit.dz);
        }
      },
    },
  });

  // ---- animation loop ----
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    // Pointer-lock camera (skip when dialogue or panel are active)
    if (!dialogueActive && !dialogueCamera.locked && !dialogueSystem.isActive() && !panelOpen) {
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

    interactionController.update(
      !dialogueActive
      && !dialogueCamera.locked
      && !dialogueSystem.isActive()
      && !panelOpen
      && !constructionActive,
    );

    // H key: 挥舞左手 (one-shot)
    if (!dialogueActive && !dialogueCamera.locked && !dialogueSystem.isActive() && !panelOpen && input.justPressed('KeyH')) {
      player.playOneShot('wave_left', 2.0);
    }
    // J key: 挥舞扇子+特效 (one-shot)
    if (!dialogueActive && !dialogueCamera.locked && !dialogueSystem.isActive() && !panelOpen && input.justPressed('KeyJ')) {
      player.playOneShot('fan_spark', 2.0);
    }

    // Entity animation updates
    for (const e of staticEntities) {
      e.updateAnimation?.(dt);
      e.updateBreathing?.(dt);
    }

    // Player update: fully freeze movement while any dialogue/input UI is active.
    if (!panelOpen && !dialogueActive && !dialogueCamera.locked && !dialogueSystem.isActive()) {
      player.update(dt, input, thirdPersonCamera);
    }

    // Architect update (always runs)
    architect.update(dt);

    // Bear update (always runs)
    bear.update(dt);
    petManager.update(dt);
    regionGameplay.update(dt);

    const nearestRegionName = regionGameplay.getNearestRegionName(player.mesh.position);
    const followingPet = [bear, ...petManager.pets].find(pet => pet.petState?.is('following') || pet._followEnabled);
    runtimeHUD.setWorldStatus(nearestRegionName, followingPet?._petName || null);
    runtimeHUD.update(dt, { entities: staticEntities.length, pets: petManager.pets.length + 1 });

    // Particle systems + reveal animations
    treeChopSequence.update(dt);
    if (campfireParticles) campfireParticles.update(dt, null);

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
