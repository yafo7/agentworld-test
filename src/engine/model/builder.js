import * as THREE from 'three';
import { getRuntime } from '../../backend/runtimeLoader.js';
import { fallbackBuildGeometry } from './fallback.js';
import { VoxelModel } from './VoxelData.js';

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
      const mat = _buildMaterial(part.mesh.material);
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

  // Pass 3: attach accurate _voxelModel wrapper from parsed data
  root._voxelModel = _buildModelWrapper(voxelModel);
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

function _buildMaterial(matData) {
  const data = matData || { color: 0x888888, flatShading: true };
  const params = {
    color: data.color ?? 0x888888,
    flatShading: data.flatShading !== false,
  };

  if (data.roughness !== undefined) params.roughness = data.roughness;
  if (data.metalness !== undefined) params.metalness = data.metalness;
  if (data.transparent !== undefined) params.transparent = data.transparent;
  if (data.opacity !== undefined) params.opacity = data.opacity;
  if (data.emissive !== undefined) params.emissive = data.emissive;
  if (data.emissiveIntensity !== undefined) params.emissiveIntensity = data.emissiveIntensity;
  if (data.side !== undefined) params.side = data.side;

  return new THREE.MeshStandardMaterial(params);
}

function _buildLegacyPart(part) {
  const group = new THREE.Group();

  // Boxes (inclusive min/max coordinates)
  for (const b of part.boxes) {
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    const d = b.maxZ - b.minZ + 1;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: _parseColor(b.color),
      flatShading: true,
    });
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
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: _parseColor(v.color),
      flatShading: true,
    });
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
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color: _parseColor(s.color),
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(s.x || 0, s.y || 0, s.z || 0);
      group.add(mesh);
    } else if (s.type === 'dot') {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: _parseColor(s.color),
        flatShading: true,
      });
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

/**
 * Build model wrapper from the parsed VoxelModel.
 * Provides getPart(id) and getChildren(id) as expected by evaluateMotion v2.
 */
function _buildModelWrapper(voxelModel) {
  return {
    getPart(id) {
      const p = voxelModel.getPart(id);
      if (!p) return null;
      return {
        id: p.id,
        name: p.name,
        isGroup: p.isGroup,
        offset: [p.offset.x, p.offset.y, p.offset.z],
        children: voxelModel.getChildren(id).map((c) => c.id),
      };
    },
    getChildren(id) {
      return voxelModel.getChildren(id).map((p) => ({
        id: p.id,
        name: p.name,
        isGroup: p.isGroup,
        offset: [p.offset.x, p.offset.y, p.offset.z],
        children: voxelModel.getChildren(p.id).map((c) => c.id),
      }));
    },
  };
}
