import * as THREE from 'three';
import { buildModelFromJson } from '../../engine/model/builder.js';
import { normalizeColliderStrategy } from './ColliderStrategy.js';

const planCache = new Map();
const hashCache = new WeakMap();

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function hashModelJson(modelJson) {
  if (!modelJson || typeof modelJson !== 'object') return 'missing';
  const cached = hashCache.get(modelJson);
  if (cached) return cached;
  const hash = fnv1a(JSON.stringify(modelJson));
  hashCache.set(modelJson, hash);
  return hash;
}

function candidateRank(candidate, rankBy) {
  if (rankBy === 'height') return candidate.height;
  if (rankBy === 'planArea') return candidate.planArea;
  return candidate.volume;
}

function toAxisAlignedBoxShape(worldBox, sourceName) {
  const size = worldBox.getSize(new THREE.Vector3());
  return {
    kind: 'box',
    center: worldBox.getCenter(new THREE.Vector3()),
    halfExtents: size.multiplyScalar(0.5),
    rotation: new THREE.Quaternion(),
    sourceName,
  };
}

export function buildPhysicsAssetPlan({ modelJson, profile, strategy }) {
  const normalizedStrategy = normalizeColliderStrategy(strategy);
  const contentHash = hashModelJson(modelJson);
  const cacheKey = `${contentHash}:${profile.key}:${normalizedStrategy}`;
  const cached = planCache.get(cacheKey);
  if (cached) return cached;

  const model = buildModelFromJson(modelJson);
  const initialBounds = new THREE.Box3().setFromObject(model);
  if (!initialBounds.isEmpty()) model.position.y = -initialBounds.min.y;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const candidates = [];
  let sourceMeshCount = 0;

  if (profile.mode === 'compound') {
    model.traverse((object) => {
      if (!object.isMesh || !object.geometry?.attributes?.position) return;
      sourceMeshCount += 1;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const localBox = object.geometry.boundingBox;
      if (!localBox || localBox.isEmpty()) return;

      object.updateWorldMatrix(true, false);
      const worldBox = localBox.clone().applyMatrix4(object.matrixWorld);
      const size = worldBox.getSize(new THREE.Vector3());
      if (size.x < profile.minExtent || size.y < profile.minHeight || size.z < profile.minExtent) return;
      const volume = size.x * size.y * size.z;
      const planArea = size.x * size.z;
      if (volume < profile.minVolume || planArea < profile.minPlanArea) return;
      candidates.push({
        shape: toAxisAlignedBoxShape(worldBox, object.name),
        volume,
        planArea,
        height: size.y,
      });
    });
  }

  const selected = candidates
    .sort((a, b) => candidateRank(b, profile.rankBy) - candidateRank(a, profile.rankBy))
    .slice(0, profile.maxBoxes || 0);

  let fallbackUsed = false;
  if (profile.mode === 'compound' && selected.length === 0 && profile.fallbackToBounds && !bounds.isEmpty()) {
    const size = bounds.getSize(new THREE.Vector3());
    selected.push({
      shape: {
        kind: 'box',
        center: bounds.getCenter(new THREE.Vector3()),
        halfExtents: size.multiplyScalar(0.5),
        rotation: new THREE.Quaternion(),
        sourceName: 'asset-bounds',
      },
      volume: 0,
      planArea: 0,
      height: size.y,
    });
    fallbackUsed = true;
  }

  const plan = Object.freeze({
    cacheKey,
    contentHash,
    profileKey: profile.key,
    strategy: normalizedStrategy,
    mode: profile.mode,
    boxes: selected.map((candidate) => candidate.shape),
    bounds: bounds.isEmpty() ? null : bounds.clone(),
    sourceMeshCount,
    candidateCount: candidates.length,
    selectedMeshCount: selected.length,
    fallbackUsed,
  });
  planCache.set(cacheKey, plan);
  return plan;
}

export function clearPhysicsAssetPlanCache() {
  planCache.clear();
}
