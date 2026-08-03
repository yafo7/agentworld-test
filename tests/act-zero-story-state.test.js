import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACT_ZERO_STORY_STORAGE_KEY,
  ActZeroStoryState,
  sanitizeActZeroWish,
} from '../src/demos/chii-island/story/ActZeroStoryState.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('ActZeroStoryState persists the rescue wish and completion', () => {
  const storage = createStorage();
  let now = 100;
  const state = new ActZeroStoryState({ storage, now: () => now });

  assert.equal(state.shouldPlay(''), true);
  state.start();
  state.recordWish('  一个   巨大的降落伞  ');
  now = 200;
  state.complete();

  const restored = new ActZeroStoryState({ storage, now: () => 300 });
  assert.equal(restored.shouldPlay(''), false);
  assert.equal(restored.getSnapshot().act0.rescueWish, '一个 巨大的降落伞');
  assert.equal(restored.getSnapshot().act0.completedAt, 200);
  assert.ok(storage.getItem(ACT_ZERO_STORY_STORAGE_KEY));
});

test('ActZeroStoryState query controls support replay and demo bypass', () => {
  const storage = createStorage();
  const state = new ActZeroStoryState({ storage });
  state.complete();

  assert.equal(state.shouldPlay('?act=0'), true);
  assert.equal(state.shouldPlay('?replay-act0'), true);
  assert.equal(state.shouldPlay('?church-town'), false);
  assert.equal(state.shouldPlay('?forest-temple'), false);
  assert.equal(state.shouldPlay('?skip-intro'), false);
});

test('sanitizeActZeroWish keeps a short local story fact', () => {
  assert.equal(sanitizeActZeroWish('  木筏\n和  降落伞  '), '木筏 和 降落伞');
  assert.equal(sanitizeActZeroWish('救'.repeat(80)).length, 48);
});
