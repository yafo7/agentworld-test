import assert from 'node:assert/strict';
import test from 'node:test';
import { AIGenerationController } from '../src/gameplay/ai/AIGenerationController.js';
import { PromptCompiler } from '../src/gameplay/ai/prompts/PromptCompiler.js';
import { PROMPT_OPERATIONS } from '../src/gameplay/ai/prompts/PromptOperations.js';
import { PromptHistoryStore } from '../src/storage/PromptHistoryStore.js';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

function createController({ worldAuthoringPort = null } = {}) {
  const calls = [];
  const contentPort = {
    generateModel: async () => ({}),
    refineModel: async () => ({}),
    mountPart: async () => ({}),
    generateAnimation: async request => { calls.push(['animation', request]); return { plan: {} }; },
    chat: async request => { calls.push(['chat', request]); return '{}'; },
  };
  const actionService = {
    createObject: async request => { calls.push(['create', request]); return { assetId: 'asset-1', modelJson: {} }; },
    refineObject: async request => { calls.push(['refine', request]); return { assetId: 'asset-2', modelJson: {} }; },
    mountPart: async request => { calls.push(['mount', request]); return { assetId: 'asset-3', modelJson: {} }; },
  };
  const history = new PromptHistoryStore({ storage: storage(), scope: 'test' });
  return {
    calls,
    history,
    controller: new AIGenerationController({
      compiler: new PromptCompiler(), contentPort, actionService, worldAuthoringPort, history,
    }),
  };
}

test('generation controller prepares, approves, executes, and records a receipt', async () => {
  const { controller, calls, history } = createController();
  const prepared = await controller.prepare({
    operation: PROMPT_OPERATIONS.MODEL_GENERATE,
    rawText: '一个原木工具架，三层横梁，挂着木锤',
    approval: { required: true },
  });
  assert.equal(prepared.status, 'awaiting_approval');
  await assert.rejects(() => controller.execute(prepared), error => error.code === 'PROMPT_APPROVAL_REQUIRED');
  const completed = await controller.execute(prepared, { confirmed: true });
  assert.equal(completed.receipt.status, 'succeeded');
  assert.equal(completed.receipt.resultEvaluation.valid, true);
  assert.equal(calls[0][0], 'create');
  assert.equal(history.list({ status: 'succeeded' }).length, 1);
  const feedback = controller.addFeedback(completed.receipt.id, {
    accepted: false,
    reasons: ['比例错误'],
  });
  assert.equal(feedback.feedback.reasons[0], '比例错误');
  assert.deepEqual(controller.recommendFromFeedback(feedback.feedback), {
    action: 'adjust_size_profile',
    regenerate: false,
  });
});

test('generation history never serializes model JSON payloads', async () => {
  const { controller, history } = createController();
  await controller.prepare({
    operation: PROMPT_OPERATIONS.MODEL_REFINE,
    rawText: '保留苹果树结构，树冠改成蓝绿色',
    input: { modelJson: { privateFixture: 'must-not-enter-history', _meta: { ai: {} } } },
  });
  const serialized = JSON.stringify(history.list());
  assert.doesNotMatch(serialized, /must-not-enter-history/);
  assert.match(serialized, /\[model-json\]/);
});

test('WorldForge preview and commit stay separate and require confirmation', async () => {
  const calls = [];
  const worldAuthoringPort = {
    preview: async request => { calls.push(['preview', request]); return { operations: [{ type: 'terrain.generate' }] }; },
    commit: async request => { calls.push(['commit', request]); return { ok: true }; },
  };
  const { controller } = createController({ worldAuthoringPort });
  const prepared = await controller.prepare({
    operation: PROMPT_OPERATIONS.TERRAIN_REFINE,
    rawText: '在东侧增加一条弯曲河流',
    target: { mapId: 'map-1' },
  });
  const { result: preview } = await controller.execute(prepared);
  await assert.rejects(() => controller.commitWorld(prepared, preview), /明确确认/);
  await controller.commitWorld(prepared, preview, { confirmed: true });
  assert.deepEqual(calls.map(call => call[0]), ['preview', 'commit']);
});
