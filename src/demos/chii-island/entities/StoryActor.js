import * as THREE from 'three';
import { loadAnimationPlan } from '../../../engine/animation/planLoader.js';
import { applyMotionDeltas, evaluateMotion } from '../../../engine/animation/player.js';
import { normalizeAnimationPlan } from '../../../engine/animation/normalizePlan.js';
import { ParticleSystem } from '../../../engine/animation/particles.js';
import { loadModel } from '../../../engine/model/loader.js';
import { getRuntime } from '../../../engine/runtime/runtimeProvider.js';

function createFallbackAngel() {
  const root = new THREE.Group();
  root.name = 'ActZeroAngelFallback';
  const white = new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.72 });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xffca55,
    emissive: 0xd97828,
    emissiveIntensity: 0.45,
    roughness: 0.45,
  });
  const wing = new THREE.MeshStandardMaterial({
    color: 0xdff4ff,
    emissive: 0x77b6d8,
    emissiveIntensity: 0.22,
    roughness: 0.55,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.7, 4, 8), white);
  body.name = 'body';
  body.position.y = 1;
  root.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 8), white);
  head.name = 'head';
  head.position.y = 1.95;
  root.add(head);

  for (const side of [-1, 1]) {
    const feather = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 1.15), wing);
    feather.name = side < 0 ? 'leftWing' : 'rightWing';
    feather.position.set(side * 0.7, 1.25, 0.15);
    feather.rotation.z = side * 0.55;
    root.add(feather);
  }

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 24), gold);
  halo.name = 'halo';
  halo.position.y = 2.7;
  halo.rotation.x = Math.PI / 2;
  root.add(halo);

  root.userData.fallbackMaterials = [white, gold, wing];
  return root;
}

export function createFallbackBlockBoss() {
  const root = new THREE.Group();
  root.name = 'ActZeroBossFallback';
  const black = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.82 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf4c744, roughness: 0.76 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe57828, roughness: 0.68 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f1dc, roughness: 0.8 });

  const addBox = (name, size, position, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    root.add(mesh);
    return mesh;
  };

  addBox('body', [0.95, 1.15, 0.55], [0, 1.25, 0], yellow);
  addBox('head', [0.78, 0.78, 0.72], [0, 2.18, 0], black);
  addBox('leftArm', [0.28, 1.05, 0.28], [-0.66, 1.32, 0], black);
  const rightArm = addBox('rightArm', [0.28, 1.05, 0.28], [0.66, 1.32, 0], black);
  addBox('leftLeg', [0.34, 0.95, 0.36], [-0.27, 0.48, 0], black);
  addBox('rightLeg', [0.34, 0.95, 0.36], [0.27, 0.48, 0], black);
  addBox('jerseyNumber', [0.28, 0.42, 0.04], [0, 1.32, 0.3], white);

  const basketball = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8), orange);
  basketball.name = 'basketball';
  basketball.position.set(0, -0.48, 0.22);
  rightArm.add(basketball);

  root.userData.fallbackMaterials = [black, yellow, orange, white];
  return root;
}

export function createFallbackStoryProtagonist() {
  const root = new THREE.Group();
  root.name = 'ActZeroProtagonistFallback';
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c8ae, roughness: 0.82 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x758f83, roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa92742, roughness: 0.76 });
  const black = new THREE.MeshStandardMaterial({ color: 0x25232b, roughness: 0.84 });

  const addBox = (name, size, position, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    root.add(mesh);
    return mesh;
  };

  addBox('body', [0.76, 0.92, 0.42], [0, 1.22, 0], red);
  addBox('head', [0.68, 0.68, 0.62], [0, 2.02, 0], skin);
  addBox('hair', [0.76, 0.32, 0.68], [0, 2.28, -0.02], hair);
  addBox('leftBraid', [0.18, 1.05, 0.18], [-0.45, 1.62, -0.04], hair);
  addBox('rightBraid', [0.18, 1.05, 0.18], [0.45, 1.62, -0.04], hair);
  addBox('leftArm', [0.22, 0.88, 0.24], [-0.52, 1.25, 0], black);
  addBox('rightArm', [0.22, 0.88, 0.24], [0.52, 1.25, 0], black);
  addBox('leftLeg', [0.25, 0.82, 0.28], [-0.22, 0.43, 0], black);
  addBox('rightLeg', [0.25, 0.82, 0.28], [0.22, 0.43, 0], black);
  addBox('leftEye', [0.08, 0.1, 0.04], [-0.17, 2.05, 0.33], black);
  addBox('rightEye', [0.08, 0.1, 0.04], [0.17, 2.05, 0.33], black);

  root.userData.fallbackMaterials = [skin, hair, red, black];
  return root;
}

export class StoryActor {
  constructor({
    scene = null,
    targetHeight = 2.6,
    rootName = 'ActZeroAngel',
    actorLabel = 'Angel',
    fallbackFactory = createFallbackAngel,
    spinningStates = ['generating'],
  } = {}) {
    this.scene = scene;
    this.targetHeight = targetHeight;
    this.actorLabel = actorLabel;
    this.spinningStates = new Set(spinningStates);
    this.root = new THREE.Group();
    this.root.name = rootName;
    this.model = fallbackFactory();
    this.root.add(this.model);
    this.animations = {};
    this.state = 'idle';
    this.time = 0;
    this.basePose = null;
    this.particles = null;
    this.usingFallback = true;
  }

  async load({ modelPath, animationPaths = {} }) {
    const loaded = await loadModel(modelPath);
    if (loaded) {
      const box = new THREE.Box3().setFromObject(loaded);
      const height = Math.max(0.01, box.max.y - box.min.y);
      const scale = this.targetHeight / height;
      loaded.scale.setScalar(scale);
      loaded.position.y = -box.min.y * scale;
      this.root.remove(this.model);
      this.model = loaded;
      this.root.add(loaded);
      this.usingFallback = false;
    }

    const entries = await Promise.all(
      Object.entries(animationPaths).map(async ([name, path]) => {
        try {
          const raw = await loadAnimationPlan(path);
          const normalized = normalizeAnimationPlan(raw, {
            duration: raw?._duration || raw?.duration || 2,
            loop: raw?._loop !== false,
            model: this.model,
          });
          return [name, normalized];
        } catch (error) {
          console.warn(`[ActZero] ${this.actorLabel} animation "${name}" unavailable:`, error.message);
          return [name, null];
        }
      }),
    );
    for (const [name, plan] of entries) {
      if (plan) this.animations[name] = plan;
    }
    this.play('idle');
    return !this.usingFallback;
  }

  play(name) {
    this.state = name;
    this.time = 0;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this._resetPose();
    this._resetParticles();
    const plan = this.animations[name];
    if (plan && this.scene) {
      this.particles = new ParticleSystem(this.scene);
      this.particles.setup(plan, this.model);
    }
  }

  update(dt) {
    this.time += dt;
    if (this.spinningStates.has(this.state)) {
      this.root.rotation.y += dt * 4.6;
    }
    const plan = this.animations[this.state];
    const runtime = getRuntime();
    if (plan && runtime && this.model) {
      const duration = plan._duration || 2;
      const loopTime = plan._loop === false
        ? Math.min(this.time, duration)
        : this.time % duration;
      const deltas = evaluateMotion(plan, duration, this.model, loopTime);
      this.basePose = applyMotionDeltas(deltas, this.model, this.basePose);
      this.particles?.update(dt, this.model);
      return;
    }

    this.root.position.y += Math.sin(this.time * 2.4) * 0.0018;
    if (this.state === 'falling') {
      this.root.rotation.z = Math.sin(this.time * 4) * 0.08;
    } else {
      this.root.rotation.z = Math.sin(this.time * 1.8) * 0.025;
    }
  }

  _resetParticles() {
    this.particles?.dispose();
    this.particles = null;
  }

  _resetPose() {
    if (!this.basePose || !this.model) return;
    for (const [name, base] of this.basePose) {
      const object = this.model.getObjectByName(name);
      if (!object) continue;
      object.position.copy(base.position);
      object.rotation.copy(base.rotation);
      object.quaternion.copy(base.quaternion);
      object.scale.copy(base.scale);
    }
  }

  dispose() {
    this._resetParticles();
    if (this.usingFallback) {
      this.model.traverse(object => object.geometry?.dispose?.());
      for (const material of this.model.userData.fallbackMaterials || []) material.dispose();
    }
    this.root.removeFromParent();
  }
}
