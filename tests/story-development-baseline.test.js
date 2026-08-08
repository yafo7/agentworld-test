import assert from 'node:assert/strict';
import test from 'node:test';
import {
  stableTextSha256,
  verifyChiiStoryBaseline,
} from '../scripts/verify-chii-story-baseline.mjs';

test('story baseline hashes ignore platform line endings but detect content changes', () => {
  assert.equal(stableTextSha256('{\r\n  "ok": true\r\n}\r\n'), stableTextSha256('{\n  "ok": true\n}\n'));
  assert.notEqual(stableTextSha256('{\n  "ok": true\n}\n'), stableTextSha256('{\n  "ok": false\n}\n'));
});

test('the frozen Original scene remains the story-development baseline', () => {
  const result = verifyChiiStoryBaseline();
  assert.deepEqual(result.errors, []);
  assert.ok(result.assetCount > 0);
  assert.equal(result.baseline.sceneStyle, 'original');
});
