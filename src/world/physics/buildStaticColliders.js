import { ColliderRegistry } from './ColliderRegistry.js';

export function buildStaticColliders(physics, entities, { registry = new ColliderRegistry(physics) } = {}) {
  for (const entity of entities) {
    registry.registerEntity(entity, { operation: 'original' });
  }
  const summary = registry.summary();
  return { registry, colliderCount: summary.colliders, summary };
}
