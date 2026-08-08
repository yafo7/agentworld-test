const STORAGE_KEY = 'chii_scene_saves_v2';
const SAVE_VERSION = 2;
const RECORD_SLOT_COUNT = 3;
const SCENE_STYLES = Object.freeze(['pro', 'voxel', 'original', 'forge']);

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function emptySceneState() {
  return {
    auto: null,
    records: Array.from({ length: RECORD_SLOT_COUNT }, () => null),
    selectedSlot: 0,
  };
}

function emptyState() {
  return {
    version: SAVE_VERSION,
    scenes: Object.fromEntries(SCENE_STYLES.map(style => [style, emptySceneState()])),
  };
}

function normalizeSlot(slot) {
  const value = Number(slot);
  if (!Number.isInteger(value) || value < 0 || value >= RECORD_SLOT_COUNT) {
    throw new RangeError(`Scene record slot must be between 0 and ${RECORD_SLOT_COUNT - 1}`);
  }
  return value;
}

function normalizeSceneState(value = {}) {
  const records = Array.from({ length: RECORD_SLOT_COUNT }, (_, index) => (
    value.records?.[index] ? clone(value.records[index]) : null
  ));
  return {
    auto: value.auto ? clone(value.auto) : null,
    records,
    selectedSlot: Number.isInteger(value.selectedSlot)
      ? Math.min(Math.max(value.selectedSlot, 0), RECORD_SLOT_COUNT - 1)
      : 0,
  };
}

function readState(storage) {
  if (!storage) return emptyState();
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.version !== SAVE_VERSION || typeof parsed.scenes !== 'object') {
      return emptyState();
    }
    const state = emptyState();
    for (const style of SCENE_STYLES) {
      state.scenes[style] = normalizeSceneState(parsed.scenes[style]);
    }
    return state;
  } catch {
    return emptyState();
  }
}

function normalizeStyle(style) {
  return SCENE_STYLES.includes(style) ? style : 'original';
}

function wrapSnapshot(snapshot, savedAt, source = 'auto') {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('Scene snapshot is required');
  }
  return {
    ...clone(snapshot),
    schemaVersion: SAVE_VERSION,
    savedAt,
    source,
  };
}

export class ChiiSceneSaveStore {
  constructor({
    storage = globalThis.localStorage,
    now = () => Date.now(),
  } = {}) {
    this.storage = storage;
    this.now = now;
    this.state = readState(storage);
  }

  getAuto(style) {
    return clone(this._scene(style).auto);
  }

  saveAuto(style, snapshot) {
    const scene = this._scene(style);
    scene.auto = wrapSnapshot(snapshot, this.now(), 'auto');
    this._persist();
    return clone(scene.auto);
  }

  getRecord(style, slot) {
    return clone(this._scene(style).records[normalizeSlot(slot)]);
  }

  getRecords(style) {
    return this._scene(style).records.map(record => clone(record));
  }

  saveRecord(style, slot, snapshot) {
    const index = normalizeSlot(slot);
    const scene = this._scene(style);
    scene.records[index] = wrapSnapshot(snapshot, this.now(), `record:${index + 1}`);
    scene.selectedSlot = index;
    this._persist();
    return clone(scene.records[index]);
  }

  restoreRecord(style, slot) {
    const index = normalizeSlot(slot);
    const scene = this._scene(style);
    const record = scene.records[index];
    if (!record) return null;
    scene.auto = wrapSnapshot(record, this.now(), `restored:${index + 1}`);
    scene.selectedSlot = index;
    this._persist();
    return clone(scene.auto);
  }

  getSelectedSlot(style) {
    return this._scene(style).selectedSlot;
  }

  setSelectedSlot(style, slot) {
    const scene = this._scene(style);
    scene.selectedSlot = normalizeSlot(slot);
    this._persist();
    return scene.selectedSlot;
  }

  clearAuto(style) {
    this._scene(style).auto = null;
    this._persist();
  }

  _scene(style) {
    const key = normalizeStyle(style);
    if (!this.state.scenes[key]) this.state.scenes[key] = emptySceneState();
    return this.state.scenes[key];
  }

  _persist() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      throw new Error(`Could not persist Chii scene save: ${error.message}`, { cause: error });
    }
  }
}

export {
  RECORD_SLOT_COUNT as CHII_SCENE_RECORD_SLOT_COUNT,
  SAVE_VERSION as CHII_SCENE_SAVE_VERSION,
  SCENE_STYLES as CHII_SCENE_SAVE_STYLES,
  STORAGE_KEY as CHII_SCENE_SAVE_STORAGE_KEY,
};
