import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';
import { createSpeechBubble } from '../ui/SpeechBubble.js';
import { getPlayerLine } from '../game/gameData.js';
import { loadModel, loadAnimationPlan, applyAnimation } from '../ai/modelLoader.js';

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

    // ---- visual (placeholder initially) ----
    this._originalColor = config.color;
    this._currentColor = config.color;

    this.mesh = new THREE.Group(); // root group — will hold model or fallback
    this.mesh.name = this.name;
    this.mesh.position.y = 0;
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
      this._animPartMap = new Map();
      model.traverse((o) => {
        if (o.name) this._animPartMap.set(o.name, o);
      });
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
          // Play walk animation
          if (this._animWalk && this._modelGroup) {
            applyAnimation(this._animWalk, animDuration, this._modelGroup, t, this._animPartMap);
          }
        } else {
          // Idle — play breathing
          if (this._animIdle && this._modelGroup) {
            applyAnimation(this._animIdle, animDuration, this._modelGroup, t, this._animPartMap);
          }
        }
        break;

      case 'chatting':
        this._updateDialogue();
        // Play idle animation
        if (this._animIdle && this._modelGroup) {
          applyAnimation(this._animIdle, animDuration, this._modelGroup, t, this._animPartMap);
        }
        break;

      case 'seeking_player':
        this._moveSeekPlayer(playerPos);
        // Play walk animation
        if (this._animWalk && this._modelGroup) {
          applyAnimation(this._animWalk, animDuration, this._modelGroup, t, this._animPartMap);
        }
        break;
    }

    if (this.state === 'chatting') {
      this._chatTimer -= dt;
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
        applyAnimation(this._animIdle, this._animDuration || 2.5, this._modelGroup, t, this._animPartMap);
      }
      return;
    }

    const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    dir.y = 0;
    const angle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.y = angle;
    this.mesh.position.addScaledVector(dir.normalize(), SEEK_SPEED);
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
    if (this._chatIndex >= this._chatLines.length) return;

    this._chatTimer -= 0.016;
    if (this._chatTimer <= 0 && this._chatIndex < this._chatLines.length) {
      const line = this._chatLines[this._chatIndex];
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
      originSignature: this.originSignature, state: this.state,
      affection: this.affection, mood: this.mood, trust: this.trust,
      memories: this.memories, milestones: { ...this._milestones },
    };
  }

  _syncLabel() {
    const allTags = this.affection >= 5
      ? [...this.tags, `亲密度${this.affection}`]
      : this.tags;
    this._label.update(this.name, allTags);
  }
}
