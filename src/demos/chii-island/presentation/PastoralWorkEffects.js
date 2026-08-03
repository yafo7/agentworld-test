import * as THREE from 'three';
import { applyAnimation } from '../../../engine/animation/player.js';
import { ParticleSystem } from '../../../engine/animation/particles.js';
import { buildModelFromJson } from '../../../engine/model/builder.js';

export class PastoralWorkEffects {
  constructor({
    scene,
    vfxService = null,
    scaffoldModelJson = null,
    scaffoldAnimationPlan = null,
  }) {
    if (!scene) throw new TypeError('PastoralWorkEffects requires a scene');
    this.scene = scene;
    this.vfxService = vfxService;
    this.scaffoldModelJson = scaffoldModelJson;
    this.scaffoldAnimationPlan = scaffoldAnimationPlan;
    this.effects = [];
    this.reveals = [];
    this.vfxKeys = new Set();
    this.disposed = false;
  }

  playWorkStart(pet, duration = 2) {
    if (this.disposed || !pet?.mesh) return null;
    if (this.vfxService) {
      const key = this.vfxService.playPreset('workStart', {
        target: pet.mesh,
        duration,
        key: `pastoral-work-start:${pet._petId || pet._petName}`,
      });
      if (key) this.vfxKeys.add(key);
      return key;
    }

    const group = new THREE.Group();
    group.name = 'PastoralStarBurst';
    const geometry = new THREE.OctahedronGeometry(0.2, 0);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffe66d,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    for (let i = 0; i < 16; i++) {
      const star = new THREE.Mesh(geometry, material.clone());
      star.frustumCulled = false;
      const angle = (i / 16) * Math.PI * 2;
      star.userData = {
        angle,
        radius: 0.9 + Math.random() * 1.2,
        y: 1 + Math.random() * 1.6,
        speed: 1.6 + Math.random() * 1.4,
      };
      group.add(star);
    }
    material.dispose();
    group.frustumCulled = false;
    this.scene.add(group);
    this.effects.push({ type: 'stars', group, pet, timer: 0, duration });
    return group;
  }

  playDust(position, duration = 1.1) {
    if (this.disposed || !position) return null;
    if (this.vfxService) {
      const key = this.vfxService.playPreset('dust', { position, duration });
      if (key) this.vfxKeys.add(key);
      return key;
    }

    const group = new THREE.Group();
    group.name = 'PastoralDustBurst';
    group.position.copy(position);
    const geometry = new THREE.SphereGeometry(0.16, 8, 6);
    const material = new THREE.MeshBasicMaterial({
      color: 0x9b7b4a,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    for (let i = 0; i < 30; i++) {
      const dust = new THREE.Mesh(geometry, material.clone());
      dust.frustumCulled = false;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.8;
      dust.position.set(0, 0.35 + Math.random() * 0.8, 0);
      dust.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        1 + Math.random(),
        Math.sin(angle) * speed,
      );
      group.add(dust);
    }
    material.dispose();
    group.frustumCulled = false;
    this.scene.add(group);
    this.effects.push({ type: 'dust', group, timer: 0, duration });
    return group;
  }

  startScaffold(points) {
    if (this.disposed || !points?.targetPos) return null;

    if (this.scaffoldModelJson) {
      const group = buildModelFromJson(this.scaffoldModelJson);
      if (!group) return null;
      group.name = 'PastoralWorkScaffold';
      group.position.copy(points.targetPos);
      group.frustumCulled = false;
      const size = points.size || new THREE.Vector3(3, 3, 3);
      const footprint = Math.max(size.x, size.z, 3.5);
      const scaffoldScale = THREE.MathUtils.clamp((footprint + 2) / 6.4, 0.65, 1.8);
      group.scale.setScalar(scaffoldScale);
      this.scene.add(group);

      const plan = this.scaffoldAnimationPlan?.motionPlan
        ? {
            ...this.scaffoldAnimationPlan.motionPlan,
            _duration: this.scaffoldAnimationPlan.duration || 2,
            _loop: true,
          }
        : this.scaffoldAnimationPlan;
      const particles = plan ? new ParticleSystem(this.scene) : null;
      particles?.setup(plan, group);
      const effect = {
        type: 'scaffold',
        group,
        particles,
        plan,
        poseMap: null,
        timer: 0,
        duration: Infinity,
        fading: false,
      };
      this.effects.push(effect);
      return effect;
    }

    const group = this._createFallbackScaffold(points);
    this.scene.add(group);
    const effect = {
      type: 'scaffold',
      group,
      timer: 0,
      duration: Infinity,
      fading: false,
    };
    this.effects.push(effect);
    return effect;
  }

  stopScaffold(effect) {
    if (this.disposed || !effect || !this.effects.includes(effect)) return;
    effect.fading = true;
    effect.timer = 0;
    effect.duration = 0.85;
  }

  reveal(group, duration = 1) {
    if (this.disposed || !group) return;
    const baseScale = group.scale.clone();
    const baseRotationY = group.rotation.y;
    group.scale.copy(baseScale).multiplyScalar(0.82);
    this.reveals.push({ group, baseScale, baseRotationY, timer: 0, duration });
  }

  update(dt) {
    if (this.disposed) return;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.timer += dt;
      const progress = Math.min(effect.timer / effect.duration, 1);
      if (effect.type === 'stars') {
        effect.group.position.copy(effect.pet.mesh.position);
        for (const star of effect.group.children) {
          const angle = star.userData.angle + effect.timer * star.userData.speed;
          star.position.set(
            Math.cos(angle) * star.userData.radius,
            star.userData.y + Math.sin(effect.timer * 5 + angle) * 0.15,
            Math.sin(angle) * star.userData.radius,
          );
          star.rotation.y += dt * 4;
          star.material.opacity = 0.95 * (1 - progress);
        }
      } else if (effect.type === 'dust') {
        for (const dust of effect.group.children) {
          dust.userData.velocity.y -= 2 * dt;
          dust.position.addScaledVector(dust.userData.velocity, dt);
          dust.material.opacity = 0.55 * (1 - progress);
        }
      } else if (effect.type === 'scaffold') {
        if (effect.plan) {
          const duration = effect.plan._duration || effect.plan.duration || 2;
          effect.poseMap = applyAnimation(
            effect.plan,
            duration,
            effect.group,
            effect.timer % duration,
            effect.poseMap,
          );
          effect.particles?.update(dt, effect.group);
        }
        const pulse = 0.82 + Math.sin(effect.timer * 5) * 0.08;
        if (!effect.plan) effect.group.position.y = Math.sin(effect.timer * 2.8) * 0.03;
        effect.group.traverse(object => {
          if (!object.material || !('opacity' in object.material)) return;
          object.material.opacity = effect.fading
            ? 0.9 * (1 - progress)
            : (effect.plan ? 1 : pulse);
        });
      }
      if (progress >= 1 && effect.duration !== Infinity) {
        effect.particles?.dispose();
        this._disposeGroup(effect.group);
        this.effects.splice(i, 1);
      }
    }

    for (let i = this.reveals.length - 1; i >= 0; i--) {
      const reveal = this.reveals[i];
      reveal.timer += dt;
      const progress = Math.min(reveal.timer / reveal.duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      reveal.group.scale
        .copy(reveal.baseScale)
        .multiplyScalar(0.82 + (1 - 0.82) * ease);
      reveal.group.rotation.y = reveal.baseRotationY
        + Math.sin((1 - progress) * Math.PI) * 0.035;
      if (progress >= 1) {
        reveal.group.scale.copy(reveal.baseScale);
        reveal.group.rotation.y = reveal.baseRotationY;
        this.reveals.splice(i, 1);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const effect of this.effects.splice(0)) {
      effect.particles?.dispose();
      this._disposeGroup(effect.group);
    }
    for (const reveal of this.reveals.splice(0)) {
      reveal.group.scale.copy(reveal.baseScale);
      reveal.group.rotation.y = reveal.baseRotationY;
    }
    for (const key of this.vfxKeys) this.vfxService?.stop?.(key);
    this.vfxKeys.clear();
  }

  _createFallbackScaffold(points) {
    const group = new THREE.Group();
    group.name = 'PastoralWorkScaffold';
    group.position.copy(points.targetPos);
    group.frustumCulled = false;

    const size = points.size || new THREE.Vector3(3, 3, 3);
    const halfWidth = Math.max(1.4, size.x * 0.5 + 0.9);
    const halfDepth = Math.max(1.4, size.z * 0.5 + 0.9);
    const height = Math.max(2.4, Math.min(4.4, size.y + 1.2));
    const baseY = 0.12;
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0xc28a45,
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b2f2a,
      roughness: 0.85,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const postGeometry = new THREE.BoxGeometry(0.18, 1, 0.18);
    const railGeometry = new THREE.BoxGeometry(1, 0.14, 0.14);
    const plankGeometry = new THREE.BoxGeometry(1, 0.12, 0.5);

    for (const [x, z] of [
      [-halfWidth, -halfDepth],
      [halfWidth, -halfDepth],
      [halfWidth, halfDepth],
      [-halfWidth, halfDepth],
    ]) {
      const post = new THREE.Mesh(postGeometry, woodMaterial.clone());
      post.position.set(x, baseY + height * 0.5, z);
      post.scale.y = height;
      post.frustumCulled = false;
      group.add(post);
    }

    const addRail = (x, y, z, length, rotationY, material = railMaterial) => {
      const rail = new THREE.Mesh(railGeometry, material.clone());
      rail.position.set(x, y, z);
      rail.rotation.y = rotationY;
      rail.scale.x = length;
      rail.frustumCulled = false;
      group.add(rail);
    };

    for (const y of [baseY + height * 0.35, baseY + height * 0.72]) {
      addRail(0, y, -halfDepth, halfWidth * 2, 0);
      addRail(0, y, halfDepth, halfWidth * 2, 0);
      addRail(-halfWidth, y, 0, halfDepth * 2, Math.PI / 2);
      addRail(halfWidth, y, 0, halfDepth * 2, Math.PI / 2);
    }

    for (const z of [-halfDepth, halfDepth]) {
      const plank = new THREE.Mesh(plankGeometry, woodMaterial.clone());
      plank.position.set(0, baseY + 0.55, z);
      plank.scale.x = halfWidth * 2;
      plank.frustumCulled = false;
      group.add(plank);
    }
    woodMaterial.dispose();
    railMaterial.dispose();
    return group;
  }

  _disposeGroup(group) {
    this.scene.remove(group);
    group.traverse(object => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) {
        for (const material of object.material) material.dispose();
      } else {
        object.material?.dispose();
      }
    });
  }
}
