// Local generated model library for the Chii Island editor.
// These assets live in public/generated/ and are always available even when
// the backend asset list (/api/voxel/api/assets/list) is empty.

/** @typedef {{ id: string, name: string, path: string, category: 'environment'|'tree'|'decor'|'pet', tags: string[], hasIdleAnimation?: boolean }} LocalModel */

/** @type {LocalModel[]} */
export const LOCAL_MODEL_LIBRARY = [
  // ---- environments ----
  { id: 'forest', name: '玛扣大森林', path: 'generated/models/forest.json', category: 'environment', tags: ['森林', '自然', '温暖', '中心'], hasIdleAnimation: true },
  { id: 'pond', name: '农村池塘', path: 'generated/models/pond.json', category: 'environment', tags: ['水', '宁静', '凉爽'], hasIdleAnimation: true },
  { id: 'grassland', name: '田园牧场', path: 'generated/models/grassland.json', category: 'environment', tags: ['草原', '开阔', '微风'], hasIdleAnimation: true },
  { id: 'sun_stone', name: '太阳石', path: 'generated/models/sun_stone.json', category: 'environment', tags: ['阳光', '神秘', '能量'], hasIdleAnimation: true },
  { id: 'trainer', name: '训练桩', path: 'generated/models/trainer.json', category: 'environment', tags: ['训练', '木桩', '修行'], hasIdleAnimation: true },

  // ---- trees ----
  { id: 'tree_marko', name: '玛扣树', path: 'generated/models/tree_marko.json', category: 'tree', tags: ['大树', '守护', '森林'], hasIdleAnimation: true },
  { id: 'tree_witch', name: '魔女树', path: 'generated/models/tree_witch.json', category: 'tree', tags: ['魔女', '幽暗', '神秘'] },
  { id: 'tree_yafo', name: '亚佛树', path: 'generated/models/tree_yafo.json', category: 'tree', tags: ['古老', '智慧', '森林'] },
  { id: 'tree_goldfish', name: '金鱼树', path: 'generated/models/tree_goldfish.json', category: 'tree', tags: ['金鱼', '灵动', '水边'] },
  { id: 'tree_rand_1', name: '随机树 1', path: 'generated/models/tree_rand_1.json', category: 'tree', tags: ['随机', '自然'] },
  { id: 'tree_rand_2', name: '随机树 2', path: 'generated/models/tree_rand_2.json', category: 'tree', tags: ['随机', '自然'] },
  { id: 'tree_rand_3', name: '随机树 3', path: 'generated/models/tree_rand_3.json', category: 'tree', tags: ['随机', '自然'] },
  { id: 'tree_rand_4', name: '随机树 4', path: 'generated/models/tree_rand_4.json', category: 'tree', tags: ['随机', '自然'] },
  { id: 'tree_rand_5', name: '随机树 5', path: 'generated/models/tree_rand_5.json', category: 'tree', tags: ['随机', '自然'] },
  { id: 'tree_rand_6', name: '随机树 6', path: 'generated/models/tree_rand_6.json', category: 'tree', tags: ['随机', '自然'] },

  // ---- decors / buildings ----
  { id: 'country_shop', name: '田园商店', path: 'generated/models/country_shop.json', category: 'decor', tags: ['商店', '田园', '温馨'], hasIdleAnimation: true },
  { id: 'moss_lamp', name: '苔藓灯', path: 'generated/models/moss_lamp.json', category: 'decor', tags: ['灯', '苔藓', '柔和'], hasIdleAnimation: true },
  { id: 'wind_chime', name: '风铃', path: 'generated/models/wind_chime.json', category: 'decor', tags: ['风铃', '轻盈', '声音'], hasIdleAnimation: true },
  { id: 'ps5_console', name: 'PS5', path: 'generated/models/ps5_console.json', category: 'decor', tags: ['科技', '游戏', '现代'] },
  { id: 'ns2_console', name: 'NS2', path: 'generated/models/ns2_console.json', category: 'decor', tags: ['科技', '游戏', '便携'] },
  { id: 'thunder_snow', name: '雷霆大雪绒', path: 'generated/models/thunder_snow.json', category: 'decor', tags: ['雪', '雷霆', '壮观'] },
  { id: 'pet_house', name: '宠物小屋', path: 'generated/models/pet_house.json', category: 'decor', tags: ['小屋', '宠物', '家'] },

  // ---- player ----
  { id: 'player-nezha', name: '玩家·哪吒', path: 'generated/models/player-nezha.json', category: 'pet', tags: ['玩家', '哪吒', '神话'], hasIdleAnimation: true },

  // ---- pets ----
  { id: 'pet_mako', name: '马扣', path: 'generated/pets/models/马扣.json', category: 'pet', tags: ['忠诚', '奔跑', '温暖', '守护'], hasIdleAnimation: true },
  { id: 'pet_fuyao', name: '扶摇', path: 'generated/pets/models/扶摇.json', category: 'pet', tags: ['自由', '风', '高远', '灵动'], hasIdleAnimation: true },
  { id: 'pet_momo', name: 'momo', path: 'generated/pets/models/momo.json', category: 'pet', tags: ['慵懒', '圆润', '可爱', '贪吃'], hasIdleAnimation: true },
  { id: 'pet_xiaoshiya', name: '小石芽', path: 'generated/pets/models/小石芽.json', category: 'pet', tags: ['石头', '安静', '纪念'] },
  { id: 'pet_pikachu', name: '皮卡丘', path: 'generated/pets/models/皮卡丘.json', category: 'pet', tags: ['电系', '活泼', '可爱', '元气'] },
  { id: 'pet_yudeng', name: '雨灯绒', path: 'generated/pets/models/雨灯绒.json', category: 'pet', tags: ['微光', '柔软', '雨'] },
  { id: 'pet_fenglingcao', name: '风铃草', path: 'generated/pets/models/风铃草.json', category: 'pet', tags: ['风铃', '花草', '轻盈'] },
];

/** Animation assets that pair with models by id. */
export const LOCAL_ANIMATION_LIBRARY = {
  forest: 'generated/animations/forest_idle.json',
  pond: 'generated/animations/pond_idle.json',
  grassland: 'generated/animations/grassland_idle.json',
  sun_stone: 'generated/animations/sun_stone_idle.json',
  trainer: 'generated/animations/trainer_idle.json',
  tree_marko: 'generated/animations/tree_marko_idle.json',
  country_shop: 'generated/animations/country_shop_idle.json',
  moss_lamp: 'generated/animations/moss_lamp_idle.json',
  wind_chime: 'generated/animations/wind_chime_idle.json',
  'player-nezha': 'generated/animations/player-nezha-idle.json',
};

/**
 * Find a local model by id.
 * @param {string} id
 * @returns {LocalModel|undefined}
 */
export function getLocalModelById(id) {
  return LOCAL_MODEL_LIBRARY.find((m) => m.id === id);
}

/**
 * Get idle animation path for a local model id, if any.
 * @param {string} id
 * @returns {string|undefined}
 */
export function getLocalAnimationPath(id) {
  return LOCAL_ANIMATION_LIBRARY[id];
}
