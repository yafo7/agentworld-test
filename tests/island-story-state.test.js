import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACT_ZERO_EVENT_ID,
  ISLAND_STORY_STORAGE_KEY,
  IslandStoryState,
} from '../src/gameplay/story/IslandStoryState.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('IslandStoryState owns the shared chapter, island, resident, region and event facts', () => {
  const storage = createStorage();
  let now = 100;
  const state = new IslandStoryState({ storage, now: () => now });

  state.setChapter('chapter_1');
  state.setIslandDay(2);
  state.setDevelopmentStage('first_home');
  state.meetResident('momo');
  state.meetResident('momo');
  state.unlockRegion('windmill_pastoral');
  state.setCurrentObjective({ id: 'meet_momo', title: 'Meet momo' });
  state.startEvent('momo_met', { source: 'dialogue' });
  now = 200;
  state.completeEvent('momo_met');

  const restored = new IslandStoryState({ storage, now: () => 300 }).getSnapshot();
  assert.equal(restored.chapter, 'chapter_1');
  assert.equal(restored.islandDay, 2);
  assert.equal(restored.developmentStage, 'first_home');
  assert.deepEqual(restored.knownResidents, ['momo']);
  assert.deepEqual(restored.unlockedRegions, ['windmill_pastoral']);
  assert.equal(restored.currentObjective.id, 'meet_momo');
  assert.deepEqual(restored.completedEvents, ['momo_met']);
  assert.equal(restored.events.momo_met.completedAt, 200);
  assert.ok(storage.getItem(ISLAND_STORY_STORAGE_KEY));
});

test('IslandStoryState emits explicit transitions and keeps completed events immutable', () => {
  const state = new IslandStoryState({ storage: createStorage(), now: () => 10 });
  const events = [];
  state.onChange(event => events.push(event.type));

  state.startEvent('bridge_repaired');
  state.completeEvent('bridge_repaired', { bridgeId: 'north_bridge' });
  state.startEvent('bridge_repaired', { shouldNotOverwrite: true });

  assert.deepEqual(events, ['event_started', 'event_completed']);
  assert.deepEqual(state.getEvent('bridge_repaired').data, { bridgeId: 'north_bridge' });
});

test('IslandStoryState migrates the previous Act Zero save once', () => {
  const storage = createStorage({
    'chii-story-v1': JSON.stringify({
      version: 1,
      act0: {
        status: 'complete',
        rescueWish: '一个降落伞',
        startedAt: 10,
        completedAt: 20,
      },
    }),
  });
  const state = new IslandStoryState({ storage });

  assert.equal(state.hasCompletedEvent(ACT_ZERO_EVENT_ID), true);
  assert.equal(state.getEvent(ACT_ZERO_EVENT_ID).data.rescueWish, '一个降落伞');
  assert.ok(storage.getItem(ISLAND_STORY_STORAGE_KEY));
});
