export const TOWN_SOCIAL_DIALOGUE = Object.freeze({
  fangk: {
    idle: '广场今天挺安静的。我正在琢磨一个小安排。',
    smallTalk: '大家都在，路也通畅。今天适合慢慢玩。',
    custom: '好，你说想办什么，我来把大家安排得明明白白。',
    active: '大家玩得正起劲。要继续，还是准备收尾？',
    preparing: '还在准备，很快就能开场。现在也可以取消。',
    continue: '好，那就再玩一会儿。',
    end: '收工啦。东西归位，笑声可以先留在广场上。',
  },
  mako: {
    idle: '我正在找一件适合跑两步再完成的小事。',
    smallTalk: '刚才绕广场跑了一圈，风正好。',
    custom: '你说吧。只要方向清楚，我就能跑过去。',
  },
  lingq: {
    idle: '我觉得广场还差一个漂亮的小动作。',
    smallTalk: '今天光线不错，我已经找到最好看的方向了。',
    custom: '这个点子听起来很上镜，我来想想怎么演。',
  },
  generic: {
    idle: '我刚好有空。要不要一起做点什么？',
    smallTalk: '在广场待一会儿也挺舒服。',
    custom: '好呀，说说你的点子。',
  },
});

const FESTIVAL_ACTIVITY_TYPES = new Set(['party', 'birthday', 'new_year', 'custom_festival']);
const DANCE_ACTIVITY_TYPES = new Set(['campfire', ...FESTIVAL_ACTIVITY_TYPES]);

export const TOWN_ACTIVITY_MIN_PERFORMANCE_DURATION = 10;

const TOWN_ACTIVITY_PHASES = Object.freeze({
  preparing: { index: 1, label: '准备' },
  gathering: { index: 2, label: '集合' },
  costume_change: { index: 2, label: '变装' },
  new_year_greetings: { index: 3, label: '拜年' },
  new_year_dance_gathering: { index: 4, label: '围火' },
  new_year_dancing: { index: 5, label: '跳舞' },
  new_year_feast_setup: { index: 6, label: '开饭' },
  new_year_feast_gathering: { index: 6, label: '入席' },
  new_year_feast: { index: 7, label: '团圆饭' },
  performing: { index: 3, label: '活动' },
  linger: { index: 4, label: '一起玩' },
  prop_exit: { index: 8, label: '收尾' },
  wind_down: { index: 4, label: '收尾' },
});

const NEW_YEAR_GREETING_LINES = Object.freeze({
  fangk: Object.freeze({ pet: '新年好！计划本祝你今年每一页都顺顺利利。', player: '新年好！也祝你的计划少一点加班。' }),
  lingq: Object.freeze({ pet: '新年好！祝你每天都能找到最好看的那一面。', player: '新年好！你的尾羽已经赢在第一天了。' }),
  mako: Object.freeze({ pet: '新年好。祝你想去的地方，都能稳稳跑到。', player: '新年好！今天先跑向年夜饭吧。' }),
  crab: Object.freeze({ pet: '新年好！祝你今年盖什么都不歪，除了想歪的点子。', player: '新年好！钳子也要记得放个假。' }),
});

const DEFAULT_NEW_YEAR_GREETING = Object.freeze({
  pet: '新年好！祝你今年遇见的每件小事都刚刚好。',
  player: '新年好！也祝你每天都有新点子。',
});

const ACTIVITY_INVITE_LINES = Object.freeze({
  fangk: '收到，我把计划本和自己一起带过去。',
  lingq: '好呀，我先找一个最上镜的位置。',
  mako: '没问题。我会准时到，顺便多跑两步。',
  crab: '收到！我带钳子，但保证今天不乱施工。',
});

const ACTIVITY_ACTION_LINES = Object.freeze({
  campfire: Object.freeze({
    fangk: '很好，篝火负责暖和，我们负责别坐得太整齐。',
    lingq: '这个火光很懂我的尾羽。',
    mako: '蹄子暖了，再跑一圈也不迟。',
  }),
  apple_pick: Object.freeze({ mako: '就是这颗。它晃得像在主动报名。' }),
  greeting: Object.freeze({
    lingq: '看好啦，这个招呼连尾羽角度都算过。',
    mako: '收到。我会站稳一点，免得抢了镜头。',
  }),
  party: Object.freeze({
    fangk: '很好，今天仍然没有谁跳进篝火。',
    lingq: '这边的观众请看尾羽！',
    mako: '这个节拍很适合踏步。',
  }),
  birthday: Object.freeze({
    fangk: '惊喜正在按计划靠近，寿星先别回头。',
    mako: '原来你们刚才认真地偷偷摸摸，是为了这个。',
    lingq: '礼帽很合适，我的审美也签字了。',
  }),
  new_year: Object.freeze({
    fangk: '新年流程第一条：开心；第二条：别漏掉吃饭。',
    lingq: '红色很衬尾羽，也很衬今天的好心情。',
    mako: '我会慢慢吃。至少第一盘会。',
    crab: '钳子今天只夹菜，不夹施工单。',
  }),
});

export function isTownFestivalActivity(type) {
  return FESTIVAL_ACTIVITY_TYPES.has(type);
}

export function isTownDanceActivity(type) {
  return DANCE_ACTIVITY_TYPES.has(type);
}

export function getTownActivityPhase(status) {
  const phaseKey = status === 'birthday_intro' ? 'performing' : status;
  return {
    key: phaseKey,
    ...(TOWN_ACTIVITY_PHASES[phaseKey] || TOWN_ACTIVITY_PHASES.preparing),
  };
}

export function getTownSocialDialogueProfile(petId) {
  return TOWN_SOCIAL_DIALOGUE[petId] || TOWN_SOCIAL_DIALOGUE.generic;
}

export function getTownNewYearGreeting(petId) {
  return NEW_YEAR_GREETING_LINES[petId] || DEFAULT_NEW_YEAR_GREETING;
}

export function getTownActivityInviteLine(petId) {
  return ACTIVITY_INVITE_LINES[petId] || '好呀，我收拾一下就过去！';
}

export function getTownActivityActionLine(type, petId, displayName = petId) {
  return ACTIVITY_ACTION_LINES[type]?.[petId]
    || `${displayName}：“这个动作我准备好啦！”`;
}

export function getTownActivityIdleOptions({ petId, wasFollowing, opportunity = null }) {
  const stateOption = wasFollowing
    ? { key: 'free_roam', label: '先在广场自由活动吧！' }
    : { key: 'follow', label: '和我一起逛逛吧！' };
  if (petId === 'fangk') {
    return [
      opportunity
        ? { key: opportunity.type, label: opportunity.acceptLabel }
        : { key: 'chat', label: '聊聊今天的广场' },
      { key: 'custom_festival', label: '我想策划一个新节日！' },
      stateOption,
    ];
  }
  return [
    opportunity
      ? { key: opportunity.type, label: opportunity.acceptLabel }
      : { key: 'chat', label: '聊聊刚才在做什么' },
    { key: 'custom_daily', label: '我有个小活动点子！' },
    stateOption,
  ];
}

export function getTownActivityContinueLine(type, petId) {
  if (type === 'apple_pick') return '好，再看看下一颗。它们今天都挺积极。';
  if (type === 'greeting') return '好，我再练一次。这次争取看起来像没练过。';
  if (type === 'campfire') return '那就再暖一会儿，篝火还没有下班。';
  return petId === 'fangk' ? TOWN_SOCIAL_DIALOGUE.fangk.continue : '好呀，那就再玩一会儿！';
}

export function getTownActivityStartLine(type, petId) {
  if (type === 'custom_festival') return TOWN_SOCIAL_DIALOGUE.fangk.custom;
  const definition = getTownActivityDefinition(type);
  if (definition) return definition.dialogue.accept;
  const profile = getTownSocialDialogueProfile(petId);
  return profile.custom || TOWN_SOCIAL_DIALOGUE.generic.custom;
}

export const TOWN_ACTIVITY_DEFINITIONS = Object.freeze({
  campfire: {
    type: 'campfire',
    scale: 'daily',
    title: '暖乎乎烤火会',
    initiatorId: 'fangk',
    participantMode: 'listed',
    defaultParticipantIds: ['fangk', 'lingq', 'mako'],
    locationId: 'campfire',
    targetObjectTags: ['篝火'],
    autoEnd: false,
    performanceDuration: 8,
    opportunity: {
      label: '去篝火边坐一会儿',
      proposal: '篝火烧得刚刚好。要不要叫大家过去暖一会儿？',
      acceptLabel: '好呀，叫上大家吧',
      preferredProfileTags: ['喜欢组织', '擅长集体活动'],
      priority: 40,
    },
    actionPrompts: {
      fangk: '围着篝火摆手跳舞',
      lingq: '展开尾羽绕火跳舞',
      mako: '围着篝火踏步跳舞',
    },
    dialogue: {
      accept: '好，我去叫他们。篝火今天负责暖和，我们负责坐好。',
      ready: '都到齐了，找个舒服的位置吧。',
      reaction: { speakerId: 'mako', text: '嗯，蹄子也暖和了。' },
      ambient: [
        { speakerId: 'lingq', text: '火光很适合我的尾巴。' },
        { speakerId: 'fangk', text: '坐得不错，队形也很松弛。' },
      ],
      end: '暖够啦，大家慢慢散步回去吧。',
    },
    beats: ['notice', 'invite', 'gather', 'perform', 'reaction', 'wind_down'],
  },
  apple_pick: {
    type: 'apple_pick',
    scale: 'daily',
    title: '苹果主动报名日',
    initiatorId: 'mako',
    participantMode: 'listed',
    defaultParticipantIds: ['mako'],
    locationId: 'apple_tree',
    targetObjectTags: ['apple'],
    autoEnd: false,
    performanceDuration: 3.2,
    opportunity: {
      label: '陪mako看看苹果树',
      proposal: '那棵苹果树晃了半天。要不要陪我去看看？',
      acceptLabel: '走吧，去看看',
      preferredProfileTags: ['喜欢运动', '可靠'],
      priority: 50,
    },
    actionPrompts: { mako: '伸手摘下红苹果' },
    props: [{
      id: 'picked_apple',
      name: '刚摘下的苹果',
      operation: 'generate',
      archetype: 'event_food',
      sizeProfile: 'event_food',
      prompt: '一个红色方块苹果带绿色小叶子',
      footprint: { width: 1, depth: 1 },
    }],
    dialogue: {
      accept: '走吧。它再晃两下，可能就要自己跳下来了。',
      ready: '就是这颗，我看准了。',
      reaction: { speakerId: 'mako', text: '看吧，它果然是自己报名的。' },
      ambient: [],
      end: '苹果到手，我们慢慢走回去吧。',
    },
    beats: ['notice', 'invite', 'approach', 'perform', 'reaction', 'wind_down'],
  },
  greeting: {
    type: 'greeting',
    scale: 'daily',
    title: '漂亮招呼练习',
    initiatorId: 'lingq',
    participantMode: 'listed',
    defaultParticipantIds: ['lingq', 'mako'],
    locationId: 'church_square',
    targetObjectTags: [],
    autoEnd: false,
    performanceDuration: 3.4,
    opportunity: {
      label: '帮lingq练习打招呼',
      proposal: 'mako正好在那边。要不要看看我新练的招呼？',
      acceptLabel: '好呀，去打个招呼',
      preferredProfileTags: ['喜欢展示', '活泼'],
      priority: 50,
    },
    actionPrompts: {
      lingq: '展开尾羽挥翅问好',
      mako: '点头抬蹄回应问好',
    },
    dialogue: {
      accept: '看好啦，我今天连尾羽的角度都算过。',
      ready: 'mako，借我一个观众的位置！',
      reaction: { speakerId: 'mako', text: '收到。这个招呼很有精神。' },
      ambient: [],
      end: '练习成功，下次可以自然一点点。',
    },
    beats: ['notice', 'invite', 'approach', 'perform', 'reaction', 'wind_down'],
  },
  party: {
    type: 'party',
    scale: 'festival',
    title: '篝火蹦蹦派对',
    initiatorId: 'fangk',
    participantMode: 'all',
    locationId: 'campfire',
    targetObjectTags: ['篝火'],
    autoEnd: false,
    performanceDuration: 0,
    opportunity: {
      label: '办一场篝火派对',
      proposal: '大家今天都在广场。要不要干脆办一场篝火派对？',
      acceptLabel: '开始吧，我也参加',
      preferredProfileTags: ['喜欢组织', '擅长集体活动'],
      priority: 30,
    },
    defaultPrompt: '围着篝火开心跳舞',
    dialogue: {
      accept: '好，我去叫大家。迟到的那位负责多跳两下。',
      ready: '位置都找好，派对开始。',
      reaction: null,
      ambient: [
        { speakerId: 'lingq', text: '这边的观众请看尾羽！' },
        { speakerId: 'mako', text: '这个节拍很适合踏步。' },
        { speakerId: 'fangk', text: '很好，没有谁跳进篝火里。' },
      ],
      end: '派对收工，大家散步放松一下。',
    },
    beats: ['invite', 'gather', 'opening', 'perform', 'festival_hold', 'host_exit'],
  },
  birthday: {
    type: 'birthday',
    scale: 'festival',
    title: 'mako的生日会',
    initiatorId: 'fangk',
    subjectId: 'mako',
    participantMode: 'all',
    locationId: 'church_square',
    targetObjectTags: [],
    autoEnd: false,
    performanceDuration: 0,
    opportunity: {
      label: '悄悄准备mako的生日会',
      proposal: '我准备给mako一个生日惊喜。你愿意帮我把大家叫来吗？',
      acceptLabel: '当然，开始准备吧',
      preferredProfileTags: ['喜欢组织', '可靠'],
      priority: 20,
    },
    actionPrompt(subjectId, petId) {
      return petId === subjectId ? '戴着礼帽开心跳舞' : '围着蛋糕拍手跳舞';
    },
    props: [{
      id: 'birthday_table',
      name: '生日蛋糕桌',
      operation: 'generate',
      archetype: 'event_table',
      sizeProfile: 'event_table',
      prompt: '木桌上放着彩色生日蛋糕和点亮蜡烛',
      footprint: { width: 3, depth: 2 },
      revealStage: 'birthday',
    }],
    dialogue: {
      accept: '好。先小声一点，惊喜最怕提前听见自己。',
      ready: '惊喜送到，寿星请站到中间。',
      reaction: null,
      ambient: [
        { speakerId: 'mako', text: '原来你们刚才一直在忙这个。谢谢。' },
        { speakerId: 'lingq', text: '礼帽很合适，我的审美也同意。' },
        { speakerId: 'fangk', text: '蛋糕和寿星都已安全到位。' },
      ],
      end: '生日会收工，蛋糕的香味可以多留一会儿。',
    },
    beats: ['invite', 'prepare_props', 'gather', 'cake_reveal', 'perform', 'festival_hold', 'host_exit'],
  },
  new_year: {
    type: 'new_year',
    scale: 'festival',
    title: '奇异岛春节团圆会',
    initiatorId: 'fangk',
    participantMode: 'all',
    locationId: 'church_square',
    targetObjectTags: [],
    autoEnd: false,
    performanceDuration: 0,
    opportunity: {
      label: '一起过个热闹春节',
      proposal: '我把春节流程排好了：先拜年，再跳舞，最后认真吃饭。来吗？',
      acceptLabel: '来！新年好要说响亮',
      preferredProfileTags: ['喜欢组织', '擅长集体活动'],
      priority: 10,
    },
    defaultPrompt: '围着篝火开心跳舞',
    props: [
      {
        id: 'firecracker', name: '新年鞭炮', operation: 'generate',
        archetype: 'festival_prop', sizeProfile: 'festival_prop',
        prompt: '红色鞭炮串挂木架，散落金色纸屑',
        footprint: { width: 2, depth: 2 }, revealStage: 'dance', layoutSlot: 0,
      },
      ...[-1, 0, 1].map((slot, index) => ({
        id: `new_year_table_${index + 1}`, name: '春节方桌', operation: 'generate',
        archetype: 'event_table', sizeProfile: 'event_table',
        prompt: '红木方桌铺红色金边桌布，桌面空置',
        footprint: { width: 3, depth: 2 }, revealStage: 'table', layoutSlot: slot,
      })),
      {
        id: 'new_year_food_1', name: '鱼饺年糕拼盘', operation: 'generate',
        archetype: 'event_food', sizeProfile: 'event_food',
        prompt: '蒸鱼饺子年糕摆满三个红色餐盘',
        footprint: { width: 1, depth: 1 }, revealStage: 'food', layoutSlot: -1, heightOffset: 1.55,
      },
      {
        id: 'new_year_food_2', name: '汤圆春卷拼盘', operation: 'generate',
        archetype: 'event_food', sizeProfile: 'event_food',
        prompt: '汤圆春卷烧鸡摆满三个金边餐盘',
        footprint: { width: 1, depth: 1 }, revealStage: 'food', layoutSlot: 0, heightOffset: 1.55,
      },
      {
        id: 'new_year_food_3', name: '糖果水果拼盘', operation: 'generate',
        archetype: 'event_food', sizeProfile: 'event_food',
        prompt: '橘子糖果花生摆满三个红色果盘',
        footprint: { width: 1, depth: 1 }, revealStage: 'food', layoutSlot: 1, heightOffset: 1.55,
      },
    ],
    dialogue: {
      accept: '好！我去叫大家换衣服。先说好，帽子转晕了不算工伤。',
      ready: '红衣服都站稳了。第一项：挨个把新年好送出去！',
      reaction: null,
      ambient: [
        { speakerId: 'lingq', text: '红色很衬尾羽，美食也很衬空盘子。' },
        { speakerId: 'mako', text: '我会慢慢吃。至少第一盘会。' },
        { speakerId: 'fangk', text: '三张桌子都在，第四张是我的计划本。' },
      ],
      end: '春节收工！桌子先回仓库，祝福全年留在岛上。',
    },
    beats: ['invite', 'prepare_outfits', 'gather', 'greetings', 'campfire_dance', 'feast_reveal', 'feast', 'festival_hold', 'host_exit'],
  },
});

export function getTownActivityDefinition(type) {
  return TOWN_ACTIVITY_DEFINITIONS[type] || null;
}

export function listTownActivityDefinitions() {
  return Object.values(TOWN_ACTIVITY_DEFINITIONS);
}

function cloneProps(props = []) {
  return props.map(prop => ({
    ...prop,
    footprint: { ...prop.footprint },
  }));
}

export function createPresetTownActivity(type, {
  initiatorId,
  participantIds,
  subjectId = null,
  targetObjectIds = [],
} = {}) {
  const definition = getTownActivityDefinition(type);
  if (!definition) throw new TypeError(`Unknown town activity: ${type}`);
  const resolvedSubject = subjectId || definition.subjectId || null;
  const actionPrompts = Object.fromEntries(participantIds.map(petId => {
    const prompt = definition.actionPrompt
      ? definition.actionPrompt(resolvedSubject, petId)
      : definition.actionPrompts?.[petId] || definition.defaultPrompt || '跟着节拍开心互动';
    return [petId, prompt];
  }));

  return {
    id: `${type}_${Date.now().toString(36)}`,
    type,
    scale: definition.scale,
    title: resolvedSubject && type === 'birthday' ? `${resolvedSubject}的生日会` : definition.title,
    hostId: definition.scale === 'festival' ? 'fangk' : (initiatorId || definition.initiatorId),
    exitPetId: definition.scale === 'festival' ? 'fangk' : (initiatorId || definition.initiatorId),
    initiatorId: initiatorId || definition.initiatorId,
    subjectId: resolvedSubject,
    participants: participantIds,
    locationId: definition.locationId,
    targetObjectIds,
    actionPrompts,
    props: cloneProps(definition.props),
    autoEnd: definition.autoEnd,
    performanceDuration: definition.performanceDuration,
    beats: [...definition.beats],
    dialogue: {
      proposal: definition.opportunity.proposal,
      accept: definition.dialogue.accept,
      ready: definition.dialogue.ready,
      reaction: definition.dialogue.reaction ? { ...definition.dialogue.reaction } : null,
      ambient: definition.dialogue.ambient.map(line => ({ ...line })),
      end: definition.dialogue.end,
    },
  };
}
