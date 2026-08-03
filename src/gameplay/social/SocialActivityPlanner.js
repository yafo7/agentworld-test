import { validateActivityPlan } from './ActivityPlanValidator.js';

function parseJsonResponse(content) {
  const text = String(content || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : text);
}

function petSummary(pets) {
  return pets.map(pet => ({
    id: pet.id,
    personalityTags: pet.profile?.personalityTags || [],
    featureTags: pet.profile?.featureTags || [],
    favoriteActions: pet.profile?.favoriteActions || [],
  }));
}

function planCacheKey(kind, concept, initiatorId, pets, objects) {
  return JSON.stringify({
    kind,
    concept: String(concept || '').trim(),
    initiatorId: initiatorId || null,
    pets: pets.map(pet => pet.id).sort(),
    objects: objects.map(object => object.id).sort(),
  });
}

function cloneCachedPlan(plan) {
  return {
    ...plan,
    id: `${plan.type}_${Date.now().toString(36)}`,
    participants: [...plan.participants],
    targetObjectIds: [...plan.targetObjectIds],
    actionPrompts: { ...plan.actionPrompts },
    props: plan.props.map(prop => ({ ...prop, footprint: { ...prop.footprint } })),
    beats: [...plan.beats],
    dialogue: {
      ...plan.dialogue,
      reaction: plan.dialogue.reaction ? { ...plan.dialogue.reaction } : null,
      ambient: plan.dialogue.ambient.map(line => ({ ...line })),
    },
  };
}

export class SocialActivityPlanner {
  constructor({ contentPort, assetLibrary = null }) {
    this.contentPort = contentPort;
    this.assetLibrary = assetLibrary;
    this.planCache = new Map();
  }

  _reusablePropAssets() {
    return (this.assetLibrary?.list?.({ type: 'model', kind: 'event_prop' }) || [])
      .filter(asset => asset.key && asset.name)
      .slice(-24)
      .map(asset => ({
        libraryKey: asset.key,
        name: asset.name,
        prompt: asset.prompt,
        activityType: asset.activityType,
      }));
  }

  async planDaily({ concept, initiatorId, pets, objects }) {
    const availablePetIds = pets.map(pet => pet.id);
    const availableObjectIds = objects.map(object => object.id);
    const cacheKey = planCacheKey('daily', concept, initiatorId, pets, objects);
    const cached = this.planCache.get(cacheKey);
    if (cached) return cloneCachedPlan(cached);
    const content = await this.contentPort.chat({
      profile: 'planner',
      temperature: 0.45,
      maxTokens: 700,
      messages: [
        {
          role: 'system',
          content: [
            '你是奇异岛城镇小活动策划宠物。只输出JSON，不写解释。',
            '活动只允许1到2只宠物，地点只能是church_square、campfire或apple_tree。',
            '每只宠物动作必须是5到10字具体中文，不写抽象氛围。',
            '对白采用观察、邀请、回应三步，每句简短，只保留一个小幽默。',
            '格式:{"type":"custom_daily","scale":"daily","title":"名称","initiatorId":"id","exitPetId":"id","participants":["id"],"locationId":"church_square","targetObjectIds":[],"actionPrompts":{"id":"具体动作"},"dialogue":{"proposal":"观察和邀请","accept":"接受后的回应","ready":"动作开场","reaction":{"speakerId":"id","text":"动作后的回应"},"end":"结束对白"}}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({ concept, initiatorId, pets: petSummary(pets), objects }),
        },
      ],
    });
    const raw = parseJsonResponse(content);
    raw.type = 'custom_daily';
    raw.scale = 'daily';
    raw.hostId = initiatorId;
    raw.exitPetId = initiatorId;
    raw.initiatorId = initiatorId;
    raw.concept = concept;
    raw.participants = [...new Set([initiatorId, ...(raw.participants || [])])].slice(0, 2);
    const plan = validateActivityPlan(raw, { availablePetIds, availableObjectIds });
    this.planCache.set(cacheKey, plan);
    return cloneCachedPlan(plan);
  }

  async planFestival({ concept, pets, objects }) {
    const availablePetIds = pets.map(pet => pet.id);
    const availableObjectIds = objects.map(object => object.id);
    const cacheKey = planCacheKey('festival', concept, 'fangk', pets, objects);
    const cached = this.planCache.get(cacheKey);
    if (cached) return cloneCachedPlan(cached);
    const reusableAssets = this._reusablePropAssets();
    const content = await this.contentPort.chat({
      profile: 'planner',
      temperature: 0.5,
      maxTokens: 1000,
      messages: [
        {
          role: 'system',
          content: [
            '你是奇异岛节日策划师fangk。只输出JSON，不写解释。',
            '使用给定宠物和对象，地点只能是church_square或campfire。',
            '最多生成两个具体可见的体素道具，每个模型描述15到20字。',
            '先查看reusableAssets；有合适道具时operation写library并原样填写libraryKey，不合适才写generate。',
            '每个道具填写sizeProfile，只能用small_decor、event_table、event_food、festival_prop、furniture、plant。',
            '每只宠物动作必须是5到10字具体中文。对白要可爱、温暖、略带幽默。',
            '环境对白最多三句，由不同参与宠物轮流说，不能重复同一种比喻。',
            '格式:{"type":"custom_festival","scale":"festival","title":"节日名","hostId":"fangk","initiatorId":"fangk","participants":["id"],"locationId":"church_square","targetObjectIds":[],"actionPrompts":{"id":"具体动作"},"props":[{"id":"prop","name":"道具名","operation":"generate或library","libraryKey":"仅复用时填写","prompt":"具体模型描述","footprint":{"width":2,"depth":2}}],"dialogue":{"proposal":"活动邀请","accept":"接受回应","ready":"开场对白","ambient":[{"speakerId":"id","text":"活动中的短句"}],"end":"结束对白"}}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({ concept, pets: petSummary(pets), objects, reusableAssets }),
        },
      ],
    });
    const raw = parseJsonResponse(content);
    raw.type = 'custom_festival';
    raw.scale = 'festival';
    raw.hostId = 'fangk';
    raw.exitPetId = 'fangk';
    raw.initiatorId = 'fangk';
    raw.concept = concept;
    raw.participants = [...new Set(['fangk', ...(raw.participants || availablePetIds)])].slice(0, 6);
    const reusableKeys = new Set(reusableAssets.map(asset => asset.libraryKey));
    raw.props = (raw.props || []).map(prop => (
      prop?.operation === 'library' && reusableKeys.has(prop.libraryKey)
        ? prop
        : { ...prop, operation: 'generate', libraryKey: null }
    ));
    const plan = validateActivityPlan(raw, { availablePetIds, availableObjectIds });
    this.planCache.set(cacheKey, plan);
    return cloneCachedPlan(plan);
  }
}

export { parseJsonResponse as parseSocialPlannerJson };
