import assert from 'node:assert/strict';
import test from 'node:test';
import { VoxelContentAdapter } from '../src/integrations/content/VoxelContentAdapter.js';
import { LocalRuntimeAssetRepository } from '../src/assets/repositories/LocalRuntimeAssetRepository.js';

test('content adapter hides provider selection behind semantic profiles', async () => {
  const calls = [];
  const adapter = new VoxelContentAdapter({
    api: {
      generateModel: async (...args) => { calls.push(['generate', ...args]); return { modelJson: {} }; },
      refineModel: async (...args) => { calls.push(['refine', ...args]); return { modelJson: {} }; },
      mountModel: async (...args) => { calls.push(['mount', ...args]); return { modelJson: {} }; },
      generateAnimation: async (...args) => { calls.push(['animation', ...args]); return { plan: {} }; },
    },
    chat: async (...args) => { calls.push(['chat', ...args]); return 'ok'; },
  });

  await adapter.generateModel({ description: '木制工具箱', quality: 'voxel' });
  await adapter.refineModel({ modelJson: {}, description: '增加绿色藤蔓' });
  await adapter.mountPart({ primaryModelJson: {}, part: '花环', placement: '头部' });
  await adapter.generateAnimation({ modelJson: {}, description: '开心挥手', emitParticles: true });
  await adapter.chat({ messages: [{ role: 'user', content: '你好' }], profile: 'planner' });

  assert.deepEqual(calls[0].slice(1), ['木制工具箱', 'gpt', 'voxel']);
  assert.equal(calls[1][3], 'gpt');
  assert.deepEqual(calls[2].slice(2), ['花环', '把花环加在头部', 'gpt']);
  assert.equal(calls[3][4], 'gpt');
  assert.equal(calls[4][2], 'deepseek');
});

test('local runtime repository resolves aliases without Studio metadata', async () => {
  const requests = [];
  const repository = new LocalRuntimeAssetRepository({
    catalog: { momo: { model: 'generated/models/momo.json', animations: { idle: 'generated/animations/momo_idle.json' } } },
    fetchImpl: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => ({ source: url }) };
    },
  });

  assert.deepEqual(await repository.getModel('momo'), { source: '/generated/models/momo.json' });
  assert.deepEqual(await repository.getAnimations('momo'), {
    idle: { source: '/generated/animations/momo_idle.json' },
  });
  assert.deepEqual(requests, ['/generated/models/momo.json', '/generated/animations/momo_idle.json']);
});

test('local runtime repository invokes browser fetch with the global receiver', async () => {
  const catalog = { receiverAsset: { model: '/receiver-check.json', animations: {} } };
  const fetchImpl = function fetchWithReceiver() {
    assert.equal(this, globalThis);
    return Promise.resolve({ ok: true, json: async () => ({ name: 'receiver-ok' }) });
  };
  const repository = new LocalRuntimeAssetRepository({ catalog, fetchImpl });
  const model = await repository.getModel('receiverAsset');
  assert.equal(model.name, 'receiver-ok');
});
