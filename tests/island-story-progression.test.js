import assert from 'node:assert/strict';
import test from 'node:test';
import { IslandStoryState } from '../src/gameplay/story/IslandStoryState.js';
import {
  ISLAND_DEVELOPMENT_STAGES,
  ISLAND_STORY_MILESTONES,
  IslandStoryProgression,
} from '../src/gameplay/story/IslandStoryProgression.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('pastoral progression is idempotent and preserves the first completion payload', () => {
  let now = 10;
  const state = new IslandStoryState({ storage: createStorage(), now: () => now++ });
  const progression = new IslandStoryProgression({ storyState: state });
  const changes = [];
  state.onChange(event => changes.push(event.type));

  progression.recordPastoralWorldChange({
    action: 'create',
    residentId: 'momo',
    targetId: 'pastoral_asset_1',
    assetId: 'asset_1',
  });
  const changeCount = changes.length;
  progression.recordPastoralWorldChange({
    action: 'refine',
    residentId: 'momo',
    targetId: 'pastoral_asset_2',
    assetId: 'asset_2',
  });

  const snapshot = state.getSnapshot();
  assert.equal(snapshot.chapter, 'island_home');
  assert.equal(snapshot.developmentStage, ISLAND_DEVELOPMENT_STAGES.HOME_SHAPED);
  assert.deepEqual(snapshot.knownResidents, ['momo']);
  assert.deepEqual(snapshot.unlockedRegions, ['windmill_pastoral', 'forest_temple']);
  assert.equal(snapshot.events[ISLAND_STORY_MILESTONES.PASTORAL_HOME_CHANGED].status, 'complete');
  assert.deepEqual(snapshot.events[ISLAND_STORY_MILESTONES.PASTORAL_HOME_CHANGED].data, {
    action: 'create',
    residentId: 'momo',
    targetId: 'pastoral_asset_1',
    assetId: 'asset_1',
  });
  assert.equal(changes.length, changeCount);
});

test('region milestones advance monotonically and normalize stable resident aliases', () => {
  const state = new IslandStoryState({ storage: createStorage(), now: () => 20 });
  const progression = new IslandStoryProgression({ storyState: state });

  progression.recordTownBuildingCompleted({
    buildingId: 'town-building-1',
    buildingName: 'Workshop',
    assetId: 'building-asset-1',
    builderId: 'crab',
    lot: { width: 3, depth: 4 },
  });
  progression.recordTownActivityCompleted({
    activityId: 'spring-party',
    activityType: 'party',
    initiatorId: 'fangke',
    participantIds: ['fangke', 'crab', 'lingq'],
    reason: 'host-ended',
  });
  progression.recordForestResidentSummoned({
    residentId: 'generated-pet-1',
    residentName: 'New friend',
    assetId: 'generated-pet-1',
  });
  progression.recordPastoralWorldChange({
    action: 'mount',
    residentId: 'momo',
    targetId: 'pastoral-target-1',
  });

  const snapshot = state.getSnapshot();
  assert.equal(snapshot.developmentStage, ISLAND_DEVELOPMENT_STAGES.ISLAND_ESTABLISHED);
  assert.deepEqual(
    new Set(snapshot.knownResidents),
    new Set(['builder_crab', 'fangk', 'lingq', 'generated-pet-1', 'momo']),
  );
  assert.deepEqual(
    new Set(snapshot.unlockedRegions),
    new Set(['church_town', 'forest_temple', 'windmill_pastoral']),
  );
  assert.equal(snapshot.events[ISLAND_STORY_MILESTONES.TOWN_BUILDING_COMPLETED].status, 'complete');
  assert.equal(snapshot.events[ISLAND_STORY_MILESTONES.TOWN_ACTIVITY_COMPLETED].status, 'complete');
  assert.equal(snapshot.events[ISLAND_STORY_MILESTONES.FOREST_RESIDENT_SUMMONED].status, 'complete');
  assert.equal(snapshot.events[ISLAND_STORY_MILESTONES.PASTORAL_HOME_CHANGED].status, 'complete');
});

test('region progression leaves authored objectives and unknown future stages untouched', () => {
  const state = new IslandStoryState({ storage: createStorage(), now: () => 30 });
  state.setDevelopmentStage('future_stage');
  state.setCurrentObjective({ id: 'authored_objective', title: 'Authored objective' });
  const progression = new IslandStoryProgression({ storyState: state });

  progression.recordForestResidentSummoned({ residentId: 'future-friend' });

  const snapshot = state.getSnapshot();
  assert.equal(snapshot.developmentStage, 'future_stage');
  assert.equal(snapshot.currentObjective.id, 'authored_objective');
  assert.equal(snapshot.events[ISLAND_STORY_MILESTONES.FOREST_RESIDENT_SUMMONED].status, 'complete');
});

test('IslandStoryProgression requires the persistent story owner contract', () => {
  assert.throws(
    () => new IslandStoryProgression({ storyState: {} }),
    /IslandStoryState-compatible owner/,
  );
});

test('incomplete or unsuccessful notifications cannot advance story progress', () => {
  const state = new IslandStoryState({ storage: createStorage(), now: () => 40 });
  const progression = new IslandStoryProgression({ storyState: state });

  progression.recordPastoralWorldChange({ action: 'create' });
  progression.recordForestResidentSummoned();
  progression.recordTownActivityCompleted({ activityId: 'timed-out', reason: 'gather-timeout' });
  progression.recordTownBuildingCompleted();

  const snapshot = state.getSnapshot();
  assert.equal(snapshot.chapter, 'prologue');
  assert.equal(snapshot.developmentStage, ISLAND_DEVELOPMENT_STAGES.STRANDED);
  assert.deepEqual(snapshot.knownResidents, []);
  assert.deepEqual(snapshot.unlockedRegions, []);
  assert.deepEqual(snapshot.events, {});
});
