import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearAIWorldEvents,
  getAIWorldEvents,
  recordAIWorldEvent,
} from '../src/storage/aiWorldState.js';

test('AI world events remain in memory and can be cleared with the scene', () => {
  clearAIWorldEvents();
  recordAIWorldEvent({ id: 'created:1', type: 'pastoral_create', assetId: 'asset-1' });

  assert.equal(getAIWorldEvents('pastoral_create').length, 1);

  clearAIWorldEvents();
  assert.deepEqual(getAIWorldEvents(), []);
});
