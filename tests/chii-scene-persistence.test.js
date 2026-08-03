import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WorldObjectRegistry } from '../src/world/WorldObjectRegistry.js';
import { ChiiSceneSaveStore } from '../src/storage/ChiiSceneSaveStore.js';
import { ChiiScenePersistenceSystem } from '../src/demos/chii-island/systems/ChiiScenePersistenceSystem.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
  };
}

function entity(id, position = [0, 0, 0]) {
  const mesh = new THREE.Group();
  const content = new THREE.Group();
  mesh.add(content);
  mesh.position.set(...position);
  mesh.name = id;
  mesh.userData.placementEditable = true;
  return {
    id,
    name: id,
    tags: ['Object'],
    category: 'decor',
    mesh,
    _content: content,
    _instanceId: `instance-${id}`,
  };
}

function createHarness({ storage, repository, originalEntities }) {
  const scene = new THREE.Scene();
  const worldObjects = new WorldObjectRegistry();
  const staticEntities = worldObjects.items;
  for (const item of originalEntities) {
    scene.add(item.mesh);
    worldObjects.add(item, {
      assetId: `curated-${item.id}`,
      operation: 'original',
      placement: {
        source: 'curated',
        anchor: { x: 1, z: 1 },
        footprint: { width: 2, depth: 2 },
      },
    });
  }
  const store = new ChiiSceneSaveStore({ storage, now: () => 500 });
  const system = new ChiiScenePersistenceSystem({
    sceneStyle: 'voxel',
    store,
    worldObjects,
    scene,
    generatedAssetRepository: repository,
    createEntity(snapshot, modelJson) {
      const restored = entity(snapshot.id || snapshot.saveId);
      restored._modelJson = modelJson;
      return restored;
    },
    replaceEntityModel({ entity: target, modelJson }) {
      target._modelJson = modelJson;
      return true;
    },
  });
  return { scene, staticEntities, worldObjects, store, system };
}

test('scene persistence restores curated edits, deletion, and generated objects', async () => {
  const storage = memoryStorage();
  const models = new Map([
    ['refined-house', { name: 'refined house' }],
    ['generated-chair', { name: 'generated chair' }],
  ]);
  const repository = { async get(id) { return { modelJson: models.get(id) || null, animations: [] }; } };
  const house = entity('house');
  const tree = entity('tree', [8, 0, 8]);
  const first = createHarness({ storage, repository, originalEntities: [house, tree] });

  house.mesh.position.set(4, 0, -6);
  house._content.scale.setScalar(1.5);
  first.worldObjects.updateMetadata(house, {
    assetId: 'refined-house',
    operation: 'refine',
  });
  first.worldObjects.remove(tree);
  first.scene.remove(tree.mesh);
  const chair = entity('chair', [3, 0, 2]);
  first.scene.add(chair.mesh);
  first.worldObjects.add(chair, {
    assetId: 'generated-chair',
    operation: 'generate',
    placement: {
      source: 'generated',
      anchor: { x: 4, z: 5 },
      footprint: { width: 1, depth: 1 },
    },
  });
  first.system.saveNow('test');
  const stored = first.store.getAuto('voxel');
  assert.equal(stored.worldVersion, 2);
  assert.deepEqual(stored.world.generatedObjects[0].modelSource, {
    type: 'asset',
    assetId: 'generated-chair',
  });
  assert.equal(JSON.stringify(stored.world.generatedObjects).includes('generated chair'), false);

  const freshHouse = entity('house');
  const freshTree = entity('tree', [8, 0, 8]);
  const second = createHarness({
    storage,
    repository,
    originalEntities: [freshHouse, freshTree],
  });
  const result = await second.system.restoreAuto();

  assert.equal(result.restored, true);
  assert.equal(result.removed, 1);
  assert.equal(result.changed, 1);
  assert.equal(result.generated, 1);
  assert.deepEqual(freshHouse.mesh.position.toArray(), [4, 0, -6]);
  assert.equal(freshHouse._content.scale.x, 1.5);
  assert.equal(freshHouse._modelJson.name, 'refined house');
  assert.equal(second.worldObjects.items.includes(freshTree), false);
  const restoredChair = second.worldObjects.findById('chair');
  assert.equal(second.staticEntities.length, second.worldObjects.items.length);
  assert.equal(second.staticEntities.filter(item => item === restoredChair).length, 1);
  assert.equal(restoredChair._modelJson.name, 'generated chair');
  assert.deepEqual(restoredChair.mesh.position.toArray(), [3, 0, 2]);
  assert.deepEqual(
    second.worldObjects.getMetadata(restoredChair).placement.footprint,
    { width: 1, depth: 1 },
  );
});
test('temporary social objects and temporary mounts are not frozen into saves', () => {
  const storage = memoryStorage();
  const repository = { async get() { return { modelJson: null, animations: [] }; } };
  const campfire = entity('campfire');
  const harness = createHarness({ storage, repository, originalEntities: [campfire] });
  const eventProp = entity('party-table');
  harness.worldObjects.add(eventProp, {
    assetId: 'party-table',
    operation: 'generate',
    placement: { source: 'social_event' },
  });
  harness.worldObjects.updateMetadata(campfire, {
    assetId: 'temporary-lantern',
    operation: 'mount',
    persistenceMode: 'temporary',
    persistenceOriginal: {
      assetId: 'curated-campfire',
      operation: 'original',
    },
  });

  const snapshot = harness.system.captureSnapshot();

  assert.equal(snapshot.world.generatedObjects.length, 0);
  assert.equal(snapshot.world.curatedChanges.length, 0);
});

test('new snapshots reject persistent generated objects without repository identity', () => {
  const storage = memoryStorage();
  const repository = { async get() { return { modelJson: null, animations: [] }; } };
  const harness = createHarness({ storage, repository, originalEntities: [] });
  const orphan = entity('orphan');
  harness.worldObjects.add(orphan, {
    operation: 'generate',
    modelJson: { name: 'must not be inlined' },
    placement: { source: 'generated' },
  });

  assert.throws(
    () => harness.system.captureSnapshot(),
    /has no persisted assetId/,
  );
});

test('legacy inline model snapshots remain readable but are never emitted again', async () => {
  const storage = memoryStorage();
  const migrated = [];
  const repository = {
    async get() { return { modelJson: null, animations: [] }; },
    async saveModel(model) {
      migrated.push(model);
      return { assetId: 'migrated-legacy-object' };
    },
  };
  const harness = createHarness({ storage, repository, originalEntities: [] });
  harness.store.saveAuto('voxel', {
    sceneStyle: 'voxel',
    worldVersion: 1,
    world: {
      removedCurated: [],
      curatedChanges: [],
      generatedObjects: [{
        saveId: 'generated:legacy',
        kind: 'generated',
        instanceId: 'legacy',
        id: 'legacy-object',
        name: 'legacy-object',
        tags: ['Object'],
        category: 'decor',
        transform: {},
        userData: {},
        metadata: { operation: 'generate', assetId: null, placement: {} },
        modelSource: { type: 'inline', modelJson: { name: 'legacy-inline' } },
      }],
    },
    aiEvents: [],
  });

  const result = await harness.system.restoreAuto();
  assert.equal(result.generated, 1);
  assert.equal(harness.worldObjects.findById('legacy-object')._modelJson.name, 'legacy-inline');
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].modelJson.name, 'legacy-inline');
  assert.deepEqual(
    harness.system.captureSnapshot().world.generatedObjects[0].modelSource,
    { type: 'asset', assetId: 'migrated-legacy-object' },
  );
});
