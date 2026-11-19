import assert from 'node:assert/strict';
import test from 'node:test';
import { AnimalAgentRuntime } from '../src/gameplay/agents/AnimalAgentRuntime.js';
import { createAnimalAgentProfile } from '../src/gameplay/agents/AgentContracts.js';
import { AgentActionRegistry, AgentActionArbiter } from '../src/gameplay/agents/AgentActionRegistry.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(selectAction, execute = async () => {}) {
  const calls = [];
  let bodyState = 'free_roam';
  const registry = new AgentActionRegistry();
  for (const id of ['routine.idle', 'routine.wander']) {
    registry.register({ id, execute: async () => { calls.push(id); return execute(); } });
  }
  const runtime = new AnimalAgentRuntime({
    profile: createAnimalAgentProfile({ id: 'momo' }),
    pet: { petState: { is: state => state === bodyState, isBusy: () => bodyState !== 'free_roam' } },
    perception: { perceive: () => ({ at: 1, nearbyObjects: [], nearbyResidents: [] }) },
    evaluator: { candidates: () => [
      { actionId: 'routine.idle', reason: 'rest', score: 2 },
      { actionId: 'routine.wander', reason: 'explore', targetId: 'tree', score: 1 },
    ] },
    arbiter: new AgentActionArbiter({ registry }),
    reasoning: { selectAction },
    now: () => 1_000_000,
    random: () => 0,
  });
  return { runtime, calls, setBodyState: state => { bodyState = state; } };
}

test('a slow planning request cannot produce overlapping decisions', async () => {
  const request = deferred();
  let requests = 0;
  const { runtime, calls } = fixture(() => { requests++; return request.promise; });
  const first = runtime.deliberate({ force: true });
  assert.equal(await runtime.deliberate({ force: true }), null);
  runtime.update(60);
  assert.equal(requests, 1);
  request.resolve({ actionId: 'routine.idle' });
  await first;
  assert.deepEqual(calls, ['routine.idle']);
  runtime.dispose();
});

for (const transition of ['dispose', 'restore', 'working']) {
  test(`late reasoning cannot act after ${transition}`, async () => {
    const request = deferred();
    const { runtime, calls, setBodyState } = fixture(() => request.promise);
    const pending = runtime.deliberate({ force: true });
    if (transition === 'working') setBodyState('working');
    else runtime[transition]();
    request.resolve({ actionId: 'routine.idle' });
    assert.equal(await pending, null);
    assert.deepEqual(calls, []);
    assert.equal(runtime.state.currentPlan, null);
    runtime.dispose();
  });
}

test('reasoning errors preserve the deterministic fallback and release the decision lock', async () => {
  const { runtime, calls } = fixture(async () => { throw new Error('offline'); });
  await runtime.deliberate({ force: true });
  assert.deepEqual(calls, ['routine.idle']);
  assert.equal(runtime.deliberation, null);
  runtime.dispose();
});

test('a reasoned action with an unoffered target cannot redirect a resident', async () => {
  const { runtime, calls } = fixture(async () => ({ actionId: 'routine.wander', targetId: 'unknown' }));
  await runtime.deliberate({ force: true });
  assert.deepEqual(calls, ['routine.idle']);
  runtime.dispose();
});

test('an old action completion cannot write memories into a restored session', async () => {
  const action = deferred();
  const { runtime } = fixture(async () => ({ actionId: 'routine.idle' }), () => action.promise);
  const pending = runtime.deliberate({ force: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  runtime.restore();
  action.resolve();
  await pending;
  assert.equal(runtime.memory.episodic.length, 0);
  assert.equal(runtime.state.currentPlan, null);
  runtime.dispose();
});

test('a late reflection cannot change restored memory', async () => {
  const request = deferred();
  const { runtime } = fixture(null);
  runtime.reasoning.reflect = () => request.promise;
  runtime.memory.reflectionPressure = 4;
  const pending = runtime._reflectIfNeeded({ summary: 'a busy day', tags: [] });
  runtime.restore();
  request.resolve({ summary: 'old reflection' });
  assert.equal(await pending, null);
  assert.equal(runtime.state.cognition.dailyCalls, 0);
  runtime.dispose();
});
