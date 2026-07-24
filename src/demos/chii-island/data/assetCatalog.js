import { LocalRuntimeAssetRepository } from '../../../assets/repositories/LocalRuntimeAssetRepository.js';
import { getChiiSceneStyle, normalizeChiiSceneStyle } from './sceneStyle.js';

const model = (name) => `generated/models/${name}.json`;
const animation = (name) => `generated/animations/${name}.json`;
const voxelModel = (name) => `generated/styles/voxel/models/${name}.json`;
const voxelAnimation = (name) => `generated/styles/voxel/animations/${name}.json`;

export const CHII_ASSET_CATALOG = Object.freeze({
  nailong: { model: model('nailong'), animations: {
    idle: animation('nailong_idle'), walk: animation('nailong_walk'), run: animation('nailong_run'),
    jump: animation('nailong_jump'), wave_left: animation('nailong_wave_left'), fan_spark: animation('nailong_fan_spark'),
  } },
  oak: { model: model('oak') },
  normal: { model: model('normal_tree') },
  apple: { model: model('apple_tree') },
  glowgrass: { model: model('glowgrass') },
  pinkFlower: { model: model('pink_flower') },
  grassClump: { model: model('grass_clump') },
  trumpetFlower: { model: model('trumpet_flower') },
  blueTulips: { model: model('blue_tulips') },
  wheatField: { model: model('wheat_field') },
  flowerPot: { model: model('flower_pot') },
  giantCarrot: { model: model('giant_carrot') },
  windmill: { model: model('windmill') },
  church: { model: model('church') },
  temple: { model: model('temple') },
  stump: { model: model('stump') },
  campfire: { model: model('campfire'), animations: { burn: animation('campfire_burn') } },
  forestTrophy: { model: model('forest_temple_trophy'), animations: { wait: animation('forest_trophy_wait') } },
  forestTent: { model: model('forest_temple_tent') },
  pastoralWorkScaffold: {
    model: model('pastoral_work_scaffold'),
    animations: { dust: animation('pastoral_work_scaffold_dust') },
  },
  fangk: { model: model('fangk'), animations: {
    idle: animation('fangk_idle'), run: animation('fangk_run'), construct: animation('fangk_construct'), dance: animation('fangk_dance'),
  } },
  momo: { model: model('momo'), animations: {
    idle: animation('momo_idle'), walk: animation('momo_walk'), run: animation('momo_run'), chop: animation('momo_chop'),
    smash: animation('momo_smash'), wave: animation('momo_wave'), magic: animation('momo_magic'),
  } },
  mako: { model: model('mako'), animations: {
    idle: animation('mako_idle'), run: animation('mako_run'), jump: animation('mako_jump'), dance: animation('mako_dance'),
  } },
  mok: { model: model('mok'), animations: {
    idle: animation('mok_idle'), run: animation('mok_run'), jump: animation('mok_jump'),
  } },
  lingq: { model: model('lingq'), animations: {
    idle: animation('lingq_idle'), run: animation('lingq_run'), jump: animation('lingq_jump'), dance: animation('lingq_dance'),
  } },
  yafo: { model: model('yafo'), animations: {
    idle: animation('yafo_idle'), run: animation('yafo_run'), jump: animation('yafo_jump'),
  } },
  crab: { model: model('crab'), animations: {
    idle: animation('crab_idle'), walk: animation('crab_walk'), run: animation('crab_run'),
    jump: animation('crab_jump'), construct: animation('crab_construct'), dance: animation('crab_dance'),
  } },
});

export const CHII_SCENE_ASSET_IDS = Object.freeze([
  'oak', 'normal', 'apple', 'glowgrass', 'windmill', 'church', 'temple',
  'pinkFlower', 'grassClump', 'trumpetFlower', 'blueTulips', 'wheatField',
  'flowerPot', 'giantCarrot', 'campfire', 'forestTrophy', 'forestTent',
  'pastoralWorkScaffold',
]);

const VOXEL_SCENE_VARIANTS = Object.freeze({
  oak: { model: voxelModel('oak') },
  normal: { model: voxelModel('normal_tree') },
  apple: { model: voxelModel('apple_tree') },
  glowgrass: { model: voxelModel('glowgrass') },
  pinkFlower: { model: voxelModel('pink_flower') },
  grassClump: { model: voxelModel('grass_clump') },
  trumpetFlower: { model: voxelModel('trumpet_flower') },
  blueTulips: { model: voxelModel('blue_tulips') },
  wheatField: { model: voxelModel('wheat_field') },
  flowerPot: { model: voxelModel('flower_pot') },
  giantCarrot: { model: voxelModel('giant_carrot') },
  campfire: { model: voxelModel('campfire'), animations: { burn: voxelAnimation('campfire_burn') } },
  pastoralWorkScaffold: {
    model: voxelModel('pastoral_work_scaffold'),
    animations: { dust: voxelAnimation('pastoral_work_scaffold_dust') },
  },
});

export function createChiiAssetCatalog(sceneStyle = 'pro') {
  if (normalizeChiiSceneStyle(sceneStyle) !== 'voxel') return CHII_ASSET_CATALOG;
  return Object.freeze(Object.fromEntries(Object.entries(CHII_ASSET_CATALOG).map(([id, entry]) => {
    const variant = VOXEL_SCENE_VARIANTS[id];
    if (!variant) return [id, entry];
    return [id, Object.freeze({
      ...entry,
      ...variant,
      animations: variant.animations || entry.animations,
    })];
  })));
}

export function createChiiAssetRepository({ sceneStyle = getChiiSceneStyle(), ...options } = {}) {
  return new LocalRuntimeAssetRepository({ catalog: createChiiAssetCatalog(sceneStyle), ...options });
}
