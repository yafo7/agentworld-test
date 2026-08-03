import * as THREE from 'three';
import { getRuntimeStatus, initRuntime } from '../../engine/runtime/runtimeProvider.js';
import { installGlobalSync } from '../../backend/index.js';
import { createScene, createRenderer, createLights, ThirdPersonCamera, setMaterialTagPresenter } from '../../engine';
import { Player } from '../../engine';
import { createUnitEnvironment, getGridWorldPosition, preloadBlocks, generateTerrainLayout } from '../../engine';
import { Input } from '../../engine';
import { PhysicsWorld } from '../../engine/physics/PhysicsWorld.js';
import { RapierDebugRenderer } from '../../engine/physics/RapierDebugRenderer.js';
import { setupRaycast } from '../../engine';
import { envGridConfigs } from './config.js';
import { generateSceneLayout } from './systems/sceneLayout.js';
import { createChiiAssetRepository, getChiiSceneAssetIds } from './data/assetCatalog.js';
import {
  getChiiSceneProfile,
  getChiiSceneStyle,
  setChiiSceneStyle,
} from './data/sceneStyle.js';
import { defaultContentGeneration } from '../../integrations/content/VoxelContentAdapter.js';
import { generatedAssets } from '../../assets/repositories/GeneratedAssetRepository.js';
import { assembleChiiScene } from './world/ChiiSceneAssembler.js';
import { assembleChiiInteriors } from './world/ChiiInteriorAssembler.js';
import { buildStaticColliders } from '../../world/physics/buildStaticColliders.js';
import { COLLIDER_STRATEGIES } from '../../world/physics/ColliderStrategy.js';
import { attachPetStateMachine } from '../../gameplay/pets/PetStateMachine.js';
import { ArchitectNPC } from './entities/ArchitectNPC.js';
import { createDialogueSystem } from './systems/DialogueSystem.js';
import { createConstructionEffect } from './systems/ConstructionEffect.js';
import { PetManager } from './systems/PetManager.js';
import { RuntimeHUD } from './systems/RuntimeHUD.js';
import { getPetProfile } from './data/petProfiles.js';
import { DialogueCameraDirector } from './presentation/DialogueCameraDirector.js';
import { PlayerItemShowcaseDirector } from './presentation/PlayerItemShowcaseDirector.js';
import { TreeChopSequence } from './presentation/TreeChopSequence.js';
import { createChiiRegionGameplay } from './gameplay/createChiiRegionGameplay.js';
import { ChiiInteractionController } from './systems/ChiiInteractionController.js';
import { BuildingInteriorSystem } from './systems/BuildingInteriorSystem.js';
import { PlacementGrid } from '../../world/placement/PlacementGrid.js';
import { TerrainPathfinder } from '../../world/navigation/TerrainPathfinder.js';
import { ObjectPlacementService } from '../../world/placement/ObjectPlacementService.js';
import { ObjectScalePolicy } from '../../world/placement/ObjectScalePolicy.js';
import { ObjectEditorController } from './systems/ObjectEditorController.js';
import { createAssetSemanticAudit } from './systems/AssetSemanticAudit.js';
import { WorldTuningAudit } from './systems/WorldTuningAudit.js';
import { InventorySystem } from './systems/InventorySystem.js';
import { CharacterEquipmentService } from '../../gameplay/equipment/CharacterEquipmentService.js';
import { CharacterAppearanceStore } from '../../storage/CharacterAppearanceStore.js';
import { ChiiSceneSaveStore } from '../../storage/ChiiSceneSaveStore.js';
import { ChiiScenePersistenceSystem } from './systems/ChiiScenePersistenceSystem.js';
import { CHII_PLAYER_CHARACTER } from './data/playerCharacter.js';
import { getChiiCharacterVariant } from './data/characterVariants.js';
import {
  CHII_SIZE_PROFILES,
  CHII_PET_HEIGHTS,
  CHII_PERFORMANCE_BUDGETS,
  CHII_WORLD_METRICS,
  resolveChiiSizeProfile,
} from './data/worldTuningProfile.js';
import { WorldClimatePresenter } from './presentation/WorldClimatePresenter.js';
import { WorldClimateSystem } from './systems/WorldClimateSystem.js';
import { BrowserClockAdapter } from '../../integrations/climate/BrowserClockAdapter.js';
import { BrowserLocationAdapter } from '../../integrations/climate/BrowserLocationAdapter.js';
import { OpenMeteoWeatherAdapter } from '../../integrations/climate/OpenMeteoWeatherAdapter.js';
import { BigDataCloudPlaceNameAdapter } from '../../integrations/climate/BigDataCloudPlaceNameAdapter.js';
import { ClimateCache } from '../../storage/ClimateCache.js';
import { VoxelStudioModelVisualAdapter } from '../../integrations/rendering/VoxelStudioModelVisualAdapter.js';
import { VoxelStudioWorldWaterAdapter } from '../../integrations/rendering/VoxelStudioWorldWaterAdapter.js';
import { WorldModelVisualLifecycle } from '../../world/model/WorldModelVisualLifecycle.js';
import { ChiiSkyVisualAdapter } from '../../integrations/rendering/ChiiSkyVisualAdapter.js';
import { VoxelStudioRenderPresentationAdapter } from '../../integrations/rendering/VoxelStudioRenderPresentationAdapter.js';
import { ActZeroStoryState } from './story/ActZeroStoryState.js';
import { IslandStoryState } from '../../gameplay/story/IslandStoryState.js';
import { ActZeroCrashDirector } from './presentation/ActZeroCrashDirector.js';
import {
  CHII_LOADING_PRESETS,
  createChiiPageLoadingScreen,
} from './presentation/ChiiPageLoadingScreen.js';
import { SceneSavePanel } from './presentation/SceneSavePanel.js';

const pageLoading = createChiiPageLoadingScreen({ preset: 'island' });

// ---- bootstrap ----
async function init() {
  window.THREE = THREE;
  const islandStoryState = new IslandStoryState();
  const actZeroStoryState = new ActZeroStoryState({ storyState: islandStoryState });
  if (actZeroStoryState.shouldPlay()) {
    pageLoading.show(CHII_LOADING_PRESETS.prologue);
  }

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
  const lightRig = createLights(scene);
  const renderPresentation = new VoxelStudioRenderPresentationAdapter({
    renderer,
    scene,
    camera,
    lightRig,
  });
  const modelVisuals = new VoxelStudioModelVisualAdapter({
    scene,
    camera,
    modelStyleRegistry: renderPresentation,
  });
  setMaterialTagPresenter(modelVisuals);
  window.__chiiModelVisuals = modelVisuals;
  window.__chiiRenderPresentation = renderPresentation;

  // ---- terrain grid (50×50, procedural forest biome) ----
  const GRID_SIZE = 50;
  const sceneStyle = getChiiSceneStyle();
  const sceneProfile = getChiiSceneProfile(sceneStyle);
  preloadBlocks({});
  const layout = generateTerrainLayout(GRID_SIZE, sceneProfile.terrainSeed);
  const centerCfg = envGridConfigs[0];

  function countBlockTypes(l) {
    const c = {}; l.flat().forEach(t => { c[t] = (c[t] || 0) + 1; }); return c;
  }

  // Runtime gameplay only reads the locally synced asset catalog. Studio edit
  // and publish operations happen outside the running game.
  const assetRepository = createChiiAssetRepository({ sceneStyle });
  window.__chiiSceneStyle = sceneStyle;
  window.__chiiSceneProfile = sceneProfile;
  console.log(`[Init] Loading local runtime assets (${sceneProfile.label})...`);
  const modelJsons = await assetRepository.getModels(getChiiSceneAssetIds(sceneStyle));
  console.log('[Init] Runtime assets loaded:', Object.keys(modelJsons).join(', '));
  const assetAudit = createAssetSemanticAudit({
    models: modelJsons,
    renderer,
    runtime: getRuntimeStatus(),
  });
  window.__chiiAssetAudit = assetAudit;

  const scenePlan = generateSceneLayout(layout, GRID_SIZE, sceneProfile.layoutSeed, {
    features: sceneProfile.features,
  });
  const petNavigation = new TerrainPathfinder({
    terrainLayout: scenePlan.modifiedLayout,
    center: [centerCfg.center[0], centerCfg.center[1]],
    tileSize: CHII_WORLD_METRICS.terrainTile,
    traversalCells: scenePlan.town?.bridge?.traversalCells || [],
  });
  console.log('[SceneLayout]', `${scenePlan.buildings.length} buildings, ${scenePlan.trees.length} trees, ${scenePlan.grasses.length} grasses`);

  const unitEnv = createUnitEnvironment(centerCfg.center[0], centerCfg.center[1], GRID_SIZE, scenePlan.modifiedLayout);
  console.log('[Terrain] 50×50 terrain:', countBlockTypes(scenePlan.modifiedLayout));
  scene.add(unitEnv);
  const worldWaterVisuals = sceneProfile.features.worldWater
    ? new VoxelStudioWorldWaterAdapter({ scene })
    : null;
  worldWaterVisuals?.attachRiver({
      riverData: scenePlan.riverData,
      center: [centerCfg.center[0], centerCfg.center[1]],
      gridSize: GRID_SIZE,
      tileSize: CHII_WORLD_METRICS.terrainTile,
    });
  window.__chiiWaterVisuals = worldWaterVisuals;

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
  const characterEquipment = new CharacterEquipmentService();
  const characterAppearances = new CharacterAppearanceStore({ scope: sceneStyle });
  const sceneSaveStore = new ChiiSceneSaveStore();
  const scenePersistence = new ChiiScenePersistenceSystem({
    sceneStyle,
    store: sceneSaveStore,
    worldObjects,
    staticEntities,
    scene,
    generatedAssetRepository: generatedAssets,
    appearanceStore: characterAppearances,
  });
  const sceneRestoreSummary = await scenePersistence.restoreAuto();
  window.__chiiSceneSave = scenePersistence;
  if (sceneRestoreSummary.restored) {
    console.log('[SceneSave] Restored local scene:', sceneRestoreSummary);
  }
  const modelVisualLifecycle = new WorldModelVisualLifecycle({ worldObjects });
  window.__chiiModelVisualLifecycle = modelVisualLifecycle;
  assetAudit.recordAnimations('forestTrophy', { wait: forestTrophyWaitPlan });
  assetAudit.recordAnimations('pastoralWorkScaffold', { dust: pastoralWorkScaffoldPlan });

  console.log(`[Init] Created ${staticEntities.length} static entities`);

  const { registry: colliderRegistry, colliderCount, summary: colliderSummary } = buildStaticColliders(physics, staticEntities);
  colliderRegistry.bindWorldObjects(worldObjects);
  window.__chiiColliderRegistry = colliderRegistry;
  console.log(`[Init] Physics colliders: ${colliderCount}`, colliderSummary);

  // ---- Rapier debug renderer (wireframe, hidden by default) ----
  const debugRenderer = new RapierDebugRenderer(physics.world);
  debugRenderer.enabled = false;
  scene.add(debugRenderer.mesh);

  async function applySavedCharacterAppearance(character, characterId, {
    baseModelJson = character?._originalModelJson,
    variantId = 'default',
  } = {}) {
    const appearance = characterAppearances.get(characterId)
      || (characterId === 'crab' ? characterAppearances.get('builder_crab') : null);
    if (!character || !baseModelJson || !appearance) return false;
    const variant = getChiiCharacterVariant(characterId, appearance.variantId);
    const appearanceVariantId = variant?.id || variantId;
    if (variant) {
      baseModelJson = await characterEquipment.loadJson(variant.model);
      character.replaceModelFromJson?.(baseModelJson, {
        targetHeight: character._targetHeight || CHII_PET_HEIGHTS[variant.assetId] || CHII_PET_HEIGHTS.generated,
        preserveCurrentTransform: true,
        preserveCurrentScale: true,
      });
      const animations = await Promise.all(Object.entries(variant.animations || {}).map(async ([name, path]) => (
        [name, await characterEquipment.loadJson(path)]
      )));
      for (const [name, plan] of animations) character.loadAnimation?.(name, plan);
    }
    const hasEquipment = Object.values(appearance.loadout || {}).some(Boolean);
    character._baseModelJson = baseModelJson;
    if (!hasEquipment) return true;
    try {
      const result = await characterEquipment.resolveLoadout({
        characterId,
        variantId: appearanceVariantId,
        baseModelJson,
        loadout: appearance.loadout,
      });
      character.replaceModelFromJson?.(result.modelJson, {
        targetHeight: character._targetHeight,
        preserveCurrentScale: true,
      });
      character._appearanceLoadout = result.loadout;
      character._appearanceOutfitId = appearance.outfitId || null;
      character._appearanceAssetId = result.assetId || null;
      return true;
    } catch (error) {
      console.warn(`[Appearance] ${characterId} outfit skipped:`, error.message);
      return false;
    }
  }

  // ---- player (same classic Phrolova used in Act Zero) ----
  const player = new Player();
  player.setTerrainLayout(centerCfg.center[0], centerCfg.center[1], GRID_SIZE, scenePlan.modifiedLayout);
  player.setWaterTraversalCells(scenePlan.town?.bridge?.traversalCells || []);
  const townDemoEnabled = new URLSearchParams(window.location.search).has('church-town');
  const forestDemoEnabled = new URLSearchParams(window.location.search).has('forest-temple');
  const townDemoCell = scenePlan.town?.petSpawns?.fangk;
  const forestDemoCell = scenePlan.forestTemple?.trophy;
  const beachSpawnCell = scenePlan.beach?.spawn;
  let demoSpawn = beachSpawnCell
    ? getGridWorldPosition(beachSpawnCell.gridX, beachSpawnCell.gridZ, centerCfg.center[0], centerCfg.center[1], GRID_SIZE)
    : { x: 0, z: 0 };
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
  const playerBaseModelJson = await characterEquipment.loadJson(CHII_PLAYER_CHARACTER.model);
  player.replaceModelFromJson(playerBaseModelJson, {
    targetHeight: CHII_PLAYER_CHARACTER.targetHeight,
    preserveCurrentTransform: false,
  });
  // Base locomotion animations
  await Promise.all([
    player.loadAnimations({
      idle: CHII_PLAYER_CHARACTER.animations.idle,
      walk: CHII_PLAYER_CHARACTER.animations.walk,
      run: CHII_PLAYER_CHARACTER.animations.run,
      jump: CHII_PLAYER_CHARACTER.animations.jump,
    }),
    player.loadAnimation('special', CHII_PLAYER_CHARACTER.animations.special),
  ]);
  const itemShowcase = new PlayerItemShowcaseDirector({
    player,
    thirdPersonCamera,
    input,
  });
  const inventorySystem = new InventorySystem({
    input,
    player,
    baseModelJson: playerBaseModelJson,
    characterId: CHII_PLAYER_CHARACTER.id,
    variantId: CHII_PLAYER_CHARACTER.variantId,
    equipmentService: characterEquipment,
    onEquipped: payload => itemShowcase.play(payload),
  });
  window.__chiiInventory = inventorySystem;
  window.__chiiItemShowcase = itemShowcase;
  const skyVisual = new ChiiSkyVisualAdapter({ scene, followTarget: player.mesh });
  const climatePresenter = new WorldClimatePresenter({
    scene,
    lightRig,
    followTarget: player.mesh,
    skyVisual,
  });
  const worldClimate = new WorldClimateSystem({
    presenter: climatePresenter,
    clock: new BrowserClockAdapter(),
    location: new BrowserLocationAdapter(),
    weatherPort: new OpenMeteoWeatherAdapter(),
    placeNamePort: new BigDataCloudPlaceNameAdapter(),
    cache: new ClimateCache(),
  });
  window.__chiiClimate = worldClimate;
  window.__chiiEnvironmentVisuals = climatePresenter;

  // ---- architect NPC ----
  const architect = new ArchitectNPC();
  architect.mesh.name = 'fangk';
  architect._petName = 'fangk';
  architect._petId = 'fangk';
  architect._profile = getPetProfile('fangk');
  attachPetStateMachine(architect, 'free_roam');
  architect._petRegion = 'church_town';
  const architectSpawn = townGridSpawn('fangk', [0, 0, 30]);
  architect.setPosition(...architectSpawn);
  architect.setOrigin(...architectSpawn);
  architect.initPhysics(physics);
  architect.setNavigation(petNavigation);
  scene.add(architect.mesh);

  async function loadCharacterRuntime(character, assetId) {
    try {
      const [modelJson, animations] = await Promise.all([
        assetRepository.getModel(assetId),
        assetRepository.getAnimations(assetId),
      ]);
      assetAudit.recordAnimations(assetId, animations);
      character.loadModelFromJson(modelJson, {
        targetHeight: CHII_PET_HEIGHTS[assetId] || CHII_PET_HEIGHTS.generated,
      });
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
  await applySavedCharacterAppearance(architect, 'fangk');

  // ---- bear NPC (wanders near windmill river side) ----
  const bear = new ArchitectNPC();
  window.__bear = bear;
  bear.mesh.name = 'momo';
  bear._petName = 'momo';
  bear._profile = getPetProfile('momo');
  attachPetStateMachine(bear, 'idle');
  bear._initialInteractionDone = false;
  bear.initPhysics(physics);
  bear.setNavigation(petNavigation);
  const [bearSpawnX, , bearSpawnZ] = gridSpawn('momo', [-60, 0, 15]);
  bear.setPosition(bearSpawnX, 0, bearSpawnZ);
  bear.setOrigin(bearSpawnX, 0, bearSpawnZ);
  scene.add(bear.mesh);

  await loadCharacterRuntime(bear, 'momo');
  await applySavedCharacterAppearance(bear, 'momo');
  if (!bear._animPlans.walk && bear._animPlans.run) bear._animPlans.walk = bear._animPlans.run;
  if (!bear._animPlans.chop && bear._animPlans.smash) bear._animPlans.chop = bear._animPlans.smash;
  if (!bear._animPlans.chop && bear._animPlans.run) bear._animPlans.chop = bear._animPlans.run;

  // ---- polished pet NPCs ----
  const townPetBounds = gridBoundsToWorld(scenePlan.town?.roamBounds);
  const petManager = new PetManager({
    scene,
    physics,
    assetRepository,
    navigation: petNavigation,
    petSpawns: {
      yafo: gridSpawn('yafo', [-30, 0, 30]),
      mok: gridSpawn('mok', [38, 0, 18]),
      mako: townGridSpawn('mako', [-38, 0, -18]),
      lingq: townGridSpawn('lingq', [26, 0, -24]),
      crab: townGridSpawn('crab', [14, 0, -34]),
    },
    petBehaviors: {
      mako: { initialState: 'free_roam', region: 'church_town', bounds: townPetBounds },
      lingq: { initialState: 'free_roam', region: 'church_town', bounds: townPetBounds },
      crab: { initialState: 'free_roam', region: 'church_town', bounds: townPetBounds },
    },
  });
  await petManager.load();
  await Promise.all(petManager.pets.map(pet => applySavedCharacterAppearance(
    pet,
    pet._profile?.id || pet._petName,
  )));
  for (const pet of petManager.pets) {
    assetAudit.recordAnimations(pet._petId || pet._petName || pet.mesh.name, pet._animPlans);
  }
  petManager.registerPet(architect, {
    name: 'fangk',
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
  const btnCloseMgmt = document.getElementById('btn-close-mgmt');
  const chkCollision = document.getElementById('chk-collision');
  const chkPerformance = document.getElementById('chk-performance');
  const colliderStrategyButtons = [...document.querySelectorAll('[data-collider-strategy]')];
  const sceneStyleButtons = [...document.querySelectorAll('[data-scene-style]')];
  const renderStyleButtons = [...document.querySelectorAll('[data-render-style]')];
  const renderQualityButtons = [...document.querySelectorAll('[data-render-quality]')];
  const chkPostProcessing = document.getElementById('chk-post-processing');
  const btnWorldTuningAudit = document.getElementById('btn-world-tuning-audit');
  const worldTuningAuditStatus = document.getElementById('world-tuning-audit-status');
  const btnReplayActZero = document.getElementById('btn-replay-act-zero');
  const runtimeHUD = new RuntimeHUD({ renderer, physics });
  const sceneSavePanel = new SceneSavePanel({
    persistence: scenePersistence,
    pageLoading,
  });
  window.__chiiSceneSavePanel = sceneSavePanel;
  assetAudit.print();
  let panelOpen = false;

  function setPanelOpen(open) {
    if (open && inventorySystem.isOpen()) inventorySystem.close();
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
  function updateColliderStrategyButtons() {
    for (const button of colliderStrategyButtons) {
      const active = button.dataset.colliderStrategy === colliderRegistry.strategy;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
  updateColliderStrategyButtons();
  for (const button of colliderStrategyButtons) {
    button.addEventListener('click', () => {
      const strategy = button.dataset.colliderStrategy;
      if (!Object.values(COLLIDER_STRATEGIES).includes(strategy)) return;
      const summary = colliderRegistry.setStrategy(strategy);
      debugRenderer.update();
      updateColliderStrategyButtons();
      console.log('[Physics] Collider strategy changed:', summary);
    });
  }
  for (const button of sceneStyleButtons) {
    const active = button.dataset.sceneStyle === sceneStyle;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', () => {
      const nextStyle = setChiiSceneStyle(button.dataset.sceneStyle);
      if (nextStyle !== sceneStyle) {
        scenePersistence.flush();
        pageLoading.reload(CHII_LOADING_PRESETS.sceneStyle);
      }
    });
  }
  function syncRenderPresentationControls() {
    const settings = renderPresentation.getSettings();
    for (const button of renderStyleButtons) {
      const active = button.dataset.renderStyle === settings.style;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const button of renderQualityButtons) {
      const active = button.dataset.renderQuality === settings.quality;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    if (chkPostProcessing) chkPostProcessing.checked = settings.postProcessing;
  }
  syncRenderPresentationControls();
  for (const button of renderStyleButtons) {
    button.addEventListener('click', () => {
      renderPresentation.setStyle(button.dataset.renderStyle);
      syncRenderPresentationControls();
    });
  }
  for (const button of renderQualityButtons) {
    button.addEventListener('click', () => {
      renderPresentation.setQuality(button.dataset.renderQuality);
      syncRenderPresentationControls();
    });
  }
  chkPostProcessing?.addEventListener('change', () => {
    renderPresentation.setPostProcessing(chkPostProcessing.checked);
    syncRenderPresentationControls();
  });
  btnWorldTuningAudit?.addEventListener('click', () => {
    const snapshot = worldTuningAudit.print();
    const abnormal = snapshot.counts.out_of_profile || 0;
    const soft = snapshot.placement.softOverlaps.length;
    worldTuningAuditStatus.textContent = abnormal || snapshot.warnings.length
      ? `需留意 ${abnormal} 个比例，${soft} 组活动间距`
      : `比例正常，共 ${snapshot.objects.length} 个场景物件`;
  });

  // Click outside card to close
  mgmtPanel.addEventListener('click', (e) => {
    if (e.target === mgmtPanel) setPanelOpen(false);
  });
  btnCloseMgmt?.addEventListener('click', () => setPanelOpen(false));

  // ---- dialogue system ----
  const dialogueSystem = createDialogueSystem();
  const dialogueCamera = new DialogueCameraDirector({ player, thirdPersonCamera, dialogueSystem });
  const placementGrid = new PlacementGrid({
    center: [centerCfg.center[0], centerCfg.center[1]],
    terrainSize: GRID_SIZE,
    terrainLayout: scenePlan.modifiedLayout,
  });
  const objectScalePolicy = new ObjectScalePolicy({
    profiles: CHII_SIZE_PROFILES,
    resolveProfile: resolveChiiSizeProfile,
    cellSize: placementGrid.cellSize,
  });
  const objectPlacement = new ObjectPlacementService({
    grid: placementGrid,
    worldObjects,
    scene,
    colliderRegistry,
    scalePolicy: objectScalePolicy,
  });
  scenePersistence.start();
  petManager.setPlacementGrid(placementGrid);
  const objectEditor = new ObjectEditorController({
    placement: objectPlacement,
    scene,
    camera,
    cameraController: thirdPersonCamera,
    canvas: renderer.domElement,
    input,
  });
  const placementAudit = objectPlacement.audit();
  const worldTuningAudit = new WorldTuningAudit({
    worldObjects,
    objectPlacement,
    metrics: CHII_WORLD_METRICS,
    profiles: CHII_SIZE_PROFILES,
    budgets: CHII_PERFORMANCE_BUDGETS,
  });
  window.__chiiPlacement = objectPlacement;
  window.__chiiWorldTuning = worldTuningAudit;
  console.log('[Placement] Initial audit:', JSON.stringify({
    entities: placementAudit.entities,
    occupiedCells: placementAudit.occupiedCells,
    overlapCells: placementAudit.overlaps.length,
    invalidTerrainEntities: placementAudit.invalidTerrain.length,
  }));
  if (placementAudit.overlaps.length > 0) {
    const overlapDetails = placementAudit.overlaps.map(overlap => ({
      cell: overlap.cell,
      entities: overlap.entities.map(instanceId => {
        const record = placementGrid.records.get(instanceId);
        return {
          instanceId,
          id: record?.entity?.id,
          name: record?.entity?.name,
          category: record?.entity?.category,
          footprint: record?.footprint,
        };
      }),
    }));
    console.warn('[Placement] Existing overlap cells:', JSON.stringify(overlapDetails));
  }
  const assembledInteriors = await assembleChiiInteriors({
    scene,
    physics,
    registry: worldObjects,
    modelJsons,
  });
  const buildingInteriorSystem = new BuildingInteriorSystem({
    player,
    cameraController: thirdPersonCamera,
    pageLoading,
    rooms: assembledInteriors.rooms,
    worldObjects,
    buildings: scenePlan.buildings,
    center: [centerCfg.center[0], centerCfg.center[1]],
    gridSize: GRID_SIZE,
    onInteriorChanged: inside => climatePresenter.setWeatherEffectsVisible(!inside),
  });
  window.__chiiInteriors = buildingInteriorSystem;
  console.log(`[Interiors] Ready: church + empty room, ${assembledInteriors.furniture.length} furniture entities`);

  const regionGameplay = await createChiiRegionGameplay({
    scene,
    physics,
    player,
    camera,
    cameraController: thirdPersonCamera,
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
    colliderRegistry,
    objectPlacement,
    objectEditor,
    equipmentService: characterEquipment,
    sceneStyle,
    onGeneratedObject: entity => objectEditor.openGenerated(entity),
  });
  const { pastoralSlice, townSocialSystem, townBuilderSystem, forestTempleSystem } = regionGameplay;
  window.__townSocialSystem = townSocialSystem;
  window.__townBuilderSystem = townBuilderSystem;
  window.__petPartyEvent = townSocialSystem;
  window.__forestTempleSystem = forestTempleSystem;
  const restoredGeneratedPets = await forestTempleSystem.restoreSavedPets();
  for (const pet of restoredGeneratedPets) {
    if (!dynamicTargets.includes(pet)) dynamicTargets.push(pet);
  }
  if (restoredGeneratedPets.length > 0) {
    console.log(`[SceneSave] Restored ${restoredGeneratedPets.length} generated pets`);
  }
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
      : regionGameplay.interactTownPet(npc, dialogueSystem);
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
    colliderRegistry,
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
  const constructionEffect = createConstructionEffect({
    scene,
    architect,
    contentPort: defaultContentGeneration,
    colliderRegistry,
    vfxService: regionGameplay.vfxService,
  });
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
    townSocialSystem,
    townBuilderSystem,
    pastoralSlice,
    forestTempleSystem,
    buildingInteriorSystem,
    objectPlacement,
    bearHome: { x: bearSpawnX, z: bearSpawnZ },
    handlers: {
      onForest: beginForestInteraction,
      onInterior: hit => {
        buildingInteriorSystem.interact(hit).catch(error => {
          console.warn('[Interiors] Transition failed:', error.message);
        });
      },
      onTownPet: beginTownPetDialogue,
      onArchitect: beginArchitectDialogue,
      onObject: entity => objectEditor.open(entity),
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

  // ---- story prologue: Act 0 crash performance ----
  const actZeroDirector = new ActZeroCrashDirector({
    scene,
    camera,
    cameraController: thirdPersonCamera,
    input,
    player,
    storyState: actZeroStoryState,
    onComplete: () => {
      if (!beachSpawnCell) return;
      const position = getGridWorldPosition(
        beachSpawnCell.gridX,
        beachSpawnCell.gridZ,
        centerCfg.center[0],
        centerCfg.center[1],
        GRID_SIZE,
      );
      player.teleport(position, { orientation: beachSpawnCell.facing, groundY: 0 });
    },
  });
  window.__chiiActZero = actZeroDirector;
  window.__chiiStory = islandStoryState;
  window.__chiiActZeroStory = actZeroStoryState;
  await actZeroDirector.start();
  pageLoading.hide();
  const interiorPreviewId = new URLSearchParams(window.location.search).get('interior-preview');
  const interiorPreviewEntry = buildingInteriorSystem.entries.find(
    entry => entry.buildingId === interiorPreviewId,
  );
  if (interiorPreviewEntry) {
    await buildingInteriorSystem.enter(interiorPreviewEntry);
  }
  btnReplayActZero?.addEventListener('click', () => {
    setPanelOpen(false);
    actZeroDirector.replay().catch(error => {
      console.warn('[ActZero] Replay failed:', error.message);
    });
  });

  // ---- animation loop ----
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    actZeroDirector.update(dt);
    const actZeroActive = actZeroDirector.isActive();
    inventorySystem.update({
      canOpen: !actZeroActive
        && !buildingInteriorSystem.isTransitioning()
        && !dialogueActive
        && !dialogueCamera.locked
        && !dialogueSystem.isActive()
        && !panelOpen
        && !itemShowcase.isActive()
        && !constructionActive
        && !objectEditor.isActive(),
    });
    const inventoryOpen = inventorySystem.isOpen();
    const itemShowcaseActive = itemShowcase.isActive();

    // Pointer-lock camera (skip when dialogue or panel are active)
    if (!actZeroActive && !buildingInteriorSystem.isTransitioning() && !dialogueActive && !dialogueCamera.locked && !dialogueSystem.isActive() && !panelOpen && !inventoryOpen && !itemShowcaseActive && !objectEditor.isActive()) {
      const { dx, dy } = input.consumeMouseDelta();
      if (dx !== 0 || dy !== 0) {
        thirdPersonCamera.applyMouseDelta(dx, dy);
      }
    }

    // ESC: close dialogue first, then toggle management panel
    if (!actZeroActive && !buildingInteriorSystem.isTransitioning() && input.justPressed('Escape')) {
      if (itemShowcaseActive) {
        itemShowcase.stop();
      } else if (inventoryOpen) {
        inventorySystem.close();
      } else if (objectEditor.isActive()) {
        objectEditor.cancel();
      } else if (dialogueSystem.isActive()) {
        dialogueSystem.hide();
      } else if (dialogueActive) {
        dialogueSystem.hide(); // onDialogueEnd callback handles unlock
      } else if (!document.pointerLockElement) {
        setPanelOpen(!panelOpen);
      }
    }

    interactionController.update(
      !actZeroActive
      && !buildingInteriorSystem.isTransitioning()
      && !dialogueActive
      && !dialogueCamera.locked
      && !dialogueSystem.isActive()
      && !panelOpen
      && !inventoryOpen
      && !itemShowcaseActive
      && !constructionActive
      && !objectEditor.isActive(),
    );

    // J: Phrolova's character-specific action. H/Space are locomotion controls in Player.
    if (!actZeroActive && !buildingInteriorSystem.isTransitioning() && !dialogueActive && !dialogueCamera.locked && !dialogueSystem.isActive() && !panelOpen && !inventoryOpen && !itemShowcaseActive && !objectEditor.isActive() && input.justPressed('KeyJ')) {
      player.playOneShot('special', 2.0);
    }

    // Entity animation updates
    if (!actZeroActive) {
      for (const e of staticEntities) {
        e.updateAnimation?.(dt);
        e.updateBreathing?.(dt);
      }
    }

    // Player update: fully freeze movement while any dialogue/input UI is active.
    if (!actZeroActive && !buildingInteriorSystem.isTransitioning() && !panelOpen && !inventoryOpen && !dialogueActive && !dialogueCamera.locked && !dialogueSystem.isActive() && !objectEditor.isActive()) {
      player.update(dt, input, thirdPersonCamera);
    }

    if (!actZeroActive) {
      architect.update(dt);
      bear.update(dt);
      petManager.update(dt);
      regionGameplay.update(dt);
      worldClimate.update(dt);
    }
    modelVisuals.update(dt);
    worldWaterVisuals?.update(dt);

    if (!actZeroActive) {
      const nearestRegionName = buildingInteriorSystem.getLocationName()
        || regionGameplay.getNearestRegionName(player.mesh.position);
      const followingPet = [bear, ...petManager.pets].find(pet => pet.petState?.is('following') || pet._followEnabled);
      runtimeHUD.setWorldStatus(nearestRegionName, followingPet?._petName || null);
      runtimeHUD.update(dt, { entities: staticEntities.length, pets: petManager.pets.length + 1 });
    }

    // Particle systems + reveal animations
    if (!actZeroActive) {
      treeChopSequence.update(dt);
      if (campfireParticles) campfireParticles.update(dt, null);
    }

    // Construction effect update
    if (!actZeroActive && constructionActive) {
      constructionEffect.update(dt);
    }

    // Dialogue system update (handles typewriter)
    if (dialogueActive) {
      dialogueSystem.update(dt);
    }

    // Camera update
    if (actZeroActive) {
      actZeroDirector.applyCamera();
    } else {
      thirdPersonCamera.update(player.mesh.position);
    }

    // Physics step
    if (!actZeroActive) physics.step();
    debugRenderer.update();

    input.endFrame();
    renderPresentation.render(dt);
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
          renderPresentation.resize(width, height);
        }
      }
    });
    ro.observe(gameWrap);
  }

  console.log(
    'Chii Island 奇异岛 — 弗洛洛主角\n' +
    '  点击画面锁定鼠标，移动鼠标 = 旋转视角 | Esc 释放鼠标 | 滚轮 = 缩放\n' +
    '  WASD = 移动（A/D 转向）| Shift = 加速\n' +
    '  空格 = 跳跃 | H = 切换飞行模式 | Q/E = 上升/下降\n' +
    '  B = 打开或关闭背包\n' +
    '  J = 弗洛洛特殊动作\n' +
    '  停止不动 = 呼吸摇摆 | 移动 = 奔跑动画 | 飞行 = 跳跃动画'
  );
}

init().catch((err) => {
  console.error('[Init] Fatal:', err);
  pageLoading.fail({
    title: '奇异岛还没准备好',
    detail: `有个行李箱卡在门口：${err.message}`,
  });
});
