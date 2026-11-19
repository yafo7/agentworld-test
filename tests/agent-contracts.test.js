import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_PERMISSION_LEVELS,
  createAgentEvent,
  createAgentRuntimeSnapshot,
  createAnimalAgentProfile,
  validateAgentPlan,
} from '../src/gameplay/agents/AgentContracts.js';
import { AgentActionArbiter, AgentActionRegistry } from '../src/gameplay/agents/AgentActionRegistry.js';

test('animal agent profile separates stable identity from mutable runtime state', () => {
  const profile = createAnimalAgentProfile({
    id: 'momo', species: 'bear', personalityTags: ['温和'], initialDrives: { curiosity: 0.8 },
  });
  const snapshot = createAgentRuntimeSnapshot(profile);
  assert.equal(profile.identity.residentId, 'momo');
  assert.equal(profile.personality.traits[0].id, '温和');
  assert.equal(snapshot.drives.curiosity, 0.8);
  snapshot.drives.curiosity = 0.2;
  assert.equal(profile.initialDrives.curiosity, 0.8);
});

test('agent events and plans use stable typed references', () => {
  const event = createAgentEvent({ type: 'player_helped', actors: ['player', 'momo'], importance: 2 });
  assert.equal(event.importance, 1);
  assert.equal(validateAgentPlan({ goalId: 'rest', steps: [{ actionId: 'idle' }] }, ['idle']).valid, true);
  assert.deepEqual(validateAgentPlan({ goalId: 'x', steps: [{ actionId: 'invent' }] }, ['idle']).errors, ['unknown_action:invent']);
});

test('action arbiter blocks high-impact tools until explicit approval', async () => {
  const registry = new AgentActionRegistry().register({
    id: 'world.create',
    permission: AGENT_PERMISSION_LEVELS.PLAYER_APPROVAL,
    execute: async () => ({ assetId: 'flower' }),
  });
  const runtime = { profile: { identity: { residentId: 'momo' } }, pet: {} };
  const arbiter = new AgentActionArbiter({ registry });
  const pending = await arbiter.execute(runtime, { actionId: 'world.create' });
  assert.equal(pending.status, 'awaiting_approval');
  const completed = await arbiter.execute(runtime, { actionId: 'world.create', approved: true });
  assert.equal(completed.result.assetId, 'flower');
});
