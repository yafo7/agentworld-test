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
    materialTagVocabulary: () => ({ version: 'test-tags' }),
    vfxTagVocabulary: () => ({ version: 'test-vfx', README: {}, presets: {} }),
  });

  await adapter.generateModel({ description: '木制工具箱', quality: 'voxel' });
  await adapter.refineModel({ modelJson: {}, description: '增加绿色藤蔓' });
  await adapter.mountPart({ primaryModelJson: {}, part: '花环', placement: '头部' });
  await adapter.generateAnimation({ modelJson: {}, description: '开心挥手', emitParticles: true });
  await adapter.chat({ messages: [{ role: 'user', content: '你好' }], profile: 'planner' });

  assert.deepEqual(calls[0].slice(1), ['木制工具箱', 'gpt', 'voxel', {
    model: 'gpt-5.6-sol-high', timeoutMs: 300000, materialTags: { version: 'test-tags' },
  }]);
  assert.equal(calls[1][3], 'gpt');
  assert.deepEqual(calls[1][4], { timeoutMs: 300000, materialTags: { version: 'test-tags' } });
  assert.deepEqual(calls[2].slice(2, 5), ['花环', '把花环加在头部', 'gpt']);
  assert.deepEqual(calls[2][5], { timeoutMs: 300000 });
  assert.equal(calls[3][4], 'gpt');
  assert.deepEqual(calls[3][6], {
    timeoutMs: 300000,
    vfxTags: { version: 'test-vfx', README: {}, presets: {} },
  });
  assert.equal(calls[4][2], 'deepseek');
});

test('content adapter passes model-library parts to mount without stringifying JSON', async () => {
  const calls = [];
  const partModel = { name: '锄头', _meta: { ai: { v: 1 } } };
  const adapter = new VoxelContentAdapter({
    api: {
      mountModel: async (...args) => {
        calls.push(args);
        return { modelJson: {} };
      },
    },
  });

  await adapter.mountPart({
    primaryModelJson: { _meta: { ai: { v: 1 } } },
    part: partModel,
    placement: '将木柄固定在右手掌心，锄刃朝前',
  });

  assert.equal(calls[0][1], partModel);
  assert.equal(calls[0][2], '将木柄固定在右手掌心，锄刃朝前');
  assert.equal(calls[0][3], 'gpt');
});

test('content adapter maps GPT Pro to the explicit voxel-pro backend mode', async () => {
  const calls = [];
  const adapter = new VoxelContentAdapter({
    api: {
      generateModel: async (...args) => {
        calls.push(args);
        return { modelJson: {} };
      },
    },
    materialTagVocabulary: () => ({ version: 'test-tags' }),
  });

  await adapter.generateModel({ description: '双眼灰绿双辫少女', quality: 'voxel-pro' });

  assert.deepEqual(calls[0], ['双眼灰绿双辫少女', 'gpt', 'voxel-pro', {
    model: 'gpt-5.6-sol-high',
    timeoutMs: 300000,
    materialTags: { version: 'test-tags' },
  }]);
});

test('content adapter rejects unknown semantic profiles instead of falling back', async () => {
  const calls = [];
  const adapter = new VoxelContentAdapter({
    api: {
      generateModel: async (...args) => { calls.push(args); return { modelJson: {} }; },
    },
    chat: async (...args) => { calls.push(args); return 'ok'; },
  });

  await assert.rejects(
    adapter.generateModel({ description: 'toolbox', quality: 'voxle' }),
    error => error instanceof TypeError
      && error.name === 'ContentPolicyError'
      && error.code === 'UNSUPPORTED_CONTENT_POLICY'
      && error.field === 'generateModel.quality',
  );
  await assert.rejects(
    adapter.chat({ messages: [{ role: 'user', content: 'plan' }], profile: 'planer' }),
    error => error instanceof TypeError
      && error.name === 'ContentPolicyError'
      && error.code === 'UNSUPPORTED_CONTENT_POLICY'
      && error.field === 'chat.profile',
  );
  assert.equal(calls.length, 0);
});

test('content adapter rejects transport overrides on semantic requests', async () => {
  const calls = [];
  const adapter = new VoxelContentAdapter({
    api: {
      generateModel: async (...args) => { calls.push(args); return { modelJson: {} }; },
    },
  });

  for (const [field, value] of [
    ['provider', 'fireworks'],
    ['model', 'gpt-5.6-sol-low'],
    ['mode', 'voxel-pro'],
  ]) {
    await assert.rejects(
      adapter.generateModel({ description: 'toolbox', quality: 'voxel', [field]: value }),
      error => error instanceof TypeError
        && error.name === 'ContentPolicyError'
        && error.code === 'UNSUPPORTED_CONTENT_POLICY'
        && error.field === `generateModel.${field}`,
    );
  }
  assert.equal(calls.length, 0);
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
