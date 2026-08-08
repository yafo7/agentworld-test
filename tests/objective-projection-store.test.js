import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectiveProjectionStore } from '../src/gameplay/objectives/ObjectiveProjectionStore.js';

function objective(id, priority, x = 0) {
  return {
    id,
    label: id,
    priority,
    target: { type: 'position', position: { x, y: 0, z: 0 } },
  };
}

test('objective projection store exposes the highest-priority owner', () => {
  const store = new ObjectiveProjectionStore();
  store.publish('story', objective('story', 20));
  store.publish('activity', objective('activity', 100));
  assert.equal(store.getCurrent().id, 'activity');
  store.clear('activity');
  assert.equal(store.getCurrent().id, 'story');
});

test('objective projection store publishes immutable plain snapshots', () => {
  const store = new ObjectiveProjectionStore();
  const received = [];
  store.subscribe(value => received.push(value));
  store.publish('activity', objective('visit', 10, 4));
  const current = store.getCurrent();
  current.target.position.x = 99;
  assert.equal(store.getCurrent().target.position.x, 4);
  assert.equal(received.length, 2);
});

test('objective projection store rejects targets without identity or position', () => {
  const store = new ObjectiveProjectionStore();
  assert.throws(() => store.publish('broken', {
    id: 'broken',
    target: { type: 'pet' },
  }), /valid target/);
});
