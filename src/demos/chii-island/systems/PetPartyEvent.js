import * as THREE from 'three';
import { ParticleSystem } from '../../../engine/animation/particles.js';

const PARTY_DURATION = 10;
const GATHER_TIMEOUT = 12;

const PARTY_SPARKLE_PLAN = {
  _duration: PARTY_DURATION,
  _loop: true,
  partyEmitter: {
    emit: {
      emitMode: 'point',
      mesh: 'icosahedron',
      meshSize: 0.16,
      rate: 22,
      lifetime: [0.8, 1.5],
      velocity: { dir: [0, 1, 0], speed: [1.1, 2.4], spread: 1.4 },
      acceleration: [0, -0.35, 0],
      colorStart: [1, 0.45, 0.15],
      colorEnd: [0.35, 0.7, 1],
      scaleStart: 1,
      scaleEnd: 0,
      offset: [0, 0.8, 0],
    },
  },
};

export class PetPartyEvent {
  constructor({ scene, player, petManager, participants, center }) {
    this.scene = scene;
    this.player = player;
    this.petManager = petManager;
    this.participants = participants;
    this.center = center.clone();
    this.active = false;
    this.phase = 'idle';
    this.elapsed = 0;
    this.slots = [];
    this.particleSystems = [];

    this.data = {
      type: 'party',
      participants: participants.map(pet => pet._petName),
      location: 'church_square',
      animation: 'dance',
      effect: 'sparkle',
      effectPrompt: '宠物围着篝火跳舞冒出彩色星星',
    };

    this.partyEmitter = new THREE.Object3D();
    this.partyEmitter.name = 'partyEmitter';
    this.partyEmitter.position.copy(this.center);
    this.scene.add(this.partyEmitter);
  }

  isTownPet(pet) {
    return this.participants.includes(pet);
  }

  canInteract(pet) {
    return this.isTownPet(pet)
      && !this.active
      && (pet._petState === 'free_roam' || pet._petState === 'following');
  }

  async interact(pet, dialogueSystem) {
    if (!this.canInteract(pet)) return false;

    const wasFollowing = pet._petState === 'following' || pet._followEnabled;
    pet._petState = 'interacting';
    pet.stopWalking?.();
    const options = [
      { key: 'party', label: '我们要一起办个派对吗？' },
      wasFollowing
        ? { key: 'free_roam', label: '今天随便做点自己喜欢的吧！' }
        : { key: 'follow', label: '和我一起玩吧！' },
      { key: 'nothing', label: '没什么' },
    ];
    const choice = await dialogueSystem.askChoice({
      speakerName: pet._petName || '宠物',
      text: '今天准备做点什么呢？',
      options,
    });

    if (choice?.key === 'party') {
      const confirmed = await dialogueSystem.say({
        speakerName: pet._petName || '宠物',
        text: '好呀好呀，我去叫大家一起来！',
      });
      if (!confirmed) {
        pet._petState = wasFollowing ? 'following' : 'free_roam';
        if (!wasFollowing) this.petManager.resumePet(pet);
        return false;
      }
      this.start();
      return true;
    }

    if (choice?.key === 'follow') {
      pet._petState = 'following';
      pet.followTarget?.(this.player.mesh, 3.0, 6.0);
      return true;
    }

    if (choice?.key === 'free_roam') {
      pet.stopFollow?.();
      pet._petState = 'free_roam';
      this.petManager.resumePet(pet);
      return true;
    }

    if (wasFollowing) {
      pet._petState = 'following';
      return false;
    }

    pet._petState = 'free_roam';
    this.petManager.resumePet(pet);
    return false;
  }

  start() {
    if (this.active) return false;
    this.active = true;
    this.phase = 'gathering';
    this.elapsed = 0;
    this.slots = this.participants.map((pet, index) => {
      const angle = (index / this.participants.length) * Math.PI * 2 - Math.PI / 2;
      return this.center.clone().add(new THREE.Vector3(Math.cos(angle) * 6.8, 0, Math.sin(angle) * 6.8));
    });

    this.participants.forEach((pet, index) => {
      pet.stopFollow?.();
      pet.disableWander?.();
      pet.unlockFacing?.();
      pet._petState = 'performing';
      pet.walkTo?.(this.slots[index].x, this.slots[index].z, 4.2);
    });
    return true;
  }

  update(dt) {
    if (!this.active) return;
    this.elapsed += dt;

    if (this.phase === 'gathering') {
      const arrived = this.participants.every(pet => !pet._targetPosition);
      if (arrived) {
        this._beginDance();
      } else if (this.elapsed >= GATHER_TIMEOUT) {
        this.participants.forEach((pet, index) => {
          pet.setPosition(this.slots[index].x, 0, this.slots[index].z);
          pet.stopWalking?.();
        });
        this._beginDance();
      }
      return;
    }

    if (this.phase === 'dancing') {
      for (let i = 0; i < this.particleSystems.length; i++) {
        const root = i < this.participants.length
          ? this.participants[i]._modelGroup
          : this.partyEmitter;
        this.particleSystems[i].update(dt, root);
      }
      if (this.elapsed >= PARTY_DURATION) this.finish();
    }
  }

  _beginDance() {
    this.phase = 'dancing';
    this.elapsed = 0;
    this._disposeParticles();

    for (const pet of this.participants) {
      pet.stopWalking?.();
      pet.lockFacing?.(this.center.x, this.center.z);
      pet.playAnimation?.(pet._animPlans?.dance ? 'dance' : (pet._animPlans?.jump ? 'jump' : 'idle'));

      const dancePlan = pet._animPlans?.dance;
      if (dancePlan && pet._modelGroup) {
        const particles = new ParticleSystem(this.scene);
        particles.setup(dancePlan, pet._modelGroup);
        this.particleSystems.push(particles);
      } else {
        this.particleSystems.push(new ParticleSystem(this.scene));
      }
    }

    const sparkle = new ParticleSystem(this.scene);
    sparkle.setup(PARTY_SPARKLE_PLAN, this.partyEmitter);
    this.particleSystems.push(sparkle);
  }

  finish() {
    if (!this.active) return;
    this._disposeParticles();
    for (const pet of this.participants) {
      pet.stopWalking?.();
      pet.unlockFacing?.();
      pet._petState = 'free_roam';
      pet.playAnimation?.('idle');
      this.petManager.resumePet(pet);
    }
    this.active = false;
    this.phase = 'idle';
    this.elapsed = 0;
  }

  _disposeParticles() {
    for (const particles of this.particleSystems) particles.dispose();
    this.particleSystems = [];
  }

  dispose() {
    this.finish();
    this.scene.remove(this.partyEmitter);
  }
}
