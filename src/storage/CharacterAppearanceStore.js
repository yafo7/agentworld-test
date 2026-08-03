const STORAGE_KEY = 'chii_character_appearances_v2';
const LEGACY_STORAGE_KEY = 'chii_character_appearances_v1';
const STORAGE_VERSION = 2;

function readJson(storage, key, fallback) {
  if (!storage) return fallback;
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

function copyAppearance(value = {}) {
  return {
    variantId: value.variantId || 'default',
    outfitId: value.outfitId || null,
    loadout: { ...(value.loadout || {}) },
  };
}

function copyAppearanceMap(value = {}) {
  return Object.fromEntries(Object.entries(value).map(([id, appearance]) => [
    id,
    copyAppearance(appearance),
  ]));
}

export class CharacterAppearanceStore {
  constructor({
    storage = globalThis.localStorage,
    scope = 'default',
  } = {}) {
    this.storage = storage;
    this.scope = String(scope || 'default');
    this.listeners = new Set();
    const stored = readJson(storage, STORAGE_KEY, null);
    this.state = stored?.version === STORAGE_VERSION && stored.scopes
      ? {
          version: STORAGE_VERSION,
          scopes: Object.fromEntries(Object.entries(stored.scopes).map(([key, value]) => [
            key,
            copyAppearanceMap(value),
          ])),
        }
      : { version: STORAGE_VERSION, scopes: {} };

    if (!this.state.scopes[this.scope]) {
      const legacy = readJson(storage, LEGACY_STORAGE_KEY, {});
      const canMigrateLegacy = Object.keys(this.state.scopes).length === 0;
      this.state.scopes[this.scope] = canMigrateLegacy
        ? copyAppearanceMap(legacy)
        : {};
      if (canMigrateLegacy && Object.keys(legacy).length > 0) this.persist();
    }
  }

  get(characterId) {
    const scope = this._scope();
    if (!characterId || !scope[characterId]) return null;
    return copyAppearance(scope[characterId]);
  }

  set(characterId, appearance) {
    if (!characterId) throw new TypeError('Character appearance requires an id');
    this._scope()[characterId] = copyAppearance(appearance);
    this.persist();
    this._emit({ type: 'set', characterId, appearance: this.get(characterId) });
    return this.get(characterId);
  }

  delete(characterId) {
    delete this._scope()[characterId];
    this.persist();
    this._emit({ type: 'delete', characterId });
  }

  getAll() {
    return copyAppearanceMap(this._scope());
  }

  replaceAll(appearances = {}, { emit = true } = {}) {
    this.state.scopes[this.scope] = copyAppearanceMap(appearances);
    this.persist();
    if (emit) this._emit({ type: 'replace', appearances: this.getAll() });
    return this.getAll();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  persist() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.warn('[CharacterAppearanceStore] Could not persist appearance:', error.message);
    }
  }

  _scope() {
    if (!this.state.scopes[this.scope]) this.state.scopes[this.scope] = {};
    return this.state.scopes[this.scope];
  }

  _emit(event) {
    for (const listener of this.listeners) listener(event);
  }
}

export {
  LEGACY_STORAGE_KEY as CHII_CHARACTER_APPEARANCE_LEGACY_STORAGE_KEY,
  STORAGE_KEY as CHII_CHARACTER_APPEARANCE_STORAGE_KEY,
};
