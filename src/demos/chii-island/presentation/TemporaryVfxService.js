import * as THREE from 'three';
import { ParticleSystem } from '../../../engine/animation/particles.js';

const PRESETS = Object.freeze({
  idea: Object.freeze({
    duration: 1.35,
    emit: {
      mesh: 'box', meshSize: 0.14, rate: 13, lifetime: [0.45, 0.85],
      velocity: { dir: [0, 1, 0], speed: [0.45, 1.1], spread: 0.7 },
      acceleration: [0, -0.15, 0], colorStart: [1, 0.92, 0.25], colorEnd: [1, 0.55, 0.12],
      scaleStart: 1, scaleEnd: 0, offset: [0, 2.6, 0],
    },
  }),
  workStart: Object.freeze({
    duration: 2,
    emit: {
      mesh: 'icosahedron', meshSize: 0.17, rate: 18, lifetime: [0.55, 1.05],
      velocity: { dir: [0, 1, 0], speed: [0.75, 1.65], spread: 1.15 },
      acceleration: [0, -0.3, 0], colorStart: [1, 0.92, 0.25], colorEnd: [0.45, 0.82, 1],
      scaleStart: 1, scaleEnd: 0, offset: [0, 1.1, 0],
    },
  }),
  dust: Object.freeze({
    duration: 1.15,
    emit: {
      mesh: 'icosahedron', meshSize: 0.16, rate: 34, lifetime: [0.45, 0.95],
      velocity: { dir: [0, 1, 0], speed: [0.55, 1.45], spread: 1.55 },
      acceleration: [0, -1.4, 0], colorStart: [0.66, 0.53, 0.34], colorEnd: [0.38, 0.29, 0.2],
      scaleStart: 1, scaleEnd: 0, offset: [0, 0.35, 0],
    },
  }),
  summon: Object.freeze({
    duration: Infinity,
    emit: {
      mesh: 'icosahedron', meshSize: 0.14, rate: 16, lifetime: [0.8, 1.45],
      velocity: { dir: [0, 1, 0], speed: [0.7, 1.5], spread: 0.75 },
      acceleration: [0, 0.05, 0], colorStart: [0.45, 0.95, 0.75], colorEnd: [1, 0.86, 0.3],
      scaleStart: 1, scaleEnd: 0, offset: [0, 2.2, 0],
    },
  }),
  celebration: Object.freeze({
    duration: 10,
    emit: {
      mesh: 'icosahedron', meshSize: 0.15, rate: 22, lifetime: [0.8, 1.5],
      velocity: { dir: [0, 1, 0], speed: [1.1, 2.35], spread: 1.35 },
      acceleration: [0, -0.3, 0], colorStart: [1, 0.45, 0.15], colorEnd: [0.35, 0.72, 1],
      scaleStart: 1, scaleEnd: 0, offset: [0, 0.8, 0],
    },
  }),
});

export function getTemporaryVfxPreset(name) {
  return PRESETS[name] || null;
}

export class TemporaryVfxService {
  constructor({ scene }) {
    this.scene = scene;
    this.effects = new Map();
    this.nextId = 1;
  }

  playPreset(name, { target = null, position = null, key = null, duration = null } = {}) {
    const preset = getTemporaryVfxPreset(name);
    if (!preset) throw new Error(`Unknown temporary VFX preset: ${name}`);
    const effectKey = key || `vfx:${name}:${this.nextId++}`;
    this.stop(effectKey);

    const root = new THREE.Group();
    const emitter = new THREE.Object3D();
    emitter.name = `chiiVfxEmitter${this.nextId++}`;
    root.name = `${emitter.name}Root`;
    root.add(emitter);
    if (position) root.position.copy(position);
    if (target) target.add(root);
    else this.scene.add(root);

    const lifetime = duration ?? preset.duration;
    const plan = {
      _duration: Number.isFinite(lifetime) ? lifetime : 60,
      _loop: true,
      [emitter.name]: { emit: { emitMode: 'point', ...preset.emit } },
    };
    const system = new ParticleSystem(this.scene);
    system.setup(plan, root);
    this.effects.set(effectKey, {
      key: effectKey,
      name,
      root,
      ownedRoot: true,
      system,
      remaining: lifetime,
    });
    return effectKey;
  }

  playPlan(plan, root, { key = null, duration = null } = {}) {
    if (!plan || !root) return null;
    const effectKey = key || `vfx:plan:${this.nextId++}`;
    this.stop(effectKey);
    const system = new ParticleSystem(this.scene);
    system.setup(plan, root);
    this.effects.set(effectKey, {
      key: effectKey,
      name: 'plan',
      root,
      ownedRoot: false,
      system,
      remaining: duration ?? plan._duration ?? plan.duration ?? Infinity,
    });
    return effectKey;
  }

  update(dt) {
    for (const [key, effect] of this.effects) {
      effect.system.update(dt, effect.root);
      if (!Number.isFinite(effect.remaining)) continue;
      effect.remaining -= dt;
      if (effect.remaining <= 0) this.stop(key);
    }
  }

  stop(key) {
    const effect = this.effects.get(key);
    if (!effect) return false;
    effect.system.dispose();
    if (effect.ownedRoot) effect.root.removeFromParent();
    this.effects.delete(key);
    return true;
  }

  dispose() {
    for (const key of [...this.effects.keys()]) this.stop(key);
  }
}
