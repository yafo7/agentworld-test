import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildModelFromJson } from '../../../engine/model/builder.js';
import { evaluateMotion, applyMotionDeltas } from '../../../engine/animation/player.js';
import { getRuntime } from '../../../backend/runtimeLoader.js';

/**
 * Simple NPC entity — no AI, no autonomous behavior.
 * Commands are called externally by dialogue/construction systems.
 *
 * Animation: idle (呼吸摇摆), run (奔跑), construct (上下挥舞卷轴)
 */
export class ArchitectNPC {
  constructor() {
    // Placeholder: blue capsule
    const geo = new THREE.CapsuleGeometry(0.4, 0.8, 4, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6688cc });
    this._placeholder = new THREE.Mesh(geo, mat);
    this._placeholder.position.set(0, 1.0, 0);
    this._placeholder.name = 'ArchitectPlaceholder';

    this.mesh = new THREE.Group();
    this.mesh.name = 'ArchitectNPC';
    this.mesh.add(this._placeholder);

    // Animation
    this._modelGroup = null;
    this._animPlans = {};
    this._animState = 'idle';
    this._animTime = 0;
    this._basePoseMap = null;

    // Movement
    this._speed = 3.5;
    this._targetPosition = null;
    this._lockedFacing = null;
    this._originPosition = new THREE.Vector3();

    // Wander behavior
    this._wanderEnabled = false;
    this._wanderSpeed = 2.0;
    this._wanderTimer = 0;
    this._wanderInterval = 3.0;
    this._wanderBounds = null; // { minX, maxX, minZ, maxZ }

    // Follow behavior
    this._followEnabled = false;
    this._followTarget = null; // direct reference to target mesh/group
    this._followDistance = 3.0;
    this._followSpeed = 6.0;

    // Physics
    this._body = null;
    this._collider = null;
    this._physicsWorld = null;

    // Chop behavior
    this._chopTreeEntity = null;
    this._chopAnimTimer = 0;
    this._chopOnDone = null;

    // Loaded model metadata (for API refine)
    this._originalModelJson = null;
  }

  // ── Position ──

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
  }

  setOrigin(x, y, z) {
    this._originPosition.set(x, y, z);
  }

  /**
   * Create Rapier kinematic body + capsule collider for physics collision.
   * @param {import('../../../engine/physics/PhysicsWorld.js').PhysicsWorld} physicsWorld
   */
  initPhysics(physicsWorld) {
    this._physicsWorld = physicsWorld;
    const p = this.mesh.position;
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(p.x, p.y, p.z)
      .lockRotations();
    this._body = physicsWorld.world.createRigidBody(bodyDesc);

    // Small capsule (~2m tall)
    const radius = 0.4;
    const halfHeight = 0.6;
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setTranslation(0, halfHeight + radius, 0);
    this._collider = physicsWorld.world.createCollider(colliderDesc, this._body);
  }

  getPosition() {
    return this.mesh.position.clone();
  }

  // ── Model loading ──

  /**
   * Build model from JSON and replace placeholder.
   * @param {object} modelJson - voxel model JSON
   */
  loadModelFromJson(modelJson) {
    if (this._modelGroup) return;
    try {
      const model = buildModelFromJson(modelJson);
      if (!model) return;

      // Scale to target height ~3.0m
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y;
      const targetHeight = 3.0;
      const scale = targetHeight / Math.max(h, 0.01);
      model.scale.setScalar(scale);

      // Ground-align
      model.position.y = -box.min.y * scale;

      // Remove placeholder
      this.mesh.remove(this._placeholder);

      this.mesh.add(model);
      this._modelGroup = model;
      this._originalModelJson = modelJson;
      console.log('[ArchitectNPC] Model loaded');
    } catch (e) {
      console.warn('[ArchitectNPC] Model build failed:', e.message);
    }
  }

  /**
   * Register an animation plan by name.
   * @param {string} name - 'idle' | 'run' | 'construct'
   * @param {object} plan - motion plan (raw or studio wrapper)
   */
  loadAnimation(name, plan) {
    const normalized = this._normalizePlan(plan);
    if (normalized) {
      this._animPlans[name] = normalized;
      console.log('[ArchitectNPC] Animation loaded:', name);
    }
  }

  _normalizePlan(raw) {
    if (!raw) return null;
    // Already runtime format (top-level _duration or bone keys)
    if (raw._duration !== undefined || raw.body !== undefined || raw.head !== undefined) return raw;
    // Studio wrapper format: { motionPlan: {...}, duration: N, ... }
    if (raw.motionPlan) {
      const plan = { ...raw.motionPlan };
      plan._duration = raw.duration || 2;
      plan._loop = true;
      return plan;
    }
    return raw;
  }

  // ── Movement commands ──

  walkTo(targetX, targetZ, speed = 3.5) {
    this._speed = speed;
    this._targetPosition = new THREE.Vector3(targetX, 0, targetZ);
    this._setAnimState(this._animPlans.walk ? 'walk' : 'run');
  }

  stopWalking() {
    this._targetPosition = null;
    if (this._animState === 'run' || this._animState === 'walk') this._setAnimState('idle');
  }

  lockFacing(worldX, worldZ) {
    this._lockedFacing = new THREE.Vector3(worldX, 0, worldZ);
  }

  unlockFacing() {
    this._lockedFacing = null;
  }

  // ── Wander behavior ──

  enableWander(speed = 2.0, bounds = null) {
    this._wanderEnabled = true;
    this._wanderSpeed = speed;
    this._wanderBounds = bounds;
    this._wanderTimer = 0;
    this._pickWanderTarget();
    this._setAnimState(this._animPlans.walk ? 'walk' : 'run');
  }

  disableWander() {
    this._wanderEnabled = false;
    this._targetPosition = null;
    this._setAnimState('idle');
  }

  _pickWanderTarget() {
    const cx = this._originPosition.x;
    const cz = this._originPosition.z;
    const range = 8;
    const minX = this._wanderBounds ? this._wanderBounds.minX : cx - range;
    const maxX = this._wanderBounds ? this._wanderBounds.maxX : cx + range;
    const minZ = this._wanderBounds ? this._wanderBounds.minZ : cz - range;
    const maxZ = this._wanderBounds ? this._wanderBounds.maxZ : cz + range;
    const tx = minX + Math.random() * (maxX - minX);
    const tz = minZ + Math.random() * (maxZ - minZ);
    this.walkTo(tx, tz, this._wanderSpeed);
  }

  // ── Follow behavior ──

  followTarget(targetMesh, distance = 3.0, speed = 6.0) {
    this._followEnabled = true;
    this._followTarget = targetMesh;
    this._followDistance = distance;
    this._followSpeed = speed;
    this._targetPosition = null;
  }

  stopFollow() {
    this._followEnabled = false;
    this._followTarget = null;
    this._targetPosition = null;
    this._setAnimState('idle');
  }

  // ── Chop tree behavior ──

  chopTree(treeEntity, onDone) {
    this._followEnabled = false;
    this._chopTreeEntity = treeEntity;
    this._chopOnDone = onDone || null;
    // Walk to tree edge (not center) to avoid clipping
    const tp = treeEntity.mesh.position;
    const box = new THREE.Box3().setFromObject(treeEntity.mesh);
    const size = new THREE.Vector3(); box.getSize(size);
    const halfW = Math.max(size.x, size.z) * 0.5 + 1.2; // stand 1.2m from edge
    const dx = this.mesh.position.x - tp.x;
    const dz = this.mesh.position.z - tp.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    const edgeX = tp.x + (dx / d) * halfW;
    const edgeZ = tp.z + (dz / d) * halfW;
    this.walkTo(edgeX, edgeZ, 4.0);
  }

  isChopping() {
    return !!this._chopTreeEntity;
  }

  /** Set callback for run dust particles. Called with (position) each ~0.15s while running. */
  onRunDust(cb) { this._onRunDust = cb; }

  playAnimation(name) {
    if (this._animPlans[name]) {
      this._setAnimState(name);
    }
  }

  // ── Update ──

  update(dt) {
    dt = Math.min(dt, 0.05);

    // Movement
    this._updateMovement(dt);

    // Facing direction
    this._updateFacing();

    // Animation
    this._updateAnimation(dt);

    // Running dust particles (spawned externally via callback)
    if ((this._animState === 'run' || this._animState === 'walk') && this._onRunDust) {
      this._dustTimer = (this._dustTimer || 0) + dt;
      if (this._dustTimer >= 0.15) {
        this._dustTimer = 0;
        this._onRunDust(this.mesh.position);
      }
    }

    // Sync Rapier body
    if (this._body) {
      const p = this.mesh.position;
      this._body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    }
  }

  _updateMovement(dt) {
    // Chop behavior: walk to tree, then play chop animation
    if (this._chopTreeEntity) {
      if (this._targetPosition) {
        // Still walking to tree — handled by normal walk logic below
      } else {
        // Arrived at tree — play chop animation (only once)
        const tp = this._chopTreeEntity.mesh.position;
        this.lockFacing(tp.x, tp.z);
        if (this._animState !== 'chop') this.playAnimation('chop');
        this._chopAnimTimer += dt;
        if (this._chopAnimTimer >= 3.0 && this._chopOnDone) {
          const cb = this._chopOnDone;
          this._chopTreeEntity = null;
          this._chopAnimTimer = 0;
          this._chopOnDone = null;
          this.unlockFacing();
          this._setAnimState('idle');
          cb();
        }
        return;
      }
    }

    // Follow behavior: direct chase pattern (same as Pet.js)
    if (this._followEnabled && this._followTarget) {
      const tp = this._followTarget.position;
      const dist = this.mesh.position.distanceTo(tp);
      if (dist > this._followDistance) {
        const dir = new THREE.Vector3().subVectors(tp, this.mesh.position);
        dir.y = 0;
        this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        this.mesh.position.addScaledVector(dir.normalize(), this._followSpeed * dt);
        if (this._animState !== 'run') this._setAnimState('run');
      } else {
        if (this._animState !== 'idle') this._setAnimState('idle');
      }
      return;
    }

    // Wander: re-pick target periodically
    if (this._wanderEnabled) {
      this._wanderTimer += dt;
      if (this._wanderTimer >= this._wanderInterval && !this._targetPosition) {
        this._wanderTimer = 0;
        this._wanderInterval = 2.5 + Math.random() * 3.5;
        this._pickWanderTarget();
      }
    }

    if (!this._targetPosition) return;

    const dir = new THREE.Vector3().subVectors(this._targetPosition, this.mesh.position);
    dir.y = 0;
    const dist = dir.length();

    if (dist < 0.2) {
      this.mesh.position.x = this._targetPosition.x;
      this.mesh.position.z = this._targetPosition.z;
      this._targetPosition = null;
      this._setAnimState('idle');
    } else {
      const step = this._speed * dt;
      this.mesh.position.addScaledVector(dir.normalize(), Math.min(step, dist));
      if (this._animState !== (this._animPlans.walk ? 'walk' : 'run')) {
        this._setAnimState(this._animPlans.walk ? 'walk' : 'run');
      }
    }
  }

  _updateFacing() {
    let target = null;
    if (this._lockedFacing) {
      target = this._lockedFacing;
    } else if (this._targetPosition) {
      target = this._targetPosition;
    }
    if (!target) return;

    const dx = target.x - this.mesh.position.x;
    const dz = target.z - this.mesh.position.z;
    if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return;
    const angle = Math.atan2(dx, dz);
    // Smooth rotation
    const currentY = this.mesh.rotation.y;
    let diff = angle - currentY;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.mesh.rotation.y += diff * 0.25;
    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = 0;
  }

  _updateAnimation(dt) {
    const plan = this._animPlans[this._animState];
    if (!plan || !this._modelGroup) {
      this._fallbackAnimation(dt);
      return;
    }

    this._animTime += dt;
    const duration = plan._duration || 1;
    const loop = plan._loop !== false;
    const t = loop ? this._animTime % duration : Math.min(this._animTime, duration);

    const runtime = getRuntime();
    if (runtime) {
      try {
        const deltas = evaluateMotion(plan, duration, this._modelGroup, t);
        this._basePoseMap = applyMotionDeltas(deltas, this._modelGroup, this._basePoseMap);
      } catch (err) {
        console.warn('[ArchitectNPC] Animation failed:', err.message);
        this._fallbackAnimation(dt);
      }
    } else {
      this._fallbackAnimation(dt);
    }
  }

  _fallbackAnimation(dt) {
    this._animTime += dt;
    if (!this._modelGroup) return;

    // Client-side fallback: simple breathing sway or run bounce
    if (this._animState === 'run') {
      const y = Math.abs(Math.sin(this._animTime * 8)) * 0.1;
      this._modelGroup.position.y = (this._modelGroup.userData._baseY || 0) + y;
    } else if (this._animState === 'construct') {
      // Wave scroll: arm-like bobbing
      const y = Math.abs(Math.sin(this._animTime * 5)) * 0.12;
      this._modelGroup.position.y = (this._modelGroup.userData._baseY || 0) + y;
      this._modelGroup.rotation.z = Math.sin(this._animTime * 5) * 0.05;
    } else {
      // Idle: breathe
      const baseScale = this._modelGroup.userData._baseScale || this._modelGroup.scale.x;
      const s = baseScale * (1 + Math.sin(this._animTime * 2) * 0.015);
      this._modelGroup.scale.setScalar(s);
      this._modelGroup.position.y = this._modelGroup.userData._baseY || 0;
      this._modelGroup.rotation.z = 0;
    }
  }

  _setAnimState(state) {
    if (!this._animPlans[state]) return;
    this._animState = state;
    this._animTime = 0;
    this._resetToBasePose();
  }

  _resetToBasePose() {
    if (!this._basePoseMap || !this._modelGroup) return;
    for (const [name, base] of this._basePoseMap) {
      const obj = this._modelGroup.getObjectByName(name);
      if (!obj) continue;
      obj.position.copy(base.position);
      obj.rotation.copy(base.rotation);
      obj.scale.copy(base.scale);
    }
  }
}
