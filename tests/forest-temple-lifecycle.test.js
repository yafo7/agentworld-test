import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { attachPetStateMachine } from '../src/gameplay/pets/PetStateMachine.js';
import { ForestTempleSystem } from '../src/demos/chii-island/systems/ForestTempleSystem.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makePet(id) {
  const calls = {
    follow: 0,
    loadAnimation: 0,
    playAnimation: 0,
    stopWalking: 0,
    unlockFacing: 0,
  };
  const pet = {
    _petId: id,
    _petName: id,
    _animPlans: {},
    _originalModelJson: { format: 2, name: id, nodes: [], parts: [] },
    mesh: new THREE.Group(),
    stopFollow() {},
    stopWalking() { calls.stopWalking++; },
    unlockFacing() { calls.unlockFacing++; },
    followTarget() { calls.follow++; },
    loadAnimation(name, plan) {
      calls.loadAnimation++;
      this._animPlans[name] = plan;
    },
    playAnimation() { calls.playAnimation++; },
  };
  attachPetStateMachine(pet, 'following');
  return { pet, calls };
}

function makeSystem(overrides = {}) {
  const trophyMesh = new THREE.Group();
  const trophyModel = new THREE.Group();
  const trophyPart = new THREE.Object3D();
  trophyPart.name = 'trophy-part';
  trophyModel.add(trophyPart);

  return new ForestTempleSystem({
    scene: new THREE.Scene(),
    physics: {},
    player: { mesh: new THREE.Group() },
    petManager: { pets: [], registerPet() {} },
    dialogueSystem: {},
    trophyEntity: { mesh: trophyMesh, _modelGroup: trophyModel },
    tentEntity: { mesh: new THREE.Group() },
    trophyWaitPlan: null,
    getPets: () => [],
    contentPort: {},
    generatedAssetRepository: {},
    ...overrides,
  });
}

test('forest lifecycle disposal is idempotent and releases owned pet presentation', async () => {
  const summon = makePet('summon-pet');
  summon.pet.petState.enterTemporary('summoning_participant', 'following');
  const camping = makePet('camping-pet');
  camping.pet.petState.enterTemporary('camping', 'following');

  let particleDisposals = 0;
  const stoppedVfx = [];
  const system = makeSystem({
    vfxService: { stop: key => stoppedVfx.push(key) },
  });
  system._summoningPet = summon.pet;
  system.campingPet = camping.pet;
  system.campingParticles = { dispose: () => particleDisposals++ };
  system.tentState = 'camping';
  system.trophyState = 'summoning';

  const trophyPart = system.trophy._modelGroup.getObjectByName('trophy-part');
  const basePosition = new THREE.Vector3(1, 2, 3);
  system.trophyPoseMap = new Map([['trophy-part', {
    position: basePosition.clone(),
    rotation: new THREE.Euler(0.1, 0.2, 0.3),
    scale: new THREE.Vector3(2, 2, 2),
  }]]);
  trophyPart.position.set(9, 9, 9);

  system.dispose();
  system.dispose();

  assert.equal(system.trophyState, 'disposed');
  assert.equal(system.tentState, 'disposed');
  assert.equal(system._summoningPet, null);
  assert.equal(system.campingPet, null);
  assert.equal(summon.pet.petState.current, 'following');
  assert.equal(camping.pet.petState.current, 'following');
  assert.equal(summon.calls.follow, 1);
  assert.equal(camping.calls.follow, 1);
  assert.equal(particleDisposals, 1);
  assert.deepEqual(stoppedVfx, ['forest-temple-summon']);
  assert.deepEqual(trophyPart.position.toArray(), basePosition.toArray());

  assert.equal(system.getFollowingPet(), null);
  assert.equal(system.findInteraction(new THREE.Vector3()), null);
  assert.equal(await system.interact({ type: 'tent', pet: camping.pet }), false);
  assert.equal(await system.introducePet({ _hasIntroduced: false }), false);
  assert.deepEqual(await system.restoreSavedPets([{ assetId: 'saved-pet' }]), []);
});

test('disposed forest summon ignores a pending model response', async () => {
  const modelResult = deferred();
  const calls = {
    animations: 0,
    saveModel: 0,
    spawn: 0,
    notify: 0,
  };
  const system = makeSystem({
    contentPort: {
      generateModel: () => modelResult.promise,
      async generateAnimation() {
        calls.animations++;
        return { plan: {} };
      },
    },
    generatedAssetRepository: {
      async saveModel() {
        calls.saveModel++;
        return { assetId: 'late-pet' };
      },
      async saveAnimation() {},
    },
    onResidentSummoned: () => calls.notify++,
  });
  system._makeFinalPrompt = async () => 'small forest friend';
  system._makePetName = async () => 'Fern';
  system._makeSpecialPrompt = async () => 'wave';
  system._spawnGeneratedPet = () => {
    calls.spawn++;
    return null;
  };

  const summon = system._runSummon({ summonJobId: null, playerMoodWish: 'calm' });
  await Promise.resolve();
  system.dispose();
  modelResult.resolve({ modelJson: { format: 2, name: 'Late pet', nodes: [], parts: [] } });
  await summon;

  assert.deepEqual(calls, {
    animations: 0,
    saveModel: 0,
    spawn: 0,
    notify: 0,
  });
});

test('disposed camping operation ignores a pending animation and resumes its pet', async () => {
  const animationResult = deferred();
  const camper = makePet('camper');
  const completedJobs = [];
  const failedJobs = [];
  const system = makeSystem({
    getPets: () => [camper.pet],
    contentPort: {
      generateAnimation: () => animationResult.promise,
    },
    runtimeStatus: {
      startJob: () => 'camp-job',
      updateJob() {},
      completeJob: (...args) => completedJobs.push(args),
      failJob: (...args) => failedJobs.push(args),
    },
  });

  assert.equal(await system._interactTent(camper.pet), true);
  assert.equal(camper.pet.petState.current, 'camping');
  system.dispose();
  animationResult.resolve({ plan: { _duration: 3 } });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(camper.pet.petState.current, 'following');
  assert.equal(camper.calls.loadAnimation, 0);
  assert.equal(camper.calls.follow, 1);
  assert.deepEqual(completedJobs, []);
  assert.deepEqual(failedJobs, []);
});
