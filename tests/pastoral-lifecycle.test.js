import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { attachPetStateMachine } from '../src/gameplay/pets/PetStateMachine.js';
import { createPastoralSlice } from '../src/demos/chii-island/systems/pastoralSlice.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function makePet(id, position = [0, 0, 0]) {
  const pet = {
    _petId: id,
    _petName: id,
    _profile: { id },
    _animPlans: {},
    _originalModelJson: { format: 2, name: id, nodes: [], parts: [] },
    _initialInteractionDone: true,
    mesh: new THREE.Group(),
    stopFollow() {},
    disableWander() {},
    stopWalking() { this._targetPosition = null; },
    unlockFacing() {},
    lockFacing() {},
    walkTo() { this._targetPosition = null; },
    playAnimation() {},
    replaceModelFromJson(modelJson) { this._originalModelJson = modelJson; return true; },
  };
  pet.mesh.position.set(...position);
  attachPetStateMachine(pet, 'idle');
  return pet;
}

test('pastoral dispose aborts pending work before world mutation and restores its pet', async () => {
  const backend = deferred();
  const backendStarted = deferred();
  const worker = makePet('momo');
  const target = makePet('target', [2, 0, 0]);
  const originalModel = target._originalModelJson;
  const choices = [{ key: 'refine' }, { key: 'confirm_target' }, { key: 'confirm_work' }];
  const stoppedVfx = [];
  let bubbleDisposals = 0;
  let worldChanges = 0;
  const slice = createPastoralSlice({
    scene: new THREE.Scene(),
    player: { mesh: new THREE.Group() },
    staticEntities: [],
    worldObjects: { items: [], getMetadata() { return {}; } },
    pets: [worker, target],
    dialogueSystem: {
      async askChoice() { return choices.shift() || null; },
      async askInput() { return 'brighter leaves'; },
    },
    contentPort: {
      async refineModel() {
        backendStarted.resolve();
        return backend.promise;
      },
    },
    generatedAssetRepository: {
      async saveModel() { return { assetId: 'late-refine' }; },
    },
    bubblePresenter: {
      clearHint() {},
      setHint() {},
      update() {},
      dispose() { bubbleDisposals += 1; },
    },
    vfxService: {
      playPreset(name) { return `pastoral-test:${name}:${Math.random()}`; },
      stop(key) { stoppedVfx.push(key); return true; },
    },
    onWorldChanged() { worldChanges += 1; },
  });

  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = callback => {
    queueMicrotask(callback);
    return 1;
  };
  try {
    const interaction = slice.interact(worker);
    await backendStarted.promise;
    assert.equal(worker.petState.current, 'working');

    slice.dispose();
    slice.dispose();
    assert.equal(worker.petState.current, 'idle');

    backend.resolve({ modelJson: { format: 2, name: 'late', nodes: [], parts: [] } });
    await assert.rejects(interaction, error => error?.code === 'PET_WORK_ABORTED');

    assert.equal(target._originalModelJson, originalModel);
    assert.equal(worldChanges, 0);
    assert.equal(bubbleDisposals, 1);
    assert.ok(stoppedVfx.some(key => key.startsWith('pastoral-test:workStart:')));
    assert.ok(stoppedVfx.some(key => key.startsWith('pastoral-test:dust:')));
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    slice.dispose();
  }
});

test('pastoral dispose removes temporary effects and restores reveal transforms', async () => {
  const scene = new THREE.Scene();
  const worker = makePet('momo');
  const target = makePet('target', [2, 0, 0]);
  target.mesh.rotation.y = 0.42;
  const choices = [{ key: 'refine' }, { key: 'confirm_target' }, { key: 'confirm_work' }];
  let bubbleDisposals = 0;
  const slice = createPastoralSlice({
    scene,
    player: { mesh: new THREE.Group() },
    staticEntities: [],
    worldObjects: { items: [], getMetadata() { return {}; } },
    pets: [worker, target],
    dialogueSystem: {
      async askChoice() { return choices.shift() || null; },
      async askInput() { return 'brighter leaves'; },
    },
    contentPort: {
      async refineModel() {
        return { modelJson: { format: 2, name: 'refined', nodes: [], parts: [] } };
      },
    },
    generatedAssetRepository: {
      async saveModel() { return { assetId: 'refined-now' }; },
    },
    bubblePresenter: {
      clearHint() {},
      setHint() {},
      update() {},
      dispose() { bubbleDisposals += 1; },
    },
  });

  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = callback => {
    queueMicrotask(callback);
    return 1;
  };
  try {
    await slice.interact(worker);
    assert.ok(scene.children.length > 0);
    assert.equal(target.mesh.scale.x, 0.82);

    slice.dispose();

    assert.equal(scene.children.length, 0);
    assert.equal(target.mesh.scale.x, 1);
    assert.equal(target.mesh.rotation.y, 0.42);
    assert.equal(bubbleDisposals, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    slice.dispose();
  }
});
