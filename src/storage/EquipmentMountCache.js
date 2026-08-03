const STORAGE_KEY = 'chii_equipment_mount_assets_v1';

function readManifest(storage) {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export class EquipmentMountCache {
  constructor({
    assetRepository = null,
    storage = globalThis.localStorage,
  } = {}) {
    this.assetRepository = assetRepository;
    this.storage = storage;
    this.manifest = readManifest(storage);
    this.memory = new Map();
    this.pending = new Map();
  }

  async getOrCreate(key, create) {
    const cached = await this.get(key);
    if (cached) return cached;
    if (this.pending.has(key)) return this.pending.get(key);

    const promise = Promise.resolve()
      .then(create)
      .then(value => {
        if (value?.modelJson && value?.assetId) this.set(key, value);
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  async get(key) {
    if (this.memory.has(key)) return this.memory.get(key);
    const entry = this.manifest[key];
    if (!entry?.assetId || !this.assetRepository?.get) return null;

    try {
      const asset = await this.assetRepository.get(entry.assetId);
      if (!asset?.modelJson) {
        this.delete(key);
        return null;
      }
      const value = {
        modelJson: asset.modelJson,
        assetId: entry.assetId,
        source: 'cache',
      };
      this.memory.set(key, value);
      return value;
    } catch {
      return null;
    }
  }

  set(key, value) {
    const cached = {
      modelJson: value.modelJson,
      assetId: value.assetId,
      source: value.source || 'generated',
    };
    this.memory.set(key, cached);
    this.manifest[key] = { assetId: value.assetId };
    this.persist();
    return cached;
  }

  delete(key) {
    this.memory.delete(key);
    delete this.manifest[key];
    this.persist();
  }

  persist() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.manifest));
    } catch (error) {
      console.warn('[EquipmentMountCache] Could not persist cache:', error.message);
    }
  }
}
