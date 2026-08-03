const activityRoot = 'generated/activities/original';

export const TOWN_ACTIVITY_MODEL_SPECS = Object.freeze({
  newYearLanternPair: Object.freeze({
    id: 'new_year_lantern_pair',
    name: '新年灯笼对',
    prompt: '一对红色方形灯笼，金色短流苏',
    path: `${activityRoot}/models/new_year_lantern_pair.json`,
    sizeProfile: 'small_decor',
    footprint: Object.freeze({ width: 1, depth: 1 }),
  }),
  newYearFirecracker: Object.freeze({
    id: 'new_year_firecracker',
    name: '新年鞭炮架',
    prompt: '红色鞭炮串挂木架，散落金色纸屑',
    path: `${activityRoot}/models/new_year_firecracker.json`,
    sizeProfile: 'festival_prop',
    footprint: Object.freeze({ width: 2, depth: 2 }),
  }),
  newYearTable: Object.freeze({
    id: 'new_year_table',
    name: '春节方桌',
    prompt: '红木方桌铺金边红桌布，桌面空置',
    path: `${activityRoot}/models/new_year_table.json`,
    sizeProfile: 'event_table',
    footprint: Object.freeze({ width: 3, depth: 2 }),
  }),
  newYearFoodFish: Object.freeze({
    id: 'new_year_food_fish',
    name: '蒸鱼饺子年糕拼盘',
    prompt: '红盘装蒸鱼饺子年糕，摆放整齐',
    path: `${activityRoot}/models/new_year_food_fish.json`,
    sizeProfile: 'event_food',
    footprint: Object.freeze({ width: 1, depth: 1 }),
  }),
  newYearFoodChicken: Object.freeze({
    id: 'new_year_food_chicken',
    name: '汤圆春卷烧鸡拼盘',
    prompt: '金边盘装汤圆春卷烧鸡，摆放整齐',
    path: `${activityRoot}/models/new_year_food_chicken.json`,
    sizeProfile: 'event_food',
    footprint: Object.freeze({ width: 1, depth: 1 }),
  }),
  newYearFoodFruit: Object.freeze({
    id: 'new_year_food_fruit',
    name: '橘子糖果花生果盘',
    prompt: '红果盘装橘子糖果花生，摆放整齐',
    path: `${activityRoot}/models/new_year_food_fruit.json`,
    sizeProfile: 'event_food',
    footprint: Object.freeze({ width: 1, depth: 1 }),
  }),
});

export const TOWN_ACTIVITY_ANIMATION_SPECS = Object.freeze({
  makoPickApple: Object.freeze({ id: 'mako_pick_apple', subjectId: 'mako', prompt: '抬头咬下红苹果', duration: 4, loop: true }),
  lingqGreeting: Object.freeze({ id: 'lingq_greeting', subjectId: 'lingq', prompt: '展开尾羽挥翅问好', duration: 4, loop: true }),
  makoGreetingReply: Object.freeze({ id: 'mako_greeting_reply', subjectId: 'mako', prompt: '点头抬蹄回应问好', duration: 4, loop: true }),
  fangkPushTable: Object.freeze({ id: 'fangk_push_table', subjectId: 'fangk', prompt: '双手向前推桌子', duration: 3, loop: false }),
  fangkOutfitTurn: Object.freeze({ id: 'fangk_outfit_turn', subjectId: 'fangk', prompt: '原地转身展示新衣', duration: 3, loop: false }),
  lingqOutfitTurn: Object.freeze({ id: 'lingq_outfit_turn', subjectId: 'lingq', prompt: '原地转身展示新衣', duration: 3, loop: false }),
  makoOutfitTurn: Object.freeze({ id: 'mako_outfit_turn', subjectId: 'mako', prompt: '原地转身展示新衣', duration: 3, loop: false }),
  crabOutfitTurn: Object.freeze({ id: 'crab_outfit_turn', subjectId: 'crab', prompt: '原地转身展示新衣', duration: 3, loop: false }),
  fangkEat: Object.freeze({ id: 'fangk_eat', subjectId: 'fangk', prompt: '低头拿起食物品尝', duration: 4, loop: true }),
  lingqEat: Object.freeze({ id: 'lingq_eat', subjectId: 'lingq', prompt: '低头拿起食物品尝', duration: 4, loop: true }),
  makoEat: Object.freeze({ id: 'mako_eat', subjectId: 'mako', prompt: '低头拿起食物品尝', duration: 4, loop: true }),
  crabEat: Object.freeze({ id: 'crab_eat', subjectId: 'crab', prompt: '低头拿起食物品尝', duration: 4, loop: true }),
  firecrackerSpark: Object.freeze({
    id: 'new_year_firecracker_spark',
    modelSpecId: 'new_year_firecracker',
    prompt: '鞭炮闪光冒金色纸屑',
    duration: 3,
    loop: true,
    emitParticles: true,
  }),
});

export const TOWN_ACTIVITY_MOUNT_SPECS = Object.freeze({
  appleTreeLanterns: Object.freeze({
    id: 'new_year_apple_tree_lanterns',
    subjectId: 'apple_tree',
    modelSpecId: 'new_year_lantern_pair',
    part: '一对红色方形灯笼，金色短流苏',
    placement: '挂在苹果树外侧树枝下',
    fallbackRefine: '保持苹果树不变，在外侧树枝挂一对红灯笼',
    knownMountIncompatible: true,
  }),
  churchLanterns: Object.freeze({
    id: 'new_year_church_lanterns',
    subjectId: 'church',
    modelSpecId: 'new_year_lantern_pair',
    part: '一对红色方形灯笼，金色短流苏',
    placement: '对称挂在教堂正门两侧',
    fallbackRefine: '保持教堂不变，在正门两侧各挂一个红灯笼',
    knownMountIncompatible: true,
  }),
});

export function activityAnimationPath(id) {
  return `${activityRoot}/animations/${id}.json`;
}

export function activityMountPath(id) {
  return `${activityRoot}/models/${id}.json`;
}

export const TOWN_ACTIVITY_ASSET_ROOT = activityRoot;
