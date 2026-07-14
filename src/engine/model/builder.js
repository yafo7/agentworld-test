import * as THREE from 'three';
import { getRuntime } from '../runtime/runtimeProvider.js';
import { fallbackBuildGeometry } from './fallback.js';
import { VoxelModel } from './VoxelData.js';

// ---- material cache: key → shared material ----
const _materialCache = new Map();

function _materialKey(params) {
  return `${params.color ?? 0}|${params.flatShading ? 'f' : 's'}|${params.transparent ? 't' : 'o'}|${params.opacity ?? 1}|${params.emissive ?? 0}|${params.emissiveIntensity ?? 0}|${params.side ?? 0}`;
}

function _getCachedMaterial(matData) {
  const data = matData || { color: 0x888888, flatShading: true };
  const key = _materialKey(data);
  if (_materialCache.has(key)) return _materialCache.get(key);

  const params = {
    color: data.color ?? 0x888888,
    flatShading: data.flatShading !== false,
  };
  if (data.transparent !== undefined) params.transparent = data.transparent;
  if (data.opacity !== undefined) params.opacity = data.opacity;
  if (data.emissive !== undefined) params.emissive = data.emissive;
  if (data.emissiveIntensity !== undefined) params.emissiveIntensity = data.emissiveIntensity;
  if (data.side !== undefined) params.side = data.side;

  const mat = new THREE.MeshLambertMaterial(params);
  _materialCache.set(key, mat);
  return mat;
}

// ---- unit geometry cache ----
const _unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);

function _getBoxGeometry(w, h, d) {
  if (w === 1 && h === 1 && d === 1) return _unitBoxGeo;
  return new THREE.BoxGeometry(w, h, d);
}

/**
 * Build a Three.js Group from modelJson — follows artwork-place/VoxelData.js blueprint.
 * Supports v2 (nodes[]), v1 (meshes[]), and fallback (parts[]) formats.
 * modelJson positions are parent-relative; no coordinate conversion needed.
 */
export function buildModelFromJson(modelJson) {
  if (!modelJson || typeof modelJson !== 'object') {
    console.warn('[ModelBuilder] Invalid modelJson');
    return new THREE.Group();
  }

  const voxelModel = VoxelModel.fromJSON(modelJson).resolveMirrors().optimize();
  const runtime = getRuntime();
  const objects = {}; // id → THREE.Object3D
  const root = new THREE.Group();
  root.name = voxelModel.name || 'Model';

  // Pass 1: create Three.js objects for each part
  for (const part of voxelModel.parts) {
    let obj = null;

    if (part.isGroup) {
      obj = new THREE.Group();
      obj.name = part.id;
      _applyTransform(obj, part);
    } else if (part.mesh) {
      const geo = runtime
        ? runtime.buildGeometry(part.mesh.type, part.mesh.geometry || {})
        : fallbackBuildGeometry(part.mesh.type, part.mesh.geometry || {});
      const mat = _getCachedMaterial(part.mesh.material);
      obj = new THREE.Mesh(geo, mat);
      obj.name = part.id;
      _applyTransform(obj, part);
    } else {
      // Legacy shapes / voxels / boxes
      obj = _buildLegacyPart(part);
      obj.name = part.id;
      _applyTransform(obj, part);
    }

    if (obj) {
      objects[part.id] = obj;
    }
  }

  // Pass 2: build hierarchy via explicit parent
  for (const part of voxelModel.parts) {
    const obj = objects[part.id];
    if (!obj) continue;
    const parentId = part.parent || null;
    if (parentId && objects[parentId]) {
      objects[parentId].add(obj);
    } else {
      root.add(obj);
    }
  }

  // Pass 3: attach the full VoxelModel so runtime.evaluateMotion gets complete part data
  // (offset, rotation, quaternion, scale — not just position)
  root._voxelModel = voxelModel;
  root.userData.modelJson = modelJson;

  return root;
}

function _applyTransform(obj, part) {
  obj.position.set(part.offset.x, part.offset.y, part.offset.z);

  if (part.quaternion) {
    obj.quaternion.set(
      part.quaternion.x,
      part.quaternion.y,
      part.quaternion.z,
      part.quaternion.w
    );
  } else if (part.rotation) {
    obj.rotation.set(part.rotation.x, part.rotation.y, part.rotation.z);
  }

  if (part.scale) {
    obj.scale.set(part.scale.x, part.scale.y, part.scale.z);
  }
}

// _buildMaterial kept as alias for backward compat
function _buildMaterial(matData) {
  return _getCachedMaterial(matData);
}

function _buildLegacyPart(part) {
  const group = new THREE.Group();

  // Boxes (inclusive min/max coordinates)
  for (const b of part.boxes) {
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    const d = b.maxZ - b.minZ + 1;
    const geo = _getBoxGeometry(w, h, d);
    const mat = _getCachedMaterial({ color: _parseColor(b.color), flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      b.minX + w / 2 - 0.5,
      b.minY + h / 2 - 0.5,
      b.minZ + d / 2 - 0.5
    );
    group.add(mesh);
  }

  // Single voxels
  for (const v of part.voxels) {
    const geo = _unitBoxGeo;
    const mat = _getCachedMaterial({ color: _parseColor(v.color), flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(v.x, v.y, v.z);
    group.add(mesh);
  }

  // Legacy shapes (only box/dot handled)
  for (const s of part.shapes) {
    if (!s) continue;
    if (s.type === 'box') {
      const w = Math.max(1, Math.round(s.w || 1));
      const h = Math.max(1, Math.round(s.h || 1));
      const d = Math.max(1, Math.round(s.d || 1));
      const geo = _getBoxGeometry(w, h, d);
      const mat = _getCachedMaterial({ color: _parseColor(s.color), flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(s.x || 0, s.y || 0, s.z || 0);
      group.add(mesh);
    } else if (s.type === 'dot') {
      const geo = _unitBoxGeo;
      const mat = _getCachedMaterial({ color: _parseColor(s.color), flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(s.x || 0, s.y || 0, s.z || 0);
      group.add(mesh);
    }
  }

  return group;
}

function _parseColor(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.startsWith('#')) return parseInt(value.slice(1), 16);
    if (value.startsWith('0x')) return parseInt(value.slice(2), 16);
  }
  return 0xcccccc;
}

/** Clear material cache (for hot-reload / model refresh) */
export function clearMaterialCache() {
  _materialCache.clear();
}

// ---- geometry merging (reduces N draw calls → 1 per entity) ----

/**
 * Merge all Mesh children of a group into a single Mesh with one BufferGeometry.
 * Preserves per-vertex colors. Handles both indexed and non-indexed geometries.
 * The original group is disposed; the new merged Mesh is returned.
 *
 * Based on voxel-game's mergeBufferGeometries pattern.
 */
export function mergeMeshGroup(group) {
  const meshes = [];
  group.traverse((child) => {
    if (child.isMesh && child.geometry) {
      meshes.push(child);
    }
  });

  if (meshes.length === 0) return group;
  if (meshes.length === 1) {
    return group;
  }

  // Compute world matrices for all descendants relative to group root.
  // group.updateWorldMatrix(false, true) cascades: each child's matrixWorld
  // = group.matrixWorld × … × parent.matrix × child.matrix.
  group.updateWorldMatrix(false, true);

  const allPositions = [];
  const allColors = [];
  let vertexOffset = 0;
  let hasColors = false;
  const indexArrays = [];

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const posAttr = geo.getAttribute('position');
    const colAttr = geo.getAttribute('color');
    const matColor = new THREE.Color(
      mesh.material.color ?? (colAttr ? 0xffffff : 0x888888)
    );

    // Use matrixWorld — includes full ancestor chain, not just immediate parent
    const worldMatrix = mesh.matrixWorld;

    const posArr = posAttr.array;
    const count = posAttr.count;

    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]);
      v.applyMatrix4(worldMatrix);
      allPositions.push(v.x, v.y, v.z);

      if (colAttr && colAttr.count === count) {
        hasColors = true;
        const cr = colAttr.array[i * 3] ?? 1;
        const cg = colAttr.array[i * 3 + 1] ?? 1;
        const cb = colAttr.array[i * 3 + 2] ?? 1;
        allColors.push(cr, cg, cb);
      } else {
        allColors.push(matColor.r, matColor.g, matColor.b);
        hasColors = true;
      }
    }

    // Handle indices
    if (geo.index) {
      const idxArr = geo.index.array;
      indexArrays.push({ array: new Uint32Array(idxArr), offset: vertexOffset, count: idxArr.length });
    } else {
      const seqIndices = new Uint32Array(count);
      for (let i = 0; i < count; i++) seqIndices[i] = vertexOffset + i;
      indexArrays.push({ array: seqIndices, offset: 0, count: count });
    }

    vertexOffset += count;
  }

  // Build merged geometry
  const mergedGeo = new THREE.BufferGeometry();
  mergedGeo.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));

  if (hasColors) {
    mergedGeo.setAttribute('color', new THREE.Float32BufferAttribute(allColors, 3));
  }

  // Combine all indices into one array
  const totalIndices = indexArrays.reduce((sum, ia) => sum + ia.count, 0);
  const combinedIndices = new Uint32Array(totalIndices);
  let writePos = 0;
  for (const ia of indexArrays) {
    for (let i = 0; i < ia.count; i++) {
      combinedIndices[writePos++] = ia.array[i] + ia.offset;
    }
  }
  mergedGeo.setIndex(new THREE.BufferAttribute(combinedIndices, 1));
  mergedGeo.computeBoundingSphere();
  mergedGeo.computeBoundingBox();

  // Find a representative material
  const refMat = meshes[0].material;
  const mergedMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    flatShading: refMat.flatShading !== false,
    vertexColors: hasColors,
    transparent: refMat.transparent ?? false,
    opacity: refMat.opacity ?? 1,
    side: refMat.side ?? THREE.FrontSide,
  });

  // Dispose original meshes
  for (const mesh of meshes) {
    if (mesh.geometry && mesh.geometry !== _unitBoxGeo) {
      mesh.geometry.dispose();
    }
    if (mesh.material && !_materialCache.has(_materialKey(mesh.material))) {
      mesh.material.dispose();
    }
  }

  // Replace group contents
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }
  const mergedMesh = new THREE.Mesh(mergedGeo, mergedMat);
  mergedMesh.name = group.name;
  group.add(mergedMesh);

  return group;
}
