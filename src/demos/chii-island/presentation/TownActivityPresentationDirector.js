import * as THREE from 'three';
import {
  CINEMATIC_SHOT_IDS,
  createCinematicCameraPose,
} from './cinematic/CinematicTemplateLibrary.js';

function subjectRoot(subject) {
  return subject?._modelGroup || subject?._content || subject?.mesh || subject || null;
}

function subjectName(subject) {
  return subject?._petName || subject?.name || subject?.mesh?.name || '奇异岛居民';
}

export class TownActivityPresentationDirector {
  constructor({ player, cameraController, dialogueSystem }) {
    this.player = player;
    this.cameraController = cameraController;
    this.dialogueSystem = dialogueSystem;
    this.queue = [];
    this.active = null;
  }

  focusInteractive(subject) {
    this._applyShot({ subjects: [subject], shotId: CINEMATIC_SHOT_IDS.ACTION_TRACKING });
  }

  showDialogue(subject, text, options = {}) {
    if (!subject || !text) return false;
    return this._enqueue({
      subjects: [subject],
      speakerName: options.speakerName || subjectName(subject),
      text,
      shotId: options.shotId || CINEMATIC_SHOT_IDS.ACTION_TRACKING,
      duration: options.duration || 2800,
    });
  }

  showFullBody(subject, text, options = {}) {
    return this.showDialogue(subject, text, {
      ...options,
      shotId: CINEMATIC_SHOT_IDS.ACTION_TRACKING,
    });
  }

  showGroup(subjects, speaker, text, options = {}) {
    if (!subjects?.length || !text) return false;
    return this._enqueue({
      subjects,
      speakerName: options.speakerName || subjectName(speaker),
      text,
      shotId: CINEMATIC_SHOT_IDS.ESTABLISHING_WIDE,
      duration: options.duration || 3200,
    });
  }

  showProp(subject, speaker, text, options = {}) {
    if (!subject || !text) return false;
    return this._enqueue({
      subjects: [subject],
      speakerName: options.speakerName || subjectName(speaker),
      text,
      shotId: CINEMATIC_SHOT_IDS.FOCUS_INSERT,
      duration: options.duration || 2600,
    });
  }

  update(dt) {
    if (this.active) {
      this.active.remaining -= dt;
      if (this.active.remaining <= 0 || !this.dialogueSystem.isActive()) {
        this.active = null;
        this.cameraController.unlock(60);
      }
    }
    if (!this.active && this.queue.length > 0 && !this.dialogueSystem.isActive()) {
      this._startNext();
    }
  }

  clear() {
    this.queue.length = 0;
    this.active = null;
    this.cameraController.unlock(60);
  }

  dispose() {
    this.clear();
  }

  _enqueue(request) {
    this.queue.push(request);
    return true;
  }

  _startNext() {
    const request = this.queue.shift();
    if (!request) return;
    this._applyShot(request);
    this.active = { request, remaining: request.duration / 1000 };
    this.dialogueSystem.sayTimed({
      speakerName: request.speakerName,
      text: request.text,
      duration: request.duration,
    }).then(() => {
      if (this.active?.request === request) this.active.remaining = 0;
    });
  }

  _applyShot(request) {
    const roots = (request.subjects || []).map(subjectRoot).filter(Boolean);
    if (roots.length === 0) return;
    const bounds = new THREE.Box3();
    for (const root of roots) {
      root.updateWorldMatrix?.(true, true);
      const box = new THREE.Box3().setFromObject(root);
      if (!box.isEmpty()) bounds.union(box);
    }
    if (bounds.isEmpty()) return;

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const shotId = request.shotId || CINEMATIC_SHOT_IDS.ESTABLISHING_WIDE;
    const isFace = shotId === CINEMATIC_SHOT_IDS.FACE_CLOSE_UP
      || shotId === CINEMATIC_SHOT_IDS.REACTION_CLOSE_UP;
    const isInsert = shotId === CINEMATIC_SHOT_IDS.FOCUS_INSERT;
    const isWide = shotId === CINEMATIC_SHOT_IDS.ESTABLISHING_WIDE;
    const isSingleSubjectAction = roots.length === 1
      && shotId === CINEMATIC_SHOT_IDS.ACTION_TRACKING;
    const lookAt = center.clone();
    if (isFace) lookAt.y = bounds.min.y + size.y * 0.72;

    let view = new THREE.Vector3().subVectors(center, this.player.mesh.position).setY(0);
    if (view.lengthSq() < 0.01) {
      view.subVectors(center, this.cameraController.camera.position).setY(0);
    }
    if (view.lengthSq() < 0.01) view.set(0, 0, -1);
    view.normalize();
    const span = Math.max(size.x, size.z, size.y * 0.75, 1);
    const distance = isFace
      ? Math.max(3.2, size.y * 0.82)
      : isInsert
        ? Math.max(4, span * 1.35)
        : isWide
          ? Math.max(9, span * 2.1)
          : Math.max(6, span * 1.65);
    const position = lookAt.clone().addScaledVector(view, -distance);
    if (isFace || isSingleSubjectAction) {
      const side = new THREE.Vector3(-view.z, 0, view.x);
      const currentSide = new THREE.Vector3()
        .subVectors(this.cameraController.camera.position, center)
        .dot(side);
      const shoulderOffset = Math.min(1.4, Math.max(0.85, size.x * 0.45));
      position.addScaledVector(side, currentSide < 0 ? -shoulderOffset : shoulderOffset);
      this._pushOutsidePlayer(position, side);
    }
    position.y += isFace ? size.y * 0.06 : Math.max(1.2, size.y * 0.25);
    const pose = createCinematicCameraPose({ position, lookAt, shotId });
    this.cameraController.lockTo(pose.position, pose.lookAt, pose.fov);
  }

  _pushOutsidePlayer(position, fallbackDirection) {
    const root = subjectRoot(this.player);
    if (!root) return;
    root.updateWorldMatrix?.(true, true);
    const bounds = root.isObject3D
      ? new THREE.Box3().setFromObject(root)
      : new THREE.Box3();
    const center = bounds.isEmpty()
      ? this.player.mesh.position.clone()
      : bounds.getCenter(new THREE.Vector3());
    const size = bounds.isEmpty()
      ? new THREE.Vector3(1, 2, 1)
      : bounds.getSize(new THREE.Vector3());
    const clearance = Math.max(1.15, Math.hypot(size.x, size.z) * 0.5 + 0.65);
    const offset = new THREE.Vector3(position.x - center.x, 0, position.z - center.z);
    if (offset.lengthSq() >= clearance * clearance) return;
    if (offset.lengthSq() < 0.0001) offset.copy(fallbackDirection);
    offset.normalize().multiplyScalar(clearance);
    position.x = center.x + offset.x;
    position.z = center.z + offset.z;
  }
}
