import * as THREE from 'three';
import { isKeyDown, consumeKeyPress } from '../input/keyboard.js';
import { loadModel } from '../model/loader.js';
import { loadAnimationPlan } from '../animation/planLoader.js';
import { applyAnimation } from '../animation/player.js';
import { getRuntime } from '../../backend/runtimeLoader.js';

/**
 * Player entity — loads a 3D model asynchronously, falling back to a blue cone placeholder.
 * Supports idle / walk / jump animations and spacebar jumping.
 * WASD movement is camera-relative: W always moves in the camera's look direction,
 * A/D strafe left/right relative to camera view.
 */
export class Player {
  constructor() {
    // Placeholder: blue cone
    const geometry = new THREE.ConeGeometry(0.5, 1.5, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x4488ff });
    this._placeholder = new THREE.Mesh(geometry, material);
    this._placeholder.position.set(0, 0.75, 0);
    this._placeholder.name = 'PlayerPlaceholder';

    this.mesh = new THREE.Group();
    this.mesh.name = 'Player';
    this.mesh.add(this._placeholder);

    this._speed = 5;
    this.heldItem = null;
    this._modelLoaded = false;

    // Model + animation refs
    this._model = null;
    this._animPlans = {};
    this._animState = 'idle';
    this._animTime = 0;
    this._basePoseMap = null;

    // Jump physics
    this._velocityY = 0;
    this._isJumping = false;
    this._jumpSpeed = 7;
    this._gravity = 18;
    this._groundY = 0;
  }

  /**
   * Async load a voxel model to replace the placeholder cone.
   * @param {string} modelPath — e.g. 'generated/models/player-nezha.json'
   */
  async loadModel(modelPath) {
    if (this._modelLoaded) return;
    const model = await loadModel(modelPath);
    if (!model) {
      console.warn('[Player] Model load failed, keeping placeholder');
      return;
    }

    // Remove placeholder
    this.mesh.remove(this._placeholder);
    this._placeholder.geometry.dispose();
    this._placeholder.material.dispose();

    // Scale model to target height (~3.0, double the original placeholder)
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetHeight = 3.0;
    const scale = targetHeight / Math.max(size.y, 0.01);
    model.scale.setScalar(scale);

    // Shift so bottom touches ground
    const minY = box.min.y * scale;
    model.position.y = -minY;

    this.mesh.add(model);
    this._model = model;
    this._modelLoaded = true;
    this._basePoseMap = null;
    // Store base transform for fallback animation
    this._model.userData._baseScale = model.scale.x;
    this._model.userData._baseY = model.position.y;
    console.log('[Player] Model loaded:', modelPath);
  }

  /**
   * Async load animation plans.
   * @param {object} paths — { idle, walk, jump }
   */
  async loadAnimations(paths) {
    const entries = Object.entries(paths);
    for (const [name, path] of entries) {
      try {
        const plan = await loadAnimationPlan(path);
        if (plan) {
          this._animPlans[name] = plan;
          console.log('[Player] Animation loaded:', name);
        }
      } catch (e) {
        console.warn('[Player] Failed to load animation', name, e.message);
      }
    }
  }

  /**
   * @param {number} dt - delta time in seconds
   * @param {number} cameraAngle - horizontal angle from ThirdPersonCamera
   */
  update(dt, cameraAngle) {
    const moveDir = new THREE.Vector3();

    // Camera look direction
    const forwardX = -Math.cos(cameraAngle);
    const forwardZ = -Math.sin(cameraAngle);
    // Right vector = forward × up (Y-up right-handed)
    const rightX = Math.sin(cameraAngle);
    const rightZ = -Math.cos(cameraAngle);

    if (isKeyDown('w')) { moveDir.x += forwardX; moveDir.z += forwardZ; }
    if (isKeyDown('s')) { moveDir.x -= forwardX; moveDir.z -= forwardZ; }
    if (isKeyDown('a')) { moveDir.x -= rightX; moveDir.z -= rightZ; }
    if (isKeyDown('d')) { moveDir.x += rightX; moveDir.z += rightZ; }

    const isMoving = moveDir.length() > 0;

    if (isMoving) {
      moveDir.normalize();
      this.mesh.position.addScaledVector(moveDir, this._speed * dt);

      // Face movement direction
      const angle = Math.atan2(moveDir.x, moveDir.z);
      this.mesh.rotation.y = angle;
    }

    // Jump input
    if (consumeKeyPress(' ') && !this._isJumping) {
      this._velocityY = this._jumpSpeed;
      this._isJumping = true;
      this._setAnimState('jump');
    }

    // Jump physics
    if (this._isJumping) {
      this._velocityY -= this._gravity * dt;
      this.mesh.position.y += this._velocityY * dt;
      if (this.mesh.position.y <= this._groundY) {
        this.mesh.position.y = this._groundY;
        this._isJumping = false;
        this._velocityY = 0;
      }
    }

    // Animation state machine
    if (!this._isJumping) {
      if (isMoving && this._animState !== 'walk') {
        this._setAnimState('walk');
      } else if (!isMoving && this._animState !== 'idle') {
        this._setAnimState('idle');
      }
    }

    // Update animation
    this._updateAnimation(dt);

    // Held item follows player
    if (this.heldItem) {
      const offset = new THREE.Vector3(0, 0.8, 0);
      this.heldItem.mesh.position.copy(this.mesh.position).add(offset);
    }
  }

  _setAnimState(state) {
    if (!this._animPlans[state]) return;
    this._animState = state;
    this._animTime = 0;
  }

  _updateAnimation(dt) {
    const plan = this._animPlans[this._animState];
    if (!plan || !this._model) return;

    this._animTime += dt;
    const duration = plan._duration || 1;
    const loop = plan._loop !== false;
    const t = loop ? this._animTime % duration : Math.min(this._animTime, duration);

    const runtime = getRuntime();
    if (runtime) {
      // Voxel Runtime path
      try {
        this._basePoseMap = applyAnimation(plan, duration, this._model, t, this._basePoseMap);
      } catch (err) {
        console.warn('[Player] applyAnimation failed:', err.message);
        this._fallbackAnimation(dt);
      }
    } else {
      // Fallback client-side animation when runtime is unavailable
      this._fallbackAnimation(dt);
    }
  }

  _fallbackAnimation(dt) {
    this._animTime += dt;
    if (!this._model) return;

    const baseScale = this._model.userData._baseScale || this._model.scale.x;
    const baseY = this._model.userData._baseY || 0;

    if (this._animState === 'walk') {
      // Walk bounce
      const y = Math.abs(Math.sin(this._animTime * 6)) * 0.08;
      this._model.position.y = baseY + y;
      // Subtle arm swing via rotation of the whole model (simple approximation)
      this._model.rotation.z = Math.sin(this._animTime * 6) * 0.03;
    } else if (this._animState === 'jump') {
      // Jump stretch
      const y = Math.max(0, Math.sin(this._animTime * 4)) * 0.3;
      this._model.position.y = baseY + y;
      this._model.rotation.x = -Math.sin(this._animTime * 4) * 0.15;
    } else {
      // Idle breathe
      const s = 1 + Math.sin(this._animTime * 2) * 0.02;
      this._model.scale.setScalar(baseScale * s);
      this._model.position.y = baseY;
      this._model.rotation.x = 0;
      this._model.rotation.z = 0;
    }
  }
}
