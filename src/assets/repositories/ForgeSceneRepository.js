import * as THREE from 'three';
import { normalizeMap, normalizeRenderScheme } from 'worldforge-studio/map-core';
import { ForgeScenePort } from '../../ports/ForgeScenePort.js';

export const CHII_FORGE_SCENE_SCHEMA_VERSION = 1;
export const CHII_FORGE_BINDINGS_SCHEMA_VERSION = 1;
export const CHII_FORGE_WORLD_SCHEMA_VERSION = 2;
export const CHII_FORGE_WORLD_BINDINGS_SCHEMA_VERSION = 2;
export const CHII_WORLD_CATALOG_SCHEMA_VERSION = 1;

function joinUrl(root, file) {
  return `${String(root || '').replace(/\/$/, '')}/${String(file || '').replace(/^\//, '')}`;
}

function assertSafeRelativeFile(value, label) {
  const file = String(value || '').replaceAll('\\', '/');
  if (!file || file.startsWith('/') || file.includes('..')) {
    throw new Error(`Invalid Forge scene ${label}`);
  }
  return file;
}

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function validateManifest(manifest, sceneId) {
  const legacy = manifest?.schemaVersion === CHII_FORGE_SCENE_SCHEMA_VERSION && manifest?.kind === 'chii-forge-scene';
  const world = manifest?.schemaVersion === CHII_FORGE_WORLD_SCHEMA_VERSION && manifest?.kind === 'chii-worldforge-world';
  if (!legacy && !world) {
    throw new Error('Unsupported Forge scene manifest');
  }
  const manifestId = legacy ? manifest.sceneId : manifest.worldId;
  if (manifestId !== sceneId) throw new Error(`Forge scene id mismatch: ${manifestId}`);
  if (String(manifest.runtime?.threeRevision) !== THREE.REVISION) {
    throw new Error(`Forge scene requires Three r${manifest.runtime?.threeRevision}, current r${THREE.REVISION}`);
  }
  for (const key of ['map', 'renderScheme', 'bindings']) {
    assertSafeRelativeFile(manifest.files?.[key], key);
    if (!/^[a-f0-9]{64}$/.test(manifest.hashes?.[key] || '')) {
      throw new Error(`Forge scene ${key} hash is missing`);
    }
  }
  if (manifest.files?.hdri) assertSafeRelativeFile(manifest.files.hdri, 'hdri');
  return manifest;
}

function validateBindings(value) {
  if (![CHII_FORGE_BINDINGS_SCHEMA_VERSION, CHII_FORGE_WORLD_BINDINGS_SCHEMA_VERSION].includes(value?.schemaVersion)) {
    throw new Error('Unsupported Forge gameplay bindings');
  }
  return Object.freeze({
    ...value,
    objects: Object.freeze({ ...(value.objects || {}) }),
    zones: Object.freeze({ ...(value.zones || {}) }),
    spawns: Object.freeze({ ...(value.spawns || {}) }),
  });
}

function validateCatalog(value) {
  if (value?.schemaVersion !== CHII_WORLD_CATALOG_SCHEMA_VERSION || value?.kind !== 'chii-world-catalog') {
    throw new Error('Unsupported Forge world catalog');
  }
  const ids = new Set();
  const worlds = (value.worlds || []).map(entry => {
    if (!entry?.id || ids.has(entry.id)) throw new Error(`Invalid or duplicate Forge world id: ${entry?.id}`);
    ids.add(entry.id);
    assertSafeRelativeFile(entry.packageRoot, `${entry.id} packageRoot`);
    return Object.freeze({ ...entry });
  });
  return Object.freeze({ ...value, worlds: Object.freeze(worlds) });
}

export class ForgeSceneRepository extends ForgeScenePort {
  constructor({
    root = '/generated/scenes/forge/worldforge',
    catalogRoot = '/generated/worlds/worldforge',
    fetcher = globalThis.fetch?.bind(globalThis),
  } = {}) {
    super();
    this.root = root;
    this.catalogRoot = catalogRoot;
    this.fetcher = fetcher;
    this.cache = new Map();
    this.catalogPromise = null;
  }

  async list() {
    if (!this.catalogPromise) {
      this.catalogPromise = this._jsonAt(this.catalogRoot, 'catalog.json')
        .then(validateCatalog)
        .catch(error => {
          this.catalogPromise = null;
          throw error;
        });
    }
    return (await this.catalogPromise).worlds;
  }

  async load(sceneId = 'chii-island-forge-v1') {
    if (this.cache.has(sceneId)) return this.cache.get(sceneId);
    const pending = this._load(sceneId).catch(error => {
      this.cache.delete(sceneId);
      throw error;
    });
    this.cache.set(sceneId, pending);
    return pending;
  }

  async _load(sceneId) {
    let packageRoot = this.root;
    if (sceneId !== 'chii-island-forge-v1') {
      const descriptor = (await this.list()).find(entry => entry.id === sceneId);
      if (!descriptor) throw new Error(`Unknown Forge world: ${sceneId}`);
      packageRoot = joinUrl(this.catalogRoot, descriptor.packageRoot);
    }
    const manifest = validateManifest(await this._jsonAt(packageRoot, 'manifest.json'), sceneId);
    const [map, renderScheme, bindings] = await Promise.all([
      this._verifiedJson(packageRoot, manifest, 'map'),
      this._verifiedJson(packageRoot, manifest, 'renderScheme'),
      this._verifiedJson(packageRoot, manifest, 'bindings'),
    ]);
    return Object.freeze({
      manifest: Object.freeze(manifest),
      map: normalizeMap(map),
      renderScheme: normalizeRenderScheme(renderScheme),
      bindings: validateBindings(bindings),
      descriptor: sceneId === 'chii-island-forge-v1'
        ? null
        : (await this.list()).find(entry => entry.id === sceneId),
      hdriUrl: manifest.files.hdri ? joinUrl(packageRoot, manifest.files.hdri) : null,
    });
  }

  async _verifiedJson(root, manifest, key) {
    const file = manifest.files[key];
    const response = await this._fetchAt(root, file);
    const bytes = await response.arrayBuffer();
    const actual = await sha256Hex(bytes);
    if (actual !== manifest.hashes[key]) throw new Error(`Forge scene integrity failed: ${key}`);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async _json(file) {
    return this._jsonAt(this.root, file);
  }

  async _jsonAt(root, file) {
    return (await this._fetchAt(root, file)).json();
  }

  async _fetch(file) {
    return this._fetchAt(this.root, file);
  }

  async _fetchAt(root, file) {
    const response = await this.fetcher(joinUrl(root, assertSafeRelativeFile(file, 'file')));
    if (!response?.ok) throw new Error(`Forge scene file unavailable: ${file}`);
    return response;
  }
}
