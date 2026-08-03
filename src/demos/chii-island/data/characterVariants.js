import { createChiiAssetCatalog } from './assetCatalog.js';

const CHARACTER_ASSET_ALIASES = Object.freeze({
  builder_crab: 'crab',
  fangke: 'fangk',
});

const CURATED_CHARACTER_IDS = new Set(['momo', 'mako', 'yafo', 'lingq', 'fangk', 'mok', 'crab']);
const PRO_ASSETS = createChiiAssetCatalog('pro');
const VOXEL_ASSETS = createChiiAssetCatalog('voxel');
const ORIGINAL_ASSETS = createChiiAssetCatalog('original');

function assetIdFor(characterId) {
  return CHARACTER_ASSET_ALIASES[characterId] || characterId;
}

export function getChiiCharacterVariants(characterId) {
  const assetId = assetIdFor(characterId);
  const proAsset = PRO_ASSETS[assetId];
  const voxelAsset = VOXEL_ASSETS[assetId];
  const originalAsset = ORIGINAL_ASSETS[assetId];
  if (!proAsset || !voxelAsset || !originalAsset || !CURATED_CHARACTER_IDS.has(assetId)) return [];
  return [
    Object.freeze({
      id: 'original',
      slug: `${assetId}-original`,
      assetId,
      group: 'Original',
      name: 'Original',
      role: '重置前岛屿居民',
      description: '冻结自 7 月 28 日大型迭代开始前的模型和动画，也是当前默认制作版本。',
      tags: Object.freeze(['Original', '默认']),
      accent: '#7b684d',
      model: originalAsset.model,
      animations: Object.freeze({ ...(originalAsset.animations || {}) }),
    }),
    Object.freeze({
      id: 'pro',
      slug: `${assetId}-pro`,
      assetId,
      group: 'Pro',
      name: '细节版',
      role: 'GPT 5.6 Pro 居民',
      description: '结构和局部细节更丰富，作为岛上默认版本。',
      tags: Object.freeze(['Pro', '细节版']),
      accent: '#b36d43',
      model: proAsset.model,
      animations: Object.freeze({ ...(proAsset.animations || {}) }),
    }),
    Object.freeze({
      id: 'voxel',
      slug: `${assetId}-voxel`,
      assetId,
      group: 'Voxel',
      name: '方块版',
      role: 'GPT 5.6 Voxel 居民',
      description: '轮廓更方整统一，适合对比岛屿整体画风。',
      tags: Object.freeze(['Voxel', '方块版']),
      accent: '#347d72',
      model: voxelAsset.model,
      animations: Object.freeze({ ...(voxelAsset.animations || {}) }),
    }),
  ];
}

export function getChiiCharacterVariant(characterId, variantId) {
  return getChiiCharacterVariants(characterId)
    .find(variant => variant.id === variantId)
    || null;
}

export { assetIdFor as getChiiCharacterAssetId };
