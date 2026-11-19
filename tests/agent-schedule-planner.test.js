import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnimalAgentProfile, createAgentRuntimeSnapshot } from '../src/gameplay/agents/AgentContracts.js';
import { AgentSchedulePlanner, getAgentDayPhase } from '../src/gameplay/agents/AgentSchedulePlanner.js';

test('schedule planner maps island climate hour to a resident anchor and personality goal', () => {
  const profile = createAnimalAgentProfile({
    residentId: 'momo',
    personality: { values: ['照顾植物'] },
    scheduleTemplate: [
      { phase: 'morning', activity: '巡视花园' },
      { phase: 'evening', activity: '找朋友聊天' },
    ],
  });
  const runtime = { profile, state: createAgentRuntimeSnapshot(profile) };
  const current = new AgentSchedulePlanner().update(runtime, { climate: { hour: 20 } });
  assert.deepEqual(current, { phase: 'evening', activity: '找朋友聊天' });
  assert.match(runtime.state.goals.active.label, /照顾植物/);
  assert.equal(getAgentDayPhase(8), 'morning');
});
