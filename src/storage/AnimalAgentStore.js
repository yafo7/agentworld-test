const STORAGE_PREFIX = 'chii_animal_agents_v1';

function clone(value) {
  if (value == null) return value;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function fallbackStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

export class AnimalAgentStore {
  constructor({ storage = globalThis.localStorage || fallbackStorage(), scope = 'original' } = {}) {
    this.storage = storage;
    this.scope = String(scope || 'original');
  }

  loadAll() {
    try {
      const value = JSON.parse(this.storage.getItem(this._key()) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : {};
    } catch {
      return {};
    }
  }

  load(residentId) {
    return this.loadAll()[residentId] || null;
  }

  save(residentId, snapshot) {
    return this.saveMany({ [residentId]: snapshot })[residentId];
  }

  saveMany(snapshots = {}) {
    const all = this.loadAll();
    Object.assign(all, clone(snapshots));
    this.storage.setItem(this._key(), JSON.stringify(all));
    return clone(snapshots);
  }

  replaceAll(snapshots = {}) {
    this.storage.setItem(this._key(), JSON.stringify(clone(snapshots || {})));
    return this.loadAll();
  }

  clear() {
    this.storage.removeItem(this._key());
  }

  _key() {
    return `${STORAGE_PREFIX}:${this.scope}`;
  }
}

export { STORAGE_PREFIX as ANIMAL_AGENT_STORAGE_PREFIX };
