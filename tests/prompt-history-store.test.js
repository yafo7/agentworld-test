import assert from 'node:assert/strict';
import test from 'node:test';
import { PromptHistoryStore } from '../src/storage/PromptHistoryStore.js';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('prompt history isolates scopes, filters records, and attaches explicit feedback', () => {
  const storage = memoryStorage();
  const original = new PromptHistoryStore({ storage, scope: 'original' });
  const forge = new PromptHistoryStore({ storage, scope: 'forge' });
  original.append({ id: 'receipt-1', operation: 'model.generate', status: 'succeeded' });
  original.append({ id: 'receipt-2', operation: 'model.refine', status: 'failed' });
  forge.append({ id: 'receipt-3', operation: 'terrain.refine', status: 'succeeded' });

  assert.equal(original.list().length, 2);
  assert.equal(forge.list().length, 1);
  assert.deepEqual(original.list({ status: 'failed' }).map(item => item.id), ['receipt-2']);

  const updated = original.addFeedback('receipt-1', {
    accepted: false,
    reasons: ['比例错误', '结构错误', '比例错误'],
    note: '桌子比宠物还高',
  });
  assert.equal(updated.feedback.accepted, false);
  assert.deepEqual(updated.feedback.reasons, ['比例错误', '结构错误']);
});

test('prompt history applies a bounded local retention policy', () => {
  const store = new PromptHistoryStore({ storage: memoryStorage(), scope: 'test', limit: 20 });
  for (let index = 0; index < 28; index += 1) {
    store.append({ id: `record-${index}`, operation: 'model.generate', status: 'prepared' });
  }
  const records = store.list();
  assert.equal(records.length, 20);
  assert.equal(records[0].id, 'record-8');
  assert.equal(records.at(-1).id, 'record-27');
});
