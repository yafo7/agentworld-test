function normalizePath(value) {
  const path = String(value || '').trim();
  if (!path) return null;
  return path.startsWith('/') ? path : `/${path}`;
}

export class ActivityAssetRepository {
  constructor({ generatedAssetRepository = null, fetcher = globalThis.fetch } = {}) {
    this.generatedAssetRepository = generatedAssetRepository;
    this.fetcher = fetcher;
    this.files = new Map();
  }

  async getModel(binding) {
    if (!binding) return null;
    if (binding.assetId && this.generatedAssetRepository?.get) {
      try {
        const generated = await this.generatedAssetRepository.get(binding.assetId);
        if (generated?.modelJson) return { modelJson: generated.modelJson, assetId: binding.assetId };
      } catch {
        // A registered file path remains the durable fallback for curated activity assets.
      }
    }
    if (!binding.path) return null;
    const modelJson = await this._getJson(binding.path);
    return modelJson ? { modelJson, assetId: binding.assetId || `activity-file:${binding.path}` } : null;
  }

  async getAnimation(binding) {
    if (!binding?.path) return null;
    return this._getJson(binding.path);
  }

  async _getJson(pathValue) {
    const path = normalizePath(pathValue);
    if (!path || !this.fetcher) return null;
    if (this.files.has(path)) return this.files.get(path);
    const response = await this.fetcher(path);
    if (!response?.ok) throw new Error(`Activity asset unavailable: ${path}`);
    const value = await response.json();
    this.files.set(path, value);
    return value;
  }
}
