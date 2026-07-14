import { assetCache } from '../../storage/assetCache.js';
import { RuntimeAssetRepository } from '../../ports/RuntimeAssetRepository.js';

function normalizePath(path) {
  return path?.startsWith('/') ? path : `/${path}`;
}

export class LocalRuntimeAssetRepository extends RuntimeAssetRepository {
  constructor({ catalog = {}, fetchImpl = globalThis.fetch } = {}) {
    super();
    this.catalog = catalog;
    this.fetch = (...args) => fetchImpl.call(globalThis, ...args);
  }

  resolve(assetRef) {
    if (typeof assetRef === 'object' && assetRef) return assetRef;
    const entry = this.catalog[assetRef];
    if (!entry) throw new Error(`Unknown runtime asset: ${assetRef}`);
    return entry;
  }

  async _read(path) {
    if (!path) return null;
    const cacheKey = path.replace(/^\//, '');
    return assetCache.load(cacheKey, async () => {
      const response = await this.fetch(normalizePath(path));
      if (!response.ok) throw new Error(`Runtime asset HTTP ${response.status}: ${path}`);
      return response.json();
    });
  }

  async getModel(assetRef) {
    return this._read(this.resolve(assetRef).model);
  }

  async getAnimation(assetRef, name) {
    const entry = this.resolve(assetRef);
    return this._read(entry.animations?.[name]);
  }

  async getAnimations(assetRef) {
    const entry = this.resolve(assetRef);
    const pairs = await Promise.all(Object.entries(entry.animations || {}).map(async ([name, path]) => {
      try {
        return [name, await this._read(path)];
      } catch (error) {
        console.warn(`[Assets] Animation ${assetRef}.${name} unavailable:`, error.message);
        return [name, null];
      }
    }));
    return Object.fromEntries(pairs.filter(([, plan]) => plan));
  }

  async getModels(assetRefs) {
    const pairs = await Promise.all(assetRefs.map(async (assetRef) => {
      try {
        return [assetRef, await this.getModel(assetRef)];
      } catch (error) {
        console.warn(`[Assets] Model ${assetRef} unavailable:`, error.message);
        return [assetRef, null];
      }
    }));
    return Object.fromEntries(pairs.filter(([, model]) => model));
  }

  async saveGeneratedBundle() {
    throw new Error('LocalRuntimeAssetRepository is read-only');
  }
}
