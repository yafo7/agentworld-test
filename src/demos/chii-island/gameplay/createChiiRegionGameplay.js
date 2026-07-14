import * as THREE from 'three';
import { getGridWorldPosition } from '../../../engine/world/terrain.js';
import { createPastoralSlice } from '../systems/pastoralSlice.js';
import { PetPartyEvent } from '../systems/PetPartyEvent.js';
import { ForestTempleSystem } from '../systems/ForestTempleSystem.js';
import { clearAIWorldEvents } from '../../../storage/aiWorldState.js';

export async function createChiiRegionGameplay({
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
  center,
  gridSize,
  dialogueCamera,
  forest,
  pastoralWork,
  runtimeStatus,
  contentPort,
  generatedAssetRepository,
}) {
  clearAIWorldEvents();

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
  });

  const townCenterGrid = scenePlan.town?.center;
  const townCenter = townCenterGrid
    ? getGridWorldPosition(townCenterGrid.x, townCenterGrid.z, center[0], center[1], gridSize)
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
    center: new THREE.Vector3(townCenter.x, 0, townCenter.z),
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
    onPetSpawned: pet => petPartyEvent.addParticipant(pet),
    runtimeStatus,
    contentPort,
    generatedAssetRepository,
  });

  const anchors = [
    ['风车田园', worldObjects.findByName('风车')?.mesh.position],
    ['教堂城镇', worldObjects.findByName('哥特教堂')?.mesh.position],
    ['森林神殿', worldObjects.findByName('古老神殿')?.mesh.position],
  ].filter(([, position]) => position);

  return {
    pastoralSlice,
    petPartyEvent,
    forestTempleSystem,
    update(dt) {
      pastoralSlice.update(dt);
      petPartyEvent.update(dt);
      forestTempleSystem.update(dt);
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
