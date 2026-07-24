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
    autoEnd: true,
    performanceDuration: 8,
    opportunity: {
      label: '去篝火边坐一会儿',
      proposal: '篝火烧得刚刚好。要不要叫大家过去暖一会儿？',
      acceptLabel: '好呀，叫上大家吧',
      preferredProfileTags: ['喜欢组织', '擅长集体活动'],
      priority: 40,
    },
    actionPrompts: {
      fangk: '伸手烤火轻轻跺脚',
      lingq: '展开尾羽围火轻摆',
      mako: '靠近篝火开心踏步',
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
    autoEnd: true,
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
    autoEnd: true,
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
      prompt: '木桌上放着彩色生日蛋糕和点亮蜡烛',
      footprint: { width: 3, depth: 2 },
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
    title: '奇异岛红火新年',
    initiatorId: 'fangk',
    participantMode: 'all',
    locationId: 'church_square',
    targetObjectTags: [],
    autoEnd: false,
    performanceDuration: 0,
    opportunity: {
      label: '一起准备红火新年',
      proposal: '灯笼和红衣服都准备好了。要不要叫大家一起过新年？',
      acceptLabel: '好呀，一起布置吧',
      preferredProfileTags: ['喜欢组织', '擅长集体活动'],
      priority: 10,
    },
    defaultPrompt: '穿着红衣拱手拜年',
    props: [{
      id: 'firecracker',
      name: '新年鞭炮',
      operation: 'generate',
      prompt: '红色鞭炮串挂在小木架上带金色纸屑',
      footprint: { width: 2, depth: 2 },
    }],
    dialogue: {
      accept: '好，大家分头准备。灯笼不许偷偷打结。',
      ready: '衣服、灯笼、鞭炮都到位，新年开场。',
      reaction: null,
      ambient: [
        { speakerId: 'lingq', text: '红色很喜庆，也很衬我的尾羽。' },
        { speakerId: 'mako', text: '新年好。今天可以多跑一圈。' },
        { speakerId: 'fangk', text: '灯笼没有打结，计划成功一半。' },
      ],
      end: '新年活动收工，祝福继续有效。',
    },
    beats: ['invite', 'prepare_mounts', 'gather', 'firecracker', 'perform', 'festival_hold', 'host_exit'],
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
    hostId: 'fangk',
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
