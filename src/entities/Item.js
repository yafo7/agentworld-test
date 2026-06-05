import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';

/**
 * Item entity — a tetrahedron representing a placeable object.
 * Can be picked up by the player and dropped near the forest.
 * Each item type maps to one pet via originSignature.
 */
export class Item {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.tags = [...config.tags];
    this.correspondsTo = config.correspondsTo;
    this.isHeld = false;

    // ---- mesh (tetrahedron / cone with 3 sides) ----
    // TetrahedronGeometry(radius, detail) — a 4-sided pyramid
    const geometry = new THREE.TetrahedronGeometry(0.6, 0);
    const material = new THREE.MeshStandardMaterial({ color: config.color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(...config.spawnPosition);
    this.mesh.rotation.y = Math.random() * Math.PI; // random rotation for visual variety
    this.mesh.name = config.name;

    // Tag label
    this._label = createTagLabel(this.mesh, []);
    this._syncLabel();
  }

  // ---- helpers ----

  get position() {
    return this.mesh.position;
  }

  /** Pick up — hide world label, attach to player. */
  onPickup() {
    this.isHeld = true;
    this._label.sprite.visible = false;
  }

  /** Drop at given world position — show label again. */
  onDrop(worldPos) {
    this.isHeld = false;
    // Un-parent from player and set world position
    this.mesh.position.copy(worldPos);
    this._label.sprite.visible = true;
  }

  /** For raycast inspection. */
  getInfo() {
    return {
      name: this.name,
      tags: this.tags,
      correspondsTo: this.correspondsTo,
      isHeld: this.isHeld,
    };
  }

  _syncLabel() {
    this._label.update(this.name, this.tags);
  }
}
