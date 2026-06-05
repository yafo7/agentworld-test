import * as THREE from 'three';
import { createTagLabel } from '../ui/TagLabel.js';
import { createSpeechBubble } from '../ui/SpeechBubble.js';
import { getPlayerLine } from '../game/gameData.js';

export { PET_CONFIGS, INTIMACY_ITEM_CONFIGS, ENV_POND, ENV_GRASSLAND } from '../game/gameData.js';

const PET_INTERACT_RANGE = 2.8;  // player-pet interaction distance
const PET_SEEK_RANGE = 2.0;      // distance at which seeking pet stops near player
const WANDER_SPEED = 0.03;
const SEEK_SPEED = 0.06;

/** Lerp a hex color toward another. */
function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (g << 8) | b;
}

/**
 * Pet entity — a colored cube with identity, state machine, intimacy, and dialogue.
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

    // ---- visual ----
    this._originalColor = config.color;
    this._currentColor = config.color;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: config.color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 0.5;
    this.mesh.name = this.name;
    this.mesh.visible = false;

    // Labels
    this._label = createTagLabel(this.mesh, []);
    this._syncLabel();
    this._bubble = createSpeechBubble(this.mesh);

    // ---- state machine ----
    this.state = 'wandering';       // wandering | chatting | seeking_player
    this.affection = 0;             // 0–10
    this.mood = 'neutral';
    this.trust = 0;
    this.memories = [];
    this.spawned = false;

    // Intimacy milestones (track which have triggered)
    this._milestones = {};          // { 5: true, 10: true }

    // Dialogue
    this._chatPartner = null;
    this._chatLines = [];           // array of { speaker, text }
    this._chatIndex = 0;
    this._chatTimer = 0;

    // Wander
    this._target = new THREE.Vector3();
    this._seekTarget = new THREE.Vector3();
  }

  // ===================================================================
  // spawn
  // ===================================================================

  spawnAt(position) {
    this.mesh.position.copy(position);
    this.mesh.visible = true;
    this.spawned = true;
    this._label.sprite.visible = true;
    this._pickRandomTarget();
  }

  // ===================================================================
  // movement (called every frame)
  // ===================================================================

  /** @param {THREE.Vector3} playerPos — current player position */
  move(playerPos) {
    if (!this.spawned) return;

    switch (this.state) {
      case 'wandering':
        this._moveWander(playerPos);
        break;
      case 'chatting':
        this._updateDialogue();
        break;
      case 'seeking_player':
        this._moveSeekPlayer(playerPos);
        break;
    }

    // Update chat timer even while wandering (for dialogue cooldown etc.)
    if (this.state === 'chatting') {
      this._chatTimer -= 0.016; // ~60fps dt approximation
    }
  }

  _moveWander(playerPos) {
    // Stop if player is nearby (so they can interact)
    const distToPlayer = this.mesh.position.distanceTo(playerPos);
    if (distToPlayer < PET_INTERACT_RANGE) return; // paused

    const dir = new THREE.Vector3().subVectors(this._target, this.mesh.position);
    if (dir.length() < 0.15) {
      this._pickRandomTarget();
    } else {
      this.mesh.position.addScaledVector(dir.normalize(), WANDER_SPEED);
    }
  }

  _moveSeekPlayer(playerPos) {
    const dist = this.mesh.position.distanceTo(playerPos);
    if (dist < PET_SEEK_RANGE) {
      // Reached player — show dialogue bubble and wait
      if (!this._bubble.isVisible) {
        this._bubble.show(getPlayerLine(this));
      }
      return; // stopped, waiting for player E-key
    }

    // Move toward player
    const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    dir.y = 0;
    this.mesh.position.addScaledVector(dir.normalize(), SEEK_SPEED);
  }

  // ===================================================================
  // dialogue (pet ↔ pet)
  // ===================================================================

  /** Start a conversation with another pet. */
  startChatWith(otherPet, lines) {
    this.state = 'chatting';
    this._chatPartner = otherPet;
    this._chatLines = lines;
    this._chatIndex = 0;
    this._chatTimer = 2.0; // seconds before first line
    this._bubble.hide();
  }

  /** Called externally to check if dialogue is done. */
  get isChatFinished() {
    return this.state === 'chatting' && this._chatIndex >= this._chatLines.length && this._chatTimer <= 0;
  }

  _updateDialogue() {
    if (this._chatIndex >= this._chatLines.length) {
      // All lines shown — wait for timer to expire (handled externally)
      return;
    }

    this._chatTimer -= 0.016;
    if (this._chatTimer <= 0 && this._chatIndex < this._chatLines.length) {
      const line = this._chatLines[this._chatIndex];
      this._bubble.show(`${line.speaker}: ${line.text}`);

      // Also show on partner
      if (this._chatPartner && this._chatPartner._bubble) {
        this._chatPartner._bubble.show(`${line.speaker}: ${line.text}`);
      }

      this._chatIndex++;
      this._chatTimer = 2.5; // next line in 2.5s
    }
  }

  /** End current dialogue and return to wandering. */
  endChat() {
    if (this.state !== 'chatting') return; // guard against double-call
    this._bubble.hide();
    if (this._chatPartner && this._chatPartner._bubble) {
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

  /** Called when player presses E near this pet. Returns what happened. */
  interactWithPlayer() {
    if (this.state === 'seeking_player') {
      // Player-pet max intimacy dialogue
      return { type: 'max_intimacy_dialogue' };
    }

    // Normal interaction: increase affection
    if (this.affection < 10) {
      this.affection++;
      this.trust = Math.min(100, this.trust + 10);
      this.mood = 'happy';
      this.memories.push(`玩家在第${this.affection}次互动时陪伴了它。`);

      // Check milestones
      const milestone = this._checkMilestone();
      return { type: 'affection_up', affection: this.affection, milestone };
    }

    return { type: 'already_max' };
  }

  _checkMilestone() {
    if (this.affection >= 5 && !this._milestones[5]) {
      this._milestones[5] = true;
      this._updateColor(0.3); // warm tint
      return 5;
    }
    if (this.affection >= 10 && !this._milestones[10]) {
      this._milestones[10] = true;
      this._updateColor(0.6); // golden glow
      return 10;
    }
    return null;
  }

  _updateColor(t) {
    this._currentColor = lerpColor(this._originalColor, 0xffdd88, t);
    this.mesh.material.color.set(this._currentColor);
    this._syncLabel();
  }

  // ===================================================================
  // seek player (called periodically by dialogue system)
  // ===================================================================

  /** Returns true if this pet should seek the player now. */
  shouldSeekPlayer() {
    return (
      this.affection >= 10 &&
      this.state === 'wandering' &&
      this._milestones[10] === true
    );
  }

  /** Begin seeking the player. */
  startSeekingPlayer() {
    this.state = 'seeking_player';
    console.log(`[Pet] ${this.name} is seeking the player!`);
  }

  /** Called after player-pet max-intimacy dialogue completes. */
  finishPlayerDialogue() {
    this._bubble.hide();
    this.state = 'wandering';
    this._pickRandomTarget();
    // Mark that this dialogue happened so it doesn't repeat
    // (could add a cooldown, but for demo just let it happen again later)
  }

  // ===================================================================
  // misc
  // ===================================================================

  _pickRandomTarget() {
    const cx = this.mesh.position.x;
    const cz = this.mesh.position.z;
    this._target.set(
      cx + (Math.random() - 0.5) * 6,
      0.5,
      cz + (Math.random() - 0.5) * 6
    );
  }

  getInfo() {
    return {
      name: this.name,
      tags: this.tags,
      personality: this.personality,
      likes: this.likes,
      dislikes: this.dislikes,
      habits: this.habits,
      originSignature: this.originSignature,
      state: this.state,
      affection: this.affection,
      mood: this.mood,
      trust: this.trust,
      memories: this.memories,
      milestones: { ...this._milestones },
    };
  }

  _syncLabel() {
    const allTags = this.affection >= 5
      ? [...this.tags, `亲密度${this.affection}`]
      : this.tags;
    this._label.update(this.name, allTags);
  }
}
