import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';
import { createSpeechBubble } from '../ui/SpeechBubble.js';
import { loadModel } from '../model/loader.js';
import { loadAnimationPlan } from '../animation/planLoader.js';
import { applyAnimation } from '../animation/player.js';
import { buildModelFromJson } from '../model/builder.js';

export class Environment {
  constructor(config) {
    this.name = config.name;
    this._modelName = config.modelName || config.name.toLowerCase().replace(/\s+/g, '_');
    this._yOffset = config.yOffset || 0;
    this._color = config.color;
    this.coreTags = [...config.coreTags];
    this.moreTags = [];
    this._residents = []; // pets that call this environment home

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
    this._hasCustomModel = false;
    this._animTime = 0;
    this._animDuration = 2.5;
    this._animPartMap = null;
    this._loadModelAndAnim();

    // Interaction animation (played once when triggered, e.g. by E-key or editor)
    this._interactionPlan = null;
    this._interactionDuration = 2.0;
    this._interactionTime = 0;
    this._interactionPlaying = false;
    this._interactionPartMap = null;

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
    // Guard against race: if the model was already replaced by snapshot restore
    // or the editor while this async load was in flight, don't overwrite it.
    if (this._modelGroup) return;

    if (model && model !== this._fallback) {
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y + (this._yOffset || 0);
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
  getInfo() { return { name: this.name, coreTags: this.coreTags, moreTags: this.moreTags, allTags: this.allTags, residents: (this._residents||[]).map(p=>p.name) }; }

  /** Call every frame to play idle + interaction animations. */
  updateAnimation(dt = 0.016) {
    // Interaction animation (one-shot)
    if (this._interactionPlaying && this._interactionPlan && this._modelGroup) {
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

    // Idle animation (looping)
    if (this._animIdle && this._modelGroup) {
      this._animTime += dt;
      const t = this._animTime % this._animDuration;
      this._animPartMap = applyAnimation(this._animIdle, this._animDuration, this._modelGroup, t, this._animPartMap);
    }
  }

  // ---- interaction animation (AI-generated, plays on E-key or editor apply) ----

  setInteractionAnimation(plan, duration = 2.0) {
    this._interactionPlan = plan;
    this._interactionDuration = duration;
    this._interactionTime = 0;
    this._interactionPlaying = false;
    this._interactionPartMap = null;
  }

  playInteractionAnimation() {
    if (!this._interactionPlan || !this._modelGroup) return;
    this._interactionPlaying = true;
    this._interactionTime = 0;
    this._interactionPartMap = null;
  }

  _syncLabel() {
    const displayTags = [...this.allTags];
    const residentNames = (this._residents || []).map((p) => p.name);
    const residence = residentNames.length > 0
      ? `居民: ${residentNames.join('、')}`
      : '暂无宠物居住';
    this._label.update(this.name, displayTags, residence);
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
        this.mesh.remove(this._modelGroup);
        this._modelGroup = null;
      } else {
        this.mesh.remove(this._fallback);
      }

      const box = new THREE.Box3().setFromObject(newModel);
      newModel.position.y = -box.min.y + (this._yOffset || 0);
      this.mesh.add(newModel);
      this._modelGroup = newModel;
      this._animPartMap = null;
      this._hasCustomModel = true;
      this._interactionPlan = null;
      this._interactionPlaying = false;
      this._interactionPartMap = null;

      for (const tag of newTags) {
        if (tag && !this.coreTags.includes(tag) && !this.moreTags.includes(tag)) {
          this.moreTags.push(tag);
        }
      }
      this._syncLabel();

      console.log(`[Environment] ${this.name} refined with tags [${newTags.join(', ')}]`);
    } catch (err) {
      console.error(`[Environment] Refine failed for ${this.name}:`, err);
      if (!this._modelGroup && this.mesh.children.filter((c) => c !== this._label.sprite && c !== this._constructionBubble.sprite).length === 0) {
        this.mesh.add(this._fallback);
      }
    }
  }

  /** Collect tags from all entities and pick the 5 most typical ones. */
  refreshTagsFromEntities(entityList) {
    const counts = {};
    for (const entity of entityList) {
      const tags = entity.tags || [];
      for (const tag of tags) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    const top5 = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
    if (top5.length > 0) {
      this.coreTags = top5;
      this._syncLabel();
    }
  }
}
