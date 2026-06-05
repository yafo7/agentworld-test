// ═══════════════════════════════════════════════════════════════
// Game data templates — single source of truth for all configs.
// PET_CONFIGS is the temporary demo data. Phase 2 replaces with AI.
// ═══════════════════════════════════════════════════════════════

// ---- Forest / Environment ----

export const FOREST_CONFIG = {
  name: '森林',
  color: 0x2d5a1e,
  size: [2, 1, 2], // [width, height, depth]
  position: [0, 0.5, 0],
  coreTags: ['森林', '潮湿', '温暖', '自然'],
  moreTags: [],
};

// ---- Items (tetrahedron pyramids) ----
// Each item type maps to one pet via originSignature matching.

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

// ---- Pets (placeholder cubes, hidden until spawned) ----

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
  },
];
