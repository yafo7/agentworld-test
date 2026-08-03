import * as THREE from 'three';

import { WorldWaterVisualPort } from '../../ports/WorldWaterVisualPort.js';
import { createWaterMaterial } from './ModelWaterTagPresenter.js';

export function buildRiverStripGeometry({ riverData, center = [0, 0], gridSize = 50, tileSize = 4 } = {}) {
  const rows = [...(riverData?.byRow?.entries?.() || [])].sort((a, b) => a[0] - b[0]);
  if (rows.length < 2) return null;
  const positions = [];
  const uvs = [];
  const indices = [];
  const offset = ((gridSize - 1) * tileSize) / 2;
  const lastIndex = rows.length - 1;

  rows.forEach(([gridZ, row], index) => {
    const left = center[0] + row.waterStart * tileSize - offset - tileSize * 0.5;
    const right = center[0] + row.waterEnd * tileSize - offset + tileSize * 0.5;
    let worldZ = center[1] + gridZ * tileSize - offset;
    if (index === 0) worldZ -= tileSize * 0.5;
    if (index === lastIndex) worldZ += tileSize * 0.5;
    positions.push(left, 0.08, worldZ, right, 0.08, worldZ);
    const v = index / Math.max(1, lastIndex);
    uvs.push(0, v, 1, v);
    if (index < lastIndex) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Chii-owned adapter for the unbundled Studio water module at audited commit 1203a1e.
 * It follows the upstream mask/shore-distance idea with a stable river strip and UV shore
 * distance, while keeping future Studio water replacements isolated from terrain gameplay.
 */
export class VoxelStudioWorldWaterAdapter extends WorldWaterVisualPort {
  constructor({ scene } = {}) {
    super();
    if (!scene) throw new TypeError('VoxelStudioWorldWaterAdapter scene is required');
    this.scene = scene;
    this.elapsed = 0;
    this.river = null;
  }

  attachRiver(options = {}) {
    this._detachRiver();
    const geometry = buildRiverStripGeometry(options);
    if (!geometry) return null;
    const material = createWaterMaterial('river');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'ChiiContinuousRiverSurface';
    mesh.renderOrder = 24;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.userData = {
      isWater: true,
      isWaterSurface: true,
      source: 'voxel-studio-water-adapter',
      sourceCommit: '1203a1e',
    };
    this.scene.add(mesh);
    this.river = { mesh, geometry, material };
    return mesh;
  }

  _detachRiver() {
    if (!this.river) return;
    this.river.mesh.removeFromParent();
    this.river.geometry.dispose();
    this.river.material.dispose();
    this.river = null;
  }

  update(dt = 0) {
    this.elapsed += Math.max(0, Number(dt) || 0);
    const uniforms = this.river?.material?.userData?.waterUniforms;
    if (uniforms) uniforms.uTime.value = this.elapsed;
  }

  getCapabilities() {
    return {
      source: 'voxel-studio-water-adapter',
      sourceCommit: '1203a1e',
      continuousRiver: true,
      uvShoreFoam: true,
      modelPoolAndFall: true,
      upstreamPackageStatus: 'water-not-exported-by-render-runtime',
    };
  }

  dispose() {
    this._detachRiver();
  }
}
