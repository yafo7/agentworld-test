import * as THREE from 'three';

export function buildStaticColliders(physics, entities) {
  let colliderCount = 0;
  const body = physics.createStaticBody();

  for (const entity of entities) {
    if (entity.mesh?.userData?.noCollider) continue;
    const box = entity.getWorldBBox?.();
    if (!box) continue;
    const hx = (box.max.x - box.min.x) / 2;
    const hy = (box.max.y - box.min.y) / 2;
    const hz = (box.max.z - box.min.z) / 2;
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const collider = entity.mesh.userData.collider;

    if (collider?.type === 'tree') {
      const radius = THREE.MathUtils.clamp(Math.min(hx, hz) * 0.32, 0.45, 1.15);
      physics.addStaticCylinderToBody(body, hy, radius, cx, cy, cz);
    } else if (collider?.type === 'building') {
      physics.addStaticBoxToBody(
        body,
        collider.width * 0.5,
        hy,
        collider.depth * 0.5,
        entity.mesh.position.x,
        cy,
        entity.mesh.position.z
      );
    } else {
      physics.addStaticBoxToBody(body, hx, hy, hz, cx, cy, cz);
    }
    colliderCount += 1;
  }

  return { body, colliderCount };
}

