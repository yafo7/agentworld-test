const STORAGE_KEY = 'chii_town_activity_assets_v1';

function readManifest(storage) {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function copyMetadata(metadata = {}) {
  return {
    kind: String(metadata.kind || '').trim() || null,
    activityType: String(metadata.activityType || '').trim() || null,
    subjectId: String(metadata.subjectId || '').trim() || null,
    name: String(metadata.name || '').trim() || null,
    prompt: String(metadata.prompt || '').trim() || null,
  };
}

export class TownActivityAssetCache {
  constructor({ assetRepository = null, storage = globalThis.localStorage } = {}) {
    this.assetRepository = assetRepository;
    this.storage = storage;
    this.manifest = readManifest(storage);
    this.models = new Map();
    this.animations = new Map();
    this.pending = new Map();
  }

  async getOrCreateModel(key, create, metadata = {}) {
    const cached = await this.getModel(key);
    if (cached) return cached;
    return this._once(`model:${key}`, async () => {
      const secondCheck = await this.getModel(key);
      if (secondCheck) return secondCheck;
      const value = await create();
      if (value?.modelJson && value?.assetId) this._setModel(key, value, metadata);
      return value;
    });
  }

  async getOrCreateAnimation(key, create, metadata = {}) {
    const cached = this.animations.get(key) || this.manifest[key]?.value;
    if (cached) {
      this.animations.set(key, cached);
      return cached;
    }
    return this._once(`animation:${key}`, async () => {
      const secondCheck = this.animations.get(key) || this.manifest[key]?.value;
      if (secondCheck) return secondCheck;
      const value = await create();
      if (value?.plan) {
        this.animations.set(key, value);
        this.manifest[key] = { type: 'animation', value, metadata: copyMetadata(metadata) };
        this._persist();
      }
      return value;
    });
  }

  async getModel(key) {
    const memoryValue = this.models.get(key);
    if (memoryValue) return memoryValue;

    const entry = this.manifest[key];
    if (entry?.type !== 'model' || !entry.assetId || !this.assetRepository?.get) return null;
    try {
      const asset = await this.assetRepository.get(entry.assetId);
      if (!asset?.modelJson) {
        this._delete(key);
        return null;
      }
      const value = { modelJson: asset.modelJson, assetId: entry.assetId };
      this.models.set(key, value);
      return value;
    } catch {
      return null;
    }
  }

  getAnimation(key) {
    const value = this.animations.get(key) || this.manifest[key]?.value || null;
    if (value) this.animations.set(key, value);
    return value;
  }

  list({ type = null, kind = null, activityType = null, subjectId = null } = {}) {
    return Object.entries(this.manifest)
      .map(([key, entry]) => ({
        key,
        type: entry?.type || null,
        assetId: entry?.assetId || null,
        ...copyMetadata(entry?.metadata),
      }))
      .filter(entry => !type || entry.type === type)
      .filter(entry => !kind || entry.kind === kind)
      .filter(entry => !activityType || entry.activityType === activityType)
      .filter(entry => !subjectId || entry.subjectId === subjectId);
  }

  _setModel(key, value, metadata = {}) {
    const cached = { modelJson: value.modelJson, assetId: value.assetId };
    this.models.set(key, cached);
    this.manifest[key] = { type: 'model', assetId: value.assetId, metadata: copyMetadata(metadata) };
    this._persist();
  }

  _once(key, create) {
    const pending = this.pending.get(key);
    if (pending) return pending;
    const promise = Promise.resolve()
      .then(create)
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  _delete(key) {
    this.models.delete(key);
    this.animations.delete(key);
    delete this.manifest[key];
    this._persist();
  }

  _persist() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.manifest));
    } catch (error) {
      console.warn('[TownActivityAssetCache] Could not persist cache:', error.message);
    }
  }
}
