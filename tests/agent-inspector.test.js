import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentConsistencyEvaluator } from '../src/gameplay/agents/AgentConsistencyEvaluator.js';
import { AgentReplayHarness } from '../src/gameplay/agents/AgentReplayHarness.js';
import { AnimalAgentInspector } from '../src/gameplay/agents/AnimalAgentInspector.js';

test('consistency evaluator catches unknown actions, budget overflow, and repetition', () => {
  const report = new AgentConsistencyEvaluator().evaluate({
    agents: [{ residentId: 'momo', cognition: { dailyCalls: 3, dailyCallBudget: 2 }, currentPlan: { steps: [{ actionId: 'invent' }] } }],
    traces: Array.from({ length: 5 }, () => ({ residentId: 'momo', type: 'decision', selected: { actionId: 'routine.idle' } })),
    actionRegistry: { list: () => [{ id: 'routine.idle' }] },
  });
  assert.equal(report.valid, false);
  assert.ok(report.findings.some(item => item.code === 'unknown_planned_action'));
  assert.ok(report.findings.some(item => item.code === 'repetitive_behavior'));
});

test('replay harness exports immutable cognitive frames', () => {
  const replay = new AgentReplayHarness();
  const source = { momo: { state: { mood: 'calm' } } };
  replay.record('start', source);
  source.momo.state.mood = 'busy';
  assert.equal(replay.export().frames[0].snapshot.momo.state.mood, 'calm');
});

test('inspector periodically captures deterministic replay frames', () => {
  const coordinator = {
    runtimes: new Map(),
    snapshot: () => ({ agents: { momo: { state: 'free_roam' } } }),
    inspect: () => [],
    getRuntime: () => null,
  };
  const trace = { list: () => [] };
  const actionRegistry = { get: () => null };
  const inspector = new AnimalAgentInspector({ coordinator, trace, actionRegistry, captureInterval: 5 });
  assert.equal(inspector.update(4), null);
  assert.equal(inspector.update(1).label, 'periodic');
  assert.equal(inspector.exportReplay().frames.length, 1);
});
