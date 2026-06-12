// ═══════════════════════════════════════════════════════════════
// Game data templates — single source of truth for all configs.
// PET_CONFIGS is the temporary demo data. Phase 2 replaces with AI.
// ═══════════════════════════════════════════════════════════════

// ---- Forest / Environment ----

export const FOREST_CONFIG = {
  name: '森林',
  modelName: 'forest',
  color: 0x2d5a1e,
  size: [2, 1, 2],
  position: [0, 0, 0],
  coreTags: ['森林', '潮湿', '温暖', '自然'],
  moreTags: [],
};

// New environments spawned after player-pet max-intimacy dialogue
export const ENV_POND = {
  name: '池塘',
  modelName: 'pond',
  color: 0x3388cc,
  size: [1.5, 0.6, 1.5],
  coreTags: ['水', '凉爽', '反射', '宁静'],
  moreTags: [],
};

export const ENV_GRASSLAND = {
  name: '草原',
  modelName: 'grassland',
  color: 0x66bb44,
  size: [1.5, 0.6, 1.5],
  coreTags: ['草原', '开阔', '温暖', '微风'],
  moreTags: [],
};

// ---- Items (tetrahedron pyramids) ----

export const ITEM_CONFIGS = [
  {
    id: 'wind_chime',
    name: '风铃',
    color: 0xaadd44,
    tags: ['微风', '花香', '轻盈', '热闹'],
    correspondsTo: '风铃草',
    spawnPosition: [2, 0, -5],
  },
];

// Intimacy reward items — spawned when a pet reaches affection 5 or 10
export const INTIMACY_ITEM_CONFIGS = {
  '雨灯绒': {
    lv5: { id: 'glow_pebble', name: '荧光石', color: 0x88ccff, tags: ['微光', '纪念', '信任'] },
    lv10: { id: 'lantern_core', name: '灯绒核心', color: 0xffcc44, tags: ['温暖光', '羁绊', '守护'] },
  },
  '小石芽': {
    lv5: { id: 'warm_pebble', name: '暖石', color: 0xee9944, tags: ['温暖', '纪念', '信任'] },
    lv10: { id: 'sun_crystal', name: '日辉晶', color: 0xffdd66, tags: ['阳光', '羁绊', '守护'] },
  },
  '风铃草': {
    lv5: { id: 'breeze_seed', name: '风种子', color: 0xbbee66, tags: ['微风', '纪念', '信任'] },
    lv10: { id: 'song_bell', name: '歌铃', color: 0xffaacc, tags: ['旋律', '羁绊', '守护'] },
  },
};

// ---- Pets ----

export const PIKACHU_CONFIG = {
  name: '皮卡丘',
  color: 0xffdd00,
  tags: ['电系', '活泼', '可爱', '元气', '友好'],
  personality: '充满活力的电气老鼠，喜欢和训练师玩耍',
  likes: ['电气', '番茄酱', '森林'],
  dislikes: ['寂寞', '冷水'],
  habits: ['脸颊放电', '蹭训练师', '发出皮卡皮卡的叫声'],
  originSignature: ['森林', '温暖', '阳光', '热闹', '自然'],
};

export const HOUSE_PET_CONFIGS = {
  '马扣': {
    name: '马扣',
    color: 0xcc8844,
    tags: ['忠诚', '奔跑', '温暖', '守护'],
    personality: '一匹热情的小马驹，喜欢在草地上奔跑，对主人绝对忠诚',
    likes: ['胡萝卜', '草原', '阳光'],
    dislikes: ['雷雨', '孤独'],
    habits: ['刨蹄子', '围着主人转圈', '发出咴咴的叫声'],
    originSignature: ['草原', '温暖', '奔跑', '忠诚', '阳光'],
    dialogue: {
      greetings: ['咴咴！你来啦！', '今天要去哪里奔跑？', '见到你我很开心！'],
      responses: { gentle: '嗯，我会一直陪着你的。', bright: '太好了！一起去奔跑吧！', social: '和大家一起玩最开心了！' },
      toPlayer: ['谢谢你给我这个家。', '有你在，我不怕雷雨了。', '我会一直守护你的。'],
    },
  },
  '扶摇': {
    name: '扶摇',
    color: 0x88ccff,
    tags: ['自由', '风', '高远', '灵动'],
    personality: '一只喜欢乘风而起的小鸟，性格洒脱，向往远方',
    likes: ['清风', '高处', '果实'],
    dislikes: ['笼子', '闷热'],
    habits: ['盘旋上升', '梳理羽毛', '站在最高点眺望'],
    originSignature: ['天空', '自由', '风', '高远', '轻盈'],
    dialogue: {
      greetings: ['啾啾！风好大啊！', '要不要一起飞上去看看？', '今天的风很舒服呢。'],
      responses: { gentle: '放心，风会指引我们的。', bright: '哇！那边好像很有趣！', social: '和大家一起在风中飞翔吧！' },
      toPlayer: ['谢谢你给了我自由的天空。', '只要有你在，哪里都是远方。', '我会为你衔来最美的果实。'],
    },
  },
  'momo': {
    name: 'momo',
    color: 0xffaabb,
    tags: ['慵懒', '圆润', '可爱', '贪吃'],
    personality: '一只圆滚滚的小团子，整天 sleepy，但一见到食物就精神百倍',
    likes: ['甜点', '软垫', '午睡'],
    dislikes: ['运动', '噪音'],
    habits: ['打哈欠', '团成球睡觉', '慢吞吞地走路'],
    originSignature: ['柔软', '温暖', '甜食', '安静', '圆润'],
    dialogue: {
      greetings: ['哈欠……你来啦。', '有吃的吗？', '好困啊……'],
      responses: { gentle: '嗯……让我再睡一会儿。', bright: '哇！是甜点吗？', social: '大家在一起……好暖和。' },
      toPlayer: ['谢谢你给我软软的家。', '只要和你在一起，我就不想动了。', '你会给我带甜点吗？'],
    },
  },
};

export const PET_CONFIGS = [
  {
    name: '雨灯绒',
    color: 0x44ddff,
    tags: ['发光', '胆小', '夜行', '潮湿亲和', '柔软'],
    personality: '害羞但亲近温柔的声音',
    likes: ['微光', '雨声', '柔软物'],
    dislikes: ['强光', '噪音'],
    habits: ['夜晚发光', '躲藏', '靠近微光'],
    originSignature: ['微光', '温柔', '安全', '安静', '潮湿'],
    // Dialogue templates
    dialogue: {
      greetings: [
        '……你好。这里好安静。',
        '那个……我可以在这里待一会儿吗？',
        '灯光好温柔……我很喜欢。',
      ],
      responses: {
        gentle: '你身上的气息让我觉得很安心。',
        bright: '好亮……不过我不会再害怕了。',
        social: '和大家在一起，好像也挺好的。',
      },
      toPlayer: [
        '谢谢你一直陪着我……这盏灯，是给我的吗？',
        '以前我只敢躲在暗处，现在我也想为你发光。',
        '你的声音，比任何光都温柔。',
      ],
    },
  },
  {
    name: '小石芽',
    color: 0xff8844,
    tags: ['坚固', '沉稳', '日行', '温暖亲和', '守护'],
    personality: '温和可靠，喜欢晒太阳',
    likes: ['阳光', '石头', '干燥'],
    dislikes: ['潮湿', '寒冷'],
    habits: ['晒太阳', '缓慢移动', '守护角落'],
    originSignature: ['阳光', '温暖', '坚固', '干燥', '安静'],
    dialogue: {
      greetings: [
        '哟，今天天气不错。',
        '你好啊。需要帮忙吗？',
        '太阳晒得真舒服……你也来晒晒？',
      ],
      responses: {
        gentle: '放心，有我在。',
        bright: '哈哈，一起晒太阳吧！',
        social: '朋友多就是热闹，我喜欢这种感觉。',
      },
      toPlayer: [
        '你总是那么可靠，就像阳光一样。',
        '我想一直守在你身边。这样你就不用一个人了。',
        '这块暖石送给你……它会提醒你，有人在守护着你。',
      ],
    },
  },
  {
    name: '风铃草',
    color: 0xaadd44,
    tags: ['轻盈', '活泼', '社交', '风系亲和', '音乐'],
    personality: '活泼好奇，喜欢热闹',
    likes: ['风铃', '花香', '热闹'],
    dislikes: ['孤独', '密闭空间'],
    habits: ['随风摇摆', '发出铃声', '靠近其他宠物'],
    originSignature: ['微风', '花香', '轻盈', '热闹', '阳光'],
    dialogue: {
      greetings: [
        '嗨嗨！你来找我玩啦？',
        '今天有什么好玩的吗？',
        '叮铃铃～听到我的铃声了吗？',
      ],
      responses: {
        gentle: '别害羞嘛！来一起玩吧！',
        bright: '哇！太棒了！我好开心！',
        social: '大家都来啦！我们开个派对吧！',
      },
      toPlayer: [
        '和你在一起的每一天都像微风拂过～',
        '我要为你唱一首歌！叮铃铃～',
        '谢谢你给了我一个不孤独的地方。',
      ],
    },
  },
];

// Merge house pets into PET_CONFIGS so dialogue helpers work for all pets
for (const pet of Object.values(HOUSE_PET_CONFIGS)) {
  if (!PET_CONFIGS.find((p) => p.name === pet.name)) {
    PET_CONFIGS.push(pet);
  }
}

// ---- Dialogue helpers ----

/** Pick a random greeting for a pet. */
export function getGreeting(pet) {
  const cfg = PET_CONFIGS.find((p) => p.name === pet.name);
  if (!cfg || !cfg.dialogue) return '你好。';
  const list = cfg.dialogue.greetings;
  return list[Math.floor(Math.random() * list.length)];
}

/** Pick a response based on the other pet's personality tone. */
export function getResponse(pet, otherPet) {
  const cfg = PET_CONFIGS.find((p) => p.name === pet.name);
  if (!cfg || !cfg.dialogue) return '嗯……你好。';

  const responses = cfg.dialogue.responses;
  // Map personality keywords to response keys
  const personality = otherPet.personality;
  if (personality.includes('害羞') || personality.includes('温柔')) return responses.gentle;
  if (personality.includes('活泼') || personality.includes('热闹')) return responses.social;
  return responses.bright;
}

/** Pick a player-directed line for max-intimacy dialogue. */
export function getPlayerLine(pet) {
  const cfg = PET_CONFIGS.find((p) => p.name === pet.name);
  if (!cfg || !cfg.dialogue) return '谢谢你。';
  const list = cfg.dialogue.toPlayer;
  return list[Math.floor(Math.random() * list.length)];
}

/** Simple goodbye lines. */
export const GOODBYES = [
  '和你聊天真开心，下次再聊！',
  '我得走啦，回头见！',
  '真好，希望还能再遇到你。',
  '那就先这样啦，拜拜～',
  '嗯……那我去那边了。',
];
