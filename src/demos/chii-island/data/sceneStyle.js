export const CHII_SCENE_STYLE_STORAGE_KEY = 'chii-scene-style-v2';
export const DEFAULT_CHII_SCENE_STYLE = 'original';

export const CHII_SCENE_PROFILES = Object.freeze({
  original: Object.freeze({
    id: 'original',
    label: 'Original',
    assetRoot: 'generated/scenes/original',
    snapshotId: 'before-2026-07-28-large-iteration',
    terrainSeed: 42,
    layoutSeed: 99,
    features: Object.freeze({
      worldWater: false,
      waterLandmarks: false,
      forestBeach: false,
    }),
  }),
  pro: Object.freeze({
    id: 'pro',
    label: 'Pro 场景',
    assetRoot: 'generated/scenes/pro',
    snapshotId: 'gpt56-pro',
    terrainSeed: 42,
    layoutSeed: 99,
    features: Object.freeze({
      worldWater: true,
      waterLandmarks: true,
      forestBeach: true,
    }),
  }),
  voxel: Object.freeze({
    id: 'voxel',
    label: 'Voxel 场景',
    assetRoot: 'generated/scenes/voxel',
    snapshotId: 'gpt56-voxel',
    terrainSeed: 42,
    layoutSeed: 99,
    features: Object.freeze({
      worldWater: true,
      waterLandmarks: true,
      forestBeach: true,
    }),
    selectable: false,
  }),
  forge: Object.freeze({
    id: 'forge',
    label: 'Forge 场景',
    assetRoot: 'generated/scenes/original',
    forgePackageRoot: 'generated/scenes/forge/worldforge',
    snapshotId: 'chii-island-forge-v1',
    terrainSeed: 42,
    layoutSeed: 99,
    features: Object.freeze({
      worldWater: false,
      waterLandmarks: false,
      forestBeach: false,
      worldForge: true,
    }),
  }),
});

export const CHII_SCENE_STYLES = Object.freeze(
  Object.values(CHII_SCENE_PROFILES).filter(profile => profile.selectable !== false).map(profile => profile.id),
);

export function normalizeChiiSceneStyle(value) {
  return Object.hasOwn(CHII_SCENE_PROFILES, value) ? value : DEFAULT_CHII_SCENE_STYLE;
}

export function getChiiSceneProfile(value = DEFAULT_CHII_SCENE_STYLE) {
  return CHII_SCENE_PROFILES[normalizeChiiSceneStyle(value)];
}

export function getChiiSceneStyle(storage = globalThis.localStorage) {
  try {
    return normalizeChiiSceneStyle(storage?.getItem(CHII_SCENE_STYLE_STORAGE_KEY));
  } catch (_) {
    return DEFAULT_CHII_SCENE_STYLE;
  }
}

export function setChiiSceneStyle(style, storage = globalThis.localStorage) {
  const normalized = normalizeChiiSceneStyle(style);
  try {
    storage?.setItem(CHII_SCENE_STYLE_STORAGE_KEY, normalized);
  } catch (_) {}
  return normalized;
}
