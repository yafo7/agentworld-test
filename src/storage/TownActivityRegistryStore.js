const STORAGE_PREFIX = 'chii_town_activity_registry_v1';

function clone(value) {
  if (value == null) return value;
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export class TownActivityRegistryStore {
  constructor({ storage = globalThis.localStorage, prefix = STORAGE_PREFIX } = {}) {
    this.storage = storage;
    this.prefix = prefix;
  }

  list(sceneStyle = 'original') {
    if (!this.storage) return [];
    try {
      const parsed = JSON.parse(this.storage.getItem(this._key(sceneStyle)) || '[]');
      return Array.isArray(parsed) ? clone(parsed) : [];
    } catch {
      return [];
    }
  }

  replaceScene(sceneStyle, records) {
    if (!this.storage) return;
    const snapshot = JSON.stringify(clone(records || []));
    this.storage.setItem(this._key(sceneStyle), snapshot);
  }

  clear(sceneStyle = 'original') {
    this.storage?.removeItem(this._key(sceneStyle));
  }

  _key(sceneStyle) {
    return `${this.prefix}:${sceneStyle}`;
  }
}

export { STORAGE_PREFIX as TOWN_ACTIVITY_REGISTRY_STORAGE_PREFIX };
