import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAnimationPlan } from '../src/engine/animation/normalizePlan.js';
import {
  createLocalVoxelRuntime,
  LOCAL_ANIMATION_TEMPLATES,
} from '../src/engine/runtime/localVoxelRuntime.js';

test('legacy tilt tracks normalize to supported pointTo tracks', () => {
  const plan = normalizeAnimationPlan({
    _duration: 2,
    head: { tilt: { axis: 'x', angle: 8 }, sway: { axis: 'z', amplitude: 0.1 } },
  });
  assert.equal(plan.head.tilt, undefined);
  assert.deepEqual(plan.head.pointTo, [{ axis: 'x', angle: 8 }]);
  assert.deepEqual(plan.head.sway, { axis: 'z', amplitude: 0.1 });
});

test('local runtime covers current backend motion templates', () => {
  for (const template of ['dash', 'slash', 'lockWorldRot']) {
    assert.ok(LOCAL_ANIMATION_TEMPLATES.includes(template));
  }
  const runtime = createLocalVoxelRuntime();
  const model = {
    getPart: id => id === 'body'
      ? { id: 'body', parent: null, rotation: { x: 0, y: 0, z: 0 } }
      : null,
    getChildren: () => [],
  };
  const result = runtime.evaluateMotion({
    body: {
      dash: { axis: 'z', speed: 3 },
      slash: { axis: 'x', amplitude: 1, speed: 4 },
    },
  }, 2, model, 0.25);
  assert.equal(result.body.position[2], 0.75);
  assert.ok(result.body.rotation[0] > 0);
});

test('local launch honors the backend deceleration contract', () => {
  const runtime = createLocalVoxelRuntime();
  const result = runtime.evaluateMotion({ body: { launch: { axis: 'z', speed: 8, decel: 0 } } }, 2, {}, 2);
  assert.equal(result.body.position[2], 16);
});
