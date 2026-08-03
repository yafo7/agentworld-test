import * as THREE from 'three';

export class ChiiInteractionController {
  constructor({
    input,
    player,
    bear,
    petManager,
    townSocialSystem = null,
    townBuilderSystem = null,
    pastoralSlice = null,
    forestTempleSystem,
    buildingInteriorSystem = null,
    objectPlacement = null,
    bearHome,
    handlers,
    interactionRange = 5.2,
  }) {
    this.input = input;
    this.player = player;
    this.bear = bear;
    this.petManager = petManager;
    this.townSocialSystem = townSocialSystem;
    this.townBuilderSystem = townBuilderSystem;
    this.pastoralSlice = pastoralSlice;
    this.forestTempleSystem = forestTempleSystem;
    this.buildingInteriorSystem = buildingInteriorSystem;
    this.objectPlacement = objectPlacement;
    this.bearHome = bearHome;
    this.handlers = handlers;
    this.interactionRange = interactionRange;
    this.prompt = document.getElementById('interact-prompt');
    this.promptKey = document.getElementById('interact-prompt-key');
    this.promptText = document.getElementById('interact-prompt-text');
    this.promptSecondary = document.getElementById('interact-prompt-secondary');
    this.promptSecondaryKey = document.getElementById('interact-prompt-secondary-key');
    this.promptSecondaryText = document.getElementById('interact-prompt-secondary-text');
    this.disposed = false;
  }

  update(enabled) {
    if (this.disposed) return;
    if (!enabled) {
      this.hidePrompt();
      return;
    }

    const playerPosition = this.player.mesh.position;
    const bearPosition = this.bear.getPosition();
    const bearOffset = this._offset(bearPosition, playerPosition);
    const forestHit = this.forestTempleSystem.findInteraction(
      playerPosition,
      this.interactionRange + 0.8,
    );
    const interiorHit = this.buildingInteriorSystem?.findInteraction(
      playerPosition,
      this.interactionRange + 0.8,
    ) || null;
    const townPetHit = this.petManager.findNearest(
      playerPosition,
      this.interactionRange,
      pet => this._canInteractWithTownPet(pet),
    );
    const regularPetHit = this.petManager.findNearest(
      playerPosition,
      this.interactionRange,
      pet => !this._isTownPet(pet),
    );
    const objectHit = this.objectPlacement?.findNearestEditable(playerPosition, this.interactionRange) || null;
    const entryEntity = interiorHit?.type === 'enter' ? interiorHit.entry?.entity : null;
    const entryObjectHit = entryEntity && this.objectPlacement?.isEditable(entryEntity)
      ? { entity: entryEntity, position: interiorHit.position, distance: interiorHit.distance }
      : null;
    const managementHit = entryObjectHit || objectHit;

    const candidates = [];
    const addCandidate = (type, distance, position) => {
      if (!position || distance > this.interactionRange + 0.8) return;
      const direction = new THREE.Vector3().subVectors(position, playerPosition);
      direction.y = 0;
      const facing = direction.lengthSq() > 0.001
        ? THREE.MathUtils.clamp(direction.normalize().dot(this.player.orientation), -1, 1)
        : 1;
      candidates.push({ type, score: distance + (1 - facing) * 1.4 });
    };

    if (forestHit) addCandidate('forest', forestHit.distance, forestHit.position);
    if (interiorHit) addCandidate('interior', interiorHit.distance, interiorHit.position);
    if (townPetHit) addCandidate('town-pet', townPetHit.dist, townPetHit.position);
    addCandidate('bear', bearOffset.distance, bearPosition);
    if (regularPetHit) addCandidate('pet', regularPetHit.dist, regularPetHit.position);
    candidates.sort((a, b) => a.score - b.score);

    this._updateNearbyPetFacing(playerPosition, bearOffset.distance);
    // A door in range always owns E. Object management remains available on F.
    const target = interiorHit ? 'interior' : candidates[0]?.type;
    const managementAction = managementHit
      ? { key: 'F', label: `管理“${managementHit.entity.name || '物件'}”` }
      : null;
    if (managementAction && this.input.justPressed('KeyF')) {
      this.handlers.onObject?.(managementHit.entity);
      return;
    }
    if (!target) {
      this._resumeBearWhenFar(bearOffset.distance);
      if (managementAction) {
        this._show(managementAction.label, managementAction.key);
        return;
      }
      this.hidePrompt();
      return;
    }

    if (target === 'forest') {
      this._show(forestHit.label, 'E', managementAction);
      if (this.input.justPressed('KeyE')) this.handlers.onForest(forestHit);
      return;
    }

    if (target === 'interior') {
      const interiorManagementAction = interiorHit.type === 'enter' ? managementAction : null;
      this._show(interiorHit.label, 'E', interiorManagementAction);
      if (this.input.justPressed('KeyE')) this.handlers.onInterior?.(interiorHit);
      return;
    }

    if (target === 'town-pet') {
      const pet = townPetHit.pet;
      const label = this.townBuilderSystem?.isBuilder(pet)
        && !this.townSocialSystem.isHandlingActivePet?.(pet)
        ? this.townBuilderSystem.getInteractionLabel(pet)
        : this.townSocialSystem.getInteractionLabel?.(pet);
      this._show(label || `与${pet._petName || '宠物'}对话`, 'E', managementAction);
      if (!pet.petState?.isBusy()) {
        pet.stopWalking?.();
        pet.lockFacing?.(playerPosition.x, playerPosition.z);
      }
      if (this.input.justPressed('KeyE')) this.handlers.onTownPet(pet);
      return;
    }

    if (target === 'bear') {
      this._show(
        this.pastoralSlice?.getInteractionLabel(this.bear) || '与momo对话',
        'E',
        managementAction,
      );
      if (!this.bear.petState.isBusy()) {
        if (!this.bear.petState.is('following') && !this.bear.petState.is('free_roam')) this.bear.stopWalking();
        this.bear.lockFacing(playerPosition.x, playerPosition.z);
      }
      if (this.input.justPressed('KeyE')) {
        this.handlers.onBear({
          pet: this.bear,
          petPosition: bearPosition,
          playerPosition,
          dx: bearOffset.dx,
          dz: bearOffset.dz,
        });
      }
      return;
    }

    const pet = regularPetHit.pet;
    this._show(
      this.pastoralSlice?.getInteractionLabel(pet)
      || `与${pet._petName || '宠物'}对话`,
      'E',
      managementAction,
    );
    if (!pet.petState?.isBusy()) {
      pet.stopWalking?.();
      pet.lockFacing?.(playerPosition.x, playerPosition.z);
    }
    if (this.input.justPressed('KeyE')) {
      this.handlers.onPet({ pet, hit: regularPetHit, playerPosition });
    }
  }

  _updateNearbyPetFacing(playerPosition, bearDistance) {
    if (bearDistance <= this.interactionRange + 2 && this.bear.petState.is('free_roam') && !this.bear.petState.isBusy()) {
      this.bear.stopWalking();
      this.bear.lockFacing(playerPosition.x, playerPosition.z);
    } else if (
      bearDistance > this.interactionRange + 3
      && this.bear.petState.is('free_roam')
      && !this.bear.petState.is('following')
      && !this.bear.petState.is('working')
    ) {
      this.bear.unlockFacing();
    }
    this.petManager.pauseNear(playerPosition, this.interactionRange + 2);
  }

  _resumeBearWhenFar(distance) {
    if (
      distance <= this.interactionRange + 3
      || this.bear.petState.is('free_roam')
      || this.bear.petState.is('following')
      || !this.bear.petState.is('free_roam')
    ) return;
    this.bear.enableWander(2, {
      minX: this.bearHome.x - 10,
      maxX: this.bearHome.x + 10,
      minZ: this.bearHome.z - 10,
      maxZ: this.bearHome.z + 10,
    });
  }

  _offset(position, origin) {
    const dx = position.x - origin.x;
    const dz = position.z - origin.z;
    return { dx, dz, distance: Math.sqrt(dx * dx + dz * dz) };
  }

  _isTownPet(pet) {
    return !!this.townBuilderSystem?.isBuilder(pet) || this.townSocialSystem.isTownPet(pet);
  }

  _canInteractWithTownPet(pet) {
    return !!this.townBuilderSystem?.canInteract(pet) || this.townSocialSystem.canInteract(pet);
  }

  _show(label, key = 'E', secondary = null) {
    this.prompt?.classList.add('visible');
    if (this.promptKey) this.promptKey.textContent = key;
    if (this.promptText) this.promptText.textContent = label;
    if (this.promptSecondary) this.promptSecondary.hidden = !secondary;
    if (secondary && this.promptSecondaryKey) this.promptSecondaryKey.textContent = secondary.key;
    if (secondary && this.promptSecondaryText) this.promptSecondaryText.textContent = secondary.label;
  }

  hidePrompt() {
    this.prompt?.classList.remove('visible');
    if (this.promptSecondary) this.promptSecondary.hidden = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.hidePrompt();
    this.handlers = {};
  }
}
