import * as THREE from 'three';

export class PlayerItemShowcaseDirector {
  constructor({
    player,
    thirdPersonCamera,
    input,
    durationMs = 3200,
    documentRef = globalThis.document,
  } = {}) {
    this.player = player;
    this.thirdPersonCamera = thirdPersonCamera;
    this.input = input;
    this.durationMs = durationMs;
    this.document = documentRef;
    this.active = false;
    this.timer = null;
    this.caption = null;
  }

  async play({ item, animationPath } = {}) {
    if (!item || !animationPath || !this.player || !this.thirdPersonCamera) return false;
    this.stop();
    await this.player.loadAnimation('equipment_showcase', animationPath, {
      duration: 2.8,
      loop: false,
    });

    this.active = true;
    this.input?.setPointerLockEnabled(false);
    this.document?.exitPointerLock?.();

    const playerPosition = this.player.mesh.position.clone();
    const facing = new THREE.Vector3(
      Math.sin(this.player.mesh.rotation.y),
      0,
      Math.cos(this.player.mesh.rotation.y),
    );
    const cameraPosition = playerPosition.clone()
      .addScaledVector(facing, 5.2)
      .add(new THREE.Vector3(0, 2.7, 0));
    const lookAt = playerPosition.clone().add(new THREE.Vector3(0, 2.05, 0));
    this.player.lockTo(cameraPosition.x, cameraPosition.z);
    this.thirdPersonCamera.lockTo(cameraPosition, lookAt, 42);
    this.player.playOneShot('equipment_showcase', 2.8);
    this._showCaption(`${item.name}，锵锵！`);

    this.timer = setTimeout(() => this.stop(), this.durationMs);
    return true;
  }

  isActive() {
    return this.active;
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.active) {
      this.player?.unlock?.();
      this.thirdPersonCamera?.unlock?.(60);
      this.input?.setPointerLockEnabled(true);
    }
    this.active = false;
    this.caption?.remove?.();
    this.caption = null;
  }

  _showCaption(text) {
    if (!this.document?.body) return;
    const caption = this.document.createElement('div');
    caption.className = 'item-showcase-caption';
    caption.textContent = text;
    this.document.body.append(caption);
    this.caption = caption;
  }

  dispose() {
    this.stop();
  }
}
