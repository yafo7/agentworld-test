import { AgentReasoningPort } from '../../ports/AgentReasoningPort.js';
import { PROMPT_OPERATIONS } from '../../gameplay/ai/prompts/PromptOperations.js';

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(text); } catch { return null; }
}

function publicProfile(runtime) {
  return {
    residentId: runtime.profile.identity.residentId,
    species: runtime.profile.identity.species,
    traits: runtime.profile.personality.traits,
    values: runtime.profile.personality.values,
    preferences: runtime.profile.preferences,
    drives: runtime.state.drives,
    mood: runtime.state.mood,
  };
}

export class ChatAgentReasoningAdapter extends AgentReasoningPort {
  constructor({ generationController, maxConcurrent = 1 } = {}) {
    super();
    if (!generationController) throw new TypeError('ChatAgentReasoningAdapter requires generationController');
    this.generationController = generationController;
    this.maxConcurrent = Math.max(1, Number(maxConcurrent) || 1);
    this.active = 0;
    this.metrics = { calls: 0, failures: 0, busyFallbacks: 0 };
  }

  async selectAction({ runtime, perception, candidates, memories }) {
    return this._run(PROMPT_OPERATIONS.AGENT_PLAN, {
      profile: publicProfile(runtime), perception,
      candidates: candidates.map(({ actionId, targetId = null, reason, score }) => ({ actionId, targetId, reason, score })),
      memories: memories.map(memory => ({ id: memory.id, summary: memory.summary, outcome: memory.outcome })),
    });
  }

  async reflect({ runtime, memories }) {
    return this._run(PROMPT_OPERATIONS.AGENT_REFLECT, {
      profile: publicProfile(runtime),
      memories: memories.map(memory => ({ id: memory.id, summary: memory.summary, outcome: memory.outcome, valence: memory.valence })),
    });
  }

  async composeDialogue({ runtime, targetId, purpose, memories = [] }) {
    return this._run(PROMPT_OPERATIONS.AGENT_DIALOGUE, {
      profile: publicProfile(runtime), targetId, purpose,
      memories: memories.map(memory => ({ id: memory.id, summary: memory.summary })),
    });
  }

  async _run(operation, context) {
    if (this.active >= this.maxConcurrent) {
      this.metrics.busyFallbacks += 1;
      return null;
    }
    this.active += 1;
    this.metrics.calls += 1;
    try {
      const completed = await this.generationController.run({
        operation,
        source: { kind: 'animal_agent', language: 'zh-CN', text: context.profile.residentId },
        input: { context },
        semanticPlanning: 'disabled',
      });
      return parseJson(completed.result);
    } catch (error) {
      this.metrics.failures += 1;
      console.warn(`[AnimalAgent] ${operation} fallback:`, error.message);
      return null;
    } finally {
      this.active -= 1;
    }
  }

  getMetrics() { return { ...this.metrics, active: this.active }; }
}
