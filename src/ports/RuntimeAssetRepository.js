/**
 * Stable asset access contract. Gameplay works with aliases/asset ids and never
 * with Studio commits, folders or HTTP paths.
 */
export class RuntimeAssetRepository {
  async getModel(_assetRef) { throw new Error('getModel() is not implemented'); }
  async getAnimation(_assetRef, _name) { throw new Error('getAnimation() is not implemented'); }
  async getAnimations(_assetRef) { throw new Error('getAnimations() is not implemented'); }
  async getModels(_assetRefs) { throw new Error('getModels() is not implemented'); }
  async saveGeneratedBundle(_bundle) { throw new Error('saveGeneratedBundle() is not implemented'); }
}

export function assertRuntimeAssetRepository(repository) {
  if (!repository) throw new TypeError('RuntimeAssetRepository is required');
  for (const method of ['getModel', 'getAnimation', 'getAnimations', 'getModels', 'saveGeneratedBundle']) {
    if (typeof repository[method] !== 'function') {
      throw new TypeError(`RuntimeAssetRepository.${method}() is required`);
    }
  }
  return repository;
}
