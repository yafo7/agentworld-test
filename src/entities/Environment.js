import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';

/**
 * Environment entity — a block representing a forest / nest zone.
 * Has coreTags (intrinsic) and moreTags (accumulated from nearby items).
 * Displays all current tags as a floating label.
 */
export class Environment {
  constructor(config) {
    this.name = config.name;
    this.coreTags = [...config.coreTags];
    this.moreTags = [];

    // ---- mesh ----
    const [w, h, d] = config.size;
    const geometry = new THREE.BoxGeometry(w, h, d);
    const material = new THREE.MeshStandardMaterial({ color: config.color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(...config.position);
    this.mesh.name = config.name;

    // Tag label floating above
    this._label = createTagLabel(this.mesh, []);
    this._syncLabel();
  }

  // ---- tag management ----

  /** All tags currently active on this environment. */
  get allTags() {
    return [...this.coreTags, ...this.moreTags];
  }

  /** Add tags from an item placed nearby. Deduplicates. */
  addTags(tags) {
    let changed = false;
    for (const tag of tags) {
      if (!this.allTags.includes(tag)) {
        this.moreTags.push(tag);
        changed = true;
      }
    }
    if (changed) this._syncLabel();
  }

  /** Remove tags (e.g. when item is picked up and moved away). */
  removeTags(tags) {
    const before = this.moreTags.length;
    this.moreTags = this.moreTags.filter((t) => !tags.includes(t));
    if (this.moreTags.length !== before) this._syncLabel();
  }

  // ---- helpers ----

  get position() {
    return this.mesh.position;
  }

  /** For raycast inspection. */
  getInfo() {
    return {
      name: this.name,
      coreTags: this.coreTags,
      moreTags: this.moreTags,
      allTags: this.allTags,
    };
  }

  _syncLabel() {
    this._label.update(this.name, this.allTags);
  }
}
