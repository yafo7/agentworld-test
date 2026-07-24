import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSETS,
  matchAnimation,
  parseArgs,
  semanticJsonEqual,
} from '../.agents/skills/chii-assets/scripts/sync-from-studio.mjs';

test('Chii asset sync pins the approved forest trophy revision', () => {
  const trophy = ASSETS.find(asset => asset.id === 'forest-trophy');
  assert.equal(trophy.assetId, 'm_1783574540705_1274n8');
  assert.equal(trophy.commit, '2026-07-09_13-20-59');
  assert.equal(trophy.folder, '一个科隆major，cs2的冠军奖杯_1.3m');
});

test('animation matching gives the approved exact title priority', () => {
  const animations = [
    { name: '上下跳动，周围出现星光特效' },
    { name: '底座保持不动，奖杯上方上下跳动，同时出现星光特效' },
  ];
  const result = matchAnimation(animations, ['上下跳动'], {
    exact: ['底座保持不动，奖杯上方上下跳动，同时出现星光特效'],
  });
  assert.equal(result.status, 'matched');
  assert.equal(result.animation, animations[1]);

  const missing = matchAnimation(animations.slice(0, 1), ['上下跳动'], {
    exact: ['底座保持不动，奖杯上方上下跳动，同时出现星光特效'],
    requireExact: true,
  });
  assert.equal(missing.status, 'missing');
});

test('asset sync argument parsing keeps scope explicit and JSON comparison semantic', () => {
  assert.deepEqual(parseArgs(['--all', '--dry-run']), {
    studio: 'http://localhost:8000', dryRun: true, source: 'edit', only: null, all: true,
  });
  assert.equal(semanticJsonEqual({ b: 2, a: { y: 1, x: 0 } }, { a: { x: 0, y: 1 }, b: 2 }), true);
  assert.equal(semanticJsonEqual({ value: 1 }, { value: 2 }), false);
});
