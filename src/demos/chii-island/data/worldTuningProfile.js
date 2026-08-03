export const CHII_WORLD_METRICS = Object.freeze({
  terrainTile: 4,
  placementSubdivision: 2,
  placementCell: 2,
  residentHeight: 3,
});

export const CHII_SCALE_CATEGORIES = Object.freeze({
  BUILDING: 'building',
  PET: 'pet',
  TREE: 'tree',
  PLANT: 'plant',
  FURNITURE: 'furniture',
  INTERACTIVE_PROP: 'interactive_prop',
});

export const CHII_SCALE_CATEGORY_RULES = Object.freeze({
  building: Object.freeze({ curated: 'authored', generated: 'footprint' }),
  pet: Object.freeze({ curated: 'resident_height', generated: 'resident_height' }),
  tree: Object.freeze({ curated: 'authored', generated: 'prompt_and_natural_footprint' }),
  plant: Object.freeze({ curated: 'authored', generated: 'prompt_and_natural_footprint' }),
  furniture: Object.freeze({ curated: 'authored', generated: 'provisional_profile' }),
  interactive_prop: Object.freeze({ curated: 'authored', generated: 'named_profile' }),
});

export const CHII_SIZE_PROFILES = Object.freeze({
  small_decor: Object.freeze({
    category: 'furniture',
    fitMode: 'height',
    targetHeight: 1.2,
    maxHeight: 1.8,
    footprintFill: 0.82,
    clearanceCells: 0,
  }),
  event_table: Object.freeze({
    category: 'furniture',
    fitMode: 'height',
    targetHeight: 1.75,
    maxHeight: 2.2,
    maxWidth: 4,
    maxDepth: 3,
    footprintFill: 0.82,
    clearanceCells: 1,
  }),
  event_food: Object.freeze({
    category: 'interactive_prop',
    fitMode: 'height',
    targetHeight: 0.72,
    maxHeight: 0.9,
    maxWidth: 1.2,
    maxDepth: 1.2,
    footprintFill: 0.72,
    clearanceCells: 0,
  }),
  festival_prop: Object.freeze({
    category: 'interactive_prop',
    fitMode: 'height',
    targetHeight: 1.35,
    maxHeight: 1.8,
    footprintFill: 0.78,
    clearanceCells: 1,
  }),
  campfire: Object.freeze({
    category: 'interactive_prop',
    fitMode: 'height',
    targetHeight: 3.68,
    maxHeight: 3.9,
    maxWidth: 4.3,
    maxDepth: 4.3,
    footprintFill: 0.78,
    clearanceCells: 2,
    generationConstraint: '篝火整体高度约为一只宠物',
    runtimeScale: 'authored',
    naturalFootprint: true,
  }),
  summon_device: Object.freeze({
    category: 'interactive_prop',
    fitMode: 'height',
    targetHeight: 3.2,
    maxHeight: 4,
    footprintFill: 0.78,
    clearanceCells: 1,
    generationConstraint: '装置整体高度约为一只宠物',
    runtimeScale: 'authored',
    naturalFootprint: true,
  }),
  tent: Object.freeze({
    category: 'building',
    fitMode: 'height',
    targetHeight: 3.8,
    maxHeight: 5,
    footprintFill: 0.82,
    clearanceCells: 1,
  }),
  furniture: Object.freeze({
    category: 'furniture',
    fitMode: 'height',
    targetHeight: 1.35,
    maxHeight: 1.8,
    footprintFill: 0.82,
    clearanceCells: 1,
  }),
  plant: Object.freeze({
    category: 'plant',
    fitMode: 'height',
    targetHeight: 0.72,
    maxHeight: 1.15,
    footprintFill: 0.72,
    clearanceCells: 0,
    generationConstraint: '植株高度约到宠物脚踝至膝盖',
    runtimeScale: 'authored',
    naturalFootprint: true,
  }),
  crop: Object.freeze({
    category: 'plant',
    fitMode: 'height',
    targetHeight: 0.62,
    maxHeight: 0.9,
    footprintFill: 0.72,
    clearanceCells: 0,
    generationConstraint: '作物高度约到宠物脚踝至膝盖',
    runtimeScale: 'authored',
    naturalFootprint: true,
  }),
  tree: Object.freeze({
    category: 'tree',
    fitMode: 'height',
    targetHeight: 9,
    maxHeight: 15.5,
    maxWidth: 14,
    maxDepth: 14,
    footprintFill: 0.88,
    clearanceCells: 1,
    generationConstraint: '成熟树高约为宠物二至五倍',
    runtimeScale: 'authored',
    naturalFootprint: true,
  }),
  building: Object.freeze({
    category: 'building',
    fitMode: 'footprint',
    maxHeight: 9,
    footprintFill: 0.82,
    clearanceCells: 1,
    generationConstraint: '门高约一只宠物，主体按占地完整展开',
  }),
  landmark: Object.freeze({
    category: 'building',
    fitMode: 'footprint',
    maxHeight: 15,
    footprintFill: 0.88,
    clearanceCells: 2,
  }),
  handheld: Object.freeze({
    category: 'interactive_prop',
    fitMode: 'height',
    targetHeight: 0.8,
    maxHeight: 1.1,
    footprintFill: 0.7,
    clearanceCells: 0,
  }),
  wearable: Object.freeze({
    category: 'interactive_prop',
    fitMode: 'height',
    targetHeight: 0.45,
    maxHeight: 0.7,
    footprintFill: 0.65,
    clearanceCells: 0,
  }),
});

export const CHII_ASSET_SIZE_PROFILES = Object.freeze({
  oak: 'tree',
  normal: 'tree',
  apple: 'tree',
  glowgrass: 'plant',
  pinkFlower: 'plant',
  grassClump: 'plant',
  trumpetFlower: 'plant',
  blueTulips: 'plant',
  wheatField: 'crop',
  flowerPot: 'plant',
  giantCarrot: 'crop',
  windmill: 'landmark',
  church: 'landmark',
  temple: 'landmark',
  townBridge: 'landmark',
  islandWaterfall: 'building',
  townFountain: 'festival_prop',
  campfire: 'campfire',
  forestTrophy: 'summon_device',
  forestTent: 'tent',
  pastoralWorkScaffold: 'building',
});

export const CHII_PET_HEIGHTS = Object.freeze({
  momo: 3,
  mako: 3.25,
  mok: 3.1,
  lingq: 2.85,
  yafo: 2.25,
  fangk: 3,
  crab: 1.9,
  generated: 3,
});

export const CHII_PRESENTATION_TUNING = Object.freeze({
  interaction: Object.freeze({
    baseRange: 5.2,
    boundsPadding: 2.2,
    maximumRange: 8,
  }),
  bubble: Object.freeze({
    topPadding: 0.48,
    minimumY: 2.35,
    maximumY: 5.2,
    width: 2.7,
    height: 0.84,
  }),
  camera: Object.freeze({
    dialoguePadding: 4.5,
    workPadding: 6,
    maximumDistance: 20,
  }),
  vfx: Object.freeze({
    referenceHeight: 3,
    minimumScale: 0.65,
    maximumScale: 1.8,
  }),
});

export const CHII_SCENE_DENSITY = Object.freeze({
  treeCap: 260,
  grassCap: 140,
  borderTreeMultiplier: 1.35,
  minimumTreeSpacingTiles: 1,
  treeChance: Object.freeze({
    edge: 0.8,
    pastoral: 0.5,
    other: 0.22,
  }),
  grassChance: Object.freeze({
    edge: 0.14,
    other: 0.08,
  }),
});

export const CHII_PERFORMANCE_BUDGETS = Object.freeze({
  staticObjectsWarning: 520,
  outOfProfileWarning: 8,
  softOverlapWarning: 300,
});

const PROFILE_KEYWORDS = Object.freeze([
  ['campfire', ['篝火', 'campfire']],
  ['event_table', ['桌', 'table', '蛋糕桌']],
  ['event_food', ['苹果', '蛋糕', '食物', 'food', 'cake']],
  ['building', ['房', '屋', '仓库', '建筑', 'building', 'house']],
  ['tree', ['树', 'tree']],
  ['crop', ['胡萝卜', '麦', '作物', 'carrot', 'wheat', 'crop']],
  ['plant', ['花', '草', '蘑菇', 'flower', 'grass', 'plant']],
  ['furniture', ['椅', '凳', '柜', '床', '架', 'chair', 'bench', 'shelf']],
  ['handheld', ['工具', '斧', '铲', '锤', 'tool']],
]);

export function resolveChiiSizeProfile({
  profileId = null,
  assetId = null,
  name = '',
  description = '',
  category = '',
} = {}) {
  if (profileId && CHII_SIZE_PROFILES[profileId]) return profileId;
  if (assetId && CHII_ASSET_SIZE_PROFILES[assetId]) return CHII_ASSET_SIZE_PROFILES[assetId];
  if (category === 'house' || category === 'building') return 'building';
  if (category === 'tree') return 'tree';
  const haystack = `${name} ${description}`.toLowerCase();
  for (const [candidate, keywords] of PROFILE_KEYWORDS) {
    if (keywords.some(keyword => haystack.includes(keyword))) return candidate;
  }
  return 'small_decor';
}

export function getChiiSizeProfile(profileId) {
  return CHII_SIZE_PROFILES[profileId] || CHII_SIZE_PROFILES.small_decor;
}

export function resolveChiiScaleCategory(profileId) {
  return getChiiSizeProfile(profileId).category;
}

export function appendChiiGenerationConstraint(description, profileId) {
  const text = String(description || '').trim();
  const constraint = getChiiSizeProfile(profileId).generationConstraint;
  return constraint ? `${text}，${constraint}` : text;
}
