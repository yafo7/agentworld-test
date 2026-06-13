import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';
import { createSpeechBubble } from '../ui/SpeechBubble.js';
import { loadModel, buildModelFromJson, applyAnimation } from '../ai/modelLoader.js';
import { generateAnimation } from '../ai/voxelApi.js';

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

    // Construction label (for refine)
    this._constructionBubble = createSpeechBubble(this.mesh);
    this._constructionRefCount = 0;

    // Interaction animation (generated after refine)
    this._interactionPlan = null;
    this._interactionDuration = 2.0;
    this._interactionTime = 0;
    this._interactionPlaying = false;
    this._interactionPartMap = null;
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

  setTags(newTags) {
    this.tags = [...newTags];
    this._syncLabel();
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

  // ---- model refine (async) ----

  async refineModel(modelJson, newTags = []) {
    try {
      const newModel = buildModelFromJson(modelJson);
      if (!newModel) throw new Error('Failed to build model from JSON');

      // Remove old model or fallback
      if (this._modelGroup) {
        this._content.remove(this._modelGroup);
        this._modelGroup = null;
      } else {
        this._content.remove(this._fallback);
      }

      // Add new model
      const box = new THREE.Box3().setFromObject(newModel);
      newModel.position.y = -box.min.y;
      this._content.add(newModel);
      this._modelGroup = newModel;

      // Reset interaction animation (old plan no longer valid for new model)
      this._interactionPlan = null;
      this._interactionPlaying = false;
      this._interactionPartMap = null;

      // Update tags
      for (const tag of newTags) {
        if (tag && !this.tags.includes(tag)) this.tags.push(tag);
      }
      this._syncLabel();

      console.log(`[StaticEntity] ${this.name} refined with tags [${newTags.join(', ')}]`);
    } catch (err) {
      console.error(`[StaticEntity] Refine failed for ${this.name}:`, err);
      // Restore fallback if nothing is visible
      if (!this._modelGroup && this._content.children.length === 0) {
        this._content.add(this._fallback);
      }
    }
  }

  // ---- interaction animation (AI-generated, plays on E-key) ----

  setInteractionAnimation(plan, duration = 2.0) {
    this._interactionPlan = plan;
    this._interactionDuration = duration;
    this._interactionTime = 0;
    this._interactionPlaying = false;
    this._interactionPartMap = null;
  }

  playInteractionAnimation() {
    if (!this._interactionPlan || !this._modelGroup) {
      this.playBreathing();
      return;
    }
    this._interactionPlaying = true;
    this._interactionTime = 0;
    this._interactionPartMap = null;
  }

  updateAnimation(dt = 0.016) {
    if (!this._interactionPlaying || !this._interactionPlan || !this._modelGroup) return;

    this._interactionTime += dt;
    const t = this._interactionTime % this._interactionDuration;
    this._interactionPartMap = applyAnimation(
      this._interactionPlan,
      this._interactionDuration,
      this._modelGroup,
      t,
      this._interactionPartMap
    );

    if (this._interactionTime >= this._interactionDuration) {
      this._interactionPlaying = false;
      // Reset to base poses
      if (this._interactionPartMap) {
        for (const [partId, base] of this._interactionPartMap) {
          const obj = this._modelGroup.getObjectByName(partId);
          if (obj) {
            obj.position.copy(base.position);
            obj.rotation.copy(base.rotation);
            obj.scale.copy(base.scale);
          }
        }
      }
    }
  }

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
