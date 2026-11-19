import { createAnimalAgentProfile } from '../../../gameplay/agents/AgentContracts.js';
import { getResidentDefinition, getResidentId } from './residentCatalog.js';

const DEFINITIONS = {
  momo: { species: 'bear', traits: ['憨厚', '温和'], values: ['自然', '照顾'], objects: { flower: 0.8, tree: 0.7, garden: 0.9 }, capabilities: ['vegetation'] },
  yafo: { species: 'bird', traits: ['调皮', '活泼'], values: ['漂亮', '自由'], objects: { flower: 0.9, decor: 0.8, tree: 0.5 }, capabilities: ['flight', 'decoration'] },
  mok: { species: 'crocodile', traits: ['凶狠', '强壮'], values: ['劳动', '力量'], objects: { farm: 0.9, wood: 0.8, stone: 0.7 }, capabilities: ['farming'] },
  mako: { species: 'horse', traits: ['沉稳', '可靠'], values: ['运动', '陪伴'], objects: { road: 0.8, apple_tree: 0.7 }, capabilities: ['sprint'] },
  lingq: { species: 'peacock', traits: ['活泼', '爱展示'], values: ['表演', '湿润'], objects: { water: 0.9, flower: 0.7 }, capabilities: ['water'] },
  fangk: { species: 'architect', traits: ['认真', '和蔼'], values: ['组织', '合作'], objects: { square: 0.9, campfire: 0.8 }, capabilities: ['organize'] },
  builder_crab: { species: 'crab', traits: ['爽快', '勤快'], values: ['建造', '实用'], objects: { building: 0.9, stone: 0.7, wood: 0.7 }, capabilities: ['building'] },
};

function capabilities(ids) {
  return ids.map(id => ({
    id,
    level: 0.7,
    actionIds: id === 'organize' ? ['social.greet', 'activity.propose']
      : id === 'building' ? ['social.greet', 'building.propose']
        : id === 'social' ? ['social.greet', 'social.cooperate']
          : ['social.greet', 'world.propose'],
  }));
}

export function createChiiAnimalAgentProfile(pet) {
  const resident = getResidentDefinition(getResidentId(pet));
  const id = resident?.id || getResidentId(pet);
  if (!id) return null;
  const source = DEFINITIONS[id] || {
    species: pet?._profile?.species || 'animal',
    traits: pet?._profile?.personalityTags || ['好奇'],
    values: pet?._profile?.featureTags || ['陪伴'],
    objects: {},
    capabilities: ['social'],
  };
  return createAnimalAgentProfile({
    residentId: id,
    displayName: pet?._petName || resident?.displayName || id,
    species: source.species,
    role: id === 'builder_crab' ? 'builder' : id === 'fangk' ? 'host' : 'resident',
    appearanceAssetId: resident?.assetId || pet?._assetId || id,
    personality: {
      traits: source.traits,
      values: source.values,
      voiceStyle: '可爱、简短、带一点幽默',
      socialStyle: id === 'mok' ? '嘴硬心软' : '友善自然',
    },
    preferences: { objects: source.objects, activities: { greeting: 0.6, party: id === 'fangk' ? 0.9 : 0.55 } },
    capabilities: capabilities(source.capabilities),
    scheduleTemplate: [
      { phase: 'morning', activity: '巡视住处' },
      { phase: 'afternoon', activity: '兴趣活动' },
      { phase: 'evening', activity: '和居民相处' },
    ],
  });
}
