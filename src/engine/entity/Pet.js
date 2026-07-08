import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';
import { createSpeechBubble } from '../ui/SpeechBubble.js';
import { getPlayerLine } from '../../demos/chii-island/data/gameData.js';
import { loadModel } from '../model/loader.js';
import { loadAnimationPlan } from '../animation/planLoader.js';
import { applyAnimation } from '../animation/player.js';
import { getRuntime } from '../../backend/runtimeLoader.js';
import { buildModelFromJson } from '../model/builder.js';
import { generateModel, generateAnimation, refineModel } from '../../backend/voxelApi.js';

export { PET_CONFIGS, INTIMACY_ITEM_CONFIGS, ENV_POND, ENV_GRASSLAND } from '../../demos/chii-island/data/gameData.js';

const PET_INTERACT_RANGE = 2.8;
const PET_SEEK_RANGE = 2.0;
const WANDER_SPEED = 0.03;
const SEEK_SPEED = 0.06;
const BEHAVIOR_INTERVAL = 5; // seconds between walk/idle decision

function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  return (Math.round(r1 + (r2 - r1) * t) << 16) | (Math.round(g1 + (g2 - g1) * t) << 8) | Math.round(b1 + (b2 - b1) * t);
}

/**
 * Pet entity with state machine, intimacy, AI models, and animations.
 */
export class Pet {
  constructor(config) {
    // ---- identity ----
    this.name = config.name;
    this._modelName = config.modelName || config.name;
    this.tags = [...config.tags];
    this.personality = config.personality;
    this.likes = [...config.likes];
    this.dislikes = [...config.dislikes];
    this.habits = [...config.habits];
    this.originSignature = [...config.originSignature];
    this.homeEnv = null; // set by onPetGenerated after spawning

    // ---- structured refine tags (ability/species/personality/feature) ----
    this.ability = config.ability || '';
    this.species = config.species || '';
    this.personalityTag = config.personalityTag || '';
    this.feature = config.feature || '';

    // ---- visual (placeholder initially) ----
    this._originalColor = config.color;
    this._currentColor = config.color;

    this.mesh = new THREE.Group(); // root group — will hold model or fallback
    this.mesh.name = this.name;
    this.mesh.position.y = 0;
    this.mesh.scale.set(0.5, 0.5, 0.5);
    this.mesh.visible = false;

    // Fallback placeholder cube
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: config.color });
    this._fallback = new THREE.Mesh(geo, mat);
    this._fallback.position.y = 0.5;
    this.mesh.add(this._fallback);

    // Model loading
    this._modelLoaded = false;
    this._modelGroup = null;
    this._hasCustomModel = false;
    this._loadModel();

    // Labels (parented to mesh)
    this._label = createTagLabel(this.mesh, []);
    this._syncLabel();
    this._bubble = createSpeechBubble(this.mesh);

    // ---- state machine ----
    this.state = 'wandering';
    this.affection = 0;
    this.mood = 'neutral';
    this.trust = 0;
    this.memories = [];
    this.spawned = false;

    // Milestones
    this._milestones = {};

    // Dialogue
    this._chatPartner = null;
    this._chatLines = [];
    this._chatIndex = 0;
    this._chatTimer = 0;

    // Movement
    this._target = new THREE.Vector3();
    this._seekTarget = new THREE.Vector3();

    // Recall
    this._recallTarget = new THREE.Vector3();
    this._recallTimer = 0;
    this._onRecallComplete = null;

    // ---- 5-second behavior timer ----
    this._behaviorTimer = BEHAVIOR_INTERVAL;
    this._isWalking = false;

    // ---- animation ----
    this._animIdle = null;
    this._animWalk = null;
    this._animTime = 0;
    this._animDuration = 2.5;
    this._animPartMap = null;
    this._loadAnimations();

    // ---- world data (injected by main.js) ----
    this._staticEntities = [];
    this._envGridConfigs = [];
    this._allPets = [];
    this._environments = [];
    this._items = [];
    this._homeEnvIndex = 4;
    this._homePosition = new THREE.Vector3();

    // ---- visit / action / linger timers ----
    this._visitTimer = 0;
    this._visitedEnvIndex = -1;
    this._actionTimer = 30;
    this._lingerTimer = 0;
    this._followTarget = null;
    this._returnToWander = false;

    // ---- action target (decor or other pet) ----
    this._actionTarget = null;
    this._actionTimerLocal = 0;

    // ---- refine state ----
    this._refineTarget = null;
    this._refineAngle = 0;
    this._refineCircling = false;
    this._refineGenerating = false;
    this._refineOptions = null; // { description, type } passed by external refine dialog

    // ---- construction label (when being refined by others) ----
    this._constructionBubble = createSpeechBubble(this.mesh);
    this._constructionRefCount = 0;
  }

  // ===================================================================
  // model & animation loading
  // ===================================================================

  async _loadModel() {
    const model = await loadModel(
      `generated/pets/models/${this.name}.json`,
      null
    );
    if (model && model !== this._fallback) {
      // Place model on ground: shift up so bounding box bottom is at y=0
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;

      this.mesh.remove(this._fallback);
      this.mesh.add(model);
      this._modelGroup = model;
      this._modelLoaded = true;
      this._originalModelJson = model.userData?.modelJson || null;
      // basePoseMap will be built lazily by applyAnimation on first frame
      this._animPartMap = null;
      console.log(`[Pet] ${this.name} model loaded`);
    }
  }

  async _loadAnimations() {
    this._animIdle = await loadAnimationPlan(`generated/pets/animations/${this.name}_idle.json`);
    this._animWalk = await loadAnimationPlan(`generated/pets/animations/${this.name}_walk.json`);
    if (this._animIdle) this._animDuration = this._animIdle._duration ?? 2.5;
    if (this._animIdle || this._animWalk) {
      console.log(`[Pet] ${this.name} animations loaded`);
    }
  }

  // ===================================================================
  // spawn
  // ===================================================================

  spawnAt(position) {
    this.mesh.position.copy(position);
    this.mesh.visible = true;
    this.spawned = true;
    this._label.sprite.visible = true;
    this._behaviorTimer = BEHAVIOR_INTERVAL;
    this._isWalking = false;
    this.state = 'wandering';
    this._visitTimer = 0;
    this._visitedEnvIndex = -1;
    this._actionTimer = 30;
    this._lingerTimer = 0;
    this._followTarget = null;
    this._returnToWander = false;
    this._actionTarget = null;
    this._actionTimerLocal = 0;
    this._pickRandomTargetInEnv(this._homeEnvIndex);
  }

  despawn() {
    this.mesh.visible = false;
    this.spawned = false;
    this.state = 'wandering';
    this._bubble.hide();
    this._label.sprite.visible = false;
    this._visitTimer = 0;
    this._visitedEnvIndex = -1;
    this._followTarget = null;
    this._returnToWander = false;
    this._actionTarget = null;
    this._actionTimerLocal = 0;
  }

  startRecall(homePosition, onComplete) {
    this.state = 'returning_home';
    this._recallTarget.copy(homePosition);
    this._onRecallComplete = onComplete;
    this._actionTarget = null;
    this._actionTimerLocal = 0;
    this._clearRefine();
    console.log(`[Pet] ${this.name} is returning home...`);
  }

  // ===================================================================
  // world data injection
  // ===================================================================

  setWorldData(staticEntities, envGridConfigs, homePosition, homeEnvIndex, allPets, environments, items, envHalfWidth = 10.25) {
    this._staticEntities = staticEntities;
    this._envGridConfigs = envGridConfigs;
    this._homePosition.set(homePosition.x, 0, homePosition.z);
    this._homeEnvIndex = homeEnvIndex;
    this._allPets = allPets;
    this._environments = environments;
    this._items = items;
    this._envHalfWidth = envHalfWidth;
  }

  getCurrentEnvIndex() {
    const HALF_WIDTH = this._envHalfWidth ?? 10.25;
    for (let i = 0; i < this._envGridConfigs.length; i++) {
      const cfg = this._envGridConfigs[i];
      const dx = Math.abs(this.mesh.position.x - cfg.center[0]);
      const dz = Math.abs(this.mesh.position.z - cfg.center[1]);
      if (dx <= HALF_WIDTH && dz <= HALF_WIDTH) {
        return i;
      }
    }
    return this._homeEnvIndex;
  }

  _getNeighborEnvIndices() {
    // Single-environment mode: no neighbors to visit.
    if (this._envGridConfigs.length <= 1) return [];
    const idx = this.getCurrentEnvIndex();
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    const neighbors = [];
    if (row > 0) neighbors.push(idx - 3);
    if (row < 2) neighbors.push(idx + 3);
    if (col > 0) neighbors.push(idx - 1);
    if (col < 2) neighbors.push(idx + 1);
    return neighbors;
  }

  _pickRandomTargetInEnv(envIndex) {
    const cfg = this._envGridConfigs[envIndex];
    if (!cfg) {
      this._pickRandomTargetFallback();
      return;
    }
    const halfWidth = this._envHalfWidth ?? 10.25;
    const range = Math.max(8, halfWidth - 1); // use most of the enlarged grid
    this._target.set(
      cfg.center[0] + (Math.random() - 0.5) * 2 * range,
      0,
      cfg.center[1] + (Math.random() - 0.5) * 2 * range
    );
  }

  _pickRandomTargetFallback() {
    const cx = this.mesh.position.x;
    const cz = this.mesh.position.z;
    this._target.set(
      cx + (Math.random() - 0.5) * 6,
      0,
      cz + (Math.random() - 0.5) * 6
    );
  }

  // ===================================================================
  // follow system
  // ===================================================================

  startFollowing(player) {
    this.state = 'following';
    this._followTarget = player;
    this._actionTarget = null;
    this._actionTimerLocal = 0;
    this._clearRefine();
    console.log(`[Pet] ${this.name} is now following the player.`);
  }

  stopFollowing() {
    this.state = 'linger';
    this._lingerTimer = 30;
    this._followTarget = null;
    this._actionTarget = null;
    this._actionTimerLocal = 0;
    this._clearRefine();
    console.log(`[Pet] ${this.name} stopped following, lingering for 30s.`);
  }

  // ===================================================================
  // visit system
  // ===================================================================

  _startVisiting() {
    const neighbors = this._getNeighborEnvIndices();
    if (neighbors.length === 0) return;
    this._visitedEnvIndex = neighbors[Math.floor(Math.random() * neighbors.length)];
    this._visitTimer = 60;
    this._actionTarget = null;
    this._actionTimerLocal = 0;
    this._pickRandomTargetInEnv(this._visitedEnvIndex);
    this._isWalking = true;
    console.log(`[Pet] ${this.name} is visiting ${this._envGridConfigs[this._visitedEnvIndex].name}`);
  }

  _startReturnHome() {
    this.state = 'returning_home';
    this._recallTarget.copy(this._homePosition);
    this._returnToWander = true;
    this._actionTarget = null;
    this._actionTimerLocal = 0;
    this._clearRefine();
    console.log(`[Pet] ${this.name} is returning home.`);
  }

  _clearRefine() {
    if (this._refineTarget) {
      this._refineTarget.hideConstructionLabel();
    }
    this._refineTarget = null;
    this._refineAngle = 0;
    this._refineCircling = false;
    this._refineGenerating = false;
    this._refineOptions = null;
  }

  // ===================================================================
  // action judgment helpers
  // ===================================================================

  _findEntitiesInEnv(envIndex) {
    const cfg = this._envGridConfigs[envIndex];
    const HALF_WIDTH = 10 * 2.05 / 2;
    return this._staticEntities.filter(e => {
      const dx = Math.abs(e.mesh.position.x - cfg.center[0]);
      const dz = Math.abs(e.mesh.position.z - cfg.center[1]);
      return dx <= HALF_WIDTH && dz <= HALF_WIDTH && e.mesh.visible;
    });
  }

  _startInteractWithDecor() {
    const currentEnv = this.getCurrentEnvIndex();
    const entities = this._findEntitiesInEnv(currentEnv);
    if (entities.length === 0) {
      this._isWalking = true;
      this._pickRandomTargetInEnv(currentEnv);
      return;
    }
    this._actionTarget = entities[Math.floor(Math.random() * entities.length)];
    this._actionTimerLocal = 5;
    this._target.copy(this._actionTarget.mesh.position);
    this._isWalking = true;
    console.log(`[Pet] ${this.name} is going to interact with ${this._actionTarget.name}`);
  }

  _startChatWithOtherPet() {
    const others = this._allPets.filter(p =>
      p !== this && p.spawned && (p.state === 'wandering' || p.state === 'linger')
    );
    if (others.length === 0) {
      this._startInteractWithDecor();
      return;
    }
    const partner = others[Math.floor(Math.random() * others.length)];
    this._actionTarget = partner;
    this._actionTimerLocal = 3;
    this._target.copy(partner.mesh.position);
    this._isWalking = true;
    console.log(`[Pet] ${this.name} is going to chat with ${partner.name}`);
  }

  // ===================================================================
  // construction label (when being refined by others)
  // ===================================================================

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

  // ===================================================================
  // refine support (this pet can also be refined by others)
  // ===================================================================

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
      newModel.position.y = -box.min.y;
      this.mesh.add(newModel);
      this._modelGroup = newModel;
      this._originalModelJson = modelJson;
      this._hasCustomModel = true;
      this._animPartMap = null;

      for (const tag of newTags) {
        if (tag && !this.tags.includes(tag)) this.tags.push(tag);
      }
      this._syncLabel();

      console.log(`[Pet] ${this.name} refined with tags [${newTags.join(', ')}]`);
    } catch (err) {
      console.error(`[Pet] Refine failed for ${this.name}:`, err);
      if (!this._modelGroup && this.mesh.children.filter((c) => c !== this._label.sprite && c !== this._constructionBubble.sprite).length === 0) {
        this.mesh.add(this._fallback);
      }
    }
  }

  // ===================================================================
  // refine system (this pet refines other entities)
  // ===================================================================

  _findNearestRefinableTarget() {
    let nearest = null;
    let nearestDist = Infinity;

    const candidates = [
      ...this._staticEntities.filter((e) => e.mesh.visible),
      ...this._allPets.filter((p) => p !== this && p.spawned),
      ...(this._environments || []),
      ...(this._items || []).filter((i) => !i.isHeld),
    ];

    for (const entity of candidates) {
      const dist = this.mesh.position.distanceTo(entity.mesh.position);
      if (dist < nearestDist) {
        nearest = entity;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  startRefine(target = null, options = {}) {
    if (!target) {
      target = this._findNearestRefinableTarget();
    }
    if (!target) {
      console.log(`[Pet] ${this.name} found nothing to refine nearby.`);
      return;
    }
    this._clearRefine();
    this._refineTarget = target;
    this._refineOptions = options;
    this.state = 'refining';
    this._refineCircling = false;
    this._refineAngle = 0;
    console.log(`[Pet] ${this.name} starts refining ${target.name}`);
  }

  async _runRefineAsync() {
    if (this._refineGenerating) return;
    this._refineGenerating = true;

    const target = this._refineTarget;
    if (!target) {
      this._refineGenerating = false;
      return;
    }

    // If no global promise exists yet, this pet becomes the master craftsman
    if (!target._refinePromise) {
      target._refinePromise = this._doActualRefine(target);
    }

    // All pets (including master) await the same shared promise
    try {
      await target._refinePromise;
    } catch (err) {
      console.error(`[Pet] ${this.name} refine failed:`, err);
    } finally {
      if (target) target.hideConstructionLabel();
      this._refineGenerating = false;
      this._refineCircling = false;
      this._refineTarget = null;
      if (this.state === 'refining') {
        this.state = 'wandering';
        this._behaviorTimer = BEHAVIOR_INTERVAL;
      }
    }
  }

  async _doActualRefine(target) {
    try {
      const options = this._refineOptions || {};
      const allTags = target._pendingRefineTags || [this.tags[Math.floor(Math.random() * this.tags.length)]];
      const tagDesc = allTags.join(', ');
      const category = target.category || 'object';
      const description = options.description
        || `Take the existing ${category} "${target.name}" and preserve its original shape, colors, and core style. Add exactly one new ${tagDesc}-themed feature to give it a fresh twist. It must still be immediately recognizable as the original ${target.name}. Lowpoly voxel style.`;

      let modelJson;
      try {
        if (target._originalModelJson?._meta?.ai) {
          const result = await refineModel(target._originalModelJson, description);
          modelJson = result.modelJson;
          console.log(`[Pet] Refined ${target.name} via backend refine API`);
        } else {
          throw new Error('no_metadata');
        }
      } catch (refineErr) {
        console.warn(`[Pet] refineModel failed (${refineErr.message}), falling back to generateModel`);
        const result = await generateModel(description);
        modelJson = result.modelJson;
      }

      await target.refineModel(modelJson, allTags);
      target._originalModelJson = modelJson;
      console.log(`[Pet] Refined ${target.name} with tags [${allTags.join(', ')}]`);

      // Generate interaction animation for StaticEntity targets
      try {
        const { plan } = await generateAnimation(modelJson, 'a funny and lively interaction animation', 2.0);
        if (target.setInteractionAnimation) {
          target.setInteractionAnimation(plan, 2.0);
        }
      } catch (animErr) {
        console.warn('[Pet] Animation generation failed:', animErr);
      }

      if (typeof this._onSceneChange === 'function') this._onSceneChange();
    } catch (err) {
      console.error(`[Pet] Refine failed:`, err);
      throw err;
    } finally {
      delete target._pendingRefineTags;
      delete target._refinePromise;
    }
  }

  // ===================================================================
  // movement (called every frame)
  // ===================================================================

  move(playerPos, dt = 0.016) {
    if (!this.spawned) return;

    // ---- 5-second behavior timer ----
    this._behaviorTimer -= dt;
    if (this._behaviorTimer <= 0) {
      this._behaviorTimer = BEHAVIOR_INTERVAL;

      if (this.state === 'following' || this.state === 'refining') {
        // No random decisions while following or refining
      } else if (this.state === 'linger' || this.state === 'visiting' || (this._visitTimer > 0 && this.state === 'wandering')) {
        this._isWalking = Math.random() < 0.5;
        if (this._isWalking) {
          if (this._visitTimer > 0 && this._visitedEnvIndex !== -1) {
            this._pickRandomTargetInEnv(this._visitedEnvIndex);
          } else {
            this._pickRandomTargetInEnv(this.getCurrentEnvIndex());
          }
        }
      } else if (this.state === 'wandering') {
        const roll = Math.random();
        if (roll < 0.45) {
          this._isWalking = true;
          this._pickRandomTargetInEnv(this.getCurrentEnvIndex());
        } else if (roll < 0.90) {
          this._isWalking = false;
        } else {
          // 10% chance to visit a neighboring environment
          this._startVisiting();
        }
      }
    }

    // ---- 30-second action timer ----
    this._actionTimer -= dt;
    if (this._actionTimer <= 0) {
      this._actionTimer = 30;
      if (this.state === 'wandering' || this.state === 'linger' || (this._visitTimer > 0 && this.state === 'wandering')) {
        const roll = Math.random();
        if (roll < 0.20) {
          this._startReturnHome();
        } else if (roll < 0.70) {
          this._startInteractWithDecor();
        } else {
          this._startChatWithOtherPet();
        }
      }
    }

    // ---- countdown timers ----
    if (this._visitTimer > 0) {
      this._visitTimer -= dt;
      if (this._visitTimer <= 0) {
        this._visitTimer = 0;
        this._visitedEnvIndex = -1;
        this._startReturnHome();
      }
    }

    if (this._lingerTimer > 0) {
      this._lingerTimer -= dt;
      if (this._lingerTimer <= 0) {
        this._lingerTimer = 0;
        this._startReturnHome();
      }
    }

    if (this._actionTarget && this._actionTimerLocal > 0) {
      const distToTarget = this.mesh.position.distanceTo(this._actionTarget.mesh.position);
      if (distToTarget < 1.5) {
        this._isWalking = false;
        this._actionTimerLocal -= dt;
        if (this._actionTimerLocal <= 0) {
          // Trigger interaction effect
          if (this._actionTarget.playBreathing) {
            this._actionTarget.playBreathing();
          }
          if (this._allPets.includes(this._actionTarget)) {
            this._bubble.show('嗨！');
            setTimeout(() => this._bubble.hide(), 2000);
          }
          this._actionTarget = null;
          this._actionTimerLocal = 0;
        }
      }
    }

    // Animation timer
    this._animTime += dt;
    const animDuration = this._animDuration || 2.5;
    const t = this._animTime % animDuration;

    switch (this.state) {
      case 'wandering':
        if (this._isWalking) {
          this._moveWander(playerPos);
          if (this._animWalk && this._modelGroup) {
            this._animPartMap = applyAnimation(this._animWalk, animDuration, this._modelGroup, t, this._animPartMap);
          }
        } else {
          if (this._animIdle && this._modelGroup) {
            this._animPartMap = applyAnimation(this._animIdle, animDuration, this._modelGroup, t, this._animPartMap);
          }
        }
        break;

      case 'following':
        {
          const dist = this.mesh.position.distanceTo(playerPos);
          if (dist > 3.0) {
            const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
            dir.y = 0;
            const angle = Math.atan2(dir.x, dir.z);
            this.mesh.rotation.y = angle;
            this.mesh.position.addScaledVector(dir.normalize(), WANDER_SPEED);
            if (this._animWalk && this._modelGroup) {
              this._animPartMap = applyAnimation(this._animWalk, animDuration, this._modelGroup, t, this._animPartMap);
            }
          } else {
            if (this._animIdle && this._modelGroup) {
              this._animPartMap = applyAnimation(this._animIdle, animDuration, this._modelGroup, t, this._animPartMap);
            }
          }
        }
        break;

      case 'refining':
        {
          if (!this._refineTarget) {
            this.state = 'wandering';
            break;
          }
          const dist = this.mesh.position.distanceTo(this._refineTarget.mesh.position);
          if (dist > 2.5 && !this._refineCircling) {
            const dir = new THREE.Vector3().subVectors(this._refineTarget.mesh.position, this.mesh.position);
            dir.y = 0;
            const angle = Math.atan2(dir.x, dir.z);
            this.mesh.rotation.y = angle;
            this.mesh.position.addScaledVector(dir.normalize(), WANDER_SPEED);
            if (this._animWalk && this._modelGroup) {
              this._animPartMap = applyAnimation(this._animWalk, animDuration, this._modelGroup, t, this._animPartMap);
            }
          } else {
            if (!this._refineCircling) {
              this._refineCircling = true;
              this._refineAngle = Math.atan2(
                this.mesh.position.z - this._refineTarget.mesh.position.z,
                this.mesh.position.x - this._refineTarget.mesh.position.x
              );
              this._refineTarget.showConstructionLabel();
              this._runRefineAsync();
            }
            this._refineAngle += dt * 1.5;
            const radius = 2.0;
            const cx = this._refineTarget.mesh.position.x;
            const cz = this._refineTarget.mesh.position.z;
            this.mesh.position.x = cx + Math.cos(this._refineAngle) * radius;
            this.mesh.position.z = cz + Math.sin(this._refineAngle) * radius;
            this.mesh.rotation.y = this._refineAngle + Math.PI / 2;
            if (this._animWalk && this._modelGroup) {
              this._animPartMap = applyAnimation(this._animWalk, animDuration, this._modelGroup, t, this._animPartMap);
            }
          }
        }
        break;

      case 'linger':
        if (this._isWalking) {
          this._moveWander(playerPos);
          if (this._animWalk && this._modelGroup) {
            this._animPartMap = applyAnimation(this._animWalk, animDuration, this._modelGroup, t, this._animPartMap);
          }
        } else {
          if (this._animIdle && this._modelGroup) {
            this._animPartMap = applyAnimation(this._animIdle, animDuration, this._modelGroup, t, this._animPartMap);
          }
        }
        break;

      case 'chatting':
        this._updateDialogue();
        if (this._animIdle && this._modelGroup) {
          this._animPartMap = applyAnimation(this._animIdle, animDuration, this._modelGroup, t, this._animPartMap);
        }
        break;

      case 'seeking_player':
        this._moveSeekPlayer(playerPos);
        // Play walk animation
        if (this._animWalk && this._modelGroup) {
          this._animPartMap = applyAnimation(this._animWalk, animDuration, this._modelGroup, t, this._animPartMap);
        }
        break;

      case 'returning_home':
        {
          const arrived = this._moveToTarget(this._recallTarget, WANDER_SPEED);
          if (arrived) {
            if (this._returnToWander) {
              this.state = 'wandering';
              this._returnToWander = false;
              this._isWalking = false;
              this._behaviorTimer = BEHAVIOR_INTERVAL;
            } else {
              this.state = 'recall_pause';
              this._recallTimer = 2.0;
            }
          }
          if (this._animWalk && this._modelGroup) {
            this._animPartMap = applyAnimation(this._animWalk, animDuration, this._modelGroup, t, this._animPartMap);
          }
        }
        break;

      case 'recall_pause':
        this._recallTimer -= dt;
        if (this._recallTimer <= 0) {
          this.despawn();
          if (this._onRecallComplete) {
            this._onRecallComplete();
            this._onRecallComplete = null;
          }
        }
        if (this._animIdle && this._modelGroup) {
          this._animPartMap = applyAnimation(this._animIdle, animDuration, this._modelGroup, t, this._animPartMap);
        }
        break;
    }

    if (this.state === 'chatting') {
      this._chatTimer -= dt;
    }

    // Fallback client-side animation when Voxel Runtime is unavailable
    if (!getRuntime() && this._modelGroup) {
      const isMoving = (this.state === 'wandering' && this._isWalking)
                    || this.state === 'seeking_player'
                    || this.state === 'returning_home'
                    || this.state === 'following'
                    || this.state === 'refining';
      if (isMoving) {
        // Simple walk bounce
        this._modelGroup.position.y = Math.abs(Math.sin(this._animTime * 6)) * 0.05;
      } else {
        // Idle breathe
        const s = 1 + Math.sin(this._animTime * 2) * 0.015;
        this._modelGroup.scale.set(s, s, s);
        this._modelGroup.position.y = 0;
      }
    }
  }

  _moveWander(playerPos) {
    const distToPlayer = this.mesh.position.distanceTo(playerPos);
    if (distToPlayer < PET_INTERACT_RANGE) return; // paused

    const dir = new THREE.Vector3().subVectors(this._target, this.mesh.position);
    if (dir.length() < 0.15) {
      // If chasing an action target, let move() handle arrival; otherwise pick new target
      if (!this._actionTarget) {
        this._pickRandomTarget();
      }
    } else {
      // Face movement direction
      const angle = Math.atan2(dir.x, dir.z);
      this.mesh.rotation.y = angle;
      this.mesh.position.addScaledVector(dir.normalize(), WANDER_SPEED);
    }
  }

  _moveSeekPlayer(playerPos) {
    const dist = this.mesh.position.distanceTo(playerPos);
    if (dist < PET_SEEK_RANGE) {
      if (!this._bubble.isVisible) {
        this._bubble.show(getPlayerLine(this));
      }
      // Play idle while waiting
      if (this._animIdle && this._modelGroup) {
        const t = (this._animTime % (this._animDuration || 2.5));
        this._animPartMap = applyAnimation(this._animIdle, this._animDuration || 2.5, this._modelGroup, t, this._animPartMap);
      }
      return;
    }

    const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    dir.y = 0;
    const angle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.y = angle;
    this.mesh.position.addScaledVector(dir.normalize(), SEEK_SPEED);
  }

  _moveToTarget(targetPos, speed = WANDER_SPEED) {
    const dir = new THREE.Vector3().subVectors(targetPos, this.mesh.position);
    dir.y = 0;
    if (dir.length() < 0.15) {
      return true; // arrived
    }
    const angle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.y = angle;
    this.mesh.position.addScaledVector(dir.normalize(), speed);
    return false;
  }

  // ===================================================================
  // dialogue
  // ===================================================================

  startChatWith(otherPet, lines) {
    this.state = 'chatting';
    this._chatPartner = otherPet;
    this._chatLines = lines;
    this._chatIndex = 0;
    this._chatTimer = 2.0;
    this._bubble.hide();
    this._actionTarget = null;
    this._actionTimerLocal = 0;
    this._clearRefine();
  }

  get isChatFinished() {
    return this.state === 'chatting' && this._chatIndex >= this._chatLines.length && this._chatTimer <= 0;
  }

  _updateDialogue() {
    if (!this._chatLines.length || this._chatIndex >= this._chatLines.length) return;

    this._chatTimer -= 0.016;
    if (this._chatTimer <= 0 && this._chatIndex < this._chatLines.length) {
      const line = this._chatLines[this._chatIndex];
      if (!line) return;
      this._bubble.show(`${line.speaker}: ${line.text}`);
      if (this._chatPartner?._bubble) {
        this._chatPartner._bubble.show(`${line.speaker}: ${line.text}`);
      }
      this._chatIndex++;
      this._chatTimer = 2.5;
    }
  }

  endChat() {
    if (this.state !== 'chatting') return;
    this._bubble.hide();
    if (this._chatPartner?._bubble) {
      this._chatPartner._bubble.hide();
      this._chatPartner.state = 'wandering';
      this._chatPartner._chatPartner = null;
      this._chatPartner._pickRandomTarget();
    }
    this.state = 'wandering';
    this._chatPartner = null;
    this._chatLines = [];
    this._chatIndex = 0;
    this._pickRandomTarget();
  }

  // ===================================================================
  // player interaction
  // ===================================================================

  interactWithPlayer() {
    if (this.state === 'seeking_player') return { type: 'max_intimacy_dialogue' };
    if (this.affection < 10) {
      this.affection++;
      this.trust = Math.min(100, this.trust + 10);
      this.mood = 'happy';
      this.memories.push(`玩家在第${this.affection}次互动时陪伴了它。`);
      const milestone = this._checkMilestone();
      return { type: 'affection_up', affection: this.affection, milestone };
    }
    return { type: 'already_max' };
  }

  _checkMilestone() {
    if (this.affection >= 5 && !this._milestones[5]) {
      this._milestones[5] = true;
      this._updateColor(0.3);
      return 5;
    }
    if (this.affection >= 10 && !this._milestones[10]) {
      this._milestones[10] = true;
      this._updateColor(0.6);
      return 10;
    }
    return null;
  }

  _updateColor(t) {
    this._currentColor = lerpColor(this._originalColor, 0xffdd88, t);
    if (this._fallback?.material?.color) {
      this._fallback.material.color.set(this._currentColor);
    }
    this._syncLabel();
  }

  // ===================================================================
  // seek player
  // ===================================================================

  shouldSeekPlayer() {
    return this.affection >= 10 && this.state === 'wandering' && this._milestones[10] === true;
  }

  startSeekingPlayer() {
    this.state = 'seeking_player';
    this._actionTarget = null;
    this._actionTimerLocal = 0;
    this._clearRefine();
    console.log(`[Pet] ${this.name} is seeking the player!`);
  }

  finishPlayerDialogue() {
    this._bubble.hide();
    this.state = 'wandering';
    this._behaviorTimer = BEHAVIOR_INTERVAL;
  }

  // ===================================================================
  // misc
  // ===================================================================

  _pickRandomTarget() {
    if (this._visitTimer > 0 && this._visitedEnvIndex !== -1) {
      this._pickRandomTargetInEnv(this._visitedEnvIndex);
    } else {
      this._pickRandomTargetInEnv(this.getCurrentEnvIndex());
    }
  }

  getInfo() {
    return {
      name: this.name, tags: this.tags, personality: this.personality,
      likes: this.likes, dislikes: this.dislikes, habits: this.habits,
      originSignature: this.originSignature, home: this.homeEnv?.name || '无',
      state: this.state, affection: this.affection, mood: this.mood,
      trust: this.trust, memories: this.memories, milestones: { ...this._milestones },
    };
  }

  toSnapshot() {
    return {
      name: this.name,
      affection: this.affection,
      trust: this.trust,
      mood: this.mood,
      spawned: this.spawned,
      state: this.state,
      position: [this.mesh.position.x, this.mesh.position.y, this.mesh.position.z],
      milestones: { ...(this._milestones || {}) },
      memories: [...(this.memories || [])],
      modelSource: this._hasCustomModel && this._originalModelJson
        ? { type: 'inline', modelJson: this._originalModelJson }
        : { type: 'path', path: `generated/pets/models/${this._modelName}.json` },
    };
  }

  async fromSnapshot(snapshot) {
    if (!snapshot) return;
    this.affection = snapshot.affection ?? this.affection;
    this.trust = snapshot.trust ?? this.trust;
    this.mood = snapshot.mood ?? this.mood;
    this._milestones = { ...(snapshot.milestones || {}) };
    this.memories = [...(snapshot.memories || [])];

    if (snapshot.spawned) {
      this.spawned = true;
      this.mesh.visible = true;
      this._label.sprite.visible = true;
      this.mesh.position.set(...snapshot.position);
      this.state = snapshot.state || 'wandering';
      if (this.state === 'following' || this.state === 'refining') {
        this.state = 'wandering';
      }
      this._behaviorTimer = BEHAVIOR_INTERVAL;
      this._isWalking = false;
      this._visitTimer = 0;
      this._visitedEnvIndex = -1;
      this._actionTimer = 30;
      this._lingerTimer = 0;
      this._followTarget = null;
      this._returnToWander = false;
      this._actionTarget = null;
      this._actionTimerLocal = 0;
      this._pickRandomTargetInEnv(this.getCurrentEnvIndex());
    }

    if (snapshot.modelSource?.type === 'inline' && snapshot.modelSource.modelJson) {
      await this.refineModel(snapshot.modelSource.modelJson, []);
    }

    this._updateColor(this.affection >= 10 ? 0.6 : this.affection >= 5 ? 0.3 : 0);
    this._syncLabel();
  }

  _syncLabel() {
    const tagList = [...this.tags];
    if (this.affection >= 5) tagList.push(`亲密度${this.affection}`);
    const residence = this.homeEnv ? `居住于: ${this.homeEnv.name}` : '';
    this._label.update(this.name, tagList, residence);
  }
}
