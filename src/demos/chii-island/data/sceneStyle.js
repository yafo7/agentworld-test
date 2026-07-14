export const CHII_SCENE_STYLE_STORAGE_KEY = 'chii-scene-style';
export const CHII_SCENE_STYLES = Object.freeze(['pro', 'voxel']);
export const DEFAULT_CHII_SCENE_STYLE = 'voxel';

export function normalizeChiiSceneStyle(value) {
  return CHII_SCENE_STYLES.includes(value) ? value : DEFAULT_CHII_SCENE_STYLE;
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
