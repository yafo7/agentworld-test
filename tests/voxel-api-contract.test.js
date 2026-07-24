import assert from 'node:assert/strict';
import test from 'node:test';
import { generateModel, refineModel, VoxelApiError } from '../src/backend/voxelApi.js';

test('model generation sends the selected provider model and mode exactly once', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    return {
      ok: true,
      text: async () => 'data: {"stage":"result","done":true,"modelJson":{"nodes":[]},"timing":{"totalMs":12}}\n',
    };
  };

  const result = await generateModel('木制工具箱', 'gpt', 'voxel', { model: 'gpt-5.6-sol-high' });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    description: '木制工具箱', provider: 'gpt', mode: 'voxel', model: 'gpt-5.6-sol-high',
  });
  assert.deepEqual(result.metadata.timing, { totalMs: 12 });
});

test('structured backend errors retain code detail status and timing', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      ok: false,
      errorCode: 'AUTH_REQUIRED',
      message: 'missing credential',
      errorDetail: { phase: 'refine', timing: { totalMs: 4 } },
    }),
  });

  await assert.rejects(
    refineModel({ nodes: [] }, '增加藤蔓', 'gpt'),
    error => {
      assert.ok(error instanceof VoxelApiError);
      assert.equal(error.code, 'AUTH_REQUIRED');
      assert.equal(error.status, 401);
      assert.equal(error.detail.phase, 'refine');
      assert.deepEqual(error.timing, { totalMs: 4 });
      return true;
    }
  );
});
