export class ForgeScenePort {
  async list() {
    throw new Error('list() is not implemented');
  }

  async load(_sceneId) {
    throw new Error('load() is not implemented');
  }
}

export function assertForgeScenePort(value) {
  if (!value?.list || !value?.load) throw new TypeError('ForgeScenePort requires list() and load(sceneId)');
  return value;
}
