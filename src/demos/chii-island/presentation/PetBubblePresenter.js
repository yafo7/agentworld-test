import * as THREE from 'three';
import { createSpeechBubble } from '../../../engine/ui/SpeechBubble.js';
import { CHII_PRESENTATION_TUNING } from '../data/worldTuningProfile.js';

export const PET_BUBBLE_VARIANTS = Object.freeze({
  idea: 'idea',
  speech: 'pet',
});

function findHead(pet) {
  const root = pet?._modelGroup;
  if (!root) return null;
  let head = null;
  root.traverse(object => {
    if (!head && /(^|[_\s-])(head|face)([_\s-]|$)|头|脸/i.test(object.name || '')) head = object;
  });
  return head || root;
}

function popScale(t) {
  const clamped = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - clamped, 3) + Math.sin(clamped * Math.PI) * 0.12;
}

function bubbleMetrics(pet) {
  const tuning = CHII_PRESENTATION_TUNING.bubble;
  const visual = pet?._modelGroup;
  if (!visual || !pet?.mesh) {
    return { y: 3.48, scale: 1 };
  }
  pet.mesh.updateWorldMatrix?.(true, true);
  const box = new THREE.Box3().setFromObject(visual);
  if (box.isEmpty()) return { y: 3.48, scale: 1 };
  const origin = pet.mesh.getWorldPosition(new THREE.Vector3());
  const height = box.max.y - box.min.y;
  return {
    y: THREE.MathUtils.clamp(
      box.max.y - origin.y + tuning.topPadding,
      tuning.minimumY,
      tuning.maximumY,
    ),
    scale: THREE.MathUtils.clamp(Math.sqrt(height / 3), 0.86, 1.16),
  };
}

export class PetBubblePresenter {
  constructor({ camera = null, vfxService = null, bubbleFactory = createSpeechBubble } = {}) {
    this.enabled = typeof document !== 'undefined';
    this.camera = camera;
    this.vfxService = vfxService;
    this.bubbleFactory = bubbleFactory;
    this.bubbles = new Map();
    this.hints = new Map();
    this.lines = new Map();
    this.gestures = new Map();
    this.projected = new THREE.Vector3();
    this.bubbleWorld = new THREE.Vector3();
    this.cameraRight = new THREE.Vector3();
  }

  setHint(pet, text = '我有个想法！', { exclusive = true } = {}) {
    if (!this.enabled || !pet) return;
    if (exclusive) {
      for (const hintedPet of [...this.hints.keys()]) {
        if (hintedPet !== pet) this.clearHint(hintedPet);
      }
    }
    if (this.hints.get(pet) === text) return;
    this.hints.set(pet, text);
    if (!this.lines.has(pet)) this._show(pet, text, PET_BUBBLE_VARIANTS.idea);
    this._startIdeaGesture(pet);
    this.vfxService?.playPreset('idea', {
      target: pet.mesh,
      key: `pet-idea:${pet._petId || pet._petName || pet.mesh.uuid}`,
    });
  }

  clearHint(pet = null) {
    const targets = pet ? [pet] : [...this.hints.keys()];
    for (const target of targets) {
      this.hints.delete(target);
      if (!this.lines.has(target)) this._hide(target);
    }
  }

  showLine(pet, text, duration = 2.8) {
    if (!this.enabled || !pet || !text) return;
    this.lines.set(pet, { remaining: duration, text });
    this._show(pet, text, PET_BUBBLE_VARIANTS.speech);
  }

  update(dt) {
    for (const [pet, line] of this.lines) {
      line.remaining -= dt;
      if (line.remaining > 0) continue;
      this.lines.delete(pet);
      const hint = this.hints.get(pet);
      if (hint) this._show(pet, hint, PET_BUBBLE_VARIANTS.idea);
      else this._hide(pet);
    }

    this.camera?.updateMatrixWorld?.();
    for (const entry of this.bubbles.values()) {
      if (!entry.bubble.isVisible) continue;
      entry.phase += dt;
      entry.appear += dt;
      const scale = popScale(entry.appear / 0.24);
      entry.bubble.sprite.scale.set(
        entry.baseScale.x * scale,
        entry.baseScale.y * scale,
        1,
      );
      this._positionBubble(entry, Math.sin(entry.phase * 3.2) * 0.055);
    }

    for (const [pet, gesture] of this.gestures) {
      gesture.elapsed += dt;
      const progress = Math.min(gesture.elapsed / gesture.duration, 1);
      const envelope = Math.sin(progress * Math.PI);
      gesture.target.rotation.x = gesture.baseX
        + Math.sin(progress * Math.PI * 4) * gesture.amplitude * envelope;
      if (progress >= 1) {
        gesture.target.rotation.x = gesture.baseX;
        this.gestures.delete(pet);
      }
    }
  }

  hideAll() {
    this.hints.clear();
    this.lines.clear();
    for (const pet of [...this.gestures.keys()]) this._finishGesture(pet);
    for (const entry of this.bubbles.values()) entry.bubble.hide();
  }

  dispose() {
    this.hideAll();
    for (const entry of this.bubbles.values()) entry.bubble.dispose();
    this.bubbles.clear();
  }

  _entry(pet) {
    if (!this.enabled || !pet?.mesh) return null;
    let entry = this.bubbles.get(pet);
    if (!entry) {
      const metrics = bubbleMetrics(pet);
      const bubble = this.bubbleFactory(pet.mesh, { variant: PET_BUBBLE_VARIANTS.speech });
      bubble.sprite.position.y = metrics.y;
      bubble.sprite.scale.set(
        CHII_PRESENTATION_TUNING.bubble.width * metrics.scale,
        CHII_PRESENTATION_TUNING.bubble.height * metrics.scale,
        1,
      );
      entry = {
        pet,
        bubble,
        baseY: bubble.sprite.position.y,
        baseScale: bubble.sprite.scale.clone(),
        phase: 0,
        appear: 1,
      };
      this.bubbles.set(pet, entry);
    }
    return entry;
  }

  _show(pet, text, variant) {
    const entry = this._entry(pet);
    if (!entry) return;
    entry.bubble.sprite.scale.copy(entry.baseScale);
    entry.bubble.show(text, { variant });
    entry.appear = 0;
  }

  _hide(pet) {
    this.bubbles.get(pet)?.bubble.hide();
  }

  _positionBubble(entry, bob) {
    if (!this.camera || !entry.pet?.mesh) {
      entry.bubble.sprite.position.set(0, entry.baseY + bob, 0);
      return;
    }
    const parent = entry.pet.mesh;
    parent.updateWorldMatrix?.(true, false);
    parent.getWorldPosition(this.bubbleWorld);
    this.bubbleWorld.y += entry.baseY + bob;
    this.projected.copy(this.bubbleWorld).project(this.camera);

    let shift = 0;
    if (this.projected.x > 0.48) shift = -Math.min(2.1, 0.9 + (this.projected.x - 0.48) * 2);
    if (this.projected.x < -0.48) shift = Math.min(2.1, 0.9 + (-0.48 - this.projected.x) * 2);
    this.cameraRight.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    this.bubbleWorld.addScaledVector(this.cameraRight, shift);
    parent.worldToLocal(this.bubbleWorld);
    entry.bubble.sprite.position.copy(this.bubbleWorld);
  }

  _startIdeaGesture(pet) {
    this._finishGesture(pet);
    const target = findHead(pet);
    if (!target) {
      pet.playAnimation?.(pet._animPlans?.wave ? 'wave' : (pet._animPlans?.jump ? 'jump' : 'idle'));
      return;
    }
    this.gestures.set(pet, {
      target,
      baseX: target.rotation.x,
      elapsed: 0,
      duration: 0.9,
      amplitude: target === pet._modelGroup ? 0.065 : 0.16,
    });
  }

  _finishGesture(pet) {
    const gesture = this.gestures.get(pet);
    if (!gesture) return;
    gesture.target.rotation.x = gesture.baseX;
    this.gestures.delete(pet);
  }
}
