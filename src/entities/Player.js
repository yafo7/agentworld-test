import * as THREE from 'three';
import { isKeyDown } from '../input/keyboard.js';

/**
 * Player entity — a cone representing the player character.
 * WASD movement is camera-relative: W always moves away from camera,
 * A/D strafe left/right relative to camera view.
 */
export class Player {
  constructor() {
    const geometry = new THREE.ConeGeometry(0.5, 1.5, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x4488ff });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(0, 0.75, 0);
    this.mesh.name = 'Player';

    this._speed = 5;
    this.heldItem = null;
  }

  /**
   * @param {number} dt - delta time in seconds
   * @param {number} cameraAngle - horizontal orbit angle from ThirdPersonCamera
   */
  update(dt, cameraAngle) {
    const moveDir = new THREE.Vector3();

    if (isKeyDown('w')) moveDir.x += 1;  // forward = away from camera
    if (isKeyDown('s')) moveDir.x -= 1;
    if (isKeyDown('a')) moveDir.z -= 1;
    if (isKeyDown('d')) moveDir.z += 1;

    if (moveDir.length() > 0) {
      moveDir.normalize();
      // Rotate movement by camera horizontal angle
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
      this.mesh.position.addScaledVector(moveDir, this._speed * dt);

      // Face away from camera
      this.mesh.rotation.y = cameraAngle;
    }

    // Held item follows player
    if (this.heldItem) {
      const offset = new THREE.Vector3(0, 0.8, 0);
      this.heldItem.mesh.position.copy(this.mesh.position).add(offset);
    }
  }
}
