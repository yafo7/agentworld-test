import * as THREE from 'three';
import { isKeyDown } from '../input/keyboard.js';

/**
 * Player entity — a cone representing the player character.
 * WASD movement relative to player's facing direction.
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
   * @param {number} _cameraAngle - unused (movement is player-relative)
   */
  update(dt, _cameraAngle) {
    const moveDir = new THREE.Vector3();

    if (isKeyDown('w')) moveDir.z -= 1;
    if (isKeyDown('s')) moveDir.z += 1;
    if (isKeyDown('a')) moveDir.x -= 1;
    if (isKeyDown('d')) moveDir.x += 1;

    if (moveDir.length() > 0) {
      moveDir.normalize();
      // Rotate movement by player's own facing direction
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y);
      this.mesh.position.addScaledVector(moveDir, this._speed * dt);

      // Face movement direction
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      this.mesh.rotation.y = targetAngle;
    }

    // Held item follows player
    if (this.heldItem) {
      const offset = new THREE.Vector3(0, 0.8, 0);
      this.heldItem.mesh.position.copy(this.mesh.position).add(offset);
    }
  }
}
