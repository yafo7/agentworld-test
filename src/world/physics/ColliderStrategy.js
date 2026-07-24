export const COLLIDER_STRATEGIES = Object.freeze({
  VOXEL_AABB: 'voxel-aabb',
  LEGACY_BOUNDS: 'legacy-bounds',
});

export const DEFAULT_COLLIDER_STRATEGY = COLLIDER_STRATEGIES.VOXEL_AABB;

export function normalizeColliderStrategy(strategy) {
  return Object.values(COLLIDER_STRATEGIES).includes(strategy)
    ? strategy
    : DEFAULT_COLLIDER_STRATEGY;
}
