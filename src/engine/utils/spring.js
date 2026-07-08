import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Lightweight absolute Vector3 spring.
 * Ported from voxel-game/src/anim/SpringSimulator.ts, simplified to run
 * one step per frame without the fixed-timestep accumulator.
 *
 * target  -> desired absolute value
 * position -> current smoothed value
 * velocity -> internal velocity
 */
export class VectorSpringSimulator {
  constructor(fps = 60, mass = 50, damping = 0.8) {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.mass = mass;
    this.damping = damping;
  }

  simulate(_dt) {
    const acceleration = new THREE.Vector3()
      .subVectors(this.target, this.position)
      .divideScalar(this.mass);
    this.velocity.add(acceleration);
    this.velocity.multiplyScalar(this.damping);
    this.position.add(this.velocity);
  }
}

/**
 * Relative scalar spring used for rotation.
 * target  -> signed angle to desired orientation
 * position -> angular step to apply this frame
 */
export class RelativeSpringSimulator {
  constructor(fps = 60, mass = 10, damping = 0.5) {
    this.position = 0;
    this.velocity = 0;
    this.target = 0;
    this.mass = mass;
    this.damping = damping;
  }

  simulate(_dt) {
    const acceleration = (this.target - this.position) / this.mass;
    this.velocity += acceleration;
    this.velocity *= this.damping;
    this.position = this.velocity;
  }
}

/** Signed angle from a to b around +Y, in (-π, π]. */
export function getSignedAngleBetweenVectors(a, b) {
  return Math.atan2(new THREE.Vector3().crossVectors(a, b).y, a.dot(b));
}

/**
 * Rotate a local XZ vector into world space via the orientation matrix.
 * Mirrors Sketchbook FunctionLibrary.appplyVectorMatrixXZ.
 * local: W=+z, S=-z, A=+x, D=-x
 * forward: camera view vector flattened on XZ
 */
export function applyVectorMatrixXZ(forward, local) {
  return new THREE.Vector3(
    forward.x * local.z + forward.z * local.x,
    local.y,
    forward.z * local.z - forward.x * local.x
  );
}

export { UP };
