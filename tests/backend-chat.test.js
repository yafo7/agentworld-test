import test from 'node:test';
import assert from 'node:assert/strict';
import { callBackendChat } from '../src/backend/chatApi.js';

test('JSON chat explicitly disables the backend streaming default', async t => {
  let payload;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, content: '{"proposals":[]}' }) };
  });
  assert.equal(await callBackendChat([{ role: 'user', content: '安排' }], 'gpt'), '{"proposals":[]}');
  assert.equal(payload.stream, false);
  assert.equal(payload.provider, 'gpt');
});
