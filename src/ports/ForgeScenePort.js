export class ForgeScenePort {
  async load(_sceneId) {
    throw new Error('load() is not implemented');
  }
}

export function assertForgeScenePort(value) {
  if (!value?.load) throw new TypeError('ForgeScenePort requires load(sceneId)');
  return value;
}
