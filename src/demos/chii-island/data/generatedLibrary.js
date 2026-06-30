// Generated asset library for Chii Island.
// Keeps AI-generated/refined voxel models and their animations so they can be
// re-selected later from the right-side model editor.
//
// Animation library is keyed by model: each generated model entry can hold
// multiple animations (idle / interaction). The editor can preview, switch,
// and apply any stored animation to the entity.
//
// Persistence strategy:
// 1. Try to save to the local Vite dev server, which writes files into
//    public/generated/models/ and public/generated/animations/ — exactly where
//    the other local models live.
// 2. If the dev endpoint is unavailable (e.g. static build), fall back to
//    localStorage so the feature still works in the current browser session.

import { assetCache } from '../../../storage/assetCache.js';

const LS_META_KEY = 'chii_generated_assets_meta';
const LS_MODEL_PREFIX = 'chii_generated_model_';
const LS_ANIM_PREFIX = 'chii_generated_anim_';

const API_BASE = '/api/local-library';

/** Generate a stable display name from description or model name. */
function makeDisplayName(description, modelJson) {
  const fromModel = modelJson?.name;
  if (fromModel && typeof fromModel === 'string' && fromModel.trim()) {
    return fromModel.trim();
  }
  if (description && typeof description === 'string') {
    const short = description.trim().slice(0, 30);
    return short || '生成模型';
  }
  return '生成模型';
}

/** Create a filesystem-safe id. */
function generateId(prefix = 'gen') {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${ts}_${rand}`;
}

/** Simple slug for filenames derived from an id. */
function safeFilename(id) {
  return id.replace(/[^a-z0-9_\-]/gi, '_');
}

function readLocalMeta() {
  try {
    const raw = localStorage.getItem(LS_META_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalMeta(meta) {
  try {
    localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
  } catch (err) {
    console.warn('[GeneratedLibrary] Failed to write local meta:', err.message);
  }
}

function readLocalModel(id) {
  try {
    const raw = localStorage.getItem(`${LS_MODEL_PREFIX}${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalModel(id, modelJson) {
  try {
    localStorage.setItem(`${LS_MODEL_PREFIX}${id}`, JSON.stringify(modelJson));
  } catch (err) {
    console.warn('[GeneratedLibrary] Failed to write local model:', err.message);
  }
}

function readLocalAnim(id) {
  try {
    const raw = localStorage.getItem(`${LS_ANIM_PREFIX}${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalAnim(id, plan) {
  try {
    localStorage.setItem(`${LS_ANIM_PREFIX}${id}`, JSON.stringify(plan));
  } catch (err) {
    console.warn('[GeneratedLibrary] Failed to write local anim:', err.message);
  }
}

function deleteLocalModel(id) {
  try {
    localStorage.removeItem(`${LS_MODEL_PREFIX}${id}`);
  } catch {}
}

function deleteLocalAnim(id) {
  try {
    localStorage.removeItem(`${LS_ANIM_PREFIX}${id}`);
  } catch {}
}

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }
  return resp.json().catch(() => ({}));
}

/**
 * Migrate legacy single-animation manifest entries to the new animations array.
 * Old format: entry.animId + entry.animPath
 * New format: entry.animations = [{ animId, name, type, path }]
 */
function migrateEntryAnimations(entry) {
  if (!entry) return entry;
  if (!Array.isArray(entry.animations)) {
    entry.animations = [];
  }
  if (entry.animId && entry.animPath) {
    const exists = entry.animations.some((a) => a.animId === entry.animId);
    if (!exists) {
      entry.animations.unshift({
        animId: entry.animId,
        name: entry.animName || '生成动画',
        type: entry.animType || 'idle',
        path: entry.animPath,
      });
    }
  }
  return entry;
}

/**
 * Load the list of generated assets.
 * First tries the dev server (so files written to public/generated/ survive
 * cache clears), then falls back to localStorage.
 * @returns {Promise<Array>}
 */
export async function loadGeneratedAssets() {
  let serverAssets = [];
  try {
    const resp = await fetch(`${API_BASE}/list`);
    if (resp.ok) {
      serverAssets = await resp.json();
    }
  } catch (err) {
    console.warn('[GeneratedLibrary] Server list unavailable, using localStorage:', err.message);
  }

  const localMeta = readLocalMeta();

  // If the server returned entries, trust it as the canonical list; but keep
  // any local-only entries the server doesn't know about yet.
  const byId = new Map();
  for (const asset of serverAssets) {
    migrateEntryAnimations(asset);
    byId.set(asset.assetId, asset);
  }
  for (const asset of localMeta) {
    migrateEntryAnimations(asset);
    if (!byId.has(asset.assetId)) {
      byId.set(asset.assetId, asset);
    }
  }

  return Array.from(byId.values()).map((asset) => ({
    ...asset,
    source: 'generated',
    assetType: 'voxel',
    displayName: asset.name || asset.assetId,
  }));
}

/**
 * Save a generated/refined voxel model to the generated library.
 *
 * @param {Object} opts
 * @param {string} opts.name — display name (e.g. entity name)
 * @param {string} opts.description — user description used for generation/refinement
 * @param {Object} opts.modelJson — v2 model JSON
 * @param {string[]} [opts.tags=[]]
 * @returns {Promise<{assetId: string}>}
 */
export async function saveGeneratedModel({ name, description, modelJson, tags = [] }) {
  const assetId = generateId('gen');
  const displayName = makeDisplayName(description, modelJson);
  const safeId = safeFilename(assetId);

  const modelToStore = {
    ...modelJson,
    name: displayName,
  };

  // 1. Try server first
  let serverOk = false;
  try {
    await postJson(`${API_BASE}/save-model`, {
      id: safeId,
      name: displayName,
      description,
      modelJson: modelToStore,
    });
    serverOk = true;
  } catch (err) {
    console.warn('[GeneratedLibrary] Server save failed, using localStorage:', err.message);
  }

  // 2. Always mirror in localStorage and assetCache for immediate use
  writeLocalModel(assetId, modelToStore);
  assetCache.set(`generated/models/${safeId}.json`, modelToStore);

  const meta = readLocalMeta();
  meta.unshift({
    assetId,
    name: displayName,
    description,
    category: 'decor',
    tags: tags.length ? tags : (modelToStore.tags || []),
    hasIdleAnimation: false,
    animations: [],
    path: `generated/models/${safeId}.json`,
    createdAt: Date.now(),
  });
  writeLocalMeta(meta);

  console.log(
    serverOk
      ? `[GeneratedLibrary] Saved model "${displayName}" to library (${safeId})`
      : `[GeneratedLibrary] Saved model "${displayName}" to localStorage (${safeId})`
  );

  return { assetId };
}

/**
 * Save an animation plan for a specific model. The animation is appended to the
 * model's animation library.
 *
 * @param {Object} opts
 * @param {string} opts.modelId — assetId returned by saveGeneratedModel
 * @param {string} [opts.name]
 * @param {Object} opts.plan — motion plan JSON
 * @param {string} [opts.type='interaction'] — 'idle' | 'interaction'
 * @returns {Promise<{animId: string, path: string}>}
 */
export async function saveAnimationForModel({ modelId, name, plan, type = 'interaction' }) {
  if (!modelId || !plan) return { animId: null, path: null };

  const animId = generateId('anim');
  const safeAnimId = safeFilename(animId);
  const safeModelId = safeFilename(modelId);

  const planToStore = {
    ...plan,
    _duration: plan._duration ?? 2.5,
    _loop: plan._loop ?? true,
    _name: name || '生成动画',
    _type: type,
    _modelId: safeModelId,
  };

  let serverOk = false;
  try {
    await postJson(`${API_BASE}/save-animation`, {
      id: safeAnimId,
      modelId: safeModelId,
      name: name || '生成动画',
      type,
      plan: planToStore,
    });
    serverOk = true;
  } catch (err) {
    console.warn('[GeneratedLibrary] Server anim save failed, using localStorage:', err.message);
  }

  writeLocalAnim(animId, planToStore);
  assetCache.set(`generated/animations/${safeAnimId}.json`, planToStore);

  const path = `generated/animations/${safeAnimId}.json`;

  // Link animation to model metadata
  let meta = readLocalMeta();
  let entry = meta.find((m) => m.assetId === modelId);

  // If local meta lost the model entry, try to recover from server manifest
  if (!entry) {
    try {
      const resp = await fetch(`${API_BASE}/list`);
      if (resp.ok) {
        const serverMeta = await resp.json();
        const serverEntry = serverMeta.find((m) => m.assetId === modelId);
        if (serverEntry) {
          meta.unshift(serverEntry);
          entry = serverEntry;
        }
      }
    } catch (err) {
      console.warn('[GeneratedLibrary] Failed to recover server manifest for animation link:', err.message);
    }
  }

  if (entry) {
    migrateEntryAnimations(entry);
    entry.animations = entry.animations.filter((a) => a.animId !== animId);
    entry.animations.unshift({
      animId,
      name: name || '生成动画',
      type,
      path,
    });
    entry.hasIdleAnimation = entry.animations.some((a) => a.type === 'idle');
    writeLocalMeta(meta);
  } else {
    console.warn(`[GeneratedLibrary] Could not link animation ${animId}: model ${modelId} not found in library`);
  }

  console.log(
    serverOk
      ? `[GeneratedLibrary] Saved ${type} animation for "${modelId}" (${safeAnimId})`
      : `[GeneratedLibrary] Saved ${type} animation to localStorage for "${modelId}" (${safeAnimId})`
  );

  return { animId, path };
}

/**
 * Legacy alias: save a generated animation paired with a generated model.
 * Defaults to type='idle' for backward compatibility.
 */
export async function saveGeneratedAnimation({ modelId, name, plan }) {
  return saveAnimationForModel({ modelId, name, plan, type: 'idle' });
}

/**
 * List animation metadata for a model.
 *
 * @param {string} modelId
 * @returns {Array<{animId: string, name: string, type: string, path: string}>}
 */
export function listAnimationsForModel(modelId) {
  const meta = readLocalMeta();
  const entry = meta.find((m) => m.assetId === modelId);
  if (!entry) return [];
  migrateEntryAnimations(entry);
  return entry.animations.map((a) => ({ ...a }));
}

/**
 * Retrieve a single animation plan by model + animId.
 *
 * @param {string} modelId
 * @param {string} animId
 * @returns {Promise<Object|null>}
 */
export async function getAnimationPlan(modelId, animId) {
  if (!modelId || !animId) return null;

  // 1. Try localStorage first
  let plan = readLocalAnim(animId);

  // 2. Find path from manifest and fetch server file
  if (!plan) {
    const meta = readLocalMeta();
    const entry = meta.find((m) => m.assetId === modelId);
    if (entry) {
      migrateEntryAnimations(entry);
      const animMeta = entry.animations.find((a) => a.animId === animId);
      if (animMeta?.path) {
        try {
          const resp = await fetch(`/${animMeta.path}`);
          if (resp.ok) {
            plan = await resp.json();
            assetCache.set(animMeta.path, plan);
          }
        } catch (err) {
          console.warn('[GeneratedLibrary] Failed to fetch anim file:', err.message);
        }
      }
    }
  }

  return plan;
}

/**
 * Retrieve a generated asset's model JSON and all paired animation plans.
 *
 * @param {string} assetId
 * @returns {Promise<{modelJson: Object|null, animPlan: Object|null, animations: Array}>}
 */
export async function getGeneratedAsset(assetId) {
  let meta = readLocalMeta();
  let entry = meta.find((m) => m.assetId === assetId);

  // Fall back to server manifest if local meta lost this entry
  if (!entry) {
    try {
      const resp = await fetch(`${API_BASE}/list`);
      if (resp.ok) {
        const serverMeta = await resp.json();
        entry = serverMeta.find((m) => m.assetId === assetId);
        if (entry) {
          meta.unshift(entry);
          writeLocalMeta(meta);
        }
      }
    } catch (err) {
      console.warn('[GeneratedLibrary] Failed to fetch server manifest for asset:', err.message);
    }
  }

  migrateEntryAnimations(entry);

  // 1. Try localStorage first (fastest and works without server)
  let modelJson = readLocalModel(assetId);
  const animations = [];
  if (entry?.animations?.length) {
    for (const anim of entry.animations) {
      const plan = readLocalAnim(anim.animId);
      if (plan) animations.push({ ...anim, plan });
    }
  }

  // 2. Fall back to fetching the server-written file
  if (!modelJson && entry?.path) {
    try {
      const resp = await fetch(`/${entry.path}`);
      if (resp.ok) {
        modelJson = await resp.json();
        assetCache.set(entry.path, modelJson);
      }
    } catch (err) {
      console.warn('[GeneratedLibrary] Failed to fetch model file:', err.message);
    }
  }

  // 3. Fall back to fetching any missing animation files
  if (entry?.animations?.length) {
    for (const anim of entry.animations) {
      if (animations.some((a) => a.animId === anim.animId)) continue;
      try {
        const resp = await fetch(`/${anim.path}`);
        if (resp.ok) {
          const plan = await resp.json();
          assetCache.set(anim.path, plan);
          animations.push({ ...anim, plan });
        }
      } catch (err) {
        console.warn('[GeneratedLibrary] Failed to fetch anim file:', err.message);
      }
    }
  }

  // Backward-compat: also return the first animation as animPlan
  const animPlan = animations.length > 0 ? animations[0].plan : null;

  return { modelJson, animPlan, animations };
}

/**
 * Delete a generated asset from localStorage (and request deletion from server
 * if a delete endpoint is added later). Does not delete files from disk because
 * the dev server currently has no delete endpoint.
 *
 * @param {string} assetId
 */
export function deleteGeneratedAsset(assetId) {
  const meta = readLocalMeta();
  const entry = meta.find((m) => m.assetId === assetId);
  if (entry) {
    migrateEntryAnimations(entry);
    for (const anim of entry.animations) {
      deleteLocalAnim(anim.animId);
    }
  }
  deleteLocalModel(assetId);
  writeLocalMeta(meta.filter((m) => m.assetId !== assetId));
}

/**
 * Delete a single animation from a model's animation library.
 *
 * @param {string} modelId
 * @param {string} animId
 */
export function deleteAnimation(modelId, animId) {
  const meta = readLocalMeta();
  const entry = meta.find((m) => m.assetId === modelId);
  if (!entry) return;
  migrateEntryAnimations(entry);
  entry.animations = entry.animations.filter((a) => a.animId !== animId);
  entry.hasIdleAnimation = entry.animations.some((a) => a.type === 'idle');
  writeLocalMeta(meta);
  deleteLocalAnim(animId);
  console.log(`[GeneratedLibrary] Deleted animation ${animId} from ${modelId}`);
}
