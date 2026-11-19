import assert from 'node:assert/strict';
import test from 'node:test';
import { PromptCompiler } from '../src/gameplay/ai/prompts/PromptCompiler.js';
import { PROMPT_OPERATIONS } from '../src/gameplay/ai/prompts/PromptOperations.js';
import { ChatAgentReasoningAdapter } from '../src/integrations/content/ChatAgentReasoningAdapter.js';

test('agent planning prompt only permits choosing supplied candidates', () => {
  const packet = new PromptCompiler().compile({
    operation: PROMPT_OPERATIONS.AGENT_PLAN,
    source: { text: 'momo' },
    input: { context: { candidates: [{ actionId: 'routine.idle' }] } },
  });
  assert.equal(packet.templateId, 'animal-agent-plan-v1');
  assert.match(packet.payload.messages[0].content, /只能从candidates中/);
  assert.equal(packet.validation.valid, true);
});

test('reasoning adapter accepts structured controller output', async () => {
  const adapter = new ChatAgentReasoningAdapter({
    generationController: { run: async () => ({ result: JSON.stringify({ actionId: 'routine.idle', targetId: null, reason: '休息一下' }) }) },
  });
  const result = await adapter.selectAction({
    runtime: {
      profile: { identity: { residentId: 'momo', species: 'bear' }, personality: { traits: [], values: [] }, preferences: {} },
      state: { drives: {}, mood: {} },
    },
    perception: {}, candidates: [{ actionId: 'routine.idle', reason: '休息', score: 1 }], memories: [],
  });
  assert.equal(result.actionId, 'routine.idle');
  assert.equal(adapter.getMetrics().calls, 1);
});
