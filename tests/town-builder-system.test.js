import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { attachPetStateMachine } from '../src/gameplay/pets/PetStateMachine.js';
import { ActivityReservationService } from '../src/gameplay/social/ActivityReservationService.js';
import {
  BUILDING_LOT_OPTIONS,
  TownBuilderSystem,
  createBuildingPrompt,
  toPlacementFootprint,
} from '../src/demos/chii-island/systems/TownBuilderSystem.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for test condition');
}

function createBuilderFixture(choiceResults, {
  onBuildingCompleted = null,
  reservations = new ActivityReservationService(),
} = {}) {
  const builder = {
    _petId: 'builder_crab',
    _petName: '螃蟹',
    mesh: new THREE.Group(),
    stopWalking() {},
    stopFollow() { this._followEnabled = false; },
    followTarget(target) { this._followEnabled = true; this._followTarget = target; },
    lockFacing() {},
    playAnimation() {},
    unlockFacing() {},
  };
  attachPetStateMachine(builder, 'free_roam');
  const scene = new THREE.Scene();
  const removed = [];
  const worldObjects = {
    add() {},
    remove(entity) { removed.push(entity); },
  };
  const objectPlacement = {
    grid: {
      subdivision: 2,
      terrainUnit: 4,
      cellSize: 2,
      findNearestAvailable(_position, footprint) {
        return { position: new THREE.Vector3(12, 0, 18), anchor: { x: 8, z: 9 }, footprint };
      },
    },
  };
  const placement = {
    position: new THREE.Vector3(12, 0, 18),
    anchor: { x: 8, z: 9 },
    footprint: { width: 6, depth: 8 },
  };
  const dialogue = {
    async askChoice() { return choiceResults.shift() || null; },
    async askInput() { return '红瓦木墙的小型宠物工坊'; },
    async say() { return true; },
  };
  const petManager = { resumePet() {} };
  const system = new TownBuilderSystem({
    scene,
    player: { mesh: new THREE.Group(), orientation: new THREE.Vector3(0, 0, 1) },
    petManager,
    builder,
    worldObjects,
    objectPlacement,
    objectEditor: { async openPlacementDraft() { return placement; } },
    contentPort: {},
    generatedAssetRepository: {},
    reservations,
    onBuildingCompleted,
  });
  return { builder, dialogue, removed, reservations, scene, system };
}

test('town building lots convert terrain tiles into placement-grid cells', () => {
  const lot = BUILDING_LOT_OPTIONS.find(option => option.key === '3x4');
  assert.deepEqual(toPlacementFootprint(lot, 2), { width: 6, depth: 8 });
  assert.deepEqual(toPlacementFootprint({ width: 5, depth: 5 }, 2), { width: 10, depth: 10 });
});

test('town building prompt preserves the request and includes the confirmed lot ratio', () => {
  assert.equal(
    createBuildingPrompt('红瓦木墙的小型宠物工坊', { width: 3, depth: 4 }),
    '红瓦木墙的小型宠物工坊，底部长宽比3比4，门高约一只宠物，主体按占地完整展开',
  );
});

test('town builder nothing choice preserves free roam', async () => {
  const fixture = createBuilderFixture([{ key: 'nothing' }]);
  assert.equal(await fixture.system.interact(fixture.builder, fixture.dialogue), false);
  assert.equal(fixture.builder._petState, 'free_roam');
  assert.equal(fixture.system.activeJob, null);
  assert.equal(fixture.reservations.ownerOf('pet:crab'), null);
});

test('town builder and town social share one resident reservation', async () => {
  const reservations = new ActivityReservationService();
  reservations.tryReserve('town-social-party', ['pet:crab']);
  const fixture = createBuilderFixture([{ key: 'build' }], { reservations });

  assert.equal(fixture.system.canInteract(fixture.builder), false);
  assert.equal(await fixture.system.interact(fixture.builder, fixture.dialogue), false);
  assert.equal(reservations.ownerOf('pet:crab'), 'town-social-party');

  reservations.release('town-social-party');
  assert.equal(fixture.system.canInteract(fixture.builder), true);
});

test('town builder holds the resident reservation until construction settles', async () => {
  const fixture = createBuilderFixture([
    { key: 'build' },
    { key: '3x4' },
    { key: 'confirm' },
  ]);
  let finishBuild;
  fixture.system._runBuild = () => new Promise(resolve => { finishBuild = resolve; });

  assert.equal(await fixture.system.interact(fixture.builder, fixture.dialogue), true);
  assert.equal(fixture.reservations.ownerOf('pet:crab'), 'town-builder');
  const activeJob = fixture.system.activeJob;
  finishBuild();
  await activeJob;
  assert.equal(fixture.reservations.ownerOf('pet:crab'), null);
});

test('town builder starts generation only after lot, placement and prompt confirmation', async () => {
  const fixture = createBuilderFixture([
    { key: 'build' },
    { key: '3x4' },
    { key: 'confirm' },
  ]);
  let work = null;
  fixture.system._runBuild = async spec => { work = spec; };

  assert.equal(await fixture.system.interact(fixture.builder, fixture.dialogue), true);
  assert.equal(fixture.builder._petState, 'working');
  assert.deepEqual(work.lot, BUILDING_LOT_OPTIONS[0]);
  assert.deepEqual(work.placement.footprint, { width: 6, depth: 8 });
  assert.equal(work.description, '红瓦木墙的小型宠物工坊');
});

test('town builder reports story progress only after a building is placed successfully', async () => {
  const completions = [];
  const fixture = createBuilderFixture([], {
    onBuildingCompleted: event => completions.push(event),
  });
  fixture.system._moveToWorkSide = async () => {};
  fixture.system._createScaffold = () => null;
  fixture.system.aiActions.createObject = async () => ({
    modelJson: { format: 2, name: 'Workshop', nodes: [], parts: [] },
    assetId: 'building-asset-1',
  });
  fixture.system._placeBuilding = () => ({
    _instanceId: 'town-building-1',
    id: 'town-building-1',
    name: 'Workshop',
    _generatedAssetId: 'building-asset-1',
    mesh: new THREE.Group(),
  });
  fixture.builder.petState.transition('working', { reason: 'test' });

  await fixture.system._runBuild({
    pet: fixture.builder,
    draft: null,
    placement: { position: new THREE.Vector3() },
    lot: { width: 3, depth: 4 },
    description: 'Workshop',
  });

  assert.deepEqual(completions, [{
    buildingId: 'town-building-1',
    buildingName: 'Workshop',
    assetId: 'building-asset-1',
    builderId: 'builder_crab',
    lot: { width: 3, depth: 4 },
  }]);

  const failed = createBuilderFixture([], {
    onBuildingCompleted: event => completions.push(event),
  });
  failed.system._moveToWorkSide = async () => {};
  failed.system._createScaffold = () => null;
  failed.system.aiActions.createObject = async () => { throw new Error('generation failed'); };
  failed.builder.petState.transition('working', { reason: 'test' });
  await assert.rejects(
    failed.system._runBuild({
      pet: failed.builder,
      draft: null,
      placement: { position: new THREE.Vector3() },
      lot: { width: 3, depth: 4 },
      description: 'Workshop',
    }),
    /generation failed/,
  );
  assert.equal(completions.length, 1);
});

test('disposed town builder is inert and cleans scaffold, reveal and reservation once', async () => {
  const fixture = createBuilderFixture([]);
  let releaseCount = 0;
  const release = fixture.reservations.release.bind(fixture.reservations);
  fixture.reservations.release = owner => {
    releaseCount += 1;
    return release(owner);
  };
  fixture.reservations.tryReserve('town-builder', ['pet:crab']);

  const scaffold = { mesh: new THREE.Group() };
  fixture.scene.add(scaffold.mesh);
  fixture.system.scaffold = scaffold;
  const revealContent = new THREE.Group();
  revealContent.scale.setScalar(0.2);
  fixture.system.reveals.push({
    entity: { _content: revealContent },
    scale: 1.75,
    time: 0.2,
  });
  const stoppedEffects = [];
  fixture.system.vfxService = { stop: key => stoppedEffects.push(key) };

  fixture.system.dispose();
  fixture.system.dispose();

  assert.equal(fixture.system.canInteract(fixture.builder), false);
  assert.equal(await fixture.system.interact(fixture.builder, {
    async askChoice() { throw new Error('dialogue must stay inactive'); },
  }), false);
  assert.equal(fixture.reservations.ownerOf('pet:crab'), null);
  assert.equal(releaseCount, 1);
  assert.equal(fixture.scene.children.includes(scaffold.mesh), false);
  assert.equal(fixture.system.scaffold, null);
  assert.equal(fixture.system.reveals.length, 0);
  assert.equal(revealContent.scale.x, 1.75);
  assert.deepEqual(stoppedEffects, ['town-builder-dust', 'town-builder-reveal']);

  let updates = 0;
  fixture.system.scaffold = { updateAnimation() { updates += 1; } };
  fixture.system.update(1);
  assert.equal(updates, 0);
});

test('dispose cancels an active placement draft and restores the interacting builder', async () => {
  const fixture = createBuilderFixture([
    { key: 'build' },
    { key: '3x4' },
  ]);
  const placementResult = deferred();
  let cancelCount = 0;
  let hideCount = 0;
  fixture.system.objectEditor = {
    placement: { active: null },
    openPlacementDraft(draft) {
      this.placement.active = { entity: draft };
      return placementResult.promise;
    },
    cancel() {
      cancelCount += 1;
      this.placement.active = null;
      placementResult.resolve(null);
      return true;
    },
  };
  fixture.dialogue.hide = () => { hideCount += 1; };

  const interaction = fixture.system.interact(fixture.builder, fixture.dialogue);
  await waitFor(() => fixture.system.activeDraft !== null);
  const draft = fixture.system.activeDraft;
  assert.equal(fixture.builder._petState, 'interacting');
  assert.equal(fixture.reservations.ownerOf('pet:crab'), 'town-builder');

  fixture.system.dispose();
  fixture.system.dispose();

  assert.equal(await interaction, false);
  assert.equal(cancelCount, 1);
  assert.equal(hideCount, 1);
  assert.equal(fixture.builder._petState, 'free_roam');
  assert.equal(fixture.system.activeDraft, null);
  assert.deepEqual(fixture.removed, [draft]);
  assert.equal(fixture.scene.children.includes(draft.mesh), false);
  assert.equal(fixture.reservations.ownerOf('pet:crab'), null);
});

test('dispose during backend generation prevents placement and story completion', async () => {
  const completions = [];
  const fixture = createBuilderFixture([], {
    onBuildingCompleted: event => completions.push(event),
  });
  const backend = deferred();
  const generationStarted = deferred();
  let placementCount = 0;
  let scaffoldDisposed = 0;
  const scaffold = {
    mesh: new THREE.Group(),
    _constructionBubble: { dispose() { scaffoldDisposed += 1; } },
  };
  fixture.system._moveToWorkSide = async () => {};
  fixture.system._createScaffold = () => {
    fixture.scene.add(scaffold.mesh);
    return scaffold;
  };
  fixture.system.aiActions.createObject = async () => {
    generationStarted.resolve();
    return backend.promise;
  };
  fixture.system._placeBuilding = () => {
    placementCount += 1;
    return {
      _instanceId: 'must-not-exist',
      name: 'Disposed building',
      mesh: new THREE.Group(),
    };
  };
  fixture.reservations.tryReserve('town-builder', ['pet:crab']);
  fixture.builder.petState.transition('working', { reason: 'test' });

  const build = fixture.system._runBuild({
    pet: fixture.builder,
    draft: null,
    placement: { position: new THREE.Vector3() },
    lot: { width: 3, depth: 4 },
    description: 'Workshop',
  });
  await generationStarted.promise;

  fixture.system.dispose();
  fixture.system.dispose();
  assert.equal(fixture.reservations.ownerOf('pet:crab'), null);
  assert.equal(fixture.builder._petState, 'free_roam');
  assert.equal(fixture.scene.children.includes(scaffold.mesh), false);
  assert.equal(scaffoldDisposed, 1);

  backend.resolve({
    modelJson: { format: 2, name: 'Workshop', nodes: [], parts: [] },
    assetId: 'building-after-dispose',
  });
  await assert.rejects(build, /disposed/);
  assert.equal(placementCount, 0);
  assert.deepEqual(completions, []);
});
