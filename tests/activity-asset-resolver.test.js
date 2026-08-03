import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ActivityAssetResolver,
  activityModelRevision,
  isActivityAssetCompatible,
} from '../src/gameplay/social/ActivityAssetResolver.js';

test('activity assets enforce scene subject model and footprint compatibility', () => {
  const model = { name: 'mako', nodes: [{ id: 'body' }] };
  const binding = {
    sceneStyles: ['original'],
    subjectId: 'mako',
    modelRevision: activityModelRevision(model),
    sizeProfile: 'event_table',
    footprint: { width: 3, depth: 2 },
  };
  assert.equal(isActivityAssetCompatible(binding, {
    sceneStyle: 'original', subjectId: 'mako', modelJson: model,
    sizeProfile: 'event_table', footprint: { width: 3, depth: 2 },
  }), true);
  assert.equal(isActivityAssetCompatible(binding, {
    sceneStyle: 'voxel', subjectId: 'mako', modelJson: model,
    sizeProfile: 'event_table', footprint: { width: 3, depth: 2 },
  }), false);
  assert.equal(isActivityAssetCompatible(binding, {
    sceneStyle: 'original', subjectId: 'lingq', modelJson: model,
    sizeProfile: 'event_table', footprint: { width: 3, depth: 2 },
  }), false);
});

test('resolver prioritizes resident animation and can read registered files and cache', async () => {
  const cache = {
    getAnimation: key => key === 'cached-wave' ? { plan: { cached: true } } : null,
    async getModel(key) { return key === 'cached-table' ? { modelJson: { cached: true }, assetId: 'table' } : null; },
  };
  const repository = {
    async getAnimation(binding) { return { file: binding.path }; },
    async getModel(binding) { return { modelJson: { file: binding.path }, assetId: binding.assetId }; },
  };
  const resolver = new ActivityAssetResolver({ cache, repository, sceneStyle: 'original' });
  const pet = { _petName: 'mako', _animPlans: { dance: { local: true } } };
  assert.equal((await resolver.resolveAnimation({ kind: 'resident_animation', name: 'dance' }, { pet })).plan.local, true);
  assert.equal((await resolver.resolveAnimation({ kind: 'activity_cache', cacheKey: 'cached-wave' }, { pet })).plan.cached, true);
  assert.equal((await resolver.resolveAnimation({ kind: 'file_animation', path: 'dance.json' }, { pet })).plan.file, 'dance.json');
  assert.equal((await resolver.resolveModel({ kind: 'activity_cache', cacheKey: 'cached-table' })).assetId, 'table');
  assert.equal((await resolver.resolveModel({ kind: 'file_model', path: 'table.json', assetId: 'fixed-table' })).assetId, 'fixed-table');
});
