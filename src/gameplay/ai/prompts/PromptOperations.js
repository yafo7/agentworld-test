export const PROMPT_SCHEMA_VERSION = 1;
export const PROMPT_PROFILE_VERSION = 'chii-v2';

export const PROMPT_OPERATIONS = Object.freeze({
  MODEL_GENERATE: 'model.generate',
  PET_GENERATE: 'pet.generate',
  BUILDING_GENERATE: 'building.generate',
  MODEL_REFINE: 'model.refine',
  MODEL_MOUNT: 'model.mount',
  ANIMATION_GENERATE: 'animation.generate',
  TERRAIN_GENERATE: 'terrain.generate',
  TERRAIN_REFINE: 'terrain.refine',
  EVENT_PLAN: 'event.plan',
  TASK_PLAN: 'task.plan',
  AGENT_PLAN: 'agent.plan',
  AGENT_REFLECT: 'agent.reflect',
  AGENT_DIALOGUE: 'agent.dialogue',
  RESIDENT_BEHAVIOR: 'resident.behavior',
});

export const PROMPT_OPERATION_VALUES = Object.freeze(Object.values(PROMPT_OPERATIONS));

let requestSequence = 0;

export function createPromptRequestId(prefix = 'prompt') {
  requestSequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${requestSequence.toString(36)}`;
}

export function createGenerationIntent(input = {}) {
  const operation = String(input.operation || '').trim();
  if (!PROMPT_OPERATION_VALUES.includes(operation)) {
    throw new TypeError(`Unsupported prompt operation: ${operation || '(empty)'}`);
  }
  return Object.freeze({
    id: input.id || createPromptRequestId('intent'),
    operation,
    source: Object.freeze({
      kind: input.source?.kind || 'gameplay',
      language: input.source?.language || 'zh-CN',
      text: String(input.source?.text ?? input.rawText ?? '').trim(),
    }),
    input: Object.freeze({ ...(input.input || {}) }),
    target: Object.freeze({ ...(input.target || {}) }),
    context: Object.freeze({ ...(input.context || {}) }),
    constraints: Object.freeze({ ...(input.constraints || {}) }),
    semantic: input.semantic ? Object.freeze({ ...input.semantic }) : null,
    approval: Object.freeze({
      required: Boolean(input.approval?.required),
      confirmed: Boolean(input.approval?.confirmed),
      reason: input.approval?.reason || null,
    }),
    semanticPlanning: input.semanticPlanning || 'auto',
  });
}
