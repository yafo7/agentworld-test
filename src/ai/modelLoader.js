// ═══════════════════════════════════════════════════════════
// Model + Animation loader.
// Loads cached modelJson and animation plans from public/generated/.
// Builds Three.js scene using Voxel runtime (matching API reference).
// ═══════════════════════════════════════════════════════════

import * as THREE from 'three';

/** @type {object|null} — Voxel runtime */
let voxelRuntime = null;
let runtimePromise = null;

export function initRuntime() {
  if (voxelRuntime) return Promise.resolve(voxelRuntime);
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const mod = await import(`${'/api/voxel'}/api/templates/module.js`);
    voxelRuntime = mod.voxelStudioRuntime;
    console.log('[Runtime] Voxel Studio runtime loaded');
    return voxelRuntime;
  })();

  return runtimePromise;
}

export function getRuntime() { return voxelRuntime; }

// ===================================================================
// Model loading — matches API reference buildScene() pattern
// ===================================================================

export async function loadModel(modelPath, fallbackMesh = null) {
  if (!voxelRuntime) {
    try { await initRuntime(); }
    catch (err) { console.warn('[ModelLoader] Runtime failed:', err.message); return fallbackMesh; }
  }

  try {
    const resp = await fetch(`/${modelPath}`);
    if (!resp.ok) {
      console.warn(`[ModelLoader] ${modelPath} not found (${resp.status})`);
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
 * Build a Three.js Group from modelJson — follows API reference exactly.
 * modelJson positions are parent-relative; no coordinate conversion needed.
 */
export function buildModelFromJson(modelJson) {
  if (!voxelRuntime) throw new Error('Runtime not initialized');

  const meshes = {}; // id → THREE.Object3D

  // First pass: create all objects at their (already relative) positions
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
      meshes[m.id] = mesh;
    }
  }

  // Second pass: build hierarchy (positions are parent-relative, no conversion)
  const root = new THREE.Group();
  root.name = modelJson.name || 'Model';

  for (const m of modelJson.meshes) {
    if (!m.parent) root.add(meshes[m.id]);
    else if (meshes[m.parent]) meshes[m.parent].add(meshes[m.id]);
  }

  return root;
}

// ===================================================================
// Animation — stores base poses, applies deltas as increments
// ===================================================================

export async function loadAnimationPlan(animPath) {
  try {
    const resp = await fetch(`/${animPath}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    console.warn(`[ModelLoader] Animation ${animPath} failed:`, err.message);
    return null;
  }
}

/**
 * Evaluate a motion plan at time t and apply pose deltas.
 * Deltas are ADDED to the stored base pose (following API spec "叠加到初始姿态").
 */
export function applyAnimation(plan, duration, model, t, basePoseMap = null) {
  if (!voxelRuntime || !plan) return basePoseMap;

  const pose = voxelRuntime.evaluateMotion(plan, duration, model, t);

  // Build base pose map lazily on first call
  if (!basePoseMap) {
    basePoseMap = new Map();
    model.traverse((obj) => {
      if (obj.name) {
        basePoseMap.set(obj.name, {
          position: obj.position.clone(),
          rotation: obj.rotation.clone(),
          scale: obj.scale.clone(),
        });
      }
    });
  }

  for (const [partId, delta] of Object.entries(pose)) {
    if (partId.startsWith('_')) continue;

    const obj = model.getObjectByName(partId);
    if (!obj) continue;

    const base = basePoseMap.get(partId);
    if (!base) continue;

    if (delta.position) {
      obj.position.set(
        base.position.x + delta.position[0],
        base.position.y + delta.position[1],
        base.position.z + delta.position[2]
      );
    }
    if (delta.rotation) {
      obj.rotation.set(
        base.rotation.x + delta.rotation[0],
        base.rotation.y + delta.rotation[1],
        base.rotation.z + delta.rotation[2]
      );
    }
    if (delta.scale) {
      obj.scale.set(
        base.scale.x * delta.scale[0],
        base.scale.y * delta.scale[1],
        base.scale.z * delta.scale[2]
      );
    }
  }

  return basePoseMap;
}
