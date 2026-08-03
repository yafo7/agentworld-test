import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { attachPetStateMachine } from '../src/gameplay/pets/PetStateMachine.js';
import { createPastoralSlice } from '../src/demos/chii-island/systems/pastoralSlice.js';
import { ForestTempleSystem } from '../src/demos/chii-island/systems/ForestTempleSystem.js';

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

function makePastoralFixture({ fail = false, onWorldChanged }) {
  const worker = makePet('momo');
  const target = makePet('target-pet', [2, 0, 0]);
  const choices = [{ key: 'refine' }, { key: 'confirm_target' }, { key: 'confirm_work' }];
  const slice = createPastoralSlice({
    scene: new THREE.Scene(),
    player: { mesh: new THREE.Group() },
    staticEntities: [],
    worldObjects: {
      items: [],
      getMetadata() { return {}; },
    },
    pets: [worker, target],
    dialogueSystem: {
      async askChoice() { return choices.shift() || null; },
      async askInput() { return 'brighter leaves'; },
    },
    contentPort: {
      async refineModel() {
        if (fail) throw new Error('refine failed');
        return { modelJson: { format: 2, name: 'refined', nodes: [], parts: [] } };
      },
    },
    generatedAssetRepository: {
      async saveModel() { return { assetId: 'refined-asset-1' }; },
    },
    bubblePresenter: {
      clearHint() {},
      setHint() {},
      update() {},
      dispose() {},
    },
    vfxService: { playPreset() {} },
    onWorldChanged,
  });
  return { slice, worker };
}

test('pastoral reports story progress only after AI work applies successfully', async () => {
  const completions = [];
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => {
    queueMicrotask(callback);
    return 0;
  };
  try {
    const successful = makePastoralFixture({
      onWorldChanged: event => completions.push(event),
    });
    await successful.slice.interact(successful.worker);
    assert.deepEqual(completions, [{
      action: 'refine',
      residentId: 'momo',
      targetId: 'target-pet',
      assetId: 'refined-asset-1',
    }]);

    const failed = makePastoralFixture({
      fail: true,
      onWorldChanged: event => completions.push(event),
    });
    await assert.rejects(failed.slice.interact(failed.worker), /refine failed/);
    assert.equal(completions.length, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

function makeForestSystem({ fail = false, onResidentSummoned }) {
  const system = new ForestTempleSystem({
    scene: new THREE.Scene(),
    physics: {},
    player: { mesh: new THREE.Group() },
    petManager: {},
    dialogueSystem: {},
    trophyEntity: null,
    tentEntity: null,
    trophyWaitPlan: null,
    getPets: () => [],
    onResidentSummoned,
    contentPort: {
      async generateModel() {
        if (fail) throw new Error('summon failed');
        return { modelJson: { format: 2, name: 'Summoned', nodes: [], parts: [] } };
      },
      async generateAnimation({ description }) {
        return { plan: { description, _duration: 2, _loop: true } };
      },
    },
    generatedAssetRepository: {
      async saveModel() { return { assetId: 'forest-pet-1' }; },
      async saveAnimation() {},
    },
  });
  system._makeFinalPrompt = async () => 'small forest friend';
  system._makePetName = async () => 'Fern';
  system._makeSpecialPrompt = async () => 'wave';
  system._spawnGeneratedPet = ({ petName, assetId }) => {
    const mesh = new THREE.Group();
    mesh.position.set(1, 0, 2);
    return {
      _petId: assetId,
      _petName: petName,
      _generatedAssetId: assetId,
      mesh,
    };
  };
  return system;
}

test('forest summon reports story progress only after model, animations and persistence succeed', async () => {
  const completions = [];
  const successful = makeForestSystem({
    onResidentSummoned: event => completions.push(event),
  });
  await successful._runSummon({ summonJobId: null, playerMoodWish: 'calm' });
  assert.deepEqual(completions, [{
    residentId: 'forest-pet-1',
    residentName: 'Fern',
    assetId: 'forest-pet-1',
  }]);

  const failed = makeForestSystem({
    fail: true,
    onResidentSummoned: event => completions.push(event),
  });
  await assert.rejects(
    failed._runSummon({ summonJobId: null, playerMoodWish: 'calm' }),
    /summon failed/,
  );
  assert.equal(completions.length, 1);
});
