// ═══════════════════════════════════════════════════════════════
// Game data templates — single source of truth for all configs.
// PET_CONFIGS is the temporary demo data. Phase 2 replaces with AI.
// ═══════════════════════════════════════════════════════════════

// ---- Forest / Environment ----

export const FOREST_CONFIG = {
  name: '森林',
  color: 0x2d5a1e,
  size: [2, 1, 2],
  position: [0, 0.5, 0],
  coreTags: ['森林', '潮湿', '温暖', '自然'],
  moreTags: [],
};

// New environments spawned after player-pet max-intimacy dialogue
export const ENV_POND = {
  name: '池塘',
  color: 0x3388cc,
  size: [1.5, 0.6, 1.5],
  coreTags: ['水', '凉爽', '反射', '宁静'],
  moreTags: [],
};

export const ENV_GRASSLAND = {
  name: '草原',
  color: 0x66bb44,
  size: [1.5, 0.6, 1.5],
  coreTags: ['草原', '开阔', '温暖', '微风'],
  moreTags: [],
};

// ---- Items (tetrahedron pyramids) ----

export const ITEM_CONFIGS = [
  {
    id: 'moss_lamp',
    name: '苔藓灯',
    color: 0x44ddff,
    tags: ['微光', '温柔', '安全', '安静'],
    correspondsTo: '雨灯绒',
    spawnPosition: [5, 0.75, 0],
  },
  {
    id: 'sun_stone',
    name: '太阳石',
    color: 0xff8844,
    tags: ['阳光', '温暖', '坚固', '干燥'],
    correspondsTo: '小石芽',
    spawnPosition: [-3, 0.75, 4],
  },
  {
    id: 'wind_chime',
    name: '风铃',
    color: 0xaadd44,
    tags: ['微风', '花香', '轻盈', '热闹'],
    correspondsTo: '风铃草',
    spawnPosition: [2, 0.75, -5],
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
