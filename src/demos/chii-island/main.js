import * as THREE from 'three';
import { getRuntimeStatus, initRuntime } from '../../engine/runtime/runtimeProvider.js';
import { createScene, createRenderer, createLights, ThirdPersonCamera, setMaterialTagPresenter } from '../../engine';
import { Player } from '../../engine';
import { createUnitEnvironment, getGridWorldPosition, preloadBlocks, generateTerrainLayout } from '../../engine';
import { Input } from '../../engine';
import { PhysicsWorld } from '../../engine/physics/PhysicsWorld.js';
import { RapierDebugRenderer } from '../../engine/physics/RapierDebugRenderer.js';
import { setupRaycast } from '../../engine';
import { CHII_WORLD_CENTER } from './data/worldConfig.js';
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
import { PetManager } from './systems/PetManager.js';
import { RuntimeHUD } from './systems/RuntimeHUD.js';
import { assignResidentIdentity, getResidentDefinition } from './data/residentCatalog.js';
import { DialogueCameraDirector } from './presentation/DialogueCameraDirector.js';
import { PlayerItemShowcaseDirector } from './presentation/PlayerItemShowcaseDirector.js';
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
import { CHII_EQUIPMENT_CATALOG } from './data/equipmentCatalog.js';
import { CharacterAppearanceStore } from '../../storage/CharacterAppearanceStore.js';
import { EquipmentMountCache } from '../../storage/EquipmentMountCache.js';
import { ChiiSceneSaveStore } from '../../storage/ChiiSceneSaveStore.js';
import { ChiiScenePersistenceSystem } from './systems/ChiiScenePersistenceSystem.js';
import { CHII_PLAYER_CHARACTER } from './data/playerCharacter.js';
import {
  CHII_SIZE_PROFILES,
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
import { ControlLockCoordinator } from '../../gameplay/control/ControlLockCoordinator.js';
import { ActZeroCrashDirector } from './presentation/ActZeroCrashDirector.js';
import {
  CHII_LOADING_PRESETS,
  createChiiPageLoadingScreen,
} from './presentation/ChiiPageLoadingScreen.js';
import { SceneSavePanel } from './presentation/SceneSavePanel.js';
import { ApplicationLifecycle } from '../../engine/runtime/ApplicationLifecycle.js';
import { SceneManagementPanel } from './presentation/SceneManagementPanel.js';
import { ChiiCharacterRuntimeService } from './systems/ChiiCharacterRuntimeService.js';
import { ChiiInteractionSession } from './systems/ChiiInteractionSession.js';
import { createMapHost } from 'worldforge-studio/host';
import { ForgeSceneRepository } from '../../assets/repositories/ForgeSceneRepository.js';
import { WorldForgeRenderPresentationAdapter } from '../../integrations/worldforge/WorldForgeRenderPresentationAdapter.js';
import { ForgeMapPhysicsAdapter } from '../../integrations/worldforge/ForgeMapPhysicsAdapter.js';
import { createTerrainLayoutFromForge } from '../../integrations/worldforge/forgeTerrainLayout.js';

const pageLoading = createChiiPageLoadingScreen({ preset: 'island' });
const applicationLifecycle = new ApplicationLifecycle();
const PLAYER_INITIAL_SPAWN_HEIGHT = 1.25;

async function awaitApplication(task) {
  applicationLifecycle.assertActive();
  const result = await (typeof task === 'function' ? task() : task);
  applicationLifecycle.assertActive();
  return result;
}

function reportDisposalErrors(errors) {
  for (const error of errors) console.warn('[Lifecycle] Disposal failed:', error);
}

function clearDebugGlobals() {
  const keys = [
    '__renderer', '__player', '__bear', '__petManager',
    '__chiiActZero', '__chiiActZeroStory', '__chiiStory',
    '__chiiAssetAudit', '__chiiClimate', '__chiiColliderRegistry',
    '__chiiEnvironmentVisuals', '__chiiInteriors', '__chiiInventory',
    '__chiiItemShowcase', '__chiiModelVisualLifecycle', '__chiiModelVisuals',
    '__chiiPlacement', '__chiiRenderPresentation', '__chiiSceneProfile',
    '__chiiSceneSave', '__chiiSceneSavePanel', '__chiiSceneStyle',
    '__chiiWaterVisuals', '__chiiWorldTuning', '__forestTempleSystem',
    '__townBuilderSystem', '__townSocialSystem',
  ];
  for (const key of keys) delete window[key];
  if (window.THREE === THREE) delete window.THREE;
}

function disposeApplication() {
  reportDisposalErrors(applicationLifecycle.dispose());
  clearDebugGlobals();
  pageLoading.dispose();
}

const handlePageHide = () => disposeApplication();
window.addEventListener('pagehide', handlePageHide, { once: true });
applicationLifecycle.add(() => window.removeEventListener('pagehide', handlePageHide));
if (import.meta.hot) import.meta.hot.dispose(disposeApplication);

// ---- bootstrap ----
async function init() {
  window.THREE = THREE;
  const islandStoryState = new IslandStoryState();
  const actZeroStoryState = new ActZeroStoryState({ storyState: islandStoryState });
  const sceneStyle = getChiiSceneStyle();
  const sceneProfile = getChiiSceneProfile(sceneStyle);
  const forgeScene = sceneProfile.features.worldForge
    ? await awaitApplication(() => new ForgeSceneRepository({
        root: `/${sceneProfile.forgePackageRoot}`,
      }).load(sceneProfile.snapshotId))
    : null;
  if (actZeroStoryState.shouldPlay()) {
    pageLoading.show(CHII_LOADING_PRESETS.prologue);
  }

  // Wait for voxel runtime before building terrain (needed for geometry)
  await awaitApplication(() => initRuntime(THREE)
    .then(() => console.log('[Init] Voxel runtime ready'))
    .catch((e) => console.warn('[Init] Voxel runtime unavailable:', e.message)));

  // Init Rapier physics
  const physics = new PhysicsWorld();
  applicationLifecycle.assertActive();
  await physics.init();
  applicationLifecycle.add(physics);
  applicationLifecycle.assertActive();
  physics.addGroundPlane(forgeScene ? -8 : 0);
  console.log('[Init] Physics ready');

  // ---- Three.js setup ----
  const scene = createScene();
  const renderer = createRenderer();
  applicationLifecycle.add(renderer, resource => {
    resource.setAnimationLoop?.(null);
    resource.dispose();
    resource.domElement.remove();
  });
  window.__renderer = renderer; // for perf debugging
  const gameWrap = document.getElementById('game-wrap');
  if (gameWrap && renderer.domElement.parentElement !== gameWrap) {
    gameWrap.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
  }

  const input = new Input(renderer.domElement);
  applicationLifecycle.add(input, resource => resource.destroy());
  const thirdPersonCamera = new ThirdPersonCamera();
  applicationLifecycle.add(thirdPersonCamera);
  const camera = thirdPersonCamera.camera;
  const lightRig = createLights(scene);
  let forgeHost = null;
  if (forgeScene) {
    scene.add(lightRig.sunLight.target);
    forgeHost = await awaitApplication(() => createMapHost({
      map: forgeScene.map,
      scheme: forgeScene.renderScheme,
      scene,
      camera,
      renderer,
      sunLight: lightRig.sunLight,
      hemisphereLight: lightRig.hemiLight,
      sunTarget: lightRig.sunLight.target,
      hdriUrl: file => forgeScene.hdriUrl
        || `/${sceneProfile.forgePackageRoot}/hdri/${encodeURIComponent(file)}`,
    }));
    window.__chiiForgeHost = forgeHost;
  }
  const renderPresentation = forgeHost
    ? new WorldForgeRenderPresentationAdapter({ host: forgeHost })
    : new VoxelStudioRenderPresentationAdapter({ renderer, scene, camera, lightRig });
  applicationLifecycle.add(renderPresentation);
  const modelVisuals = new VoxelStudioModelVisualAdapter({
    scene,
    camera,
    modelStyleRegistry: renderPresentation,
  });
  applicationLifecycle.add(modelVisuals);
  setMaterialTagPresenter(modelVisuals);
  applicationLifecycle.add(() => setMaterialTagPresenter(null));
  window.__chiiModelVisuals = modelVisuals;
  window.__chiiRenderPresentation = renderPresentation;

  // ---- terrain grid (50×50, procedural forest biome) ----
  const GRID_SIZE = 50;
  preloadBlocks({});
  const layout = forgeScene
    ? createTerrainLayoutFromForge(forgeScene.map, GRID_SIZE)
    : generateTerrainLayout(GRID_SIZE, sceneProfile.terrainSeed);
  const centerCfg = { center: CHII_WORLD_CENTER };

  function countBlockTypes(l) {
    const c = {}; l.flat().forEach(t => { c[t] = (c[t] || 0) + 1; }); return c;
  }

  // Runtime gameplay only reads the locally synced asset catalog. Studio edit
  // and publish operations happen outside the running game.
  const assetRepository = createChiiAssetRepository({ sceneStyle });
  window.__chiiSceneStyle = sceneStyle;
  window.__chiiSceneProfile = sceneProfile;
  console.log(`[Init] Loading local runtime assets (${sceneProfile.label})...`);
  const modelJsons = await awaitApplication(
    () => assetRepository.getModels(getChiiSceneAssetIds(sceneStyle)),
  );
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

  const unitEnv = forgeScene
    ? null
    : createUnitEnvironment(centerCfg.center[0], centerCfg.center[1], GRID_SIZE, scenePlan.modifiedLayout);
  console.log('[Terrain] 50×50 terrain:', countBlockTypes(scenePlan.modifiedLayout));
  if (unitEnv) scene.add(unitEnv);
  const forgePhysics = forgeScene
    ? new ForgeMapPhysicsAdapter({ physics, map: forgeScene.map }).attach()
    : null;
  if (forgePhysics) applicationLifecycle.add(forgePhysics);
  const worldWaterVisuals = sceneProfile.features.worldWater
    ? new VoxelStudioWorldWaterAdapter({ scene })
    : null;
  if (worldWaterVisuals) applicationLifecycle.add(worldWaterVisuals);
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

  const assembledScene = await awaitApplication(() => assembleChiiScene({
    scene,
    scenePlan,
    modelJsons,
    assetRepository,
    center: [centerCfg.center[0], centerCfg.center[1]],
    gridSize: GRID_SIZE,
    seed: 42,
  }));
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
  if (campfireParticles) applicationLifecycle.add(campfireParticles);
  const characterEquipment = new CharacterEquipmentService({
    catalog: CHII_EQUIPMENT_CATALOG,
    contentPort: defaultContentGeneration,
    assetRepository: generatedAssets,
    cache: new EquipmentMountCache({ assetRepository: generatedAssets }),
  });
  const characterAppearances = new CharacterAppearanceStore({ scope: sceneStyle });
  const characterRuntime = new ChiiCharacterRuntimeService({
    assetRepository,
    assetAudit,
    equipmentService: characterEquipment,
    appearanceStore: characterAppearances,
  });
  const sceneSaveStore = new ChiiSceneSaveStore();
  const scenePersistence = new ChiiScenePersistenceSystem({
    sceneStyle,
    store: sceneSaveStore,
    worldObjects,
    scene,
    generatedAssetRepository: generatedAssets,
    appearanceStore: characterAppearances,
  });
  applicationLifecycle.add(scenePersistence);
  const sceneRestoreSummary = await awaitApplication(() => scenePersistence.restoreAuto());
  window.__chiiSceneSave = scenePersistence;
  if (sceneRestoreSummary.restored) {
    console.log('[SceneSave] Restored local scene:', sceneRestoreSummary);
  }
  const modelVisualLifecycle = new WorldModelVisualLifecycle({ worldObjects });
  applicationLifecycle.add(modelVisualLifecycle);
  window.__chiiModelVisualLifecycle = modelVisualLifecycle;
  assetAudit.recordAnimations('forestTrophy', { wait: forestTrophyWaitPlan });
  assetAudit.recordAnimations('pastoralWorkScaffold', { dust: pastoralWorkScaffoldPlan });

  console.log(`[Init] Created ${staticEntities.length} static entities`);

  const { registry: colliderRegistry, colliderCount, summary: colliderSummary } = buildStaticColliders(physics, staticEntities);
  applicationLifecycle.add(colliderRegistry);
  colliderRegistry.bindWorldObjects(worldObjects);
  window.__chiiColliderRegistry = colliderRegistry;
  console.log(`[Init] Physics colliders: ${colliderCount}`, colliderSummary);

  // ---- Rapier debug renderer (wireframe, hidden by default) ----
  const debugRenderer = new RapierDebugRenderer(physics.world);
  applicationLifecycle.add(debugRenderer, resource => {
    scene.remove(resource.mesh);
    resource.dispose();
  });
  debugRenderer.enabled = false;
  scene.add(debugRenderer.mesh);

  // ---- player (same classic Phrolova used in Act Zero) ----
  const player = new Player();
  player.setTerrainLayout(centerCfg.center[0], centerCfg.center[1], GRID_SIZE, scenePlan.modifiedLayout);
  player.setWaterTraversalCells(scenePlan.town?.bridge?.traversalCells || []);
  const townDemoEnabled = new URLSearchParams(window.location.search).has('church-town');
  const forestDemoEnabled = new URLSearchParams(window.location.search).has('forest-temple');
  const townDemoCell = scenePlan.town?.petSpawns?.fangk;
  const forestDemoCell = scenePlan.forestTemple?.trophy;
  const beachSpawnCell = scenePlan.beach?.spawn;
  const forgePlayerSpawn = forgeScene?.bindings?.spawns?.player;
  let demoSpawn = forgePlayerSpawn
    ? { x: forgePlayerSpawn[0], z: forgePlayerSpawn[2] }
    : beachSpawnCell
      ? getGridWorldPosition(beachSpawnCell.gridX, beachSpawnCell.gridZ, centerCfg.center[0], centerCfg.center[1], GRID_SIZE)
      : { x: 0, z: 0 };
  if (forestDemoEnabled && forestDemoCell) {
    demoSpawn = getGridWorldPosition(forestDemoCell.gridX, forestDemoCell.gridZ - 1, centerCfg.center[0], centerCfg.center[1], GRID_SIZE);
  } else if (townDemoEnabled && townDemoCell) {
    demoSpawn = getGridWorldPosition(townDemoCell.gridX - 1, townDemoCell.gridZ, centerCfg.center[0], centerCfg.center[1], GRID_SIZE);
  }
  player.initPhysics(physics, demoSpawn.x, PLAYER_INITIAL_SPAWN_HEIGHT, demoSpawn.z);
  thirdPersonCamera.setCollisionWorld(physics.world, player._collider);
  window.__player = player;
  player._scene = scene; // for particle emitters
  scene.add(player.mesh);
  const playerBaseModelJson = await awaitApplication(
    () => characterEquipment.loadJson(CHII_PLAYER_CHARACTER.model),
  );
  player.replaceModelFromJson(playerBaseModelJson, {
    targetHeight: CHII_PLAYER_CHARACTER.targetHeight,
    preserveCurrentTransform: false,
  });
  // Base locomotion animations
  await awaitApplication(() => Promise.all([
    player.loadAnimations({
      idle: CHII_PLAYER_CHARACTER.animations.idle,
      walk: CHII_PLAYER_CHARACTER.animations.walk,
      run: CHII_PLAYER_CHARACTER.animations.run,
      jump: CHII_PLAYER_CHARACTER.animations.jump,
    }),
    player.loadAnimation('special', CHII_PLAYER_CHARACTER.animations.special),
  ]));
  const itemShowcase = new PlayerItemShowcaseDirector({
    player,
    thirdPersonCamera,
    input,
  });
  applicationLifecycle.add(itemShowcase);
  const inventorySystem = new InventorySystem({
    input,
    player,
    baseModelJson: playerBaseModelJson,
    characterId: CHII_PLAYER_CHARACTER.id,
    variantId: CHII_PLAYER_CHARACTER.variantId,
    equipmentService: characterEquipment,
    onEquipped: payload => itemShowcase.play(payload),
  });
  applicationLifecycle.add(inventorySystem);
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
  applicationLifecycle.add(worldClimate);
  window.__chiiClimate = worldClimate;
  window.__chiiEnvironmentVisuals = climatePresenter;

  // ---- architect NPC ----
  const architect = new ArchitectNPC();
  const architectDefinition = assignResidentIdentity(architect, 'fangk');
  attachPetStateMachine(architect, architectDefinition.initialState);
  architect._petRegion = architectDefinition.region;
  const architectSpawn = townGridSpawn(
    architectDefinition.spawnKey,
    architectDefinition.defaultSpawn,
  );
  architect.setPosition(...architectSpawn);
  architect.setOrigin(...architectSpawn);
  architect.initPhysics(physics);
  architect.setNavigation(petNavigation);
  scene.add(architect.mesh);

  await awaitApplication(() => characterRuntime.loadCharacterAsset(architect, architectDefinition.assetId));
  await awaitApplication(() => characterRuntime.applySavedAppearance(architect, architectDefinition.profileId));

  // ---- bear NPC (wanders near windmill river side) ----
  const bear = new ArchitectNPC();
  window.__bear = bear;
  const bearDefinition = assignResidentIdentity(bear, 'momo');
  attachPetStateMachine(bear, bearDefinition.initialState);
  bear._petRegion = bearDefinition.region;
  bear._initialInteractionDone = false;
  bear.initPhysics(physics);
  bear.setNavigation(petNavigation);
  const [bearSpawnX, , bearSpawnZ] = gridSpawn(
    bearDefinition.spawnKey,
    bearDefinition.defaultSpawn,
  );
  bear.setPosition(bearSpawnX, 0, bearSpawnZ);
  bear.setOrigin(bearSpawnX, 0, bearSpawnZ);
  scene.add(bear.mesh);

  await awaitApplication(() => characterRuntime.loadCharacterAsset(bear, bearDefinition.assetId));
  await awaitApplication(() => characterRuntime.applySavedAppearance(bear, bearDefinition.profileId));
  if (!bear._animPlans.walk && bear._animPlans.run) bear._animPlans.walk = bear._animPlans.run;

  // ---- polished pet NPCs ----
  const townPetBounds = gridBoundsToWorld(scenePlan.town?.roamBounds);
  const yafoDefinition = getResidentDefinition('yafo');
  const mokDefinition = getResidentDefinition('mok');
  const makoDefinition = getResidentDefinition('mako');
  const lingqDefinition = getResidentDefinition('lingq');
  const crabDefinition = getResidentDefinition('builder_crab');
  const petManager = new PetManager({
    scene,
    physics,
    assetRepository,
    navigation: petNavigation,
    petSpawns: {
      yafo: gridSpawn(yafoDefinition.spawnKey, yafoDefinition.defaultSpawn),
      mok: gridSpawn(mokDefinition.spawnKey, mokDefinition.defaultSpawn),
      mako: townGridSpawn(makoDefinition.spawnKey, makoDefinition.defaultSpawn),
      lingq: townGridSpawn(lingqDefinition.spawnKey, lingqDefinition.defaultSpawn),
      crab: townGridSpawn(crabDefinition.spawnKey, crabDefinition.defaultSpawn),
    },
    petBehaviors: {
      mako: { bounds: townPetBounds },
      lingq: { bounds: townPetBounds },
      crab: { bounds: townPetBounds },
    },
  });
  await awaitApplication(() => petManager.load());
  await awaitApplication(() => Promise.all(petManager.pets.map(pet => characterRuntime.applySavedAppearance(
    pet,
    pet._profile?.id || pet._petName,
  ))));
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

  const controlLocks = new ControlLockCoordinator();

  // ---- dynamic targets for raycast ----
  const dynamicTargets = [...new Set([player, architect, bear, ...staticEntities, ...petManager.pets])];

  applicationLifecycle.add(setupRaycast(camera, dynamicTargets));

  const runtimeHUD = new RuntimeHUD({ renderer, physics });
  applicationLifecycle.add(runtimeHUD);
  const sceneSavePanel = new SceneSavePanel({
    persistence: scenePersistence,
    pageLoading,
  });
  applicationLifecycle.add(sceneSavePanel);
  window.__chiiSceneSavePanel = sceneSavePanel;
  assetAudit.print();

  // ---- dialogue system ----
  const dialogueSystem = createDialogueSystem();
  applicationLifecycle.add(dialogueSystem);
  const dialogueCamera = new DialogueCameraDirector({ player, thirdPersonCamera, dialogueSystem });
  applicationLifecycle.add(dialogueCamera);
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
  applicationLifecycle.add(objectEditor);
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
  const assembledInteriors = await awaitApplication(() => assembleChiiInteriors({
    scene,
    physics,
    registry: worldObjects,
    modelJsons,
  }));
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
  applicationLifecycle.add(buildingInteriorSystem);
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
    terrainTileSize: CHII_WORLD_METRICS.terrainTile,
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
    storyState: islandStoryState,
    navigation: petNavigation,
    onGeneratedObject: entity => objectEditor.openGenerated(entity),
  });
  applicationLifecycle.add(regionGameplay);
  applicationLifecycle.assertActive();
  const { pastoralSlice, townSocialSystem, townBuilderSystem, forestTempleSystem } = regionGameplay;
  window.__townSocialSystem = townSocialSystem;
  window.__townBuilderSystem = townBuilderSystem;
  window.__forestTempleSystem = forestTempleSystem;
  const restoredGeneratedPets = await awaitApplication(() => forestTempleSystem.restoreSavedPets());
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

  const interactionSession = new ChiiInteractionSession({
    player,
    thirdPersonCamera,
    dialogueSystem,
    dialogueCamera,
    pastoralSlice,
    forestTempleSystem,
    regionGameplay,
    forestTrophy,
    forestTent,
  });
  applicationLifecycle.add(interactionSession);

  const interactionController = new ChiiInteractionController({
    input,
    player,
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
      onForest: hit => interactionSession.beginForestInteraction(hit),
      onInterior: hit => {
        buildingInteriorSystem.interact(hit).catch(error => {
          console.warn('[Interiors] Transition failed:', error.message);
        });
      },
      onTownPet: pet => interactionSession.beginTownPetDialogue(pet),
      onObject: entity => objectEditor.open(entity),
      onBear: ({ pet }) => interactionSession.beginPastoralPetDialogue(pet),
      onPet: ({ pet }) => {
        if (pet._hasIntroduced === false) {
          interactionSession.beginGeneratedPetIntroduction(pet);
        } else {
          interactionSession.beginPastoralPetDialogue(pet);
        }
      },
    },
  });
  applicationLifecycle.add(interactionController);

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
  applicationLifecycle.add(actZeroDirector);
  window.__chiiActZero = actZeroDirector;
  window.__chiiStory = islandStoryState;
  window.__chiiActZeroStory = actZeroStoryState;
  const managementPanel = new SceneManagementPanel({
    sceneStyle,
    beforeOpen: () => {
      if (inventorySystem.isOpen()) inventorySystem.close();
      return true;
    },
    onCollisionVisibleChange: visible => {
      debugRenderer.enabled = visible;
    },
    onPerformanceVisibleChange: visible => runtimeHUD.setPerformanceVisible(visible),
    getColliderStrategy: () => colliderRegistry.strategy,
    onColliderStrategySelected: strategy => {
      if (!Object.values(COLLIDER_STRATEGIES).includes(strategy)) return;
      const summary = colliderRegistry.setStrategy(strategy);
      debugRenderer.update();
      console.log('[Physics] Collider strategy changed:', summary);
    },
    onSceneStyleSelected: requestedStyle => {
      const nextStyle = setChiiSceneStyle(requestedStyle);
      if (nextStyle !== sceneStyle) {
        scenePersistence.flush();
        pageLoading.reload(CHII_LOADING_PRESETS.sceneStyle);
      }
    },
    getRenderSettings: () => renderPresentation.getSettings(),
    onRenderStyleSelected: style => renderPresentation.setStyle(style),
    onRenderQualitySelected: quality => renderPresentation.setQuality(quality),
    onPostProcessingChange: enabled => renderPresentation.setPostProcessing(enabled),
    onAudit: () => worldTuningAudit.print(),
    onReplay: () => {
      actZeroDirector.replay().catch(error => {
        console.warn('[ActZero] Replay failed:', error.message);
      });
    },
  });
  applicationLifecycle.add(managementPanel);
  await awaitApplication(() => actZeroDirector.start());
  pageLoading.hide();
  const interiorPreviewId = new URLSearchParams(window.location.search).get('interior-preview');
  const interiorPreviewEntry = buildingInteriorSystem.entries.find(
    entry => entry.buildingId === interiorPreviewId,
  );
  if (interiorPreviewEntry) {
    await awaitApplication(() => buildingInteriorSystem.enter(interiorPreviewEntry));
  }
  // ---- animation loop ----
  const clock = new THREE.Clock();
  let animationFrameId = null;
  let animationActive = true;
  applicationLifecycle.add(() => {
    animationActive = false;
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  });

  function animate() {
    if (!animationActive) return;
    animationFrameId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    actZeroDirector.update(dt);
    const actZeroActive = actZeroDirector.isActive();
    const transitioningInterior = buildingInteriorSystem.isTransitioning();
    controlLocks.set('act-zero', actZeroActive, ['*']);
    controlLocks.set('interior-transition', transitioningInterior, ['*']);
    controlLocks.set('dialogue-route', interactionSession.isActive(), ['inventory', 'camera', 'interaction', 'special', 'movement']);
    controlLocks.set('dialogue-camera', dialogueCamera.locked, ['inventory', 'camera', 'interaction', 'special', 'movement']);
    controlLocks.set('dialogue-ui', dialogueSystem.isActive(), ['inventory', 'camera', 'interaction', 'special', 'movement']);
    controlLocks.set('management', managementPanel.isOpen(), ['inventory', 'camera', 'interaction', 'special', 'movement']);
    controlLocks.set('showcase', itemShowcase.isActive(), ['inventory', 'camera', 'interaction', 'special', 'movement']);
    controlLocks.set('object-editor', objectEditor.isActive(), ['inventory', 'camera', 'interaction', 'special', 'movement']);
    inventorySystem.update({
      canOpen: !controlLocks.isBlocked('inventory'),
    });
    const inventoryOpen = inventorySystem.isOpen();
    const itemShowcaseActive = itemShowcase.isActive();
    controlLocks.set('inventory', inventoryOpen, ['camera', 'interaction', 'special', 'movement']);

    // Pointer-lock camera (skip when dialogue or panel are active)
    if (!controlLocks.isBlocked('camera')) {
      const { dx, dy } = input.consumeMouseDelta();
      if (dx !== 0 || dy !== 0) {
        thirdPersonCamera.applyMouseDelta(dx, dy);
      }
    }

    // ESC: close dialogue first, then toggle management panel
    if (!actZeroActive && !transitioningInterior && input.justPressed('Escape')) {
      if (itemShowcaseActive) {
        itemShowcase.stop();
      } else if (inventoryOpen) {
        inventorySystem.close();
      } else if (objectEditor.isActive()) {
        objectEditor.cancel();
      } else if (dialogueSystem.isActive()) {
        dialogueSystem.hide();
      } else if (interactionSession.isActive()) {
        dialogueSystem.hide(); // onDialogueEnd callback handles unlock
      } else if (!document.pointerLockElement) {
        managementPanel.toggle();
      }
    }

    interactionController.update(
      !controlLocks.isBlocked('interaction'),
    );

    // J: Phrolova's character-specific action. H/Space are locomotion controls in Player.
    if (!controlLocks.isBlocked('special') && input.justPressed('KeyJ')) {
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
    if (!controlLocks.isBlocked('movement')) {
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
      const followingPet = [bear, ...petManager.pets].find(pet => pet.petState?.is('following'));
      runtimeHUD.setWorldStatus(nearestRegionName, followingPet?._petName || null);
      runtimeHUD.update(dt, { entities: staticEntities.length, pets: petManager.pets.length + 1 });
    }

    // Particle systems
    if (!actZeroActive) {
      if (campfireParticles) campfireParticles.update(dt, null);
    }

    // Dialogue system update (handles typewriter)
    if (interactionSession.isActive()) {
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
    applicationLifecycle.add(ro, observer => observer.disconnect());
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
  if (!applicationLifecycle.isActive()) return;
  console.error('[Init] Fatal:', err);
  pageLoading.fail({
    title: '奇异岛还没准备好',
    detail: `有个行李箱卡在门口：${err.message}`,
  });
  reportDisposalErrors(applicationLifecycle.dispose());
  clearDebugGlobals();
});
