const STORAGE_KEY = 'chii-island-story-v1';
const LEGACY_ACT_ZERO_STORAGE_KEY = 'chii-story-v1';
const STORAGE_VERSION = 1;

export const ACT_ZERO_EVENT_ID = 'act0_crash';

function clone(value) {
  return structuredClone(value);
}

function normalizeId(value, label) {
  const id = String(value || '').trim();
  if (!id) throw new TypeError(`${label} requires a non-empty id`);
  return id;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
}

function normalizeEvent(value = {}) {
  const status = ['in_progress', 'complete'].includes(value.status)
    ? value.status
    : 'in_progress';
  return {
    status,
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : null,
    completedAt: status === 'complete' && Number.isFinite(value.completedAt)
      ? value.completedAt
      : null,
    data: value.data && typeof value.data === 'object' && !Array.isArray(value.data)
      ? clone(value.data)
      : {},
  };
}

function normalizeObjective(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  if (!id) return null;
  return {
    id,
    title: String(value.title || id).trim().slice(0, 80),
    chapter: String(value.chapter || '').trim() || null,
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : null,
    data: value.data && typeof value.data === 'object' && !Array.isArray(value.data)
      ? clone(value.data)
      : {},
  };
}

export function createDefaultIslandStorySnapshot() {
  return {
    version: STORAGE_VERSION,
    chapter: 'prologue',
    islandDay: 1,
    developmentStage: 'stranded',
    knownResidents: [],
    unlockedRegions: [],
    currentObjective: null,
    events: {},
    facts: {},
    updatedAt: null,
  };
}

function normalizeSnapshot(value) {
  const fallback = createDefaultIslandStorySnapshot();
  if (!value || typeof value !== 'object') return fallback;

  const events = {};
  if (value.events && typeof value.events === 'object' && !Array.isArray(value.events)) {
    for (const [id, event] of Object.entries(value.events)) {
      const normalizedId = String(id || '').trim();
      if (normalizedId && event && typeof event === 'object') {
        events[normalizedId] = normalizeEvent(event);
      }
    }
  }

  return {
    version: STORAGE_VERSION,
    chapter: String(value.chapter || fallback.chapter).trim() || fallback.chapter,
    islandDay: Number.isInteger(value.islandDay) && value.islandDay > 0
      ? value.islandDay
      : fallback.islandDay,
    developmentStage: String(value.developmentStage || fallback.developmentStage).trim()
      || fallback.developmentStage,
    knownResidents: normalizeStringList(value.knownResidents),
    unlockedRegions: normalizeStringList(value.unlockedRegions),
    currentObjective: normalizeObjective(value.currentObjective),
    events,
    facts: value.facts && typeof value.facts === 'object' && !Array.isArray(value.facts)
      ? clone(value.facts)
      : {},
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : null,
  };
}

function migrateLegacyActZero(value) {
  if (!value?.act0 || typeof value.act0 !== 'object') return null;
  const snapshot = createDefaultIslandStorySnapshot();
  const legacy = value.act0;
  if (['in_progress', 'complete'].includes(legacy.status)) {
    snapshot.events[ACT_ZERO_EVENT_ID] = normalizeEvent({
      status: legacy.status,
      startedAt: legacy.startedAt,
      completedAt: legacy.completedAt,
      data: { rescueWish: String(legacy.rescueWish || '') },
    });
  } else if (legacy.rescueWish) {
    snapshot.facts['act0.rescueWish'] = String(legacy.rescueWish);
  }
  return snapshot;
}

export class IslandStoryState {
  constructor({
    storage = globalThis.localStorage,
    now = () => Date.now(),
  } = {}) {
    this.storage = storage;
    this.now = now;
    this.listeners = new Set();
    const { snapshot, migrated } = this._read();
    this.snapshot = snapshot;
    if (migrated) this._persist();
  }

  _read() {
    try {
      const raw = this.storage?.getItem?.(STORAGE_KEY);
      if (raw) return { snapshot: normalizeSnapshot(JSON.parse(raw)), migrated: false };

      const legacyRaw = this.storage?.getItem?.(LEGACY_ACT_ZERO_STORAGE_KEY);
      const migrated = migrateLegacyActZero(legacyRaw ? JSON.parse(legacyRaw) : null);
      if (migrated) return { snapshot: migrated, migrated: true };
    } catch {
      // A malformed or unavailable save must not block the island from loading.
    }
    return { snapshot: createDefaultIslandStorySnapshot(), migrated: false };
  }

  _persist() {
    try {
      this.storage?.setItem?.(STORAGE_KEY, JSON.stringify(this.snapshot));
    } catch {
      // Story remains playable when browser storage is unavailable.
    }
  }

  _commit(type, mutate, details = {}) {
    mutate(this.snapshot);
    this.snapshot.updatedAt = this.now();
    this._persist();
    const snapshot = this.getSnapshot();
    const event = { type, ...details, snapshot };
    for (const listener of this.listeners) listener(event);
    return snapshot;
  }

  getSnapshot() {
    const snapshot = clone(this.snapshot);
    snapshot.completedEvents = Object.entries(snapshot.events)
      .filter(([, event]) => event.status === 'complete')
      .map(([id]) => id);
    return snapshot;
  }

  onChange(listener) {
    if (typeof listener !== 'function') throw new TypeError('Story listener must be a function');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setChapter(chapter) {
    const id = normalizeId(chapter, 'Story chapter');
    if (this.snapshot.chapter === id) return this.getSnapshot();
    return this._commit('chapter_changed', state => { state.chapter = id; }, { chapter: id });
  }

  setIslandDay(day) {
    if (!Number.isInteger(day) || day < 1) throw new TypeError('Island day must be a positive integer');
    if (this.snapshot.islandDay === day) return this.getSnapshot();
    return this._commit('island_day_changed', state => { state.islandDay = day; }, { islandDay: day });
  }

  advanceIslandDay() {
    return this.setIslandDay(this.snapshot.islandDay + 1);
  }

  setDevelopmentStage(stage) {
    const id = normalizeId(stage, 'Development stage');
    if (this.snapshot.developmentStage === id) return this.getSnapshot();
    return this._commit('development_stage_changed', state => {
      state.developmentStage = id;
    }, { developmentStage: id });
  }

  meetResident(residentId) {
    const id = normalizeId(residentId, 'Resident');
    if (this.snapshot.knownResidents.includes(id)) return this.getSnapshot();
    return this._commit('resident_met', state => { state.knownResidents.push(id); }, { residentId: id });
  }

  unlockRegion(regionId) {
    const id = normalizeId(regionId, 'Region');
    if (this.snapshot.unlockedRegions.includes(id)) return this.getSnapshot();
    return this._commit('region_unlocked', state => { state.unlockedRegions.push(id); }, { regionId: id });
  }

  setCurrentObjective(objective) {
    const normalized = normalizeObjective({ ...objective, startedAt: objective?.startedAt ?? this.now() });
    if (!normalized) throw new TypeError('Story objective requires a non-empty id');
    return this._commit('objective_changed', state => { state.currentObjective = normalized; }, {
      objectiveId: normalized.id,
    });
  }

  clearCurrentObjective() {
    if (!this.snapshot.currentObjective) return this.getSnapshot();
    const objectiveId = this.snapshot.currentObjective.id;
    return this._commit('objective_cleared', state => { state.currentObjective = null; }, { objectiveId });
  }

  startEvent(eventId, data = {}) {
    const id = normalizeId(eventId, 'Story event');
    const existing = this.snapshot.events[id];
    if (existing?.status === 'complete') return this.getSnapshot();
    return this._commit('event_started', state => {
      state.events[id] = {
        status: 'in_progress',
        startedAt: existing?.startedAt ?? this.now(),
        completedAt: null,
        data: { ...(existing?.data || {}), ...(data || {}) },
      };
    }, { eventId: id });
  }

  updateEventData(eventId, data = {}) {
    const id = normalizeId(eventId, 'Story event');
    const existing = this.snapshot.events[id];
    if (existing?.status === 'complete') return this.getSnapshot();
    return this._commit('event_updated', state => {
      state.events[id] = {
        status: existing?.status || 'in_progress',
        startedAt: existing?.startedAt ?? this.now(),
        completedAt: null,
        data: { ...(existing?.data || {}), ...(data || {}) },
      };
    }, { eventId: id });
  }

  completeEvent(eventId, data = {}) {
    const id = normalizeId(eventId, 'Story event');
    const existing = this.snapshot.events[id];
    if (existing?.status === 'complete') return this.getSnapshot();
    return this._commit('event_completed', state => {
      state.events[id] = {
        status: 'complete',
        startedAt: existing?.startedAt ?? this.now(),
        completedAt: this.now(),
        data: { ...(existing?.data || {}), ...(data || {}) },
      };
    }, { eventId: id });
  }

  resetEvent(eventId) {
    const id = normalizeId(eventId, 'Story event');
    if (!this.snapshot.events[id]) return this.getSnapshot();
    return this._commit('event_reset', state => { delete state.events[id]; }, { eventId: id });
  }

  getEvent(eventId) {
    const event = this.snapshot.events[String(eventId || '').trim()];
    return event ? clone(event) : null;
  }

  hasCompletedEvent(eventId) {
    return this.getEvent(eventId)?.status === 'complete';
  }

  setFact(factId, value) {
    const id = normalizeId(factId, 'Story fact');
    return this._commit('fact_changed', state => { state.facts[id] = clone(value); }, { factId: id });
  }

  getFact(factId, fallback = null) {
    const id = String(factId || '').trim();
    return id && Object.hasOwn(this.snapshot.facts, id) ? clone(this.snapshot.facts[id]) : fallback;
  }
}

export const ISLAND_STORY_STORAGE_KEY = STORAGE_KEY;
export const ISLAND_STORY_LEGACY_ACT_ZERO_STORAGE_KEY = LEGACY_ACT_ZERO_STORAGE_KEY;
export const ISLAND_STORY_STORAGE_VERSION = STORAGE_VERSION;
