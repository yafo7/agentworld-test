import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Third-person camera that follows a target (player).
 *
 * Aligned with voxel-game/CameraRig:
 * - Yaw/pitch naming instead of spherical theta/phi.
 * - Smooth target follow via lerp.
 * - Pitch is decoupled from horizontal distance (fixed XZ radius).
 * - Ground collision clamp so the camera never dips below the ground.
 * - Mouse delta is applied externally by the Input system (pointer lock);
 *   this class no longer listens to drag events.
 * - Scroll wheel zooms.
 */
export class ThirdPersonCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );

    // Orbit parameters
    this.distance = 8;
    this.yaw = 0;          // horizontal orbit angle
    this.pitch = 0.3;      // vertical angle (0 = horizontal, positive = above)

    // Smooth follow
    this.followLerp = 0.12;
    this._targetPos = new THREE.Vector3();
    this._smoothedPos = new THREE.Vector3();
    this._lookOffset = new THREE.Vector3(0, 1.5, 0);

    // Mouse sensitivity (external Input system drives us via applyMouseDelta)
    this.mouseSensitivity = 0.0025;

    // Dialogue lock (interview camera)
    this._locked = false;
    this._lockTarget = null;    // { pos: THREE.Vector3, lookAt: THREE.Vector3 }
    this._targetFov = 75;
    this._fovTweenSpeed = 4.0;
    this._restoreFov = 75;
    this._restoreDistance = 8;
    this._restoreFollowLerp = 0.12;
    this._collisionWorld = null;
    this._collisionExclude = null;
    this._collisionPadding = 0.45;

    this._setupInput();
  }

  _setupInput() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    canvas.addEventListener('wheel', (e) => {
      this.distance += e.deltaY * 0.01;
      this.distance = Math.max(3, Math.min(20, this.distance));
    }, { passive: true });
  }

  /**
   * Apply accumulated mouse delta (from pointer-lock input).
   * @param {number} dx horizontal mouse movement
   * @param {number} dy vertical mouse movement
   */
  applyMouseDelta(dx, dy, sensitivity = this.mouseSensitivity) {
    this.yaw -= dx * sensitivity;
    // Non-inverted vertical: pushing the mouse DOWN raises the camera (looks down)
    this.pitch += dy * sensitivity;

    // Clamp pitch to avoid flips / ground penetration
    const cap = Math.PI / 3;
    this.pitch = Math.max(-cap, Math.min(cap, this.pitch));
  }

  /**
   * Call every frame. targetPos is the player position (Vector3).
   */
  update(targetPos) {
    // ---- Locked mode: interview camera (dialogue / cutscene) ----
    if (this._locked && this._lockTarget) {
      // Smooth FOV tween
      const fovDiff = this._targetFov - this.camera.fov;
      if (Math.abs(fovDiff) > 0.05) {
        this.camera.fov += fovDiff * 0.08;
        this.camera.updateProjectionMatrix();
      }

      // Smooth position lerp toward lock target
      const safePos = this._resolveCollision(this._lockTarget.lookAt, this._lockTarget.pos);
      this.camera.position.lerp(safePos, 0.08);
      this.camera.lookAt(this._lockTarget.lookAt);
      return;
    }

    // ---- Smooth FOV restore when not locked ----
    const fovDiff = this._targetFov - this.camera.fov;
    if (Math.abs(fovDiff) > 0.05) {
      this.camera.fov += fovDiff * 0.08;
      this.camera.updateProjectionMatrix();
    }

    this._targetPos.copy(targetPos).add(this._lookOffset);

    // First frame: snap smoothed position to target.
    if (this._smoothedPos.lengthSq() === 0) {
      this._smoothedPos.copy(this._targetPos);
    }

    // Smooth follow
    this._smoothedPos.lerp(this._targetPos, this.followLerp);

    const offset = this._computeOffset();
    const desiredPosition = this._targetPos.clone().add(offset);
    this.camera.position.copy(this._resolveCollision(this._targetPos, desiredPosition));

    // Ground collision: never let camera go below ground level
    if (this.camera.position.y < 0.5) {
      this.camera.position.y = 0.5;
    }

    this.camera.lookAt(this._smoothedPos);
  }

  _computeOffset() {
    // Fixed horizontal distance; pitch only controls Y.
    const yOffset = Math.tan(this.pitch) * this.distance;
    return new THREE.Vector3(
      Math.sin(this.yaw) * this.distance,
      yOffset,
      Math.cos(this.yaw) * this.distance
    );
  }

  setCollisionWorld(world, excludeCollider = null) {
    this._collisionWorld = world || null;
    this._collisionExclude = excludeCollider || null;
  }

  _resolveCollision(origin, desiredPosition) {
    if (!this._collisionWorld) return desiredPosition;
    const direction = new THREE.Vector3().subVectors(desiredPosition, origin);
    const distance = direction.length();
    if (distance < 0.01) return desiredPosition;
    direction.multiplyScalar(1 / distance);

    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );
    const hit = this._collisionWorld.castRay(
      ray,
      distance,
      true,
      undefined,
      undefined,
      this._collisionExclude,
      undefined,
      collider => collider.parent()?.isFixed?.() !== false
    );
    if (!hit) return desiredPosition;
    const safeDistance = Math.max(1.0, hit.timeOfImpact - this._collisionPadding);
    return origin.clone().addScaledVector(direction, safeDistance);
  }

  /** Returns the horizontal orbit angle (radians) aligned with camera look direction. */
  getHorizontalAngle() {
    return this.yaw;
  }

  /**
   * Freeze camera at a specific position for dialogue/cutscene.
   * @param {THREE.Vector3} position - world position for camera
   * @param {THREE.Vector3} lookAt - world point to look at
   * @param {number} [fov=40] - target FOV (narrower for interview feel)
   */
  lockTo(position, lookAt, fov = 40) {
    this._locked = true;
    this._lockTarget = {
      pos: position.clone(),
      lookAt: lookAt.clone(),
    };
    this._restoreFov = this.camera.fov;
    this._restoreDistance = this.distance;
    this._restoreFollowLerp = this.followLerp;
    this._targetFov = fov;
  }

  /**
   * Restore camera to follow mode.
   * @param {number} [fov=60] - target FOV to restore to
   */
  unlock(fov = 60) {
    this._locked = false;
    this._lockTarget = null;
    this._targetFov = fov;
    this.distance = this._restoreDistance;
    this.followLerp = this._restoreFollowLerp;
  }

  /** Adjust camera aspect ratio on resize. */
  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
