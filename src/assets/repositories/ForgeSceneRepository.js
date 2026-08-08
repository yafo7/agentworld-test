import * as THREE from 'three';
import { normalizeMap, normalizeRenderScheme } from 'worldforge-studio/map-core';
import { ForgeScenePort } from '../../ports/ForgeScenePort.js';

export const CHII_FORGE_SCENE_SCHEMA_VERSION = 1;
export const CHII_FORGE_BINDINGS_SCHEMA_VERSION = 1;

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
  if (manifest?.schemaVersion !== CHII_FORGE_SCENE_SCHEMA_VERSION || manifest?.kind !== 'chii-forge-scene') {
    throw new Error('Unsupported Forge scene manifest');
  }
  if (manifest.sceneId !== sceneId) throw new Error(`Forge scene id mismatch: ${manifest.sceneId}`);
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
  if (value?.schemaVersion !== CHII_FORGE_BINDINGS_SCHEMA_VERSION) {
    throw new Error('Unsupported Forge gameplay bindings');
  }
  return Object.freeze({
    ...value,
    objects: Object.freeze({ ...(value.objects || {}) }),
    zones: Object.freeze({ ...(value.zones || {}) }),
    spawns: Object.freeze({ ...(value.spawns || {}) }),
  });
}

export class ForgeSceneRepository extends ForgeScenePort {
  constructor({
    root = '/generated/scenes/forge/worldforge',
    fetcher = globalThis.fetch?.bind(globalThis),
  } = {}) {
    super();
    this.root = root;
    this.fetcher = fetcher;
    this.cache = new Map();
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
    const manifest = validateManifest(await this._json('manifest.json'), sceneId);
    const [map, renderScheme, bindings] = await Promise.all([
      this._verifiedJson(manifest, 'map'),
      this._verifiedJson(manifest, 'renderScheme'),
      this._verifiedJson(manifest, 'bindings'),
    ]);
    return Object.freeze({
      manifest: Object.freeze(manifest),
      map: normalizeMap(map),
      renderScheme: normalizeRenderScheme(renderScheme),
      bindings: validateBindings(bindings),
      hdriUrl: manifest.files.hdri ? joinUrl(this.root, manifest.files.hdri) : null,
    });
  }

  async _verifiedJson(manifest, key) {
    const file = manifest.files[key];
    const response = await this._fetch(file);
    const bytes = await response.arrayBuffer();
    const actual = await sha256Hex(bytes);
    if (actual !== manifest.hashes[key]) throw new Error(`Forge scene integrity failed: ${key}`);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async _json(file) {
    return (await this._fetch(file)).json();
  }

  async _fetch(file) {
    const response = await this.fetcher(joinUrl(this.root, assertSafeRelativeFile(file, 'file')));
    if (!response?.ok) throw new Error(`Forge scene file unavailable: ${file}`);
    return response;
  }
}
