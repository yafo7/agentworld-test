import { COLLIDER_STRATEGIES, normalizeColliderStrategy } from './ColliderStrategy.js';

const PROFILE_VERSION = 2;

const PROFILES = Object.freeze({
  none: Object.freeze({ key: `none:v${PROFILE_VERSION}`, mode: 'none' }),
  legacyTree: Object.freeze({
    key: `legacy-tree:v${PROFILE_VERSION}`,
    mode: 'legacy-tree',
    fallbackToBounds: true,
  }),
  legacyBuilding: Object.freeze({
    key: `legacy-building:v${PROFILE_VERSION}`,
    mode: 'legacy-building',
    fallbackToBounds: true,
  }),
  legacyBounds: Object.freeze({
    key: `legacy-bounds:v${PROFILE_VERSION}`,
    mode: 'legacy-bounds',
    fallbackToBounds: true,
  }),
  voxelTree: Object.freeze({
    key: `voxel-tree:v${PROFILE_VERSION}`,
    mode: 'compound',
    maxBoxes: 1,
    minVolume: 0.05,
    minPlanArea: 0.02,
    minHeight: 0.6,
    minExtent: 0.08,
    rankBy: 'height',
    fallbackToBounds: false,
  }),
  building: Object.freeze({
    key: `building:v${PROFILE_VERSION}`,
    mode: 'compound',
    maxBoxes: 18,
    minVolume: 0.35,
    minPlanArea: 0.16,
    minHeight: 0.18,
    minExtent: 0.1,
    rankBy: 'volume',
    fallbackToBounds: true,
  }),
  decor: Object.freeze({
    key: `decor:v${PROFILE_VERSION}`,
    mode: 'compound',
    maxBoxes: 4,
    minVolume: 0.08,
    minPlanArea: 0.04,
    minHeight: 0.12,
    minExtent: 0.08,
    rankBy: 'volume',
    fallbackToBounds: true,
  }),
  bridge: Object.freeze({
    key: `bridge:v${PROFILE_VERSION}`,
    mode: 'bridge',
    fallbackToBounds: false,
  }),
});

const NON_SOLID_CATEGORIES = new Set(['plant', 'grass', 'flower', 'crop']);

export function colliderProfileForEntity(entity, strategy) {
  if (!entity?.mesh || entity.mesh.userData?.noCollider) return PROFILES.none;
  if (NON_SOLID_CATEGORIES.has(entity.category)) return PROFILES.none;

  const normalizedStrategy = normalizeColliderStrategy(strategy);
  const explicitType = entity.mesh.userData?.collider?.type;
  if (explicitType === 'bridge') return PROFILES.bridge;
  if (normalizedStrategy === COLLIDER_STRATEGIES.LEGACY_BOUNDS) {
    if (explicitType === 'tree' || entity.category === 'tree') return PROFILES.legacyTree;
    if (explicitType === 'building' || entity.category === 'house' || entity.category === 'building') {
      return PROFILES.legacyBuilding;
    }
    return PROFILES.legacyBounds;
  }
  if (explicitType === 'tree' || entity.category === 'tree') {
    return PROFILES.voxelTree;
  }
  if (explicitType === 'building' || entity.category === 'house' || entity.category === 'building') {
    return PROFILES.building;
  }
  return PROFILES.decor;
}

export { PROFILE_VERSION };
