export class ForgeMapPhysicsAdapter {
  constructor({ physics, map }) {
    this.physics = physics;
    this.map = map;
    this.bodies = [];
  }

  attach() {
    const terrain = this.map.terrain;
    const [width, , depth] = this.map.box.size;
    const vertices = new Float32Array(terrain.resolutionX * terrain.resolutionZ * 3);
    let offset = 0;
    for (let z = 0; z < terrain.resolutionZ; z += 1) {
      for (let x = 0; x < terrain.resolutionX; x += 1) {
        vertices[offset++] = -width / 2 + x * width / (terrain.resolutionX - 1);
        vertices[offset++] = terrain.heights[z * terrain.resolutionX + x] || 0;
        vertices[offset++] = -depth / 2 + z * depth / (terrain.resolutionZ - 1);
      }
    }
    const indices = [];
    for (let z = 0; z < terrain.resolutionZ - 1; z += 1) {
      for (let x = 0; x < terrain.resolutionX - 1; x += 1) {
        const a = z * terrain.resolutionX + x;
        const b = a + 1;
        const c = a + terrain.resolutionX;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    this.bodies.push(this.physics.addStaticTrimesh(vertices, new Uint32Array(indices)));
    for (const box of this.map.collisionBake?.boxes || []) {
      const halfX = (box.max[0] - box.min[0]) / 2;
      const halfY = (box.max[1] - box.min[1]) / 2;
      const halfZ = (box.max[2] - box.min[2]) / 2;
      this.bodies.push(this.physics.addStaticBox(
        halfX, halfY, halfZ,
        box.min[0] + halfX, box.min[1] + halfY, box.min[2] + halfZ,
      ).parent());
    }
    return this;
  }

  dispose() {
    for (const body of this.bodies) this.physics.removeRigidBody(body);
    this.bodies.length = 0;
  }
}
