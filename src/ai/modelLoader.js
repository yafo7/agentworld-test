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
    catch (err) { console.warn('[ModelLoader] Runtime failed, using fallback builder:', err.message); }
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
 * Fallback geometry builder when Voxel Runtime is unavailable.
 * Supports the primitive types used by exported models.
 */
function fallbackBuildGeometry(type, params) {
  switch (type) {
    case 'box':
      return new THREE.BoxGeometry(params.width || 1, params.height || 1, params.depth || 1);
    case 'sphere':
      return new THREE.SphereGeometry(params.radius || 0.5, params.widthSegments || 16, params.heightSegments || 12);
    case 'cylinder':
      return new THREE.CylinderGeometry(params.radiusTop || 0.5, params.radiusBottom || 0.5, params.height || 1, params.radialSegments || 16);
    case 'cone':
      return new THREE.ConeGeometry(params.radius || 0.5, params.height || 1, params.radialSegments || 16);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(params.radius || 0.5, params.detail || 0);
    default:
      console.warn(`[ModelLoader] Unknown geometry type "${type}", using box fallback`);
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

/**
 * Build a Three.js Group from modelJson — follows API reference exactly.
 * modelJson positions are parent-relative; no coordinate conversion needed.
 */
export function buildModelFromJson(modelJson) {
  const meshes = {}; // id → THREE.Object3D

  // First pass: create all objects at their (already relative) positions
  for (const m of modelJson.meshes) {
    if (m.group) {
      const g = new THREE.Group();
      g.position.set(m.position?.x ?? 0, m.position?.y ?? 0, m.position?.z ?? 0);
      g.name = m.id; // English ID matches animation plan keys
      meshes[m.id] = g;
    } else {
      const geo = voxelRuntime
        ? voxelRuntime.buildGeometry(m.type, m.geometry || {})
        : fallbackBuildGeometry(m.type, m.geometry || {});
      const mat = new THREE.MeshStandardMaterial({
        color: m.color ?? 0x888888,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(m.position?.x ?? 0, m.position?.y ?? 0, m.position?.z ?? 0);
      mesh.name = m.id; // English ID matches animation plan keys
      meshes[m.id] = mesh;
    }
  }

  // Second pass: build hierarchy with parent inference
  // (matches VoxelData.js: meshes auto-parent to the last group seen)
  const root = new THREE.Group();
  root.name = modelJson.name || 'Model';
  let currentGroupId = null;

  for (const m of modelJson.meshes) {
    if (m.group) {
      currentGroupId = m.id;
      if (!m.parent) root.add(meshes[m.id]);
      else if (meshes[m.parent]) meshes[m.parent].add(meshes[m.id]);
    } else {
      // Infer parent: explicit parent → current group → root
      const parentId = m.parent || currentGroupId || null;
      if (parentId && meshes[parentId]) {
        meshes[parentId].add(meshes[m.id]);
      } else {
        root.add(meshes[m.id]);
      }
    }
  }

  // Attach model wrapper for evaluateMotion (built from actual Three.js hierarchy)
  root._voxelModel = _buildModelWrapper(root);

  return root;
}

/**
 * Build model wrapper from the constructed Three.js hierarchy.
 * Provides getPart(id)→{id,isGroup,offset} and getChildren(id)→[].
 */
function _buildModelWrapper(rootGroup) {
  const byId = {};

  rootGroup.traverse((obj) => {
    if (!obj.name) return;
    byId[obj.name] = {
      id: obj.name,
      name: obj.name,
      isGroup: obj.isGroup || (obj.children && obj.children.length > 0),
      offset: [obj.position.x, obj.position.y, obj.position.z],
      children: [],
    };
  });

  // Build children lists from Three.js parent-child relationships
  rootGroup.traverse((obj) => {
    if (!obj.name || !obj.parent || obj.parent === rootGroup) return;
    const parentId = obj.parent.name;
    if (byId[parentId] && byId[obj.name]) {
      byId[parentId].children.push(byId[obj.name]);
    }
  });

  return {
    getPart(id) { return byId[id] || null; },
    getChildren(id) {
      const part = byId[id];
      return part ? part.children : [];
    },
  };
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

  // Pass model wrapper (with getPart/getChildren) to evaluateMotion,
  // not the raw THREE.Group. Required for complex templates like tilt/wave/flow.
  const modelArg = model._voxelModel || model;
  const pose = voxelRuntime.evaluateMotion(plan, duration, modelArg, t);

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

  // Apply deltas: base + delta
  const applied = new Map(); // partId → { position, rotation, scale } applied delta
  for (const [partId, delta] of Object.entries(pose)) {
    if (partId.startsWith('_')) continue;

    const obj = model.getObjectByName(partId);
    if (!obj) continue;

    const base = basePoseMap.get(partId);
    if (!base) continue;

    const pos = delta.position || [0, 0, 0];
    const rot = delta.rotation || [0, 0, 0];
    const scl = delta.scale;

    obj.position.set(
      base.position.x + pos[0],
      base.position.y + pos[1],
      base.position.z + pos[2]
    );
    obj.rotation.set(
      base.rotation.x + rot[0],
      base.rotation.y + rot[1],
      base.rotation.z + rot[2]
    );
    if (scl) {
      obj.scale.set(base.scale.x * scl[0], base.scale.y * scl[1], base.scale.z * scl[2]);
    }

    applied.set(partId, { position: pos, rotation: rot, scale: scl });
  }

  // Propagate parent deltas to _attached children
  const attachMap = pose._attachMap;
  if (attachMap) {
    for (const [childId, parentId] of Object.entries(attachMap)) {
      const parentApplied = applied.get(parentId);
      if (!parentApplied) continue;

      const childObj = model.getObjectByName(childId);
      if (!childObj) continue;

      const childBase = basePoseMap.get(childId);
      if (!childBase) continue;

      // Child gets its own delta (if any) + parent's delta
      const childApplied = applied.get(childId);
      const ownPos = childApplied ? childApplied.position : [0, 0, 0];
      const ownRot = childApplied ? childApplied.rotation : [0, 0, 0];

      childObj.position.set(
        childBase.position.x + ownPos[0] + parentApplied.position[0],
        childBase.position.y + ownPos[1] + parentApplied.position[1],
        childBase.position.z + ownPos[2] + parentApplied.position[2]
      );
      childObj.rotation.set(
        childBase.rotation.x + ownRot[0] + parentApplied.rotation[0],
        childBase.rotation.y + ownRot[1] + parentApplied.rotation[1],
        childBase.rotation.z + ownRot[2] + parentApplied.rotation[2]
      );
    }
  }

  return basePoseMap;
}
