import { PromptCompilerPort } from '../../../ports/PromptCompilerPort.js';
import { compileResidentBehavior } from './ResidentBehaviorPrompt.js';
import {
  PROMPT_OPERATIONS,
  PROMPT_PROFILE_VERSION,
  PROMPT_SCHEMA_VERSION,
  createGenerationIntent,
  createPromptRequestId,
} from './PromptOperations.js';

const ABSTRACT_REWRITES = Object.freeze([
  [/梦幻/g, '蓝绿色与发光蘑菇'],
  [/温暖/g, '原木与暖黄色灯'],
  [/可爱/g, '圆脑袋短手短脚'],
  [/神秘/g, '深色结构与发光水晶'],
  [/强壮/g, '宽肩粗壮四肢'],
  [/漂亮|好看/g, '配色清晰'],
  [/高级/g, '结构整齐材质清楚'],
]);
const ABSTRACT_TERMS = /感觉|氛围|治愈|有趣|特别|神奇|适合|充满|表现出/;
const ANCHOR_TERMS = /头顶|左手|右手|背部|胸前|腰侧|屋顶|屋脊|墙|树枝|地面|顶部|手里/;

function text(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactChinese(value, fallback = '') {
  return text(value, fallback)
    .replace(/帮我|请帮我|请生成|生成一个|创造一个/g, '')
    .replace(/\s*([，。！？；：、])\s*/g, '$1')
    .replace(/[。！？]+$/g, '');
}

function visibleText(value, fallback = '') {
  let output = compactChinese(value, fallback);
  for (const [pattern, replacement] of ABSTRACT_REWRITES) output = output.replace(pattern, replacement);
  return output;
}

function stableHash(value) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function joinPrompt(base, constraint) {
  const left = compactChinese(base);
  const right = compactChinese(constraint);
  if (!right || left.includes(right)) return left;
  return `${left}，${right}`;
}

function semanticModelDescription(intent) {
  const semantic = intent.semantic || {};
  if (!semantic.subject) return visibleText(intent.source.text || intent.input.description, '一个原木小装饰');
  const classifier = semantic.classifier || (intent.operation === PROMPT_OPERATIONS.PET_GENERATE ? '一只' : '一个');
  return [
    `${classifier}${semantic.mainColor || ''}${semantic.bodyShape || ''}${semantic.subject}`,
    semantic.material,
    semantic.structure,
    ...(semantic.features || []),
  ].map(item => compactChinese(item)).filter(Boolean).join('，');
}

function compileModel(intent) {
  const constraints = intent.constraints || {};
  const description = joinPrompt(
    semanticModelDescription(intent),
    constraints.generationConstraint,
  );
  return {
    templateId: intent.operation === PROMPT_OPERATIONS.PET_GENERATE
      ? 'pet-visible-v2'
      : intent.operation === PROMPT_OPERATIONS.BUILDING_GENERATE
        ? 'building-footprint-v2'
        : 'model-visible-v2',
    capability: 'content.model.generate',
    payload: {
      description,
      quality: constraints.qualityProfile || 'voxel',
    },
  };
}

function compileRefine(intent) {
  const semantic = intent.semantic || {};
  const identity = compactChinese(semantic.identity || intent.target.identity || intent.target.name);
  const targetPart = compactChinese(semantic.targetPart || intent.input.targetPart);
  const change = visibleText(semantic.change || intent.input.change || intent.source.text || intent.input.description);
  let description = change;
  if (identity && targetPart && change) {
    description = `保留${identity}与整体比例，只将${targetPart}改成${change}，其余不变`;
  } else if (identity && change && !/^保留/.test(change)) {
    description = `保留${identity}与原有结构，${change}，其余不变`;
  }
  return {
    templateId: 'refine-identity-v2',
    capability: 'content.model.refine',
    payload: { modelJson: intent.input.modelJson, description },
  };
}

function compileMount(intent) {
  const semantic = intent.semantic || {};
  const rawPart = semantic.part || intent.input.part || intent.source.text;
  const part = rawPart && typeof rawPart === 'object'
    ? rawPart
    : visibleText(rawPart, '原木小装饰');
  let placement = compactChinese(semantic.placement || intent.input.placement, '顶部中央');
  if (placement === '顶部') placement = '顶部中央，保持竖直，不遮挡主体';
  if (placement === '头部') placement = '头顶两耳之间，保持水平，不遮挡眼睛';
  return {
    templateId: 'mount-anchor-v2',
    capability: 'content.model.mount',
    payload: { primaryModelJson: intent.input.modelJson, part, placement },
  };
}

function compileAnimation(intent) {
  const semantic = intent.semantic || {};
  const description = visibleText(
    semantic.action || intent.input.description || intent.source.text,
    '轻轻呼吸摇摆',
  );
  return {
    templateId: intent.constraints.emitParticles ? 'animation-vfx-v2' : 'animation-motion-v2',
    capability: 'content.animation.generate',
    payload: {
      modelJson: intent.input.modelJson,
      description,
      duration: Number(intent.constraints.duration) || 2,
      emitParticles: Boolean(intent.constraints.emitParticles),
    },
  };
}

function atomicWorldPrompts(intent) {
  const explicit = Array.isArray(intent.input.steps) ? intent.input.steps : null;
  const source = explicit?.length
    ? explicit
    : text(intent.source.text || intent.input.description)
      .replace(/然后|同时还要|接着|再在/g, '。')
      .split(/[。；;\n]+/)
      .map(prompt => ({ prompt }));
  const initialMode = intent.operation === PROMPT_OPERATIONS.TERRAIN_GENERATE ? 'generate' : 'refine';
  return source.map((entry, index) => ({
    mode: entry.mode || (index === 0 ? initialMode : 'refine'),
    prompt: compactChinese(entry.prompt || entry.description).slice(0, 60),
  })).filter(entry => entry.prompt);
}

function compileTerrain(intent) {
  return {
    templateId: 'worldforge-atomic-map-v2',
    capability: 'worldforge.map.author',
    payload: {
      mapId: intent.target.mapId || intent.input.mapId,
      steps: atomicWorldPrompts(intent),
      label: text(intent.input.label, '奇异岛地图调整').slice(0, 80),
    },
  };
}

function plannerPets(pets = []) {
  return pets.map(pet => ({
    id: pet.id,
    personalityTags: pet.profile?.personalityTags || pet.personalityTags || [],
    featureTags: pet.profile?.featureTags || pet.featureTags || [],
    favoriteActions: pet.profile?.favoriteActions || pet.favoriteActions || [],
  }));
}

function compileEvent(intent) {
  if (intent.input.festivalBrief) {
    const { festivalBrief, residents, objects, correction } = intent.input;
    return { templateId: 'island-festival-book-v1', capability: 'content.chat.plan-event',
      payload: { profile: 'planner', temperature: 0.45, maxTokens: 5000, messages: [
        { role: 'system', content: [
          '你是奇异岛的组织者fangk。根据玩家已经确认的三个回答策划一个可执行节日。只输出JSON。保留玩家给定的节日名，所有居民各有贴合性格的分工。',
          '顶层字段为title、locationId、events、cast、links、props、dialogue。events是{id,name}数组，cast为按居民ID索引的对象，每位有role与steps。links是{from,to,label}数组，props是{id,name,prompt,sizeProfile}数组，dialogue包含ready和end。',
          '已有动作步骤示例 {"eventId":"show","name":"安静听铃","seconds":6,"animation":"idle"}。新动作示例 {"eventId":"show","name":"举手摇铃","seconds":5,"prompt":"抬臂左右摇铃"}。字段名严格使用animation或prompt其中一个。不要使用合并字段名或额外嵌套。',
          'events按开演顺序排列，1至5项，每项至少有一位居民执行，id使用英文短标识。cast须覆盖输入中的每位居民。fangk为host，其他role任选helper、dancer、spectator、participant。每人1至6个步骤，每步引用一个eventId，seconds为2至12秒。',
          'animation必须逐人从该居民的animations中原样选取，不能借用其他居民的动作。例如fangk没有wave时，挥手指挥应填prompt「抬臂左右挥手指挥」，不要填animation。安静观看可用该居民的idle。特殊动作可用prompt代替animation，3至12个汉字描述具体肢体动作。原地表演，不使用walk。集合和离场由岛上处理。',
          'links只列具体合作关系；from和to必须是两位不同的已知居民。locationId选church_square或campfire。props按主题需要生成0至2件，id为英文标识，prompt用15至20字描述一个可见体素道具。sizeProfile选festival_prop、event_food或event_table。不要生成角色、代码或虚构岛上物品。'
        ].join('\n') },
        { role: 'user', content: JSON.stringify({ festivalBrief, residents, objects, correction }) },
      ] } };
  }
  const scale = intent.input.scale === 'festival' ? 'festival' : 'daily';
  const festival = scale === 'festival';
  const reusableAssets = intent.input.reusableAssets || [];
  const system = festival ? [
    '你是奇异岛节日策划师fangk。只输出JSON，不写解释。',
    '只能使用输入中存在的宠物和对象，地点只能是church_square或campfire。',
    '先查看reusableAssets；可复用时operation写library，不足时才写generate，最多生成两个道具。',
    '道具描述15到20字，宠物动作5到10字，活动必须由fangk对话开始并确认结束。',
    '格式:{"type":"custom_festival","scale":"festival","title":"节日名","hostId":"fangk","initiatorId":"fangk","exitPetId":"fangk","participants":["id"],"locationId":"church_square","targetObjectIds":[],"actionPrompts":{"id":"具体动作"},"props":[{"id":"prop","name":"道具名","operation":"generate或library","libraryKey":"复用键","sizeProfile":"festival_prop","prompt":"具体模型描述","footprint":{"width":2,"depth":2}}],"dialogue":{"proposal":"活动邀请","accept":"接受回应","ready":"开场对白","ambient":[{"speakerId":"id","text":"活动短句"}],"end":"结束对白"}}',
  ] : [
    '你是奇异岛城镇小活动策划宠物。只输出JSON，不写解释。',
    '只能使用输入中存在的宠物和对象；活动包含1到2只宠物，地点只能是church_square、campfire或apple_tree。',
    '每只宠物动作5到10字，只描述一个具体动作；活动由发起宠物对话开始并确认结束。',
    '格式:{"type":"custom_daily","scale":"daily","title":"名称","initiatorId":"id","exitPetId":"id","participants":["id"],"locationId":"church_square","targetObjectIds":[],"actionPrompts":{"id":"具体动作"},"dialogue":{"proposal":"观察和邀请","accept":"接受回应","ready":"动作开场","reaction":{"speakerId":"id","text":"动作回应"},"end":"结束对白"}}',
  ];
  return {
    templateId: festival ? 'event-festival-v2' : 'event-daily-v2',
    capability: 'content.chat.plan-event',
    payload: {
      profile: 'planner',
      temperature: festival ? 0.5 : 0.45,
      maxTokens: festival ? 1000 : 700,
      messages: [
        { role: 'system', content: system.join('\n') },
        {
          role: 'user',
          content: JSON.stringify({
            concept: text(intent.source.text || intent.input.concept).slice(0, 80),
            initiatorId: intent.input.initiatorId || (festival ? 'fangk' : null),
            pets: plannerPets(intent.input.pets),
            objects: intent.input.objects || [],
            reusableAssets,
          }),
        },
      ],
    },
  };
}

function compileTask(intent) {
  return {
    templateId: 'task-objective-v2',
    capability: 'content.chat.plan-task',
    payload: {
      profile: 'planner',
      temperature: 0.35,
      maxTokens: 500,
      messages: [
        {
          role: 'system',
          content: [
            '你是奇异岛轻量任务整理器。只输出JSON，不解释。',
            '只能引用输入中存在的角色、对象和地点。任务必须有开始入口、一个可验证目标、导航目标和确认结束方式。',
            '格式:{"title":"任务名","entry":{"type":"pet_dialogue","petId":"id"},"objective":{"verb":"visit或interact或collect","targetId":"id","count":1},"guidanceTargetId":"id","completion":{"type":"interaction","targetId":"id"},"dialogue":{"start":"开始对白","complete":"完成对白"}}',
          ].join('\n'),
        },
        { role: 'user', content: JSON.stringify(intent.input.context || {}) },
      ],
    },
  };
}

function compileAgentPlan(intent) {
  return {
    templateId: 'animal-agent-plan-v1',
    capability: 'content.chat.agent-plan',
    payload: {
      profile: 'planner', temperature: 0.25, maxTokens: 260,
      messages: [
        {
          role: 'system',
          content: [
            '你是奇异岛小动物的生活决策器，只输出JSON，不解释。',
            '只能从candidates中原样选择actionId和targetId，不能创造动作、地点或对象。',
            '结合性格、当前需求、附近环境和记忆选择自然的一项，避免重复上一件事。',
            '格式:{"actionId":"候选动作","targetId":null,"reason":"15字以内的具体理由"}',
          ].join('\n'),
        },
        { role: 'user', content: JSON.stringify(intent.input.context || {}) },
      ],
    },
  };
}

function compileAgentReflection(intent) {
  return {
    templateId: 'animal-agent-reflection-v1',
    capability: 'content.chat.agent-reflect',
    payload: {
      profile: 'planner', temperature: 0.3, maxTokens: 320,
      messages: [
        {
          role: 'system',
          content: [
            '你是奇异岛小动物的记忆整理器，只输出JSON，不解释。',
            '根据给出的真实记忆总结一条稳定认识，不得补充未发生的事件。',
            '格式:{"summary":"40字以内的认识","sourceMemoryIds":["id"],"tags":["标签"]}',
          ].join('\n'),
        },
        { role: 'user', content: JSON.stringify(intent.input.context || {}) },
      ],
    },
  };
}

function compileAgentDialogue(intent) {
  return {
    templateId: 'animal-agent-dialogue-v1',
    capability: 'content.chat.agent-dialogue',
    payload: {
      profile: 'planner', temperature: 0.55, maxTokens: 180,
      messages: [
        {
          role: 'system',
          content: [
            '你是奇异岛小动物，只输出JSON，不解释。',
            '说一句轻松、自然、略带幽默的中文短句，只能提到输入中的真实经历。',
            '格式:{"text":"30字以内对白","memoryIds":["引用的记忆id"]}',
          ].join('\n'),
        },
        { role: 'user', content: JSON.stringify(intent.input.context || {}) },
      ],
    },
  };
}

function validateCompiled(packet) {
  const errors = [];
  const warnings = [];
  const prompt = packet.payload.description || packet.payload.part || '';
  if (packet.capability.startsWith('content.model') && !prompt) errors.push('missing_prompt');
  if (ABSTRACT_TERMS.test(prompt)) warnings.push('abstract_language');
  if (prompt.length > 80) warnings.push('prompt_too_long');
  if (packet.operation === PROMPT_OPERATIONS.MODEL_REFINE) {
    if (!packet.payload.modelJson) errors.push('missing_target_model');
    if (!/保留|不变/.test(packet.payload.description)) warnings.push('identity_preservation_not_explicit');
  }
  if (packet.operation === PROMPT_OPERATIONS.MODEL_MOUNT) {
    if (!packet.payload.primaryModelJson) errors.push('missing_primary_model');
    if (!ANCHOR_TERMS.test(packet.payload.placement || '')) errors.push('missing_mount_anchor');
  }
  if (packet.operation === PROMPT_OPERATIONS.ANIMATION_GENERATE && !packet.payload.modelJson) {
    errors.push('missing_animation_model');
  }
  if (packet.operation === PROMPT_OPERATIONS.BUILDING_GENERATE) {
    const footprint = packet.constraints.footprint;
    if (!footprint?.width || !footprint?.depth) errors.push('missing_building_footprint');
  }
  if (packet.capability === 'worldforge.map.author') {
    if (!packet.payload.mapId) errors.push('missing_map_id');
    if (!packet.payload.steps.length) errors.push('missing_world_steps');
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings) });
}

export function shouldUseSemanticUnderstanding(intentInput) {
  const intent = intentInput?.operation ? intentInput : createGenerationIntent(intentInput);
  if (intent.semanticPlanning === 'required') return true;
  if (intent.semanticPlanning === 'disabled') return false;
  const source = intent.source.text;
  return source.length > 48 || ABSTRACT_TERMS.test(source)
    || /梦幻|温暖|可爱|神秘|高级|漂亮|感觉|风格/.test(source);
}

export class PromptCompiler extends PromptCompilerPort {
  compile(intentInput) {
    const intent = Object.isFrozen(intentInput) ? intentInput : createGenerationIntent(intentInput);
    let compiled;
    switch (intent.operation) {
      case PROMPT_OPERATIONS.MODEL_GENERATE:
      case PROMPT_OPERATIONS.PET_GENERATE:
      case PROMPT_OPERATIONS.BUILDING_GENERATE:
        compiled = compileModel(intent);
        break;
      case PROMPT_OPERATIONS.MODEL_REFINE:
        compiled = compileRefine(intent);
        break;
      case PROMPT_OPERATIONS.MODEL_MOUNT:
        compiled = compileMount(intent);
        break;
      case PROMPT_OPERATIONS.ANIMATION_GENERATE:
        compiled = compileAnimation(intent);
        break;
      case PROMPT_OPERATIONS.TERRAIN_GENERATE:
      case PROMPT_OPERATIONS.TERRAIN_REFINE:
        compiled = compileTerrain(intent);
        break;
      case PROMPT_OPERATIONS.EVENT_PLAN:
        compiled = compileEvent(intent);
        break;
      case PROMPT_OPERATIONS.TASK_PLAN:
        compiled = compileTask(intent);
        break;
      case PROMPT_OPERATIONS.AGENT_PLAN:
        compiled = compileAgentPlan(intent);
        break;
      case PROMPT_OPERATIONS.RESIDENT_BEHAVIOR:
        compiled = compileResidentBehavior(intent);
        break;
      case PROMPT_OPERATIONS.AGENT_REFLECT:
        compiled = compileAgentReflection(intent);
        break;
      case PROMPT_OPERATIONS.AGENT_DIALOGUE:
        compiled = compileAgentDialogue(intent);
        break;
      default:
        throw new TypeError(`Unsupported prompt operation: ${intent.operation}`);
    }
    const packet = {
      id: createPromptRequestId('packet'),
      schemaVersion: PROMPT_SCHEMA_VERSION,
      promptProfileVersion: PROMPT_PROFILE_VERSION,
      operation: intent.operation,
      templateId: compiled.templateId,
      capability: compiled.capability,
      payload: Object.freeze({ ...compiled.payload }),
      constraints: Object.freeze({ ...intent.constraints }),
      preconditions: Object.freeze([...(intent.input.preconditions || [])]),
      approval: intent.approval,
      provenance: Object.freeze({
        intentId: intent.id,
        sourceKind: intent.source.kind,
        semanticPlannerUsed: Boolean(intent.semantic),
      }),
    };
    packet.validation = validateCompiled(packet);
    packet.cacheKey = `${intent.operation}:${stableHash({
      payload: packet.payload,
      targetRevision: intent.target.revision || null,
      constraints: packet.constraints,
      profile: PROMPT_PROFILE_VERSION,
    })}`;
    return Object.freeze(packet);
  }

  validate(packet) {
    return validateCompiled(packet);
  }
}

export { visibleText as normalizeVisiblePromptText };
