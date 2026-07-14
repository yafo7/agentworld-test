import * as THREE from 'three';

export class ChiiInteractionController {
  constructor({
    input,
    player,
    architect,
    bear,
    petManager,
    petPartyEvent,
    forestTempleSystem,
    bearHome,
    handlers,
    interactionRange = 5.2,
  }) {
    this.input = input;
    this.player = player;
    this.architect = architect;
    this.bear = bear;
    this.petManager = petManager;
    this.petPartyEvent = petPartyEvent;
    this.forestTempleSystem = forestTempleSystem;
    this.bearHome = bearHome;
    this.handlers = handlers;
    this.interactionRange = interactionRange;
    this.prompt = document.getElementById('interact-prompt');
    this.promptText = document.getElementById('interact-prompt-text');
  }

  update(enabled) {
    if (!enabled) {
      this.hidePrompt();
      return;
    }

    const playerPosition = this.player.mesh.position;
    const architectPosition = this.architect.getPosition();
    const bearPosition = this.bear.getPosition();
    const architectOffset = this._offset(architectPosition, playerPosition);
    const bearOffset = this._offset(bearPosition, playerPosition);
    const forestHit = this.forestTempleSystem.findInteraction(
      playerPosition,
      this.interactionRange + 0.8,
    );
    const townPetHit = this.petManager.findNearest(
      playerPosition,
      this.interactionRange,
      pet => this.petPartyEvent.canInteract(pet),
    );
    const regularPetHit = this.petManager.findNearest(
      playerPosition,
      this.interactionRange,
      pet => !this.petPartyEvent.isTownPet(pet),
    );

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
    if (townPetHit) addCandidate('town-pet', townPetHit.dist, townPetHit.position);
    if (!this.petPartyEvent.isTownPet(this.architect)) {
      addCandidate('architect', architectOffset.distance, architectPosition);
    }
    addCandidate('bear', bearOffset.distance, bearPosition);
    if (regularPetHit) addCandidate('pet', regularPetHit.dist, regularPetHit.position);
    candidates.sort((a, b) => a.score - b.score);

    this._updateNearbyPetFacing(playerPosition, bearOffset.distance);
    const target = candidates[0]?.type;
    if (!target) {
      this._resumeBearWhenFar(bearOffset.distance);
      this.hidePrompt();
      return;
    }

    if (target === 'forest') {
      this._show(forestHit.label);
      if (this.input.justPressed('KeyE')) this.handlers.onForest(forestHit);
      return;
    }

    if (target === 'town-pet') {
      const pet = townPetHit.pet;
      this._show(`与${pet._petName || '宠物'}对话`);
      pet.stopWalking?.();
      pet.lockFacing?.(playerPosition.x, playerPosition.z);
      if (this.input.justPressed('KeyE')) this.handlers.onTownPet(pet);
      return;
    }

    if (target === 'architect') {
      this._show('与fangk对话');
      if (this.input.justPressed('KeyE')) {
        this.handlers.onArchitect({
          architectPosition,
          playerPosition,
          dx: architectOffset.dx,
          dz: architectOffset.dz,
        });
      }
      return;
    }

    if (target === 'bear') {
      this._show('与momo对话');
      if (!this.bear.petState.isBusy()) {
        if (!this.bear._followEnabled && !this.bear.petState.is('free_roam')) this.bear.stopWalking();
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
    this._show(`与${pet._petName || '宠物'}对话`);
    if (!pet.petState?.isBusy()) {
      pet.stopWalking?.();
      pet.lockFacing?.(playerPosition.x, playerPosition.z);
    }
    if (this.input.justPressed('KeyE')) {
      this.handlers.onPet({ pet, hit: regularPetHit, playerPosition });
    }
  }

  _updateNearbyPetFacing(playerPosition, bearDistance) {
    if (bearDistance <= this.interactionRange + 2 && this.bear._wanderEnabled && !this.bear.petState.isBusy()) {
      this.bear.stopWalking();
      this.bear.lockFacing(playerPosition.x, playerPosition.z);
    } else if (
      bearDistance > this.interactionRange + 3
      && this.bear._wanderEnabled
      && !this.bear._followEnabled
      && !this.bear.petState.is('working')
    ) {
      this.bear.unlockFacing();
    }
    this.petManager.pauseNear(playerPosition, this.interactionRange + 2);
  }

  _resumeBearWhenFar(distance) {
    if (
      distance <= this.interactionRange + 3
      || this.bear._wanderEnabled
      || this.bear._followEnabled
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

  _show(label) {
    this.prompt?.classList.add('visible');
    if (this.promptText) this.promptText.textContent = label;
  }

  hidePrompt() {
    this.prompt?.classList.remove('visible');
  }
}

