// ═══════════════════════════════════════════════════════════
// Model + Animation loader.
// Loads cached modelJson and animation plans from public/generated/.
// Falls back to placeholder geometry if cache is missing.
// ═══════════════════════════════════════════════════════════

import * as THREE from 'three';

/** @type {object|null} — Voxel runtime, set by initRuntime() */
let voxelRuntime = null;

/** @type {Promise<object>|null} — pending runtime init promise */
let runtimePromise = null;

/**
 * Initialize the Voxel Studio runtime module.
 * Returns a Promise that resolves when runtime is ready.
 * Safe to call multiple times — returns the same promise.
 * Requires window.THREE to be set.
 */
export function initRuntime() {
  if (voxelRuntime) return Promise.resolve(voxelRuntime);
  if (runtimePromise) return runtimePromise;

  // Template literal prevents Vite from statically analyzing this import.
  // The path is proxied through Vite's dev server → voxel-studio-backend.zeabur.app.
  runtimePromise = (async () => {
    const mod = await import(`${'/api/voxel'}/api/templates/module.js`);
    voxelRuntime = mod.voxelStudioRuntime;
    console.log('[Runtime] Voxel Studio runtime loaded');
    return voxelRuntime;
  })();

  return runtimePromise;
}

/**
 * Get the runtime reference (must call initRuntime first).
 */
export function getRuntime() {
  return voxelRuntime;
}

// ===================================================================
// Model loading
// ===================================================================

/**
 * Load a cached modelJson and build a Three.js Group from it.
 * Falls back to a placeholder mesh if cache is missing or runtime unavailable.
 *
 * @param {string} modelPath — path relative to /public/ (e.g. "generated/models/forest.json")
 * @param {THREE.Mesh} [fallbackMesh] — placeholder to use if model fails to load
 * @returns {Promise<THREE.Group|THREE.Mesh>}
 */
export async function loadModel(modelPath, fallbackMesh = null) {
  // Wait for runtime if it's still loading
  if (!voxelRuntime) {
    try {
      await initRuntime();
    } catch (err) {
      console.warn('[ModelLoader] Runtime failed to load, using fallback:', err.message);
      return fallbackMesh;
    }
  }

  try {
    const resp = await fetch(`/${modelPath}`);
    if (!resp.ok) {
      console.warn(`[ModelLoader] ${modelPath} not found (${resp.status}), using fallback`);
      return fallbackMesh;
    }

    const modelJson = await resp.json();
    return buildModelFromJson(modelJson);
  } catch (err) {
    console.warn(`[ModelLoader] Failed to load ${modelPath}:`, err.message);
    return fallbackMesh;
  }
}

/**
 * Build a Three.js Group from a modelJson object using the Voxel runtime.
 */
export function buildModelFromJson(modelJson) {
  if (!voxelRuntime) throw new Error('Runtime not initialized');

  const meshes = {};     // id → THREE.Object3D
  const worldPos = {};   // id → original world position (before hierarchy)

  // First pass: create groups and meshes at their world positions
  for (const m of modelJson.meshes) {
    const pos = new THREE.Vector3(m.position?.x ?? 0, m.position?.y ?? 0, m.position?.z ?? 0);
    worldPos[m.id] = pos.clone();

    if (m.group) {
      const g = new THREE.Group();
      g.position.copy(pos);
      g.name = m.id;
      meshes[m.id] = g;
    } else {
      const geo = voxelRuntime.buildGeometry(m.type, m.geometry || {});
      const mat = new THREE.MeshStandardMaterial({
        color: m.color ?? 0x888888,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.name = m.id;
      meshes[m.id] = mesh;
    }
  }

  // Second pass: build hierarchy — convert world positions to parent-relative
  const root = new THREE.Group();
  root.name = modelJson.name || 'Model';

  for (const m of modelJson.meshes) {
    const obj = meshes[m.id];
    if (!m.parent) {
      root.add(obj);
    } else if (meshes[m.parent]) {
      // Subtract parent's ORIGINAL world position to get relative position
      obj.position.sub(worldPos[m.parent]);
      meshes[m.parent].add(obj);
    }
  }

  return root;
}

// ===================================================================
// Animation loading
// ===================================================================

/**
 * Load a cached animation plan.
 *
 * @param {string} animPath — path relative to /public/
 * @returns {Promise<object|null>} motion plan, or null if missing
 */
export async function loadAnimationPlan(animPath) {
  try {
    const resp = await fetch(`/${animPath}`);
    if (!resp.ok) {
      console.warn(`[ModelLoader] Animation ${animPath} not found (${resp.status})`);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.warn(`[ModelLoader] Failed to load animation ${animPath}:`, err.message);
    return null;
  }
}

/**
 * Evaluate a motion plan at time t and apply deltas to a model group.
 * Call every frame.
 *
 * @param {object} plan     — motion plan from animation API
 * @param {number} duration — animation duration in seconds
 * @param {THREE.Group} model — the root group of the model
 * @param {number} t        — current time in seconds (looped within duration)
 * @param {Map<string, THREE.Object3D>} [partMap] — optional name→object cache
 */
export function applyAnimation(plan, duration, model, t, partMap = null) {
  if (!voxelRuntime || !plan) return; // runtime not ready yet or no plan

  const pose = voxelRuntime.evaluateMotion(plan, duration, model, t);

  // Build part map lazily (case-insensitive key lookup)
  if (!partMap) {
    partMap = new Map();
    model.traverse((obj) => {
      if (obj.name) partMap.set(obj.name.toLowerCase(), obj);
    });
  }

  for (const [partId, delta] of Object.entries(pose)) {
    if (partId.startsWith('_')) continue;
    const obj = partMap.get(partId.toLowerCase());
    if (!obj) continue;

    if (delta.position) {
      obj.position.set(delta.position[0], delta.position[1], delta.position[2]);
    }
    if (delta.rotation) {
      obj.rotation.set(delta.rotation[0], delta.rotation[1], delta.rotation[2]);
    }
    if (delta.scale) {
      obj.scale.set(delta.scale[0], delta.scale[1], delta.scale[2]);
    }
  }
}
