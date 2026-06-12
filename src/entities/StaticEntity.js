import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';
import { loadModel } from '../ai/modelLoader.js';

/**
 * Static entity — an immovable decoration or tree that displays a name + tag label.
 * Similar to Item but without pickup functionality.
 */
export class StaticEntity {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.tags = [...(config.tags || [])];
    this.category = config.category || 'decor'; // 'decor' | 'tree'

    // ---- mesh ----
    this.mesh = new THREE.Group();
    this.mesh.name = this.name;
    this.mesh.position.set(...(config.position || [0, 0, 0]));

    // Inner content group (model scale)
    this._content = new THREE.Group();
    this._content.scale.set(config.scale ?? 1, config.scale ?? 1, config.scale ?? 1);
    this.mesh.add(this._content);

    // Fallback placeholder
    let fallbackGeo, fallbackMat, fallbackY;
    if (this.category === 'tree') {
      fallbackGeo = new THREE.CylinderGeometry(0.3, 0.3, 2, 8);
      fallbackMat = new THREE.MeshStandardMaterial({ color: 0x44aa44, flatShading: true });
      fallbackY = 1.0;
    } else {
      fallbackGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      fallbackMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, flatShading: true });
      fallbackY = 0.4;
    }
    this._fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
    this._fallback.position.y = fallbackY;
    this._content.add(this._fallback);

    // Model loading
    this._modelGroup = null;
    this._loadModel(config.modelName || config.id);

    // Tag label
    this._label = createTagLabel(this.mesh, []);
    this._syncLabel();
  }

  async _loadModel(modelName) {
    const model = await loadModel(`generated/models/${modelName}.json`, null);
    if (model && model !== this._fallback) {
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;
      this._content.remove(this._fallback);
      this._content.add(model);
      this._modelGroup = model;
      console.log(`[StaticEntity] ${this.name} model loaded`);
    }
  }

  get position() { return this.mesh.position; }

  getInfo() {
    return { name: this.name, tags: this.tags, category: this.category };
  }

  _syncLabel() { this._label.update(this.name, this.tags); }

  // ---- breathing animation (client-side sine wave) ----

  playBreathing() {
    if (this._breathing) return;
    this._breathing = true;
    this._breathTime = 0;
    this._breathBaseScale = this._content.scale.x;
    console.log(`[StaticEntity] ${this.name} breathing started`);
  }

  updateBreathing(dt = 0.016) {
    if (!this._breathing) return;
    this._breathTime += dt;
    const s = this._breathBaseScale * (1 + Math.sin(this._breathTime * 3) * 0.06);
    this._content.scale.set(s, s, s);
    if (this._breathTime > 3) {
      this._breathing = false;
      this._content.scale.set(this._breathBaseScale, this._breathBaseScale, this._breathBaseScale);
      console.log(`[StaticEntity] ${this.name} breathing ended`);
    }
  }
}
