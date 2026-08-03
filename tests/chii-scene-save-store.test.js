import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ChiiSceneSaveStore,
  CHII_SCENE_RECORD_SLOT_COUNT,
} from '../src/storage/ChiiSceneSaveStore.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test('scene save store isolates auto state and records by scene style', () => {
  const storage = memoryStorage();
  let now = 100;
  const store = new ChiiSceneSaveStore({ storage, now: () => now++ });

  store.saveAuto('voxel', { world: { generatedObjects: [{ saveId: 'voxel-object' }] } });
  store.saveAuto('pro', { world: { generatedObjects: [{ saveId: 'pro-object' }] } });
  store.saveRecord('voxel', 1, { world: { removedCurated: ['tree'] } });

  assert.equal(store.getAuto('voxel').world.generatedObjects[0].saveId, 'voxel-object');
  assert.equal(store.getAuto('pro').world.generatedObjects[0].saveId, 'pro-object');
  assert.equal(store.getRecord('pro', 1), null);
  assert.deepEqual(store.getRecord('voxel', 1).world.removedCurated, ['tree']);
  assert.equal(store.getRecords('voxel').length, CHII_SCENE_RECORD_SLOT_COUNT);
});
test('reset copies one frozen record into auto state without changing other records', () => {
  const storage = memoryStorage();
  let now = 200;
  const store = new ChiiSceneSaveStore({ storage, now: () => now++ });
  store.saveRecord('original', 0, { world: { generatedObjects: [{ saveId: 'kept' }] } });
  store.saveAuto('original', { world: { generatedObjects: [{ saveId: 'later' }] } });

  const restored = store.restoreRecord('original', 0);

  assert.equal(restored.world.generatedObjects[0].saveId, 'kept');
  assert.equal(store.getAuto('original').source, 'restored:1');
  assert.equal(store.getRecord('original', 0).world.generatedObjects[0].saveId, 'kept');
});
