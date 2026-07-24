import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';
import { createSpeechBubble } from '../ui/SpeechBubble.js';
import { loadModel } from '../model/loader.js';
import { loadAnimationPlan } from '../animation/planLoader.js';
import { applyAnimation } from '../animation/player.js';
import { buildModelFromJson } from '../model/builder.js';
import { detachMaterialTagPresentation } from '../model/MaterialTagPresentation.js';

export class Item {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this._modelName = config.modelName || config.id; // generated file uses item id
    this.tags = [...config.tags];
    this.correspondsTo = config.correspondsTo;
    this._color = config.color;
    this.isHeld = false;

    // ---- mesh ----
    this.mesh = new THREE.Group();
    this.mesh.name = config.name;
    this.mesh.scale.set(0.8, 0.8, 0.8);
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
    this._hasCustomModel = !!config.modelJson;
    this._animTime = 0;
    this._animDuration = 2.5;
    this._animPartMap = null;
    this._loadModelAndAnim();

    // Tag label
    this._label = createTagLabel(this.mesh, []);
    this._syncLabel();

    // Construction label (for refine)
    this._constructionBubble = createSpeechBubble(this.mesh);
    this._constructionRefCount = 0;
  }

  async _loadModelAndAnim() {
    const modelName = this._modelName;
    const model = await loadModel(`generated/models/${modelName}.json`, null);
    // Guard against race: if already replaced while async load was in flight, skip.
    if (this._modelGroup) return;

    if (model && model !== this._fallback) {
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;
      this.mesh.remove(this._fallback);
      this.mesh.add(model);
      this._modelGroup = model;
      this._originalModelJson = model.userData?.modelJson || null;
      this._animPartMap = null; // built lazily by applyAnimation
    }

    // Second race guard before loading the default idle animation.
    if (this._modelGroup) return;
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

  toSnapshot() {
    return {
      id: this.id,
      name: this.name,
      tags: [...this.tags],
      correspondsTo: this.correspondsTo,
      color: this._color,
      isHeld: false,
      position: [this.mesh.position.x, this.mesh.position.y, this.mesh.position.z],
      modelSource: this._hasCustomModel && this._originalModelJson
        ? { type: 'inline', modelJson: this._originalModelJson }
        : { type: 'path', path: `generated/models/${this._modelName}.json` },
    };
  }

  async fromSnapshot(snapshot) {
    if (!snapshot) return;
    this.isHeld = false;
    this.mesh.position.set(...snapshot.position);
    this._label.sprite.visible = true;
    if (snapshot.modelSource?.type === 'inline' && snapshot.modelSource.modelJson) {
      await this.refineModel(snapshot.modelSource.modelJson, []);
    }
  }

  /** Call every frame to play idle animation. */
  updateAnimation(dt = 0.016) {
    if (!this._animIdle || !this._modelGroup) return;
    this._animTime += dt;
    const t = this._animTime % this._animDuration;
    this._animPartMap = applyAnimation(this._animIdle, this._animDuration, this._modelGroup, t, this._animPartMap);
  }

  // ---- construction label ----

  showConstructionLabel() {
    this._constructionRefCount++;
    this._constructionBubble.show('正在施工中...');
  }

  hideConstructionLabel() {
    this._constructionRefCount = Math.max(0, this._constructionRefCount - 1);
    if (this._constructionRefCount === 0) {
      this._constructionBubble.hide();
    }
  }

  // ---- model refine ----

  async refineModel(modelJson, newTags = []) {
    try {
      const newModel = buildModelFromJson(modelJson);
      if (!newModel) throw new Error('Failed to build model from JSON');

      if (this._modelGroup) {
        detachMaterialTagPresentation(this._modelGroup);
        this.mesh.remove(this._modelGroup);
        this._modelGroup = null;
      } else {
        this.mesh.remove(this._fallback);
      }

      const box = new THREE.Box3().setFromObject(newModel);
      newModel.position.y = -box.min.y;
      this.mesh.add(newModel);
      this._modelGroup = newModel;
      this._animPartMap = null;
      this._hasCustomModel = true;

      for (const tag of newTags) {
        if (tag && !this.tags.includes(tag)) this.tags.push(tag);
      }
      this._syncLabel();

      console.log(`[Item] ${this.name} refined with tags [${newTags.join(', ')}]`);
    } catch (err) {
      console.error(`[Item] Refine failed for ${this.name}:`, err);
      if (!this._modelGroup && this.mesh.children.filter((c) => c !== this._label.sprite && c !== this._constructionBubble.sprite).length === 0) {
        this.mesh.add(this._fallback);
      }
    }
  }

  _syncLabel() { this._label.update(this.name, this.tags); }
}
