import * as THREE from 'three';
import { createSpeechBubble } from '../ui/SpeechBubble.js';
import { loadModel } from '../model/loader.js';
import { buildModelFromJson, mergeMeshGroup } from '../model/builder.js';
import { applyAnimation } from '../animation/player.js';
import { generateAnimation } from '../../backend/voxelApi.js';
import { generateInstanceId } from '../../storage/sceneSnapshot.js';

/**
 * Static entity — an immovable decoration or tree that displays a name + tag label.
 * Similar to Item but without pickup functionality.
 */
export class StaticEntity {
  constructor(config) {
    this._instanceId = config.instanceId || generateInstanceId('static');
    this.id = config.id;
    this.name = config.name;
    this.tags = [...(config.tags || [])];
    this.category = config.category || 'decor'; // 'decor' | 'tree' | 'house'
    this._modelName = config.modelName || config.id;
    this._areaType = config.areaType || 'default';

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
      fallbackMat = new THREE.MeshLambertMaterial({ color: 0x44aa44, flatShading: true });
      fallbackY = 1.0;
    } else {
      fallbackGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      fallbackMat = new THREE.MeshLambertMaterial({ color: 0xffcc00, flatShading: true });
      fallbackY = 0.4;
    }
    this._fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
    this._fallback.position.y = fallbackY;
    this._content.add(this._fallback);

    // Model loading
    this._modelGroup = null;
    this._originalModelJson = config.modelJson || null;
    this._hasCustomModel = !!config.modelJson;
    this._mergeGeometry = config.mergeGeometry !== false; // merge sub-meshes into 1 draw call
    this._loadModel(config.modelName || config.id, config.modelJson);

    // Construction label (for refine)
    this._constructionBubble = createSpeechBubble(this.mesh);
    this._constructionRefCount = 0;

    // Interaction animation (generated after refine)
    this._interactionPlan = null;
    this._interactionDuration = 2.0;
    this._interactionTime = 0;
    this._interactionPlaying = false;
    this._interactionPartMap = null;

    // Idle animation (AI-generated, loops continuously)
    this._animIdle = null;
    this._animIdleDuration = 2.5;
    this._animIdleTime = 0;
    this._animIdlePartMap = null;
  }

  async _loadModel(modelName, modelJson = null) {
    try {
      const model = modelJson
        ? buildModelFromJson(modelJson)
        : await loadModel(`generated/models/${modelName}.json`, null);
      if (model && model !== this._fallback) {
        // Guard against race: if already replaced while async load was in flight, skip.
        if (this._modelGroup) return;

        // Merge sub-meshes into single geometry (N draw calls → 1)
        // Must run BEFORE bounding-box / positioning, so all vertices are
        // baked into group-local space while the group is still at origin.
        if (this._mergeGeometry) {
          mergeMeshGroup(model);
        }

        const box = new THREE.Box3().setFromObject(model);
        model.position.y = -box.min.y;

        this._content.remove(this._fallback);
        this._content.add(model);
        this._modelGroup = model;
        this._originalModelJson = modelJson || model.userData?.modelJson || null;
        console.log(`[StaticEntity] ${this.name} model loaded`);
      }
    } catch (err) {
      console.warn(`[StaticEntity] ${this.name} failed to load model ${modelName}:`, err.message);
    }
  }

  get position() { return this.mesh.position; }

  /**
   * World-space axis-aligned bounding box for collision.
   * Returns null if model hasn't loaded yet.
   */
  getWorldBBox() {
    if (!this._modelGroup) return null;
    // Ensure all world matrices are fresh so setFromObject gives world-space bounds
    this.mesh.updateWorldMatrix(false, true);
    return new THREE.Box3().setFromObject(this._modelGroup);
  }

  getInfo() {
    return { name: this.name, tags: this.tags, category: this.category };
  }

  toSnapshot() {
    return {
      instanceId: this._instanceId,
      id: this.id,
      name: this.name,
      tags: [...this.tags],
      category: this.category,
      areaType: this._areaType,
      envIndex: this._envIndex ?? 4,
      gridX: this._gridX ?? 0,
      gridZ: this._gridZ ?? 0,
      scale: this._content?.scale.x ?? 1,
      visible: this.mesh.visible,
      modelSource: this._snapshotModelSource(),
      interactionPlan: this._interactionPlan || null,
      idlePlan: this._animIdle || null,
    };
  }

  _snapshotModelSource() {
    if (this._generatedAssetId) {
      return { type: 'assetId', assetId: this._generatedAssetId };
    }
    if (this._hasCustomModel && this._originalModelJson?._isGLTF) {
      return { type: 'gltf' };
    }
    if (this._hasCustomModel && this._originalModelJson) {
      return { type: 'inline', modelJson: this._originalModelJson };
    }
    return { type: 'path', path: `generated/models/${this._modelName}.json` };
  }

  setTags(newTags) {
    this.tags = [...newTags];
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
      this._hasCustomModel = true;

      console.log(`[StaticEntity] ${this.name} refined with tags [${newTags.join(', ')}]`);
    } catch (err) {
      console.error(`[StaticEntity] Refine failed for ${this.name}:`, err);
      // Restore fallback if nothing is visible
      if (!this._modelGroup && this._content.children.length === 0) {
        this._content.add(this._fallback);
      }
    }
  }

  // ---- model replacement (used by generate system) ----

  replaceModel(mesh, modelJson) {
    // Remove old model or fallback
    if (this._modelGroup) {
      this._content.remove(this._modelGroup);
      this._modelGroup = null;
    } else {
      this._content.remove(this._fallback);
    }

    // Add new model
    const box = new THREE.Box3().setFromObject(mesh);
    mesh.position.y = -box.min.y;
    mesh.userData.modelJson = modelJson;
    this._content.add(mesh);
    this._modelGroup = mesh;
    this._originalModelJson = modelJson;
    this._hasCustomModel = true;

    // Reset animations
    this._interactionPlan = null;
    this._interactionPlaying = false;
    this._interactionPartMap = null;
    this._animIdle = null;
    this._animIdlePartMap = null;
    this._animIdleTime = 0;
  }

  // ---- idle animation (AI-generated, loops continuously) ----

  playIdleAnimation(plan, duration = 2.5) {
    this._animIdle = plan;
    this._animIdleDuration = duration;
    this._animIdleTime = 0;
    this._animIdlePartMap = null;
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
      this._animIdleTime += dt;
      const t = this._animIdleTime % this._animIdleDuration;
      this._animIdlePartMap = applyAnimation(
        this._animIdle,
        this._animIdleDuration,
        this._modelGroup,
        t,
        this._animIdlePartMap
      );
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
