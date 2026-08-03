import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ActivityRegistry,
  activitySimilarity,
  createActivitySignature,
} from '../src/gameplay/social/ActivityRegistry.js';
import { TownActivityRegistryStore } from '../src/storage/TownActivityRegistryStore.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

function plan(overrides = {}) {
  return {
    type: 'custom_festival',
    scale: 'festival',
    title: '月光篝火会',
    concept: '大家围着篝火跳舞',
    initiatorId: 'fangk',
    exitPetId: 'fangk',
    participants: ['fangk', 'mako', 'lingq'],
    locationId: 'campfire',
    actionPrompts: { fangk: '摆手跳舞', mako: '踏步跳舞', lingq: '挥翅跳舞' },
    props: [],
    beats: ['invite', 'gather', 'perform', 'host_exit'],
    ...overrides,
  };
}

test('activity signatures are stable and similarity recognizes reusable structure', () => {
  assert.deepEqual(createActivitySignature(plan()), createActivitySignature(plan()));
  const similar = plan({ title: '星光篝火会', concept: '宠物在火堆旁跳舞' });
  const unrelated = plan({
    title: '苹果练习',
    concept: 'mako摘苹果',
    locationId: 'apple_tree',
    actionPrompts: { mako: '抬头摘苹果' },
    participants: ['mako'],
    props: [{ id: 'apple', archetype: 'event_food' }],
  });
  assert.ok(activitySimilarity(plan(), similar) >= 0.75);
  assert.ok(activitySimilarity(plan(), unrelated) < 0.75);
});

test('registry resolves exact then similar activities and persists per scene', () => {
  const storage = memoryStorage();
  const store = new TownActivityRegistryStore({ storage });
  const registry = new ActivityRegistry({ store, sceneStyle: 'original' });
  const ready = registry.register({
    id: 'town.festival.moon-fire.v1',
    status: 'ready',
    sceneStyle: 'original',
    type: 'custom_festival',
    plan: plan(),
  });
  assert.equal(registry.resolve(plan()).match, 'exact');
  const similarIntent = plan({ title: '星光篝火会', concept: '宠物在火堆旁跳舞' });
  const result = registry.resolve(similarIntent);
  assert.equal(result.match, 'similar');
  assert.equal(result.record.id, ready.id);
  const draft = registry.createDraft(similarIntent, { similar: result.record });
  assert.equal(draft.derivedFrom, ready.id);
  assert.equal(draft.status, 'draft');
  assert.equal(new ActivityRegistry({ store, sceneStyle: 'original' }).get(draft.id).derivedFrom, ready.id);
  assert.equal(new ActivityRegistry({ store, sceneStyle: 'voxel' }).list().length, 0);
});

test('registry rolls back memory when atomic persistence fails', () => {
  const registry = new ActivityRegistry({
    sceneStyle: 'original',
    store: { list: () => [], replaceScene: () => { throw new Error('quota'); } },
  });
  assert.throws(() => registry.register({ id: 'broken', plan: plan() }), /quota/);
  assert.equal(registry.get('broken'), null);
});

test('curated seed definitions remain authoritative over persisted run statistics', () => {
  const storage = memoryStorage();
  const store = new TownActivityRegistryStore({ storage });
  store.replaceScene('original', [{
    id: 'town.party.v1',
    status: 'ready',
    origin: 'curated',
    sceneStyle: 'original',
    type: 'party',
    plan: plan({ title: '旧定义' }),
    assets: { models: { stale: true } },
    stats: { runs: 7, failures: 1, lastResult: 'host-ended' },
  }]);
  const registry = new ActivityRegistry({
    store,
    sceneStyle: 'original',
    seed: [{
      id: 'town.party.v1',
      status: 'ready',
      origin: 'curated',
      sceneStyle: 'original',
      type: 'party',
      plan: plan({ title: '当前定义' }),
      assets: { models: { current: true } },
    }],
  });
  const record = registry.get('town.party.v1');
  assert.equal(record.plan.title, '当前定义');
  assert.equal(record.assets.models.current, true);
  assert.equal(record.stats.runs, 7);
});
