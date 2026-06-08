import * as THREE from 'three';
import { isKeyDown } from '../input/keyboard.js';
import { loadModel, loadAnimationPlan, applyAnimation } from '../ai/modelLoader.js';

/**
 * Player entity — Group with cone fallback, replaced by trainer model.
 * WASD movement relative to camera angle. Can hold one item at a time.
 */
export class Player {
  constructor() {
    // Root group
    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0, 0);
    this.mesh.name = 'Player';

    // Fallback cone
    const geo = new THREE.ConeGeometry(0.5, 1.5, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4488ff });
    this._fallback = new THREE.Mesh(geo, mat);
    this._fallback.position.y = 0.75;
    this.mesh.add(this._fallback);

    // Model loading
    this._modelGroup = null;
    this._animIdle = null;
    this._animWalk = null;
    this._animTime = 0;
    this._animDuration = 2.5;
    this._animPartMap = null;
    this._isMoving = false;
    this._loadModelAndAnim();

    this._speed = 5;
    this.heldItem = null;
  }

  async _loadModelAndAnim() {
    const model = await loadModel('generated/models/trainer.json', null);
    if (model && model !== this._fallback && model !== null) {
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;
      this.mesh.remove(this._fallback);
      this.mesh.add(model);
      this._modelGroup = model;
      this._animPartMap = new Map();
      model.traverse((o) => { if (o.name) this._animPartMap.set(o.name, o); });
      console.log('[Player] Trainer model loaded');
    }

    this._animIdle = await loadAnimationPlan('generated/animations/trainer_idle.json');
    this._animWalk = await loadAnimationPlan('generated/animations/trainer_walk.json');
    if (this._animIdle) this._animDuration = this._animIdle._duration ?? 2.5;
    if (this._animIdle || this._animWalk) console.log('[Player] Trainer animations loaded');
  }

  /**
   * @param {number} dt - delta time in seconds
   * @param {number} cameraAngle - horizontal orbit angle from ThirdPersonCamera
   */
  update(dt, cameraAngle) {
    const moveDir = new THREE.Vector3();

    if (isKeyDown('w')) moveDir.z -= 1;
    if (isKeyDown('s')) moveDir.z += 1;
    if (isKeyDown('a')) moveDir.x -= 1;
    if (isKeyDown('d')) moveDir.x += 1;

    this._isMoving = moveDir.length() > 0;

    if (this._isMoving) {
      moveDir.normalize();
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
      this.mesh.position.addScaledVector(moveDir, this._speed * dt);

      // Face movement direction
      const angle = Math.atan2(moveDir.x, moveDir.z);
      this.mesh.rotation.y = angle;
    }

    // Held item follows
    if (this.heldItem) {
      const offset = new THREE.Vector3(0, 0.8, 0);
      this.heldItem.mesh.position.copy(this.mesh.position).add(offset);
    }

    // Animation
    this._animTime += dt;
    const t = this._animTime % this._animDuration;
    const anim = this._isMoving ? this._animWalk : this._animIdle;
    if (anim && this._modelGroup) {
      applyAnimation(anim, this._animDuration, this._modelGroup, t, this._animPartMap);
    }
  }
}
