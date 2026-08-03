import assert from 'node:assert/strict';
import test from 'node:test';
import { AIWorldActionService } from '../src/gameplay/ai/AIWorldActionService.js';
import {
  PetWorkCoordinator,
  PetWorkAbortedError,
} from '../src/gameplay/ai/PetWorkCoordinator.js';

test('AI world action service applies semantic operations and persists their results', async () => {
  const calls = [];
  const contentPort = {
    async generateModel(input) { calls.push(['create', input]); return { modelJson: { name: 'new' } }; },
    async refineModel(input) { calls.push(['refine', input]); return { modelJson: { name: 'refined' } }; },
    async mountPart(input) { calls.push(['mount', input]); return { modelJson: { name: 'mounted' } }; },
  };
  const assetRepository = {
    async saveModel(input) { calls.push(['save', input]); return { assetId: `asset-${calls.length}` }; },
  };
  const service = new AIWorldActionService({ contentPort, assetRepository });

  const created = await service.createObject({ description: '木制工具架', tags: ['pastoral'] });
  const refined = await service.refineObject({ modelJson: {}, description: '加上绿色藤蔓' });
  const mounted = await service.mountPart({ modelJson: {}, part: '小灯', placement: '顶部' });

  assert.equal(created.modelJson.name, 'new');
  assert.equal(calls.find(([type]) => type === 'create')[1].quality, 'voxel');
  assert.equal(refined.modelJson.name, 'refined');
  assert.equal(mounted.modelJson.name, 'mounted');
  assert.deepEqual(calls.filter(([type]) => type !== 'save').map(([type]) => type), ['create', 'refine', 'mount']);
  assert.equal(calls.filter(([type]) => type === 'save').length, 3);
});

test('pet work coordinator always removes presentation and finishes pet', async () => {
  const lifecycle = [];
  const coordinator = new PetWorkCoordinator({
    startPresentation: () => { lifecycle.push('start'); return 'scaffold'; },
    stopPresentation: value => lifecycle.push(`stop:${value}`),
    playIntro: async () => lifecycle.push('intro'),
    finishPet: (_pet, nextState) => lifecycle.push(`finish:${nextState}`),
  });

  await assert.rejects(() => coordinator.run({
    pet: {},
    points: {},
    nextState: 'idle',
    focusCamera: false,
    status: { title: 'work', preparing: 'prepare', requesting: 'request', complete: 'done' },
    execute: async () => { throw new Error('backend failed'); },
    apply: async () => {},
  }), /backend failed/);

  assert.deepEqual(lifecycle, ['start', 'intro', 'stop:scaffold', 'finish:idle']);
});

test('pet work coordinator rejects late backend results before apply', async () => {
  let releaseBackend;
  let markBackendStarted;
  const backendStarted = new Promise(resolve => { markBackendStarted = resolve; });
  const backendResult = new Promise(resolve => { releaseBackend = resolve; });
  const lifecycle = [];
  const coordinator = new PetWorkCoordinator({
    startPresentation: () => { lifecycle.push('start'); return 'scaffold'; },
    stopPresentation: value => lifecycle.push(`stop:${value}`),
    playIntro: async () => lifecycle.push('intro'),
    finishPet: (_pet, nextState) => lifecycle.push(`finish:${nextState}`),
  });

  const work = coordinator.run({
    pet: {},
    points: {},
    nextState: 'idle',
    focusCamera: false,
    status: { title: 'work', preparing: 'prepare', requesting: 'request', complete: 'done' },
    execute: async () => {
      markBackendStarted();
      return backendResult;
    },
    apply: async () => lifecycle.push('apply'),
  });

  await backendStarted;
  coordinator.abortPending(new PetWorkAbortedError('owner disposed'));
  releaseBackend({ modelJson: {} });

  await assert.rejects(work, error => error?.code === 'PET_WORK_ABORTED');
  assert.deepEqual(lifecycle, ['start', 'intro', 'stop:scaffold', 'finish:idle']);
});
