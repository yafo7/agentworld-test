import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';

// Demo pet configs — placeholder data until AI generation pipeline is wired.
export { PET_CONFIGS } from '../game/gameData.js';

/**
 * Pet entity — a colored cube with full identity data.
 * Hidden until spawned via the generation system (F key near forest).
 */
export class Pet {
  /**
   * @param {Object} config — from PET_CONFIGS
   */
  constructor(config) {
    // ---- identity ----
    this.name = config.name;
    this.tags = [...config.tags];
    this.personality = config.personality;
    this.likes = [...config.likes];
    this.dislikes = [...config.dislikes];
    this.habits = [...config.habits];
    this.originSignature = [...config.originSignature];

    // ---- visual ----
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: config.color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 0.5;
    this.mesh.name = this.name;
    this.mesh.visible = false; // hidden until spawned

    // Tag label
    this._label = createTagLabel(this.mesh, []);
    this._syncLabel();

    // ---- runtime state ----
    this.mood = 'neutral';
    this.trust = 0;
    this.affection = 0;
    this.memories = [];
    this.spawned = false;

    // Wander target
    this._target = new THREE.Vector3();
  }

  // ---- spawn / despawn ----

  /** Make pet appear at given position. */
  spawnAt(position) {
    this.mesh.position.copy(position);
    this.mesh.visible = true;
    this.spawned = true;
    this._label.sprite.visible = true;
    this._pickRandomTarget();
  }

  // ---- movement ----

  _pickRandomTarget() {
    const cx = this.mesh.position.x;
    const cz = this.mesh.position.z;
    this._target.set(
      cx + (Math.random() - 0.5) * 6,
      0.5,
      cz + (Math.random() - 0.5) * 6
    );
  }

  move() {
    if (!this.spawned) return;
    const speed = 0.03;
    const dir = new THREE.Vector3().subVectors(this._target, this.mesh.position);
    if (dir.length() < 0.15) {
      this._pickRandomTarget();
    } else {
      this.mesh.position.addScaledVector(dir.normalize(), speed);
    }
  }

  // ---- info ----

  getInfo() {
    return {
      name: this.name,
      tags: this.tags,
      personality: this.personality,
      likes: this.likes,
      dislikes: this.dislikes,
      habits: this.habits,
      originSignature: this.originSignature,
      mood: this.mood,
      trust: this.trust,
      affection: this.affection,
      memories: this.memories,
    };
  }

  _syncLabel() {
    this._label.update(this.name, this.tags);
  }
}
