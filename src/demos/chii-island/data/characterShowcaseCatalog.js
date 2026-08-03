import { CHII_ASSET_CATALOG } from './assetCatalog.js';
import { CHII_PET_HEIGHTS } from './worldTuningProfile.js';
import { getChiiCharacterVariants } from './characterVariants.js';

export const CHARACTER_SHOWCASE_PATH = './player-candidates.html';

export const SHOWCASE_ANIMATION_LABELS = Object.freeze({
  idle: '呼吸待机',
  walk: '行走',
  run: '奔跑',
  jump: '跳跃',
  wave_left: '挥左手',
  fan_spark: '扇子特效',
  chop: '伐木',
  smash: '重击',
  wave: '挥手',
  magic: '魔法',
  dance: '跳舞',
  construct: '施工',
  special: '特技',
});

const CANDIDATE_ACCENTS = Object.freeze([
  '#9e324b',
  '#347d72',
  '#b57a24',
  '#7655a4',
  '#d26386',
]);

const RESIDENT_DEFINITIONS = Object.freeze([
  {
    id: 'momo',
    group: '风车田园',
    role: '森林伙伴',
    description: '憨厚温和，喜欢树木、花草和慢慢整理自然。',
    tags: ['熊', '温和', '伐木'],
    accent: '#b36d43',
  },
  {
    id: 'yafo',
    group: '风车田园',
    role: '天空伙伴',
    description: '调皮活泼，喜欢高处、花朵和漂亮的小装饰。',
    tags: ['小鸟', '活泼', '飞行'],
    accent: '#4d98bd',
  },
  {
    id: 'mok',
    group: '风车田园',
    role: '农田伙伴',
    description: '力气很大也很爱劳动，对土地、木头和农田格外认真。',
    tags: ['鳄鱼', '强壮', '耕地'],
    accent: '#538b58',
  },
  {
    id: 'mako',
    group: '教堂城镇',
    role: '运动伙伴',
    description: '沉稳可靠，喜欢奔跑，也不会错过热闹的集体活动。',
    tags: ['马', '沉稳', '疾跑'],
    accent: '#a75443',
  },
  {
    id: 'lingq',
    group: '教堂城镇',
    role: '表演伙伴',
    description: '活泼又爱展示，广场、水边和舞台都很适合它。',
    tags: ['孔雀', '亮眼', '引水'],
    accent: '#347e86',
  },
]);

const FUNCTIONAL_DEFINITIONS = Object.freeze([
  {
    id: 'fangk',
    group: '教堂城镇',
    role: '城镇组织者',
    description: '认真可靠，负责召集居民、主持活动和照看广场秩序。',
    tags: ['工程师', '组织', '活动'],
    accent: '#cc7654',
  },
  {
    id: 'builder_crab',
    assetId: 'crab',
    name: '螃蟹',
    group: '教堂城镇',
    role: '建筑工匠',
    description: '两只钳子都很能干，专门负责新建筑的选址与施工。',
    tags: ['螃蟹', '施工', '建造'],
    accent: '#dc654f',
  },
]);

function characterFromAsset(definition) {
  const assetId = definition.assetId || definition.id;
  const asset = CHII_ASSET_CATALOG[assetId];
  if (!asset) throw new Error(`Unknown showcase asset: ${assetId}`);
  const variants = getChiiCharacterVariants(definition.id);
  const defaultVariant = variants[0] || asset;

  return Object.freeze({
    id: definition.id,
    assetId,
    name: definition.name || definition.id,
    group: definition.group,
    role: definition.role,
    description: definition.description,
    tags: Object.freeze([...definition.tags]),
    accent: definition.accent,
    model: defaultVariant.model,
    animations: Object.freeze({ ...(defaultVariant.animations || {}) }),
    displayHeight: definition.displayHeight || CHII_PET_HEIGHTS[assetId] || 3,
    ...(variants.length ? { variants: Object.freeze(variants) } : {}),
  });
}

function candidateToVariant(candidate, index) {
  const quality = candidate.promptPacket?.request_hints?.quality;
  const title = candidate.title.replace(/^方案\s+[A-Z]\s+·\s+/, '');
  return Object.freeze({
    id: candidate.id,
    slug: candidate.slug,
    assetId: `phrolova-${candidate.slug}`,
    name: title,
    group: `方案 ${candidate.id.toUpperCase()}`,
    role: quality === 'voxel-pro' ? 'GPT Voxel Pro 主角候选' : 'GPT Voxel 主角候选',
    description: candidate.intent,
    tags: Object.freeze([
      '主角候选',
      quality === 'voxel-pro' ? 'Pro 精细模型' : 'Voxel 模型',
    ]),
    accent: CANDIDATE_ACCENTS[index % CANDIDATE_ACCENTS.length],
    model: candidate.model,
    animations: Object.freeze({ ...candidate.animations }),
    displayHeight: 4,
  });
}

function candidatesToPhrolova(candidates) {
  if (!candidates.length) return null;
  const variants = Object.freeze(candidates.map(candidateToVariant));
  const defaultVariant = variants[0];
  return Object.freeze({
    id: 'phrolova',
    assetId: 'phrolova',
    name: '弗洛洛',
    group: '现役主角',
    role: '可操控角色 · 五种模型',
    description: '第0幕与奇异岛共用的彼岸花指挥家，可以切换五种体素造型。',
    tags: Object.freeze(['现役主角', '彼岸花', '多版本']),
    accent: '#9e324b',
    model: defaultVariant.model,
    animations: defaultVariant.animations,
    displayHeight: defaultVariant.displayHeight,
    variants,
  });
}

export function createCharacterShowcaseCatalog(candidateManifest) {
  const candidates = candidateManifest?.candidates || [];
  const phrolova = candidatesToPhrolova(candidates);
  const formerPlayer = characterFromAsset({
    id: 'nailong',
    name: '奶龙',
    group: '保留角色',
    role: '旧版岛屿主角',
    description: '曾经在奇异岛上奔跑和飞行的主角模型，继续留在展柜中。',
    tags: ['保留角色', '旧版主角', '飞行'],
    accent: '#e5a634',
    displayHeight: 4,
  });

  return Object.freeze({
    categories: Object.freeze([
      Object.freeze({
        id: 'players',
        title: '主角与候选',
        shortTitle: '主角',
        accent: '#9e324b',
        characters: Object.freeze([
          ...(phrolova ? [phrolova] : []),
          formerPlayer,
        ]),
      }),
      Object.freeze({
        id: 'residents',
        title: '岛上居民',
        shortTitle: '居民',
        accent: '#347d72',
        characters: Object.freeze(RESIDENT_DEFINITIONS.map(characterFromAsset)),
      }),
      Object.freeze({
        id: 'specialists',
        title: '功能居民',
        shortTitle: '职能',
        accent: '#b57a24',
        characters: Object.freeze(FUNCTIONAL_DEFINITIONS.map(characterFromAsset)),
      }),
    ]),
  });
}

export function getShowcaseAnimationLabel(name) {
  return SHOWCASE_ANIMATION_LABELS[name] || name;
}
