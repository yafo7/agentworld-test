import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectiveProjectionStore } from '../src/gameplay/objectives/ObjectiveProjectionStore.js';
import { StoryObjectiveProjectionBridge } from '../src/gameplay/objectives/StoryObjectiveProjectionBridge.js';

class StoryStateStub {
  constructor(objective = null) {
    this.objective = objective;
    this.listeners = new Set();
  }

  getSnapshot() { return { currentObjective: this.objective }; }
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  set(objective) { this.objective = objective; for (const listener of this.listeners) listener(); }
}

test('story bridge only projects objectives with explicit guidance data', () => {
  const storyState = new StoryStateStub({ id: 'plain', title: '普通剧情', data: {} });
  const store = new ObjectiveProjectionStore();
  const bridge = new StoryObjectiveProjectionBridge({ storyState, projectionStore: store });
  assert.equal(store.getCurrent(), null);

  storyState.set({
    id: 'find-momo',
    title: '寻找 momo',
    data: {
      guidance: {
        label: '去森林找 momo',
        target: { type: 'pet', id: 'momo' },
        trigger: 'interact',
      },
    },
  });
  assert.equal(store.getCurrent().id, 'story:find-momo');
  assert.equal(store.getCurrent().target.id, 'momo');

  storyState.set(null);
  assert.equal(store.getCurrent(), null);
  bridge.dispose();
});
