import assert from 'node:assert/strict';
import test from 'node:test';
import { CHII_MAIN_WORLD_ID } from '../src/demos/chii-island/data/worldForgeWorlds.js';
import {
  CHII_ACTIVE_WORLD_STORAGE_KEY,
  consumeActiveWorldId,
  getActiveWorldId,
  setActiveWorldId,
} from '../src/demos/chii-island/data/worldSelection.js';

function memoryStorage(initial = []) {
  const values = new Map(initial);
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('ordinary refresh returns to the Original main world', () => {
  const durable = memoryStorage([[CHII_ACTIVE_WORLD_STORAGE_KEY, 'wf-open-plain']]);
  const transitions = memoryStorage();

  assert.equal(consumeActiveWorldId(durable, transitions), CHII_MAIN_WORLD_ID);
  assert.equal(getActiveWorldId(durable), CHII_MAIN_WORLD_ID);
});

test('an explicit world transition survives exactly one reload', () => {
  const durable = memoryStorage();
  const transitions = memoryStorage();

  setActiveWorldId('wf-fresh-forest', durable, transitions);
  assert.equal(consumeActiveWorldId(durable, transitions), 'wf-fresh-forest');
  assert.equal(consumeActiveWorldId(durable, transitions), CHII_MAIN_WORLD_ID);
});
