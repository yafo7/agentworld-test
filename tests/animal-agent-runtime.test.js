import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnimalAgentProfile } from '../src/gameplay/agents/AgentContracts.js';
import { AnimalAgentRuntime } from '../src/gameplay/agents/AnimalAgentRuntime.js';
import { AgentActionArbiter, AgentActionRegistry } from '../src/gameplay/agents/AgentActionRegistry.js';

function pet() {
  return {
    _petState: 'free_roam',
    petState: { current: 'free_roam', is: value => value === 'free_roam', isBusy: () => false },
  };
}

test('runtime selects a registered utility action and records its outcome', async () => {
  const calls = [];
  const registry = new AgentActionRegistry()
    .register({ id: 'routine.idle', execute: async () => calls.push('idle') })
    .register({ id: 'routine.wander', execute: async () => calls.push('wander') });
  const runtime = new AnimalAgentRuntime({
    profile: createAnimalAgentProfile({ id: 'momo', initialDrives: { energy: 0.1 } }),
    pet: pet(),
    perception: { perceive: () => ({ at: 1, nearbyObjects: [], nearbyResidents: [] }) },
    arbiter: new AgentActionArbiter({ registry }),
    random: () => 0,
  });
  await runtime.deliberate({ force: true });
  assert.deepEqual(calls, ['idle']);
  assert.equal(runtime.memory.episodic.at(-1).tags[0], 'routine.idle');
});

test('runtime resets its reasoning budget when the island day changes', () => {
  const profile = createAnimalAgentProfile({ residentId: 'momo' });
  const pet = {
    _petState: 'free_roam',
    petState: { is: state => state === 'free_roam', isBusy: () => false },
  };
  const registry = new AgentActionRegistry();
  registry.register({ id: 'routine.idle', execute: async () => ({}) });
  const runtime = new AnimalAgentRuntime({
    profile,
    pet,
    perception: { perceive: () => ({ at: 5, story: { islandDay: 2 }, nearbyResidents: [], nearbyObjects: [] }) },
    arbiter: new AgentActionArbiter({ registry }),
    saved: { state: { schedule: { islandDay: 1, anchors: [], commitments: [] }, cognition: { dailyCalls: 5 } } },
    perceptionInterval: 0.1,
    deliberationInterval: 999,
    random: () => 0,
  });
  runtime.update(0.2);
  assert.equal(runtime.state.schedule.islandDay, 2);
  assert.equal(runtime.state.cognition.dailyCalls, 0);
  runtime.dispose();
});

test('external-world runtime starts immediately with a deterministic warmup decision', async () => {
  const calls = [];
  let reasoningCalls = 0;
  const registry = new AgentActionRegistry()
    .register({ id: 'routine.idle', execute: async () => calls.push('idle') })
    .register({ id: 'routine.wander', execute: async () => calls.push('wander') });
  const runtime = new AnimalAgentRuntime({
    profile: createAnimalAgentProfile({ id: 'momo' }),
    pet: pet(),
    perception: { perceive: () => ({ at: 1, nearbyObjects: [], nearbyResidents: [] }) },
    arbiter: new AgentActionArbiter({ registry }),
    reasoning: {
      selectAction: async () => {
        reasoningCalls += 1;
        return { actionId: 'routine.idle' };
      },
    },
    now: () => 10_000,
    random: () => 0,
    startImmediately: true,
  });

  assert.equal(runtime.deliberationElapsed, runtime.deliberationInterval);
  runtime.update(0);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 1);
  assert.equal(reasoningCalls, 0);
  runtime.dispose();
});
