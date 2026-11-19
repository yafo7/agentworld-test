export const AGENT_SCHEMA_VERSION = 1;

export const AGENT_PERMISSION_LEVELS = Object.freeze({
  AUTONOMOUS: 0,
  VALIDATED: 1,
  CACHED_GENERATION: 2,
  PLAYER_APPROVAL: 3,
  DIRECTOR_APPROVAL: 4,
  AUTHORING_ONLY: 5,
});

export const AGENT_ACTION_STATUS = Object.freeze({
  IDLE: 'idle',
  PLANNED: 'planned',
  AWAITING_APPROVAL: 'awaiting_approval',
  EXECUTING: 'executing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const AGENT_MEMORY_TYPES = Object.freeze({
  EPISODIC: 'episodic',
  SEMANTIC: 'semantic',
  REFLECTION: 'reflection',
  PROMISE: 'promise',
});

const DEFAULT_DRIVES = Object.freeze({
  energy: 0.72,
  curiosity: 0.58,
  sociability: 0.55,
  comfort: 0.68,
  purpose: 0.5,
});

function clone(value) {
  if (value == null) return value;
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function clamp01(value, fallback = 0.5) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

function normalizedWeights(values = []) {
  return values.map(value => (
    typeof value === 'string'
      ? { id: value, weight: 0.7 }
      : { id: String(value?.id || '').trim(), weight: clamp01(value?.weight, 0.7) }
  )).filter(value => value.id);
}

export function createAnimalAgentProfile(input = {}) {
  const residentId = String(input.residentId || input.id || '').trim();
  if (!residentId) throw new TypeError('Animal agent profile requires residentId');
  return Object.freeze({
    schemaVersion: AGENT_SCHEMA_VERSION,
    identity: Object.freeze({
      residentId,
      displayName: String(input.displayName || input.name || residentId),
      species: String(input.species || 'animal'),
      role: String(input.role || 'resident'),
      appearanceAssetId: input.appearanceAssetId || residentId,
      originStory: String(input.originStory || ''),
    }),
    personality: Object.freeze({
      traits: Object.freeze(normalizedWeights(input.personality?.traits || input.personalityTags)),
      values: Object.freeze(normalizedWeights(input.personality?.values || input.valueTags)),
      voiceStyle: String(input.personality?.voiceStyle || input.voiceStyle || '轻松简短'),
      socialStyle: String(input.personality?.socialStyle || input.socialStyle || '友善'),
      riskTolerance: clamp01(input.personality?.riskTolerance, 0.4),
    }),
    preferences: Object.freeze({
      objects: Object.freeze({ ...(input.preferences?.objects || {}) }),
      activities: Object.freeze({ ...(input.preferences?.activities || {}) }),
      regions: Object.freeze({ ...(input.preferences?.regions || {}) }),
      weather: Object.freeze({ ...(input.preferences?.weather || {}) }),
      timeOfDay: Object.freeze({ ...(input.preferences?.timeOfDay || {}) }),
      companions: Object.freeze({ ...(input.preferences?.companions || {}) }),
      aversions: Object.freeze([...(input.preferences?.aversions || [])]),
    }),
    capabilities: Object.freeze((input.capabilities || []).map(capability => Object.freeze({
      id: String(capability.id || capability).trim(),
      level: clamp01(capability.level, 0.5),
      actionIds: Object.freeze([...(capability.actionIds || [])]),
      constraints: Object.freeze({ ...(capability.constraints || {}) }),
    })).filter(capability => capability.id)),
    scheduleTemplate: Object.freeze([...(input.scheduleTemplate || [])].map(item => Object.freeze({ ...item }))),
    initialDrives: Object.freeze({
      ...DEFAULT_DRIVES,
      ...Object.fromEntries(Object.entries(input.initialDrives || {}).map(([key, value]) => [key, clamp01(value)])),
    }),
  });
}

export function createAgentRuntimeSnapshot(profile, saved = {}) {
  const residentId = profile.identity.residentId;
  return {
    schemaVersion: AGENT_SCHEMA_VERSION,
    residentId,
    introduced: Boolean(saved.introduced),
    drives: { ...profile.initialDrives, ...(saved.drives || {}) },
    mood: {
      valence: clamp01(saved.mood?.valence, 0.55),
      arousal: clamp01(saved.mood?.arousal, 0.4),
      label: String(saved.mood?.label || '平静'),
      causes: [...(saved.mood?.causes || [])],
      expiresAt: Number(saved.mood?.expiresAt) || null,
    },
    schedule: clone(saved.schedule || { islandDay: 1, anchors: profile.scheduleTemplate, commitments: [] }),
    goals: clone(saved.goals || { longTerm: [], active: null, backlog: [] }),
    currentPlan: clone(saved.currentPlan || null),
    cognition: {
      lastPerceptionAt: Number(saved.cognition?.lastPerceptionAt) || 0,
      lastPlanAt: Number(saved.cognition?.lastPlanAt) || 0,
      lastReflectionAt: Number(saved.cognition?.lastReflectionAt) || 0,
      cooldownUntil: Number(saved.cognition?.cooldownUntil) || 0,
      dailyCalls: Number(saved.cognition?.dailyCalls) || 0,
      dailyCallBudget: Number(saved.cognition?.dailyCallBudget) || 6,
    },
  };
}

export function createAgentEvent(input = {}) {
  const type = String(input.type || '').trim();
  if (!type) throw new TypeError('Agent event requires type');
  return {
    id: input.id || `agent_event_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    at: Number(input.at) || Date.now(),
    islandDay: Math.max(1, Number(input.islandDay) || 1),
    locationId: input.locationId || null,
    actors: [...new Set((input.actors || []).map(String).filter(Boolean))],
    objectRefs: [...new Set((input.objectRefs || []).map(String).filter(Boolean))],
    summary: String(input.summary || type).slice(0, 280),
    tags: [...new Set((input.tags || []).map(String).filter(Boolean))],
    outcome: String(input.outcome || 'observed'),
    importance: clamp01(input.importance, 0.4),
    valence: Math.min(1, Math.max(-1, Number(input.valence) || 0)),
    source: String(input.source || 'world'),
    shareable: input.shareable !== false,
  };
}

export function validateAgentPlan(plan, actionIds = []) {
  const errors = [];
  const allowed = new Set(actionIds);
  if (!plan || typeof plan !== 'object') errors.push('missing_plan');
  if (!String(plan?.goalId || '').trim()) errors.push('missing_goal');
  if (!Array.isArray(plan?.steps) || plan.steps.length === 0) errors.push('missing_steps');
  for (const step of plan?.steps || []) {
    if (!allowed.has(step.actionId)) errors.push(`unknown_action:${step.actionId}`);
  }
  return { valid: errors.length === 0, errors };
}

export { clamp01 as clampAgentValue };
