import { StaticEntity } from '../../../engine/entity/StaticEntity.js';
import { replaceStaticEntityModel } from '../../../world/model/replaceStaticEntityModel.js';
import {
  getAIWorldEvents,
  onAIWorldEventsChange,
  replaceAIWorldEvents,
} from '../../../storage/aiWorldState.js';

const WORLD_SNAPSHOT_VERSION = 2;
const AUTOSAVE_DELAY_MS = 350;
const NON_PERSISTENT_SOURCES = new Set([
  'building_draft',
  'interior',
  'social_event',
]);

function jsonClone(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function rounded(value) {
  return Math.round(finite(value) * 10000) / 10000;
}

function vector3(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return value.slice(0, 3).map((entry, index) => finite(entry, fallback[index]));
}

function transformOf(entity, metadata = {}) {
  const placementScale = Number(metadata.placement?.normalizationScale)
    * Number(metadata.placement?.userScale ?? 1);
  const stableContentScale = Number.isFinite(placementScale) && placementScale > 0
    ? [placementScale, placementScale, placementScale]
    : [
        rounded(entity?._content?.scale?.x ?? 1),
        rounded(entity?._content?.scale?.y ?? 1),
        rounded(entity?._content?.scale?.z ?? 1),
      ];
  return {
    position: [
      rounded(entity?.mesh?.position?.x),
      rounded(entity?.mesh?.position?.y),
      rounded(entity?.mesh?.position?.z),
    ],
    rotation: [
      rounded(entity?.mesh?.rotation?.x),
      rounded(entity?.mesh?.rotation?.y),
      rounded(entity?.mesh?.rotation?.z),
    ],
    contentScale: stableContentScale.map(rounded),
    visible: entity?.mesh?.visible !== false,
  };
}

function userDataOf(entity) {
  const data = entity?.mesh?.userData || {};
  return {
    placementEditable: data.placementEditable !== false,
    pastoralObject: data.pastoralObject === true,
    townBuilding: data.townBuilding === true,
    noCollider: data.noCollider === true,
  };
}

function effectiveMetadata(metadata = {}) {
  if (metadata.persistenceMode !== 'temporary' || !metadata.persistenceOriginal) {
    return metadata;
  }
  return {
    ...metadata,
    ...metadata.persistenceOriginal,
    persistenceMode: undefined,
    persistenceOriginal: undefined,
  };
}

function savedMetadata(metadata = {}) {
  const effective = effectiveMetadata(metadata);
  return {
    operation: effective.operation || 'original',
    assetId: effective.assetId || null,
    prompt: effective.prompt || null,
    lotSize: jsonClone(effective.lotSize),
    placement: jsonClone(effective.placement, {}),
  };
}

function isPersistentMetadata(metadata = {}) {
  const source = metadata.placement?.source;
  return !NON_PERSISTENT_SOURCES.has(source);
}

function modelSourceFor(entity, metadata, {
  baselineAssetId = null,
  generated = false,
} = {}) {
  const effective = effectiveMetadata(metadata);
  const assetId = effective.assetId || entity?._generatedAssetId || null;
  const operation = effective.operation || 'original';
  if (assetId && (generated || operation !== 'original' || assetId !== baselineAssetId)) {
    return { type: 'asset', assetId };
  }
  return null;
}

function snapshotEntity(entity, metadata, {
  kind,
  baselineAssetId = null,
} = {}) {
  const modelSource = modelSourceFor(entity, metadata, {
    baselineAssetId,
    generated: kind === 'generated',
  });
  if (kind === 'generated' && !modelSource) {
    throw new TypeError(`Generated world object ${entity?.name || entity?.id || 'unknown'} has no persisted assetId`);
  }
  return {
    saveId: entity._chiiSaveId,
    kind,
    instanceId: entity._instanceId || null,
    id: entity.id || null,
    name: entity.name || entity.mesh?.name || 'Object',
    tags: [...(entity.tags || [])],
    category: entity.category || 'decor',
    transform: transformOf(entity, metadata),
    userData: userDataOf(entity),
    metadata: savedMetadata(metadata),
    modelSource,
  };
}

function comparableSnapshot(snapshot) {
  return JSON.stringify({
    tags: snapshot.tags,
    category: snapshot.category,
    transform: snapshot.transform,
    userData: snapshot.userData,
    metadata: snapshot.metadata,
    modelSource: snapshot.modelSource,
  });
}

function applyTransform(entity, transform = {}) {
  const position = vector3(transform.position);
  const rotation = vector3(transform.rotation);
  const contentScale = vector3(transform.contentScale, [1, 1, 1]);
  entity.mesh.position.set(...position);
  entity.mesh.rotation.set(...rotation);
  entity._content?.scale?.set(...contentScale);
  entity.mesh.visible = transform.visible !== false;
}

function applyUserData(entity, userData = {}) {
  entity.mesh.userData.placementEditable = userData.placementEditable !== false;
  entity.mesh.userData.pastoralObject = userData.pastoralObject === true;
  entity.mesh.userData.townBuilding = userData.townBuilding === true;
  entity.mesh.userData.noCollider = userData.noCollider === true;
}

function curatedSaveId(entity, metadata, index) {
  const identity = String(metadata.assetId || entity.id || entity.name || 'object')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 48);
  return `curated:${String(index).padStart(4, '0')}:${identity}`;
}

function generatedSaveId(entity) {
  return `generated:${entity._instanceId || entity.id || Date.now().toString(36)}`;
}

function createDefaultEntity(snapshot, modelJson) {
  const entity = new StaticEntity({
    instanceId: snapshot.instanceId || undefined,
    id: snapshot.id || snapshot.saveId,
    name: snapshot.name || 'Saved object',
    tags: snapshot.tags || [],
    category: snapshot.category || 'decor',
    position: vector3(snapshot.transform?.position),
    scale: 1,
    modelJson,
  });
  applyTransform(entity, snapshot.transform);
  applyUserData(entity, snapshot.userData);
  return entity;
}

export class ChiiScenePersistenceSystem {
  constructor({
    sceneStyle,
    store,
    worldObjects,
    scene,
    generatedAssetRepository,
    appearanceStore,
    createEntity = createDefaultEntity,
    replaceEntityModel = replaceStaticEntityModel,
    autosaveDelayMs = AUTOSAVE_DELAY_MS,
  }) {
    if (!store || !worldObjects || !scene || !generatedAssetRepository) {
      throw new TypeError('ChiiScenePersistenceSystem requires store, worldObjects, scene, and asset repository');
    }
    this.sceneStyle = sceneStyle;
    this.store = store;
    this.worldObjects = worldObjects;
    this.scene = scene;
    this.generatedAssetRepository = generatedAssetRepository;
    this.appearanceStore = appearanceStore;
    this.createEntity = createEntity;
    this.replaceEntityModel = replaceEntityModel;
    this.autosaveDelayMs = autosaveDelayMs;
    this.baseline = new Map();
    this.statusListeners = new Set();
    this.timer = null;
    this.started = false;
    this.restoring = false;
    this.autosaveSuspended = false;
    this.lastSavedAt = 0;
    this.lastError = null;
    this._unbindWorld = null;
    this._unbindAI = null;
    this._onPageHide = () => this.flush();

    this._captureBaseline();
  }

  async restoreAuto() {
    const snapshot = this.store.getAuto(this.sceneStyle);
    if (!snapshot) {
      replaceAIWorldEvents([]);
      return { restored: false, removed: 0, changed: 0, generated: 0, warnings: [] };
    }

    this.restoring = true;
    const warnings = [];
    let removed = 0;
    let changed = 0;
    let generated = 0;
    try {
      replaceAIWorldEvents(snapshot.aiEvents || []);
      for (const saveId of snapshot.world?.removedCurated || []) {
        const baseline = this.baseline.get(saveId);
        if (!baseline || !this.worldObjects.items.includes(baseline.entity)) continue;
        this.worldObjects.remove(baseline.entity);
        this.scene.remove(baseline.entity.mesh);
        removed += 1;
      }

      for (const entry of snapshot.world?.curatedChanges || []) {
        const baseline = this.baseline.get(entry.saveId);
        if (!baseline || !this.worldObjects.items.includes(baseline.entity)) continue;
        try {
          await this._restoreCuratedEntity(baseline.entity, entry);
          changed += 1;
        } catch (error) {
          warnings.push(`${entry.name || entry.saveId}: ${error.message}`);
        }
      }

      for (const entry of snapshot.world?.generatedObjects || []) {
        try {
          const entity = await this._restoreGeneratedEntity(entry);
          if (entity) generated += 1;
        } catch (error) {
          warnings.push(`${entry.name || entry.saveId}: ${error.message}`);
        }
      }
      this.lastSavedAt = snapshot.savedAt || 0;
      return { restored: true, removed, changed, generated, warnings };
    } finally {
      this.restoring = false;
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    this._unbindWorld = this.worldObjects.onChange(event => this._handleWorldChange(event));
    this._unbindAI = onAIWorldEventsChange(() => this.scheduleSave('ai-world'));
    globalThis.addEventListener?.('pagehide', this._onPageHide);
    if (!this.store.getAuto(this.sceneStyle)) this.scheduleSave('initial');
  }

  dispose() {
    this.flush();
    clearTimeout(this.timer);
    this.timer = null;
    this._unbindWorld?.();
    this._unbindAI?.();
    globalThis.removeEventListener?.('pagehide', this._onPageHide);
    this.started = false;
  }

  scheduleSave(reason = 'world-change') {
    if (!this.started || this.restoring || this.autosaveSuspended) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.saveNow(reason);
    }, this.autosaveDelayMs);
  }

  flush() {
    if (!this.started || this.restoring || this.autosaveSuspended) return null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.saveNow('flush');
  }

  saveNow(reason = 'manual') {
    try {
      const snapshot = this.captureSnapshot();
      const saved = this.store.saveAuto(this.sceneStyle, snapshot);
      this.lastSavedAt = saved.savedAt;
      this.lastError = null;
      this._emitStatus({
        state: 'saved',
        reason,
        savedAt: saved.savedAt,
        message: '当前岛屿已经记住了。',
      });
      return saved;
    } catch (error) {
      this.lastError = error;
      console.warn('[SceneSave] Auto save failed:', error.message);
      this._emitStatus({
        state: 'error',
        reason,
        message: `这次没有记住：${error.message}`,
      });
      return null;
    }
  }

  captureSnapshot({ includeAppearances = false } = {}) {
    const world = this._captureWorldDelta();
    return {
      sceneStyle: this.sceneStyle,
      worldVersion: WORLD_SNAPSHOT_VERSION,
      world,
      aiEvents: getAIWorldEvents(),
      ...(includeAppearances
        ? { appearances: this.appearanceStore?.getAll?.() || {} }
        : {}),
    };
  }

  record(slot) {
    const snapshot = this.captureSnapshot({ includeAppearances: true });
    this.store.saveAuto(this.sceneStyle, snapshot);
    const record = this.store.saveRecord(this.sceneStyle, slot, snapshot);
    this.lastSavedAt = record.savedAt;
    this._emitStatus({
      state: 'recorded',
      slot,
      savedAt: record.savedAt,
      message: `记录 ${slot + 1} 已经收好。`,
    });
    return record;
  }

  resetToRecord(slot) {
    const record = this.store.getRecord(this.sceneStyle, slot);
    if (!record) return null;
    this.autosaveSuspended = true;
    clearTimeout(this.timer);
    this.timer = null;
    this.appearanceStore?.replaceAll?.(record.appearances || {}, { emit: false });
    replaceAIWorldEvents(record.aiEvents || []);
    const restored = this.store.restoreRecord(this.sceneStyle, slot);
    this._emitStatus({
      state: 'reset',
      slot,
      savedAt: restored.savedAt,
      message: `正在回到记录 ${slot + 1}。`,
    });
    return restored;
  }

  getRecords() {
    return this.store.getRecords(this.sceneStyle);
  }

  getSelectedSlot() {
    return this.store.getSelectedSlot(this.sceneStyle);
  }

  setSelectedSlot(slot) {
    return this.store.setSelectedSlot(this.sceneStyle, slot);
  }

  onStatus(listener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  _captureBaseline() {
    const initial = [...this.worldObjects.items];
    initial.forEach((entity, index) => {
      const metadata = this.worldObjects.getMetadata(entity);
      if (!isPersistentMetadata(metadata)) return;
      const saveId = curatedSaveId(entity, metadata, index);
      entity._chiiSaveId = saveId;
      entity._chiiSaveKind = 'curated';
      const snapshot = snapshotEntity(entity, metadata, {
        kind: 'curated',
        baselineAssetId: metadata.assetId || null,
      });
      this.baseline.set(saveId, {
        entity,
        assetId: metadata.assetId || null,
        snapshot,
        comparable: comparableSnapshot(snapshot),
      });
    });
  }

  _captureWorldDelta() {
    const currentById = new Map();
    for (const entity of this.worldObjects.items) {
      const metadata = this.worldObjects.getMetadata(entity);
      if (!isPersistentMetadata(metadata)) continue;
      if (!entity._chiiSaveId) {
        entity._chiiSaveId = generatedSaveId(entity);
        entity._chiiSaveKind = 'generated';
      }
      currentById.set(entity._chiiSaveId, { entity, metadata });
    }

    const removedCurated = [];
    const curatedChanges = [];
    for (const [saveId, baseline] of this.baseline) {
      const current = currentById.get(saveId);
      if (!current) {
        removedCurated.push(saveId);
        continue;
      }
      const snapshot = snapshotEntity(current.entity, current.metadata, {
        kind: 'curated',
        baselineAssetId: baseline.assetId,
      });
      if (comparableSnapshot(snapshot) !== baseline.comparable) curatedChanges.push(snapshot);
      currentById.delete(saveId);
    }

    const generatedObjects = [];
    for (const { entity, metadata } of currentById.values()) {
      if (metadata.persistenceMode === 'temporary') continue;
      generatedObjects.push(snapshotEntity(entity, metadata, { kind: 'generated' }));
    }
    return {
      removedCurated,
      curatedChanges,
      generatedObjects,
    };
  }

  async _restoreCuratedEntity(entity, snapshot) {
    const modelJson = await this._resolveModel(snapshot.modelSource);
    if (snapshot.modelSource && !modelJson) {
      throw new Error(`missing model asset ${snapshot.modelSource.assetId || 'inline'}`);
    }
    if (modelJson) {
      this.replaceEntityModel({
        entity,
        modelJson,
        operation: snapshot.metadata?.operation || 'refine',
        assetId: snapshot.metadata?.assetId || null,
      });
      entity._generatedAssetId = snapshot.metadata?.assetId || null;
    }
    entity.name = snapshot.name || entity.name;
    entity.mesh.name = entity.name;
    entity.tags = [...(snapshot.tags || entity.tags || [])];
    entity.category = snapshot.category || entity.category;
    applyTransform(entity, snapshot.transform);
    applyUserData(entity, snapshot.userData);
    this.worldObjects.updateMetadata(entity, {
      ...(snapshot.metadata || {}),
      ...(modelJson ? { modelJson } : {}),
    });
  }

  async _restoreGeneratedEntity(snapshot) {
    const modelJson = await this._resolveModel(snapshot.modelSource);
    if (!modelJson) throw new Error('generated model asset is unavailable');
    const assetId = await this._resolveRestoredAssetId(snapshot, modelJson);
    const entity = this.createEntity(snapshot, modelJson);
    entity._chiiSaveId = snapshot.saveId || generatedSaveId(entity);
    entity._chiiSaveKind = 'generated';
    entity._generatedAssetId = assetId;
    applyTransform(entity, snapshot.transform);
    applyUserData(entity, snapshot.userData);
    this.scene.add(entity.mesh);
    this.worldObjects.add(entity, {
      ...(snapshot.metadata || {}),
      assetId,
      modelJson,
    });
    return entity;
  }

  async _resolveRestoredAssetId(snapshot, modelJson) {
    const assetId = snapshot.metadata?.assetId || snapshot.modelSource?.assetId || null;
    if (assetId) return assetId;
    if (snapshot.modelSource?.type !== 'inline') {
      throw new Error('generated model asset identity is unavailable');
    }
    if (typeof this.generatedAssetRepository.saveModel !== 'function') {
      throw new Error('legacy inline model cannot be migrated to the asset repository');
    }
    const saved = await this.generatedAssetRepository.saveModel({
      name: snapshot.name || snapshot.id || 'Migrated scene object',
      description: 'Migrated from a legacy Chii scene save',
      modelJson,
      tags: [...(snapshot.tags || []), 'scene-save-migration'],
    });
    if (!saved?.assetId) throw new Error('legacy inline model migration returned no assetId');
    return saved.assetId;
  }

  async _resolveModel(source) {
    if (!source) return null;
    if (source.type === 'inline') return jsonClone(source.modelJson);
    if (source.type !== 'asset' || !source.assetId) return null;
    const asset = await this.generatedAssetRepository.get(source.assetId);
    return asset?.modelJson || null;
  }

  _handleWorldChange(event) {
    if (this.restoring) return;
    const metadata = event.metadata || this.worldObjects.getMetadata(event.entity);
    if (!isPersistentMetadata(metadata)) return;
    if (metadata.persistenceMode === 'temporary') return;
    if (event.type === 'added' && !event.entity._chiiSaveId) {
      event.entity._chiiSaveId = generatedSaveId(event.entity);
      event.entity._chiiSaveKind = 'generated';
    }
    this.scheduleSave(event.type);
  }

  _emitStatus(status) {
    for (const listener of this.statusListeners) listener(status);
  }
}

export {
  AUTOSAVE_DELAY_MS as CHII_SCENE_AUTOSAVE_DELAY_MS,
  NON_PERSISTENT_SOURCES as CHII_NON_PERSISTENT_PLACEMENT_SOURCES,
  WORLD_SNAPSHOT_VERSION as CHII_WORLD_SNAPSHOT_VERSION,
  snapshotEntity as createChiiEntitySnapshot,
};
