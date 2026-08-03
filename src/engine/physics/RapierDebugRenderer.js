import * as THREE from 'three';

/**
 * Renders Rapier collider wireframes using world.debugRender().
 * Ported from voxel-game/src/physics/RapierDebugRenderer.ts.
 *
 * Buffers grow as needed but never shrink to avoid GC churn.
 * Toggle visibility via the `enabled` property.
 */
export class RapierDebugRenderer {
  /**
   * @param {import('@dimforge/rapier3d-compat').World} world
   */
  constructor(world) {
    this._world = world;

    /** @type {boolean} */
    this.enabled = false;

    // Internal buffers — allocate once, grow as needed
    this._positions = new Float32Array(0);
    this._colors = new Float32Array(0);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(this._colors, 3));
    geom.setDrawRange(0, 0);
    this._geom = geom;

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: true,
    });

    /** @type {THREE.LineSegments} */
    this.mesh = new THREE.LineSegments(geom, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 999;
    this.mesh.visible = false;
  }

  /** Call each frame. Only does work when `enabled` is true. */
  update() {
    if (!this.enabled) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    const { vertices, colors } = this._world.debugRender();

    // Grow buffers if needed; never shrink
    const needed = Math.max(vertices.length, colors.length);
    if (needed > this._positions.length) {
      this._positions = new Float32Array(needed);
      this._colors = new Float32Array(needed);
      this._geom.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
      this._geom.setAttribute('color', new THREE.BufferAttribute(this._colors, 3));
    }

    // Zero out the buffer region we'll use (avoids stale data from previous frames)
    this._positions.fill(0, 0, vertices.length);
    this._colors.fill(0, 0, colors.length);

    this._positions.set(vertices, 0);
    this._colors.set(colors, 0);

    this._geom.attributes.position.needsUpdate = true;
    this._geom.attributes.color.needsUpdate = true;
    this._geom.setDrawRange(0, vertices.length / 3);
  }

  dispose() {
    this._geom.dispose();
    this.mesh.material.dispose();
    this._world = null;
  }
}
