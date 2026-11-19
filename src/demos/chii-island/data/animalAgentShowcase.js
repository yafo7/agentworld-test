import { createAgentRuntimeSnapshot } from '../../../gameplay/agents/AgentContracts.js';
import { createChiiAnimalAgentProfile } from './animalAgentProfiles.js';
import { getResidentDefinition } from './residentCatalog.js';

const ACTION_LABELS = Object.freeze({
  'routine.idle': '休息观察',
  'routine.wander': '附近散步',
  'routine.observe': '观察物品',
  'social.greet': '主动问候',
  'social.cooperate': '和朋友一起玩',
  'world.propose': '提出环境改造想法',
  'activity.propose': '提出城镇活动',
  'building.propose': '提出建筑计划',
});

const OBJECT_LABELS = Object.freeze({
  flower: '花朵', tree: '树木', garden: '花园', decor: '装饰', farm: '农田',
  wood: '木头', stone: '石材', road: '道路', apple_tree: '苹果树', water: '水边',
  square: '广场', campfire: '篝火', building: '建筑',
});

const ARCHITECTURE_STEPS = Object.freeze([
  { id: 'perception', label: '感知', detail: '看见附近的人、宠物、物品、天气和事件' },
  { id: 'memory', label: '回忆', detail: '寻找有关经历、事实和关系' },
  { id: 'decision', label: '决定', detail: '环境变化或每五分钟，由 AI 维护近期行为状态机' },
  { id: 'permission', label: '确认', detail: '改造、生成和大型活动必须经过规则审批' },
  { id: 'action', label: '行动', detail: '复用移动、对话、建造和活动系统' },
  { id: 'reflection', label: '记住', detail: '记录结果，更新关系与长期认识' },
]);

const COMMON_ACTIONS = Object.freeze([
  'routine.idle', 'routine.wander', 'routine.observe', 'social.greet', 'social.cooperate',
]);

function weightedLabels(entries = []) {
  return entries.map(entry => ({ label: entry.id, weight: entry.weight }));
}

function relationshipRows(relationships = {}) {
  return Object.entries(relationships).map(([residentId, relation]) => ({
    residentId,
    name: getResidentDefinition(residentId)?.displayName || residentId,
    affection: Number(relation.affection) || 0,
    trust: Number(relation.trust) || 0,
    familiarity: Number(relation.familiarity) || 0,
    tension: Number(relation.tension) || 0,
  })).sort((a, b) => b.familiarity - a.familiarity);
}

export function createAnimalAgentShowcaseProjection(character, saved = null) {
  if (!character || !getResidentDefinition(character.id)) return null;
  const profile = createChiiAnimalAgentProfile({
    _residentId: character.id,
    _petName: character.name,
  });
  if (!profile) return null;
  const state = createAgentRuntimeSnapshot(profile, saved?.state);
  const memory = saved?.memory || {};
  const preferences = Object.entries(profile.preferences.objects)
    .map(([id, weight]) => ({ id, label: OBJECT_LABELS[id] || id, weight: Number(weight) || 0 }))
    .sort((a, b) => b.weight - a.weight);
  const actions = [...new Set([...COMMON_ACTIONS, ...profile.capabilities.flatMap(capability => capability.actionIds)])]
    .map(id => ({ id, label: ACTION_LABELS[id] || id }));
  return Object.freeze({
    residentId: profile.identity.residentId,
    name: profile.identity.displayName,
    species: profile.identity.species,
    role: profile.identity.role,
    hasSavedLife: Boolean(saved),
    personality: Object.freeze({
      traits: Object.freeze(weightedLabels(profile.personality.traits)),
      values: Object.freeze(weightedLabels(profile.personality.values)),
      voiceStyle: profile.personality.voiceStyle,
      socialStyle: profile.personality.socialStyle,
    }),
    preferences: Object.freeze(preferences),
    capabilities: Object.freeze(profile.capabilities.map(capability => ({
      id: capability.id,
      level: capability.level,
      actions: capability.actionIds.map(id => ACTION_LABELS[id] || id),
    }))),
    actions: Object.freeze(actions),
    schedule: Object.freeze(profile.scheduleTemplate.map(item => ({ ...item }))),
    runtime: Object.freeze({
      mood: state.mood.label,
      drives: Object.freeze({ ...state.drives }),
      currentActivity: state.schedule.current?.activity || null,
      activeGoal: state.goals.active?.label || null,
      currentPlan: saved?.behavior?.reason || state.currentPlan?.reason || null,
      islandDay: state.schedule.islandDay,
      dailyCalls: state.cognition.dailyCalls,
      dailyCallBudget: state.cognition.dailyCallBudget,
    }),
    memory: Object.freeze({
      episodicCount: memory.episodic?.length || 0,
      factCount: memory.semanticFacts?.length || 0,
      reflectionCount: memory.reflections?.length || 0,
      recent: Object.freeze([...(memory.episodic || [])].sort((a, b) => b.at - a.at).slice(0, 5)
        .map(item => ({ id: item.id, summary: item.summary, outcome: item.outcome }))),
      relationships: Object.freeze(relationshipRows(memory.relationships)),
    }),
    architecture: ARCHITECTURE_STEPS,
  });
}

export { ACTION_LABELS as ANIMAL_AGENT_ACTION_LABELS };
