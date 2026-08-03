import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyChiiStoryBaseline } from '../scripts/verify-chii-story-baseline.mjs';

test('the frozen Original scene remains the story-development baseline', () => {
  const result = verifyChiiStoryBaseline();
  assert.deepEqual(result.errors, []);
  assert.ok(result.assetCount > 0);
  assert.equal(result.baseline.sceneStyle, 'original');
});
