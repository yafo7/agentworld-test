import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadModel } from '../model/loader.js';
import { buildModelFromJson } from '../model/builder.js';
import { loadAnimationPlan } from '../animation/planLoader.js';
import { evaluateMotion, applyMotionDeltas } from '../animation/player.js';
import { normalizeAnimationPlan } from '../animation/normalizePlan.js';
import { getRuntime } from '../runtime/runtimeProvider.js';
import { ParticleSystem } from '../animation/particles.js';
import { worldToGridCoordinates } from '../world/terrain.js';
import {
  VectorSpringSimulator,
  RelativeSpringSimulator,
  getSignedAngleBetweenVectors,
  applyVectorMatrixXZ,
  UP,
} from '../utils/spring.js';

/**
 * Player entity — loads a 3D model asynchronously, falling back to a blue cone placeholder.
 * Supports idle / run / jump / flight animations.
 *
 * Movement is aligned with voxel-game/Character:
 * - W always moves in the camera's look direction.
 * - S walks backward relative to the camera.
 * - A/D turn the character toward camera-left / camera-right and walk forward.
 * - Velocity and rotation are smoothed via spring simulators.
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
    this._scene = null; // set externally for particle emitters

    this._speed = 8;
    this._runSpeed = 12;
    this.heldItem = null;
    this._modelLoaded = false;

    // Model + animation refs
    this._model = null;
    this._animPlans = {};
    this._animState = 'idle';
    this._animTime = 0;
    this._basePoseMap = null;
    // One-shot animation overlay (e.g. wave, fan spark)
    this._oneShotPlan = null;
    this._oneShotTime = 0;
    this._oneShotDuration = 0;
    this._oneShotLoop = false;

    // Locomotion actions: H toggles flight, Space jumps while grounded.
    this._isFlying = false;
    this._flightAllowed = true;
    this._flySpeed = 8;
    this._flySpeedVertical = 5;
    this._jumpSpeed = 6.4;
    this._groundY = 0;

    // Spring-based movement / rotation (voxel-game style)
    // Lower mass / damping = snappier response, less sticky start/stop.
    this.orientation = new THREE.Vector3(0, 0, 1);
    this.orientationTarget = new THREE.Vector3(0, 0, 1);
    this.velocity = new THREE.Vector3();
    this.velocityTarget = new THREE.Vector3();
    this.velocitySimulator = new VectorSpringSimulator(60, 10, 0.4);
    this.rotationSimulator = new RelativeSpringSimulator(60, 1, 0.1);
    this._turnMultiplier = 8; // very fast turning for small arc radius

    // Scratch
    this._flatView = new THREE.Vector3();
    this._localDir = new THREE.Vector3();
    this._moveVector = new THREE.Vector3();

    // Rapier KCC physics
    this._physicsWorld = null;
    this._body = null;
    this._collider = null;
    this._controller = null;
    this._verticalVel = 0;
    this._grounded = false;

    // Dialogue lock (freeze player facing NPC)
    this._locked = false;
    this._lockTarget = null;

    // Terrain layout for water checks only (not collision)
    this._terrainCx = 0;
    this._terrainCz = 0;
    this._terrainSize = 0;
    this._terrainLayout = null;
    this._terrainConstraintEnabled = true;
  }

  /**
   * Initialize Rapier kinematic character controller.
   * Body origin is at feet; capsule collider is shifted up.
   * Autostep and snap-to-ground are disabled (same as voxel-game — causes sinking).
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physicsWorld
   * @param {number} [spawnX=0]
   * @param {number} [spawnY=0]
   * @param {number} [spawnZ=0]
   */
  initPhysics(physicsWorld, spawnX = 0, spawnY = 0, spawnZ = 0) {
    this._physicsWorld = physicsWorld;

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnX, spawnY, spawnZ)
      .lockRotations();
    this._body = physicsWorld.world.createRigidBody(bodyDesc);

    // Capsule: ~3m total height (halfHeight=1.0 shaft + radius=0.5 top + radius=0.5 bottom)
    const halfHeight = 1.0;
    const radius = 0.5;
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setTranslation(0, halfHeight + radius, 0);
    this._collider = physicsWorld.world.createCollider(colliderDesc, this._body);

    this._controller = physicsWorld.world.createCharacterController(0.01);
    this._controller.setApplyImpulsesToDynamicBodies(true);
    this._controller.setCharacterMass(80);
    this._controller.enableAutostep(0.45, 0.2, true);
    this._controller.enableSnapToGround(0.3);

    // Sync mesh to initial body position
    this.mesh.position.set(spawnX, spawnY, spawnZ);
  }

  /**
   * Register terrain layout for grid-based water checks.
   * Water is terrain, not a physics entity.
   * @param {number} centerX
   * @param {number} centerZ
   * @param {number} gridSize
   * @param {string[][]} layout
   */
  setTerrainLayout(centerX, centerZ, gridSize, layout) {
    this._terrainCx = centerX;
    this._terrainCz = centerZ;
    this._terrainSize = gridSize;
    this._terrainLayout = layout;
  }

  setWaterTraversalCells(cells = []) {
    this._waterTraversalCells = new Set(
      [...cells].map(cell => typeof cell === 'string' ? cell : `${cell.gridX},${cell.gridZ}`),
    );
  }

  setTerrainConstraintEnabled(enabled) {
    this._terrainConstraintEnabled = Boolean(enabled);
  }

  setFlightAllowed(allowed) {
    this._flightAllowed = Boolean(allowed);
    if (!this._flightAllowed && this._isFlying) this._setFlightMode(false);
  }

  teleport(position, {
    orientation = null,
    groundY = position?.y ?? this._groundY,
  } = {}) {
    if (!position) return false;
    this._groundY = Number.isFinite(groundY) ? groundY : 0;
    this._isFlying = false;
    this._verticalVel = 0;
    this._grounded = true;
    this.velocity.set(0, 0, 0);
    this.velocityTarget.set(0, 0, 0);
    this.velocitySimulator.position.set(0, 0, 0);
    this.velocitySimulator.velocity.set(0, 0, 0);
    this.velocitySimulator.target.set(0, 0, 0);
    this.rotationSimulator.position = 0;
    this.rotationSimulator.velocity = 0;
    this.rotationSimulator.target = 0;

    this.mesh.position.set(position.x, this._groundY, position.z);
    if (orientation) {
      this.orientation.set(orientation.x, 0, orientation.z);
      if (this.orientation.lengthSq() < 0.001) this.orientation.set(0, 0, 1);
      this.orientation.normalize();
      this.orientationTarget.copy(this.orientation);
      this.mesh.lookAt(
        this.mesh.position.x + this.orientation.x,
        this.mesh.position.y,
        this.mesh.position.z + this.orientation.z,
      );
    }

    const next = {
      x: this.mesh.position.x,
      y: this.mesh.position.y,
      z: this.mesh.position.z,
    };
    this._body?.setTranslation(next, true);
    this._body?.setNextKinematicTranslation(next);
    this._setAnimState('idle');
    return true;
  }

  /**
   * Check if a world position falls on a water cell.
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {boolean}
   */
  _isInWater(worldX, worldZ) {
    if (!this._terrainConstraintEnabled || !this._terrainLayout) return false;
    const g = worldToGridCoordinates(worldX, worldZ, this._terrainCx, this._terrainCz, this._terrainSize);
    if (g.gridX < 0 || g.gridX >= this._terrainSize || g.gridZ < 0 || g.gridZ >= this._terrainSize) return true;
    if (this._waterTraversalCells?.has(`${g.gridX},${g.gridZ}`)) return false;
    return this._terrainLayout[g.gridZ]?.[g.gridX] === 'water';
  }

  /**
   * Freeze player facing a world point (for dialogue).
   * @param {number} worldX
   * @param {number} worldZ
   */
  lockTo(worldX, worldZ) {
    this._locked = true;
    this._lockTarget = new THREE.Vector3(worldX, 0, worldZ);
  }

  /** Release dialogue lock. */
  unlock() {
    this._locked = false;
    this._lockTarget = null;
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

    this._installModel(model, {
      targetHeight: 3,
      modelJson: model.userData?.modelJson || null,
    });
    console.log('[Player] Model loaded:', modelPath);
  }

  /**
   * Replace the visible player with a model built from runtime JSON.
   * Animation plans remain attached to the player and continue targeting the
   * primary model's preserved node names after refine or mount.
   */
  replaceModelFromJson(modelJson, {
    targetHeight = 3,
    preserveCurrentTransform = true,
  } = {}) {
    try {
      const model = buildModelFromJson(modelJson);
      this._installModel(model, {
        targetHeight,
        preserveCurrentTransform,
        modelJson,
      });
      return true;
    } catch (error) {
      console.warn('[Player] Model replacement failed:', error.message);
      return false;
    }
  }

  getModelJson() {
    return this._currentModelJson || this._model?.userData?.modelJson || null;
  }

  _installModel(model, {
    targetHeight = 3,
    preserveCurrentTransform = false,
    modelJson = null,
  } = {}) {
    if (!model) return false;

    const previousModel = this._model;
    const previousTransform = previousModel
      ? {
          scale: previousModel.userData?._baseScale || previousModel.scale.x,
          y: previousModel.userData?._baseY ?? previousModel.position.y,
        }
      : null;

    this._cleanupEmitters();
    this._oneShotPlan = null;
    this._oneShotTime = 0;
    this._oneShotDuration = 0;
    if (previousModel) this.mesh.remove(previousModel);

    if (this._placeholder?.parent === this.mesh) {
      this.mesh.remove(this._placeholder);
      this._placeholder.geometry.dispose();
      this._placeholder.material.dispose();
    }

    if (preserveCurrentTransform && previousTransform) {
      model.scale.setScalar(previousTransform.scale);
      model.position.y = previousTransform.y;
    } else {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = targetHeight / Math.max(size.y, 0.01);
      model.scale.setScalar(scale);
      model.position.y = -box.min.y * scale;
    }

    model.userData._baseScale = model.scale.x;
    model.userData._baseY = model.position.y;
    this.mesh.add(model);
    this._model = model;
    this._modelLoaded = true;
    this._currentModelJson = modelJson || model.userData?.modelJson || null;
    this._basePoseMap = null;
    this._animTime = 0;
    return true;
  }

  /**
   * Normalize a studio animation plan to the runtime-expected format.
   * Studio format: { motionPlan: {...}, duration: N, ... }
   * Runtime expects: { _duration: N, _loop: bool, boneKey: {...}, ... } at top level.
   */
  _normalizePlan(raw, defaults = {}) {
    return normalizeAnimationPlan(raw, {
      duration: defaults.duration || 2,
      loop: defaults.loop !== undefined ? defaults.loop : true,
      model: this._model,
    });
  }

  /**
   * Async load a single animation plan by name.
   * @param {string} name — e.g. 'wave_left', 'fan_spark'
   * @param {string} path — e.g. 'generated/animations/nailong_wave_left.json'
   * @param {object} [defaults] — { duration, loop }
   */
  async loadAnimation(name, path, defaults = {}) {
    try {
      const raw = await loadAnimationPlan(path);
      const plan = this._normalizePlan(raw, defaults);
      if (plan) {
        this._animPlans[name] = plan;
        console.log('[Player] Animation loaded:', name);
      }
    } catch (e) {
      console.warn('[Player] Failed to load animation', name, e.message);
    }
  }

  /**
   * Trigger a one-shot animation that plays once then returns to previous state.
   * @param {string} name — animation name in _animPlans
   * @param {number} [duration=2] — playback duration in seconds
   * @param {boolean} [loop=false]
   */
  playOneShot(name, duration = null, loop = false) {
    const plan = this._animPlans[name];
    if (!plan) {
      console.warn('[Player] One-shot animation not found:', name);
      return;
    }
    this._oneShotPlan = plan;
    this._oneShotTime = 0;
    this._oneShotDuration = duration || plan._duration || 2;
    this._oneShotLoop = loop;

    // Setup particle emitters if plan has emit tracks (3d-generate pattern)
    this._cleanupEmitters();
    if (this._scene && this._model) {
      this._particleSystem = new ParticleSystem(this._scene);
      this._particleSystem.setup(plan, this._model);
    }

    console.log('[Player] One-shot:', name, 'duration:', this._oneShotDuration);
  }

  _cleanupEmitters() {
    if (this._particleSystem) {
      this._particleSystem.dispose();
      this._particleSystem = null;
    }
  }

  /**
   * Async load animation plans.
   * @param {object} paths — { idle, walk, jump }
   */
  async loadAnimations(paths) {
    const entries = Object.entries(paths);
    for (const [name, path] of entries) {
      try {
        const raw = await loadAnimationPlan(path);
        const plan = this._normalizePlan(raw);
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
   * @param {Input} input - unified input state
   * @param {ThirdPersonCamera} camera - camera rig (supplies yaw/viewVector)
   */
  update(dt, input, camera) {
    if (!input || !camera) return;

    // ---- Locked mode (dialogue): freeze movement, face NPC, play idle ----
    if (this._locked && this._lockTarget) {
      const dir = new THREE.Vector3().subVectors(this._lockTarget, this.mesh.position);
      dir.y = 0;
      if (dir.lengthSq() > 0.001) {
        this.mesh.lookAt(
          this.mesh.position.x + dir.x,
          this.mesh.position.y,
          this.mesh.position.z + dir.z
        );
      }
      if (this._oneShotPlan) {
        this._updateOneShot(dt);
      } else {
        if (this._animState !== 'idle') this._setAnimState('idle');
        this._updateAnimation(dt);
      }
      return;
    }

    const up = input.isDown('KeyW');
    const down = input.isDown('KeyS');
    const left = input.isDown('KeyA');
    const right = input.isDown('KeyD');
    const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');

    if (this._flightAllowed && input.justPressed('KeyH')) {
      this._setFlightMode(!this._isFlying);
    }
    if (!this._isFlying && input.justPressed('Space') && this._grounded) {
      this._verticalVel = this._jumpSpeed;
      this._grounded = false;
      this._setAnimState('jump');
    }

    // Camera view vector on the horizontal plane
    this._flatView.set(-Math.sin(camera.yaw), 0, -Math.cos(camera.yaw));

    // Local movement direction: W=+z, S=-z, A=+x, D=-x (voxel-game convention)
    const x = (left ? 1 : 0) + (right ? -1 : 0);
    const z = (up ? 1 : 0) + (down ? -1 : 0);
    this._localDir.set(x, 0, z);
    if (this._localDir.lengthSq() > 0.0001) {
      this._localDir.normalize();
    }

    // Orientation target: rotate local direction by camera view
    if (this._localDir.lengthSq() > 0.0001) {
      this._moveVector.copy(applyVectorMatrixXZ(this._flatView, this._localDir));
      this.orientationTarget.copy(this._moveVector).normalize();
    }

    // Spring rotation toward target orientation (turnMultiplier reduces effective turning radius)
    const angle = getSignedAngleBetweenVectors(this.orientation, this.orientationTarget);
    this.rotationSimulator.target = angle;
    this.rotationSimulator.simulate(dt);
    this.orientation.applyAxisAngle(UP, this.rotationSimulator.position * this._turnMultiplier);
    this.orientation.normalize();

    // Direct velocity response: press = move immediately, release = stop immediately
    const targetSpeed = this._localDir.lengthSq() > 0.0001 ? 1 : 0;
    this.velocity.set(0, 0, targetSpeed);

    // Move forward along current orientation
    const speed = run ? this._runSpeed : this._speed;
    const forward = this.orientation.clone().multiplyScalar(this.velocity.z * speed);

    if (!this._isFlying) {
      // Walking: use KCC for collision resolution (wall sliding, depenetration)
      if (this._controller) {
        let dx = forward.x * dt;
        let dz = forward.z * dt;

        // Pre-validate water: if destination cell is water, block horizontal movement
        const nx = this.mesh.position.x + dx;
        const nz = this.mesh.position.z + dz;
        if (this._isInWater(nx, nz)) {
          dx = 0;
          dz = 0;
        }

        // Manual gravity on kinematic body
        this._verticalVel += -9.81 * dt;

        const desired = { x: dx, y: this._verticalVel * dt, z: dz };
        this._controller.computeColliderMovement(this._collider, desired);
        const corrected = this._controller.computedMovement();
        this._grounded = this._controller.computedGrounded();
        if (this._grounded && this._verticalVel < 0) this._verticalVel = 0;

        const t = this._body.translation();
        const next = { x: t.x + corrected.x, y: t.y + corrected.y, z: t.z + corrected.z };
        this._body.setNextKinematicTranslation(next);
        this.mesh.position.set(next.x, next.y, next.z);
      }
    } else {
      // Flight: bypass KCC entirely, teleport body to match mesh
      this.mesh.position.addScaledVector(forward, dt);
    }

    // Face orientation
    this.mesh.lookAt(
      this.mesh.position.x + this.orientation.x,
      this.mesh.position.y + this.orientation.y,
      this.mesh.position.z + this.orientation.z
    );

    // Flight vertical movement
    if (this._isFlying) {
      // Vertical: Q=up, E=down
      if (input.isDown('KeyQ')) {
        this.mesh.position.y += this._flySpeedVertical * dt;
      }
      if (input.isDown('KeyE')) {
        this.mesh.position.y -= this._flySpeedVertical * dt;
      }
      // Clamp: don't go below ground
      if (this.mesh.position.y < this._groundY) {
        this.mesh.position.y = this._groundY;
      }

      // Keep Rapier body in sync with mesh position (flight bypasses KCC)
      if (this._body) {
        const p = this.mesh.position;
        this._body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      }
    }

    // Animation state machine (one-shot takes priority)
    if (this._oneShotPlan) {
      this._updateOneShot(dt);
    } else if (this._isFlying) {
      if (this._animState !== 'jump') this._setAnimState('jump');
    } else if (!this._grounded || Math.abs(this._verticalVel) > 0.05) {
      if (this._animState !== 'jump') this._setAnimState('jump');
    } else {
      if (this.velocity.z > 0.01) {
        if (this._animState !== 'run') this._setAnimState('run');
      } else if (this.velocity.z <= 0.01 && this._animState !== 'idle') {
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

  _setFlightMode(enabled) {
    this._isFlying = Boolean(enabled);
    this._verticalVel = 0;
    if (this._isFlying) {
      this._setAnimState('jump');
      console.log('[Player] Flight mode ON');
      return;
    }

    this.mesh.position.y = this._groundY;
    this._grounded = true;
    this._setAnimState('idle');
    if (this._body) {
      const position = {
        x: this.mesh.position.x,
        y: this.mesh.position.y,
        z: this.mesh.position.z,
      };
      this._body.setTranslation(position, true);
      this._body.setNextKinematicTranslation(position);
    }
    console.log('[Player] Flight mode OFF');
  }

  _updateOneShot(dt) {
    this._oneShotTime += dt;
    // 3d-generate pattern: evaluateMotion → applyMotionDeltas
    const runtime = getRuntime();
    if (runtime && this._model) {
      try {
        const deltas = evaluateMotion(this._oneShotPlan, this._oneShotDuration, this._model, this._oneShotTime);
        this._basePoseMap = applyMotionDeltas(deltas, this._model, this._basePoseMap);
      } catch (err) {
        console.warn('[Player] One-shot animation failed:', err.message);
      }
    }
    // Tick particle system (3d-generate pattern)
    if (this._particleSystem && this._particleSystem.emitters.length > 0) {
      this._particleSystem.update(dt, this._model);
    }
    // Check if one-shot is done
    if (!this._oneShotLoop && this._oneShotTime >= this._oneShotDuration) {
      this._oneShotPlan = null;
      this._oneShotTime = 0;
      this._animTime = 0;
      this._cleanupEmitters();
      this._resetToBasePose();
      console.log('[Player] One-shot finished');
    }
  }

  _setAnimState(state) {
    if (!this._animPlans[state]) return;
    this._animState = state;
    this._animTime = 0;
    // Reset bones to base pose so previous animation's deltas don't linger
    this._resetToBasePose();
  }

  _resetToBasePose() {
    if (!this._basePoseMap || !this._model) return;
    for (const [name, base] of this._basePoseMap) {
      const obj = this._model.getObjectByName(name);
      if (!obj) continue;
      obj.position.copy(base.position);
      obj.rotation.copy(base.rotation);
      obj.quaternion.copy(base.quaternion);
      obj.scale.copy(base.scale);
    }
  }

  _updateAnimation(dt) {
    // One-shot animations handle themselves via _updateOneShot
    if (this._oneShotPlan) return;

    const plan = this._animPlans[this._animState];
    if (!plan || !this._model) return;

    this._animTime += dt;
    const duration = plan._duration || 1;
    const loop = plan._loop !== false;
    const t = loop ? this._animTime % duration : Math.min(this._animTime, duration);

    const runtime = getRuntime();
    if (runtime) {
      // 3d-generate pattern: evaluateMotion → applyMotionDeltas
      try {
        const deltas = evaluateMotion(plan, duration, this._model, t);
        this._basePoseMap = applyMotionDeltas(deltas, this._model, this._basePoseMap);
      } catch (err) {
        console.warn('[Player] animation failed:', err.message);
        this._fallbackAnimation(dt);
      }
    } else {
      this._fallbackAnimation(dt);
    }
  }

  _fallbackAnimation(dt) {
    this._animTime += dt;
    if (!this._model) return;

    const baseScale = this._model.userData._baseScale || this._model.scale.x;
    const baseY = this._model.userData._baseY || 0;

    if (this._animState === 'run') {
      // Run: faster bounce + stronger arm swing
      const y = Math.abs(Math.sin(this._animTime * 12)) * 0.15;
      this._model.position.y = baseY + y;
      this._model.rotation.z = Math.sin(this._animTime * 12) * 0.06;
    } else if (this._animState === 'walk') {
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
