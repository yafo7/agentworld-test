import { LocalRuntimeAssetRepository } from '../../../assets/repositories/LocalRuntimeAssetRepository.js';
import {
  getChiiSceneProfile,
  getChiiSceneStyle,
  normalizeChiiSceneStyle,
} from './sceneStyle.js';

const modelNames = Object.freeze({
  nailong: 'nailong',
  oak: 'oak',
  normal: 'normal_tree',
  apple: 'apple_tree',
  glowgrass: 'glowgrass',
  pinkFlower: 'pink_flower',
  grassClump: 'grass_clump',
  trumpetFlower: 'trumpet_flower',
  blueTulips: 'blue_tulips',
  wheatField: 'wheat_field',
  flowerPot: 'flower_pot',
  giantCarrot: 'giant_carrot',
  windmill: 'windmill',
  church: 'church',
  temple: 'temple',
  townBridge: 'town_stone_bridge',
  islandWaterfall: 'island_waterfall',
  townFountain: 'town_fountain',
  churchPew: 'church_pew',
  churchAltar: 'church_altar',
  churchStatue: 'church_angel_statue',
  stump: 'stump',
  campfire: 'campfire',
  forestTrophy: 'forest_temple_trophy',
  forestTent: 'forest_temple_tent',
  pastoralWorkScaffold: 'pastoral_work_scaffold',
  fangk: 'fangk',
  momo: 'momo',
  mako: 'mako',
  mok: 'mok',
  lingq: 'lingq',
  yafo: 'yafo',
  crab: 'crab',
});

const animationNames = Object.freeze({
  nailong: Object.freeze({
    idle: 'nailong_idle', walk: 'nailong_walk', run: 'nailong_run',
    jump: 'nailong_jump', wave_left: 'nailong_wave_left', fan_spark: 'nailong_fan_spark',
  }),
  campfire: Object.freeze({ burn: 'campfire_burn' }),
  forestTrophy: Object.freeze({ wait: 'forest_trophy_wait' }),
  pastoralWorkScaffold: Object.freeze({ dust: 'pastoral_work_scaffold_dust' }),
  fangk: Object.freeze({
    idle: 'fangk_idle', run: 'fangk_run', construct: 'fangk_construct', dance: 'fangk_dance',
  }),
  momo: Object.freeze({
    idle: 'momo_idle', walk: 'momo_walk', run: 'momo_run', chop: 'momo_chop',
    smash: 'momo_smash', wave: 'momo_wave', magic: 'momo_magic',
  }),
  mako: Object.freeze({
    idle: 'mako_idle', run: 'mako_run', jump: 'mako_jump', dance: 'mako_dance',
  }),
  mok: Object.freeze({ idle: 'mok_idle', run: 'mok_run', jump: 'mok_jump' }),
  lingq: Object.freeze({
    idle: 'lingq_idle', run: 'lingq_run', jump: 'lingq_jump', dance: 'lingq_dance',
  }),
  yafo: Object.freeze({ idle: 'yafo_idle', run: 'yafo_run', jump: 'yafo_jump' }),
  crab: Object.freeze({
    idle: 'crab_idle', walk: 'crab_walk', run: 'crab_run',
    jump: 'crab_jump', construct: 'crab_construct', dance: 'crab_dance',
  }),
});

const WATER_LANDMARK_IDS = new Set(['islandWaterfall', 'townFountain']);

function buildSceneCatalog(sceneStyle) {
  const profile = getChiiSceneProfile(sceneStyle);
  const model = name => `${profile.assetRoot}/models/${name}.json`;
  const animation = name => `${profile.assetRoot}/animations/${name}.json`;
  return Object.freeze(Object.fromEntries(Object.entries(modelNames).flatMap(([id, name]) => {
    if (!profile.features.waterLandmarks && WATER_LANDMARK_IDS.has(id)) return [];
    const animations = animationNames[id];
    return [[id, Object.freeze({
      model: model(name),
      ...(animations ? {
        animations: Object.freeze(Object.fromEntries(
          Object.entries(animations).map(([key, file]) => [key, animation(file)]),
        )),
      } : {}),
    })]];
  })));
}

const CHII_SCENE_CATALOGS = Object.freeze(Object.fromEntries(
  ['pro', 'voxel', 'original', 'forge'].map(sceneStyle => [sceneStyle, buildSceneCatalog(sceneStyle)]),
));

export const CHII_ASSET_CATALOG = CHII_SCENE_CATALOGS.pro;

export const CHII_SCENE_ASSET_IDS = Object.freeze([
  'oak', 'normal', 'apple', 'glowgrass', 'windmill', 'church', 'temple', 'townBridge',
  'islandWaterfall', 'townFountain',
  'churchPew', 'churchAltar', 'churchStatue',
  'pinkFlower', 'grassClump', 'trumpetFlower', 'blueTulips', 'wheatField',
  'flowerPot', 'giantCarrot', 'campfire', 'forestTrophy', 'forestTent',
  'pastoralWorkScaffold',
]);

export function createChiiAssetCatalog(sceneStyle = 'pro') {
  return CHII_SCENE_CATALOGS[normalizeChiiSceneStyle(sceneStyle)];
}

export function getChiiSceneAssetIds(sceneStyle = getChiiSceneStyle()) {
  const catalog = createChiiAssetCatalog(sceneStyle);
  return CHII_SCENE_ASSET_IDS.filter(id => catalog[id]);
}

export function createChiiAssetRepository({ sceneStyle = getChiiSceneStyle(), ...options } = {}) {
  return new LocalRuntimeAssetRepository({ catalog: createChiiAssetCatalog(sceneStyle), ...options });
}
