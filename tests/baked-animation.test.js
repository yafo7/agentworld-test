import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { animationResultPlan } from '../src/ports/AnimationResult.js';
import { evaluateMotion, applyMotionDeltas } from '../src/engine/animation/player.js';
import { generateAnimation } from '../src/backend/voxelApi.js';

const model = { nodes: [{ id: 'arm' }] };
const payload = tracks => ({ ok: true, baked: { fps: 1, duration: 1, loop: false, animation: { arm: tracks } } });

test('baked tracks interpolate actual position and rotation against the base pose', () => {
  const plan = animationResultPlan(payload({ posX: [0, 2], rotZ: [0, 1] }), model);
  const root = new Group(), arm = new Group();
  arm.name = 'arm'; arm.position.x = 10; root.add(arm);
  const deltas = evaluateMotion(plan, 1, root, 0.5);
  applyMotionDeltas(deltas, root);
  assert.equal(arm.position.x, 11);
  assert.ok(Math.abs(arm.rotation.z - 0.5) < 0.00001);
  assert.equal(plan._loop, false);
});

test('baked quaternions are absolute local poses and interpolate by slerp', () => {
  const plan = animationResultPlan(payload({ quatX: [0, 0], quatY: [0, 0], quatZ: [0, 1], quatW: [1, 0] }), model);
  const root = new Group(), arm = new Group(); arm.name = 'arm'; arm.rotation.z = 0.4; root.add(arm);
  applyMotionDeltas(evaluateMotion(plan, 1, root, 0.5), root);
  assert.ok(Math.abs(arm.rotation.z - Math.PI / 2) < 0.00001);
});

test('animation response rejects missing nodes, invalid samples and unsupported effects', () => {
  assert.throws(() => animationResultPlan(payload({ posX: [0, NaN] }), model));
  assert.throws(() => animationResultPlan(payload({ posX: [0], rotX: [0, 1] }), model));
  assert.throws(() => animationResultPlan(payload({ quatX: [0] }), model));
  assert.throws(() => animationResultPlan(payload({ posX: [0] }), { nodes: [] }));
  const p = payload({ posX: [0] }); p.baked.emit = { sparks: [] };
  assert.throws(() => animationResultPlan(p, model));
});

test('legacy plans remain identical and quick endpoint accepts current baked responses', async t => {
  const plan = { _duration: 2, arm: { swing: { amplitude: 0.1 } } };
  assert.equal(animationResultPlan({ ok: true, plan }, model), plan);
  let endpoint;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    endpoint = url;
    assert.equal(JSON.parse(options.body).provider, 'gpt');
    return { ok: true, json: async () => payload({ posX: [0, 1] }) };
  });
  const result = await generateAnimation(model, '双手缓缓抬起', 3, 'gpt');
  assert.match(endpoint, /animation-quick$/);
  assert.equal(result.plan._baked.animation.arm.posX[1], 1);
});
