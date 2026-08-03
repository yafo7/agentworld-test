import * as THREE from 'three';
import { CHII_PRESENTATION_TUNING } from '../data/worldTuningProfile.js';

export class DialogueCameraDirector {
  constructor({ player, thirdPersonCamera, dialogueSystem, workHoldMs = 3600 }) {
    this.player = player;
    this.thirdPersonCamera = thirdPersonCamera;
    this.dialogueSystem = dialogueSystem;
    this.workHoldMs = workHoldMs;
    this.locked = false;
    this.workTimer = null;
  }

  getPosition(subject) {
    return subject?.getPosition?.()
      || subject?.mesh?.position?.clone?.()
      || new THREE.Vector3();
  }

  getBounds(subject) {
    const direct = subject?.getWorldBBox?.();
    if (direct && !direct.isEmpty()) return direct.clone();
    const visual = subject?._modelGroup || subject?.mesh;
    if (!visual) return null;
    const bounds = new THREE.Box3().setFromObject(visual);
    return bounds.isEmpty() ? null : bounds;
  }

  framePair(subject, targetPosition = null, distance = 9, height = 1.25, fov = 52) {
    const playerPos = this.player.mesh.position.clone();
    const subjectPos = this.getPosition(subject);
    const targetPos = targetPosition ? targetPosition.clone() : subjectPos;
    const midPoint = new THREE.Vector3()
      .add(playerPos)
      .add(subjectPos)
      .add(targetPos)
      .multiplyScalar(1 / 3);
    midPoint.y = 1.35;

    const subjectSpan = new THREE.Vector3().subVectors(subjectPos, playerPos);
    const targetSpan = new THREE.Vector3().subVectors(targetPos, playerPos);
    let direction = subjectSpan.lengthSq() > targetSpan.lengthSq() ? subjectSpan : targetSpan;
    direction.y = 0;
    if (direction.lengthSq() < 0.001) direction = new THREE.Vector3(0, 0, 1);
    direction.normalize();
    const side = new THREE.Vector3(-direction.z, 0, direction.x);

    const span = Math.max(
      playerPos.distanceTo(subjectPos),
      playerPos.distanceTo(targetPos),
      subjectPos.distanceTo(targetPos),
      4,
    );
    const subjectBounds = this.getBounds(subject);
    const subjectSize = subjectBounds?.getSize(new THREE.Vector3()) || new THREE.Vector3();
    const visualSpan = Math.max(subjectSize.x, subjectSize.y, subjectSize.z, span);
    const framingDistance = Math.min(
      CHII_PRESENTATION_TUNING.camera.maximumDistance,
      distance + Math.max(0, visualSpan - 3) * 0.65,
    );
    const cameraPosition = midPoint.clone()
      .addScaledVector(side, framingDistance + span * 0.45)
      .addScaledVector(direction, framingDistance * 0.35);
    cameraPosition.y += height + Math.max(span, subjectSize.y) * 0.03;
    this.thirdPersonCamera.lockTo(cameraPosition, midPoint, fov);
  }

  setDialogueLock(locked, subject = null) {
    this.locked = locked;
    this._clearTimer();
    if (!locked) {
      this.release(subject);
      return;
    }

    const subjectPos = this.getPosition(subject);
    document.exitPointerLock();
    this.player.lockTo(subjectPos.x, subjectPos.z);
    subject?.lockFacing?.(this.player.mesh.position.x, this.player.mesh.position.z);
    this.framePair(subject, null, 9.5, 1.25, 54);
  }

  focusDialogue(subject) {
    this.framePair(subject, null, 9.5, 1.25, 54);
  }

  focusWork(subject, targetPosition) {
    this.framePair(subject, targetPosition, 11.5, 1.45, 58);
    this._clearTimer();
    this.workTimer = setTimeout(() => {
      if (!this.locked && !this.dialogueSystem.isActive()) {
        this.thirdPersonCamera.unlock(60);
      }
      this.workTimer = null;
    }, this.workHoldMs);
  }

  release(subject = null) {
    this.locked = false;
    this._clearTimer();
    this.player.unlock();
    subject?.unlockFacing?.();
    this.thirdPersonCamera.unlock(60);
  }

  _clearTimer() {
    if (!this.workTimer) return;
    clearTimeout(this.workTimer);
    this.workTimer = null;
  }

  dispose() {
    this._clearTimer();
  }
}
