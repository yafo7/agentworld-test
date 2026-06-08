import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';
import { loadModel, loadAnimationPlan, applyAnimation } from '../ai/modelLoader.js';

export class Item {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this._modelName = config.id; // generated file uses item id
    this.tags = [...config.tags];
    this.correspondsTo = config.correspondsTo;
    this.isHeld = false;

    // ---- mesh ----
    this.mesh = new THREE.Group();
    this.mesh.name = config.name;
    this.mesh.scale.set(0.5, 0.5, 0.5); // half size
    this.mesh.position.set(...(config.spawnPosition || [0, 0.6, 0]));

    // Fallback tetrahedron
    const geo = new THREE.TetrahedronGeometry(0.6, 0);
    const mat = new THREE.MeshStandardMaterial({ color: config.color });
    this._fallback = new THREE.Mesh(geo, mat);
    this._fallback.position.y = 0.4;
    this.mesh.add(this._fallback);

    // Model loading
    this._modelGroup = null;
    this._animIdle = null;
    this._animTime = 0;
    this._animDuration = 2.5;
    this._animPartMap = null;
    this._loadModelAndAnim();

    // Tag label
    this._label = createTagLabel(this.mesh, []);
    this._syncLabel();
  }

  async _loadModelAndAnim() {
    const modelName = this._modelName;
    const model = await loadModel(`generated/models/${modelName}.json`, null);
    if (model && model !== this._fallback) {
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;
      this.mesh.remove(this._fallback);
      this.mesh.add(model);
      this._modelGroup = model;
      this._animPartMap = new Map();
      model.traverse((o) => { if (o.name) this._animPartMap.set(o.name, o); });
    }

    this._animIdle = await loadAnimationPlan(`generated/animations/${modelName}_idle.json`);
    if (this._animIdle) this._animDuration = this._animIdle._duration ?? 2.5;
  }

  // ---- pickup ----

  get position() { return this.mesh.position; }

  onPickup() {
    this.isHeld = true;
    this._label.sprite.visible = false;
  }

  onDrop(worldPos) {
    this.isHeld = false;
    this.mesh.position.copy(worldPos);
    this._label.sprite.visible = true;
  }

  getInfo() {
    return { name: this.name, tags: this.tags, correspondsTo: this.correspondsTo, isHeld: this.isHeld };
  }

  /** Call every frame to play idle animation. */
  updateAnimation(dt = 0.016) {
    if (!this._animIdle || !this._modelGroup) return;
    this._animTime += dt;
    const t = this._animTime % this._animDuration;
    applyAnimation(this._animIdle, this._animDuration, this._modelGroup, t, this._animPartMap);
  }

  _syncLabel() { this._label.update(this.name, this.tags); }
}
