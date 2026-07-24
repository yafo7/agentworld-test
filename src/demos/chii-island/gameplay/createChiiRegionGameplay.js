import * as THREE from 'three';
import { getGridWorldPosition } from '../../../engine/world/terrain.js';
import { createPastoralSlice } from '../systems/pastoralSlice.js';
import { TownSocialSystem } from '../systems/TownSocialSystem.js';
import { TownBuilderSystem } from '../systems/TownBuilderSystem.js';
import { ForestTempleSystem } from '../systems/ForestTempleSystem.js';
import { clearAIWorldEvents } from '../../../storage/aiWorldState.js';
import { TemporaryVfxService } from '../presentation/TemporaryVfxService.js';

export async function createChiiRegionGameplay({
  scene,
  physics,
  player,
  camera = null,
  petManager,
  architect,
  bear,
  staticEntities,
  worldObjects,
  dialogueSystem,
  scenePlan,
  center,
  gridSize,
  dialogueCamera,
  forest,
  pastoralWork,
  runtimeStatus,
  contentPort,
  generatedAssetRepository,
  colliderRegistry,
  objectPlacement,
  objectEditor,
  onGeneratedObject,
}) {
  clearAIWorldEvents();
  const vfxService = new TemporaryVfxService({ scene });

  const pastoralSlice = createPastoralSlice({
    scene,
    player,
    staticEntities,
    worldObjects,
    pets: [bear, ...petManager.pets.filter(pet => pet._petRegion !== 'church_town')],
    dialogueSystem,
    center,
    gridSize,
    terrainLayout: scenePlan.modifiedLayout,
    setDialogueLock: (locked, pet) => dialogueCamera.setDialogueLock(locked, pet),
    focusDialogueCamera: pet => dialogueCamera.focusDialogue(pet),
    focusWorkCamera: (pet, target) => dialogueCamera.focusWork(pet, target),
    workScaffoldModelJson: pastoralWork.modelJson,
    workScaffoldAnimationPlan: pastoralWork.animationPlan,
    runtimeStatus,
    contentPort,
    generatedAssetRepository,
    colliderRegistry,
    objectPlacement,
    onGeneratedObject,
    camera,
    vfxService,
  });

  const townCenterGrid = scenePlan.town?.center;
  const townCenter = townCenterGrid
    ? getGridWorldPosition(townCenterGrid.x, townCenterGrid.z, center[0], center[1], gridSize)
    : { x: 0, z: -30 };
  const townPets = [
    architect,
    petManager.pets.find(pet => pet._petName === 'lingq'),
    petManager.pets.find(pet => pet._petName === 'mako'),
    petManager.pets.find(pet => pet._petId === 'builder_crab'),
  ].filter(Boolean);
  const townSocialSystem = new TownSocialSystem({
    scene,
    player,
    petManager,
    participants: townPets,
    center: new THREE.Vector3(townCenter.x, 0, townCenter.z),
    worldObjects,
    objectPlacement,
    contentPort,
    generatedAssetRepository,
    runtimeStatus,
    camera,
    vfxService,
  });
  const townBuilderSystem = new TownBuilderSystem({
    scene,
    player,
    petManager,
    builder: petManager.pets.find(pet => pet._petId === 'builder_crab'),
    worldObjects,
    objectPlacement,
    objectEditor,
    contentPort,
    generatedAssetRepository,
    runtimeStatus,
    scaffoldModelJson: pastoralWork.modelJson,
    scaffoldAnimationPlan: pastoralWork.animationPlan,
    setDialogueLock: (locked, pet) => dialogueCamera.setDialogueLock(locked, pet),
    vfxService,
  });

  const forestTempleSystem = new ForestTempleSystem({
    scene,
    physics,
    player,
    petManager,
    dialogueSystem,
    trophyEntity: forest.trophy,
    tentEntity: forest.tent,
    trophyWaitPlan: forest.trophyWaitPlan,
    getPets: () => [bear, ...petManager.pets],
    onPetSpawned: pet => townSocialSystem.addParticipant(pet),
    runtimeStatus,
    contentPort,
    generatedAssetRepository,
    vfxService,
  });

  const anchors = [
    ['风车田园', worldObjects.findByName('风车')?.mesh.position],
    ['教堂城镇', worldObjects.findByName('哥特教堂')?.mesh.position],
    ['森林神殿', worldObjects.findByName('古老神殿')?.mesh.position],
  ].filter(([, position]) => position);

  return {
    pastoralSlice,
    townSocialSystem,
    townBuilderSystem,
    petPartyEvent: townSocialSystem,
    forestTempleSystem,
    vfxService,
    update(dt) {
      pastoralSlice.update(dt);
      townSocialSystem.update(dt);
      townBuilderSystem.update(dt);
      forestTempleSystem.update(dt);
      vfxService.update(dt);
    },
    interactTownPet(pet, dialogue) {
      return townBuilderSystem.isBuilder(pet)
        ? townBuilderSystem.interact(pet, dialogue)
        : townSocialSystem.interact(pet, dialogue);
    },
    getNearestRegionName(position) {
      let nearest = anchors[0];
      let nearestDistance = Infinity;
      for (const anchor of anchors) {
        const distance = position.distanceToSquared(anchor[1]);
        if (distance < nearestDistance) {
          nearest = anchor;
          nearestDistance = distance;
        }
      }
      return nearest?.[0] || '奇异岛';
    },
  };
}
