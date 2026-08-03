import * as THREE from 'three';
import { ArchitectNPC } from '../entities/ArchitectNPC.js';
import { getPetProfile } from '../data/petProfiles.js';
import { createChiiAssetRepository } from '../data/assetCatalog.js';
import { assignResidentIdentity, PET_MANAGER_RESIDENTS } from '../data/residentCatalog.js';
import { attachPetStateMachine } from '../../../gameplay/pets/PetStateMachine.js';
import { CHII_PET_HEIGHTS } from '../data/worldTuningProfile.js';

function makeBounds(x, z, range = 10) {
  return { minX: x - range, maxX: x + range, minZ: z - range, maxZ: z + range };
}

function randomIn(min, max) {
  return min + Math.random() * (max - min);
}

export class PetManager {
  constructor({
    scene,
    physics,
    petSpawns = {},
    petBehaviors = {},
    assetRepository = createChiiAssetRepository(),
    navigation = null,
  }) {
    this.scene = scene;
    this.physics = physics;
    this.petSpawns = petSpawns;
    this.petBehaviors = petBehaviors;
    this.assetRepository = assetRepository;
    this.navigation = navigation;
    this.placementGrid = null;
    this.pets = [];
  }

  setPlacementGrid(grid) {
    this.placementGrid = grid || null;
  }

  async load() {
    const assetLoads = [];
    for (const config of PET_MANAGER_RESIDENTS) {
      const pet = new ArchitectNPC();
      const spawn = this.petSpawns[config.spawnKey] || config.defaultSpawn;
      assignResidentIdentity(pet, config.id);
      pet._managedByPetManager = true;
      this._configurePet(pet, config, spawn);
      pet._initialInteractionDone = false;

      pet.setPosition(...spawn);
      pet.setOrigin(...spawn);
      pet.initPhysics(this.physics);
      this.scene.add(pet.mesh);
      this.pets.push(pet);

      assetLoads.push(this._loadPetAssets(pet, config));
    }
    await Promise.all(assetLoads);
  }

  async _loadPetAssets(pet, config) {
    try {
      const [modelJson, animations] = await Promise.all([
        this.assetRepository.getModel(config.assetId),
        this.assetRepository.getAnimations(config.assetId),
      ]);
      if (modelJson) {
        pet.loadModelFromJson(modelJson, {
          targetHeight: CHII_PET_HEIGHTS[config.assetId] || CHII_PET_HEIGHTS.generated,
        });
        if (pet._modelGroup) {
          pet._modelGroup.userData._baseScale = pet._modelGroup.scale.x;
          pet._modelGroup.userData._baseY = pet._modelGroup.position.y;
        }
      }

      for (const [name, plan] of Object.entries(animations)) pet.loadAnimation(name, plan);
      if (!pet._animPlans.jump && pet._animPlans.run) pet._animPlans.jump = pet._animPlans.run;
      if (!pet._animPlans.run && pet._animPlans.idle) pet._animPlans.run = pet._animPlans.idle;

      console.log(`[PetManager] ${config.id} ready:`, Object.keys(pet._animPlans).join(', '));
    } catch (error) {
      console.warn(`[PetManager] ${config.id} failed:`, error.message);
    }
  }

  _configurePet(pet, config, spawn) {
    const behavior = this.petBehaviors[config.spawnKey] || {};
    attachPetStateMachine(pet, behavior.initialState || config.initialState);
    pet._petRegion = behavior.region || config.region;
    pet._petBounds = behavior.bounds || makeBounds(spawn[0], spawn[2], 10);
    pet._nextPetActionAt = randomIn(1.0, 3.0);
    pet.setNavigation?.(this.navigation);
  }

  registerPet(pet, { name, profile = null, spawn, initialState = 'idle', region = 'pastoral', bounds = null, updateExternally = false } = {}) {
    if (!pet || this.pets.includes(pet)) return pet;
    const petName = name || pet._petName || pet.mesh?.name || 'pet';
    const origin = spawn || [pet.mesh.position.x, pet.mesh.position.y, pet.mesh.position.z];
    pet._petName = petName;
    pet._profile = profile || getPetProfile(petName);
    pet._managedByPetManager = true;
    attachPetStateMachine(pet, initialState).transition(initialState, { reason: 'pet-registered' });
    pet._petRegion = region;
    pet._petBounds = bounds || makeBounds(origin[0], origin[2], 10);
    pet._nextPetActionAt = randomIn(1.0, 3.0);
    pet._petManagerExternalUpdate = updateExternally;
    pet.setNavigation?.(this.navigation);
    this.pets.push(pet);
    return pet;
  }

  update(dt) {
    for (const pet of this.pets) {
      if (
        pet.petState?.is('free_roam')
        && !pet.petState.isBusy()
        && !pet._pastoralIdeaPending
      ) {
        this._updateRandomAction(pet, dt);
      }
      if (!pet._petManagerExternalUpdate) pet.update(dt);
    }
  }

  _updateRandomAction(pet, dt) {
    pet._nextPetActionAt -= dt;
    if (pet._nextPetActionAt > 0 || pet._targetPosition) return;

    const roll = Math.random();
    const idleThreshold = pet._petRegion === 'church_town' ? 0.48 : 0.42;
    if (roll < idleThreshold) {
      pet.stopWalking();
      pet.playAnimation('idle');
      pet._nextPetActionAt = randomIn(1.8, 3.8);
      return;
    }

    if (pet._petRegion === 'church_town' || roll < 0.78) {
      const b = pet._petBounds;
      let destination = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = {
          x: randomIn(b.minX, b.maxX),
          y: 0,
          z: randomIn(b.minZ, b.maxZ),
        };
        if (!this.placementGrid || this.placementGrid.isWorldPositionAvailable(candidate)) {
          destination = candidate;
          break;
        }
      }
      if (destination) {
        pet.walkTo(destination.x, destination.z, randomIn(2.5, 4.2));
      } else {
        pet.stopWalking();
        pet.playAnimation('idle');
      }
      pet._nextPetActionAt = randomIn(2.0, 4.0);
      return;
    }

    pet.stopWalking();
    pet.playAnimation('jump');
    pet._nextPetActionAt = randomIn(1.4, 2.8);
  }

  findNearest(position, range, predicate = null) {
    let best = null;
    let bestDist = range;
    for (const pet of this.pets) {
      if (predicate && !predicate(pet)) continue;
      const p = pet.getPosition();
      const bounds = pet._modelGroup
        ? new THREE.Box3().setFromObject(pet._modelGroup)
        : null;
      const nearestX = bounds && !bounds.isEmpty()
        ? THREE.MathUtils.clamp(position.x, bounds.min.x, bounds.max.x)
        : p.x;
      const nearestZ = bounds && !bounds.isEmpty()
        ? THREE.MathUtils.clamp(position.z, bounds.min.z, bounds.max.z)
        : p.z;
      const dx = nearestX - position.x;
      const dz = nearestZ - position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= bestDist) {
        best = { pet, dist, position: p, dx, dz };
        bestDist = dist;
      }
    }
    return best;
  }

  pauseNear(position, range) {
    for (const pet of this.pets) {
      if (pet.petState?.isBusy()) continue;
      if (pet.petState?.is('following')) continue;
      const p = pet.getPosition();
      const dx = p.x - position.x;
      const dz = p.z - position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= range) {
        pet.stopWalking();
        pet.lockFacing(position.x, position.z);
      } else if (dist > range + 1 && !pet.petState?.is('following')) {
        pet.unlockFacing();
      }
    }
  }

  resumePet(pet) {
    if (!pet || pet.petState?.is('following') || !pet.petState?.is('free_roam')) return;
    pet.unlockFacing();
    pet._nextPetActionAt = randomIn(0.5, 1.5);
  }
}
