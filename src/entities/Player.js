import * as THREE from 'three';
import { isKeyDown } from '../input/keyboard.js';

/**
 * Player entity — a cone representing the player character.
 * WASD movement is camera-relative: W always moves in the camera's look direction,
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

    if (moveDir.length() > 0) {
      moveDir.normalize();
      this.mesh.position.addScaledVector(moveDir, this._speed * dt);

      // Face movement direction
      const angle = Math.atan2(moveDir.x, moveDir.z);
      this.mesh.rotation.y = angle;
    }

    // Held item follows player
    if (this.heldItem) {
      const offset = new THREE.Vector3(0, 0.8, 0);
      this.heldItem.mesh.position.copy(this.mesh.position).add(offset);
    }
  }
}
