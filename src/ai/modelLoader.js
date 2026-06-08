// ═══════════════════════════════════════════════════════════
// Model + Animation loader.
// Loads cached modelJson and animation plans from public/generated/.
// Falls back to placeholder geometry if cache is missing.
// ═══════════════════════════════════════════════════════════

import * as THREE from 'three';

/** @type {object|null} — Voxel runtime, set by initRuntime() */
let voxelRuntime = null;

/**
 * Initialize the Voxel Studio runtime module.
 * Must be called once before any model loading.
 * Requires window.THREE to be set.
 */
export async function initRuntime() {
  if (voxelRuntime) return voxelRuntime;

  const mod = await import('https://voxel-studio-backend.zeabur.app/api/templates/module.js');
  voxelRuntime = mod.voxelStudioRuntime;
  console.log('[Runtime] Voxel Studio runtime loaded');
  return voxelRuntime;
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
  if (!voxelRuntime) {
    console.warn('[ModelLoader] Runtime not initialized, using fallback');
    return fallbackMesh;
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

  const meshes = {}; // id → THREE.Object3D

  // First pass: create groups and meshes
  for (const m of modelJson.meshes) {
    if (m.group) {
      const g = new THREE.Group();
      g.position.set(m.position?.x ?? 0, m.position?.y ?? 0, m.position?.z ?? 0);
      g.name = m.name || m.id;
      meshes[m.id] = g;
    } else {
      const geo = voxelRuntime.buildGeometry(m.type, m.geometry || {});
      const mat = new THREE.MeshStandardMaterial({
        color: m.color ?? 0x888888,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(m.position?.x ?? 0, m.position?.y ?? 0, m.position?.z ?? 0);
      mesh.name = m.name || m.id;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshes[m.id] = mesh;
    }
  }

  // Second pass: build hierarchy
  const root = new THREE.Group();
  root.name = modelJson.name || 'Model';

  for (const m of modelJson.meshes) {
    if (!m.parent) {
      root.add(meshes[m.id]);
    } else if (meshes[m.parent]) {
      meshes[m.parent].add(meshes[m.id]);
    }
  }

  // Center the model
  if (!modelJson._skipAutoCenter) {
    const box = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box.getCenter(center);
    // Only center horizontally, keep feet on ground
    root.position.set(-center.x, -box.min.y, -center.z);
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
  if (!voxelRuntime || !plan) return;

  const pose = voxelRuntime.evaluateMotion(plan, duration, model, t);

  // Build part map lazily
  if (!partMap) {
    partMap = new Map();
    model.traverse((obj) => {
      if (obj.name) partMap.set(obj.name, obj);
    });
  }

  for (const [partId, delta] of Object.entries(pose)) {
    if (partId.startsWith('_')) continue;
    const obj = partMap.get(partId);
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
