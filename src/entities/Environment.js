import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';
import { loadModel, loadAnimationPlan, applyAnimation } from '../ai/modelLoader.js';

export class Environment {
  constructor(config) {
    this.name = config.name;
    this._modelName = config.modelName || config.name.toLowerCase().replace(/\s+/g, '_');
    this._yOffset = config.yOffset || 0;
    this.coreTags = [...config.coreTags];
    this.moreTags = [];

    // ---- mesh (placeholder initially) ----
    this.mesh = new THREE.Group();
    this.mesh.name = config.name;
    const [w, h, d] = config.size || [1.5, 0.6, 1.5];
    this.mesh.position.set(...(config.position || [0, 0.3, 0]));

    // Fallback placeholder
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color: config.color || 0x888888 });
    this._fallback = new THREE.Mesh(geo, mat);
    this._fallback.position.y = h / 2;
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
      model.position.y = -box.min.y + (this._yOffset || 0);
      this.mesh.remove(this._fallback);
      this.mesh.add(model);
      this._modelGroup = model;
      this._animPartMap = new Map();
      model.traverse((o) => { if (o.name) this._animPartMap.set(o.name, o); });
    }

    this._animIdle = await loadAnimationPlan(`generated/animations/${modelName}_idle.json`);
    if (this._animIdle) this._animDuration = this._animIdle._duration ?? 2.5;
  }

  // ---- tag management ----

  get allTags() { return [...this.coreTags, ...this.moreTags]; }

  addTags(tags) {
    let changed = false;
    for (const tag of tags) {
      if (!this.allTags.includes(tag)) { this.moreTags.push(tag); changed = true; }
    }
    if (changed) this._syncLabel();
  }

  get position() { return this.mesh.position; }
  getInfo() { return { name: this.name, coreTags: this.coreTags, moreTags: this.moreTags, allTags: this.allTags }; }

  /** Call every frame to play idle animation. */
  updateAnimation(dt = 0.016) {
    if (!this._animIdle || !this._modelGroup) return;
    this._animTime += dt;
    const t = this._animTime % this._animDuration;
    applyAnimation(this._animIdle, this._animDuration, this._modelGroup, t, this._animPartMap);
  }

  _syncLabel() { this._label.update(this.name, this.allTags); }
}
