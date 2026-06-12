import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';
import { createSpeechBubble } from '../ui/SpeechBubble.js';
import { getPlayerLine } from '../game/gameData.js';
import { loadModel, loadAnimationPlan, applyAnimation, getRuntime } from '../ai/modelLoader.js';

export { PET_CONFIGS, INTIMACY_ITEM_CONFIGS, ENV_POND, ENV_GRASSLAND } from '../game/gameData.js';

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
    this.tags = [...config.tags];
    this.personality = config.personality;
    this.likes = [...config.likes];
    this.dislikes = [...config.dislikes];
    this.habits = [...config.habits];
    this.originSignature = [...config.originSignature];
    this.homeEnv = null; // set by onPetGenerated after spawning

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
    this._pickRandomTarget(); // target relative to spawn position
  }

  despawn() {
    this.mesh.visible = false;
    this.spawned = false;
    this.state = 'wandering';
    this._bubble.hide();
    this._label.sprite.visible = false;
  }

  startRecall(homePosition, onComplete) {
    this.state = 'returning_home';
    this._recallTarget.copy(homePosition);
    this._onRecallComplete = onComplete;
    console.log(`[Pet] ${this.name} is returning home...`);
  }

  // ===================================================================
  // movement (called every frame)
  // ===================================================================

  move(playerPos, dt = 0.016) {
    if (!this.spawned) return;

    // Behavior timer
    this._behaviorTimer -= dt;
    if (this._behaviorTimer <= 0) {
      this._behaviorTimer = BEHAVIOR_INTERVAL;
      this._isWalking = Math.random() < 0.5;
      if (this._isWalking) this._pickRandomTarget();
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
            this.state = 'recall_pause';
            this._recallTimer = 2.0;
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
      const isMoving = this.state === 'wandering' && this._isWalking
                    || this.state === 'seeking_player'
                    || this.state === 'returning_home';
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
      this._pickRandomTarget();
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
    const cx = this.mesh.position.x;
    const cz = this.mesh.position.z;
    this._target.set(
      cx + (Math.random() - 0.5) * 6,
      0,
      cz + (Math.random() - 0.5) * 6
    );
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

  _syncLabel() {
    const tagList = [...this.tags];
    if (this.affection >= 5) tagList.push(`亲密度${this.affection}`);
    const residence = this.homeEnv ? `居住于: ${this.homeEnv.name}` : '';
    this._label.update(this.name, tagList, residence);
  }
}
