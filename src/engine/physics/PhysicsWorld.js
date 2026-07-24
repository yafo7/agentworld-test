import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Thin wrapper around Rapier3D physics world.
 * Ported from voxel-game/src/physics/PhysicsWorld.ts.
 *
 * - Fixed timestep (1/60), single step() per frame
 * - EventQueue created but never drained (no collision event processing)
 * - Static cuboid colliders for environment
 * - No collision groups, no bitmasks
 */
export class PhysicsWorld {
  constructor() {
    /** @type {RAPIER.World} */
    this.world = null;
    /** @type {RAPIER.EventQueue} */
    this.eventQueue = null;
    this._initialized = false;
  }

  /**
   * Initialize Rapier WASM and create the physics world.
   * Safe to call multiple times — returns immediately if already initialized.
   * @param {{ x?: number, y?: number, z?: number }} [gravity]
   */
  async init(gravity = { x: 0, y: -9.81, z: 0 }) {
    if (this._initialized) return;
    await RAPIER.init();
    this.world = new RAPIER.World(gravity);
    this.eventQueue = new RAPIER.EventQueue(true);
    this.world.timestep = 1 / 60;
    this._initialized = true;
  }

  /** Step the physics simulation one frame. */
  step() {
    if (!this._initialized) return;
    this.world.step(this.eventQueue);
  }

  /**
   * Create a static box collider.
   * @param {number} hx - half-extent X
   * @param {number} hy - half-extent Y
   * @param {number} hz - half-extent Z
   * @param {number} x  - center X
   * @param {number} y  - center Y
   * @param {number} z  - center Z
   * @returns {RAPIER.Collider}
   */
  addStaticBox(hx, hy, hz, x, y, z) {
    const body = this.createStaticBody();
    return this.addStaticBoxToBody(body, hx, hy, hz, x, y, z);
  }

  createStaticBody() {
    return this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  addStaticBoxToBody(body, hx, hy, hz, x, y, z, rotation = null) {
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z);
    if (rotation) colliderDesc.setRotation(rotation);
    return this.world.createCollider(colliderDesc, body);
  }

  addStaticCylinderToBody(body, halfHeight, radius, x, y, z) {
    const colliderDesc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(x, y, z);
    return this.world.createCollider(colliderDesc, body);
  }

  removeRigidBody(body) {
    if (body) this.world.removeRigidBody(body);
  }

  /**
   * Create a large thin cuboid to act as a ground plane.
   * Rapier 0.19 compat build does not expose ColliderDesc.halfspace,
   * so we emulate it with a huge cuboid (matches voxel-game approach).
   * @param {number} [y=0] - top face Y position
   * @returns {RAPIER.Collider}
   */
  addGroundPlane(y = 0) {
    return this.addStaticBox(1000, 0.5, 1000, 0, y - 0.5, 0);
  }
}
