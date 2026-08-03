import * as THREE from 'three';
import { PARTICLE_PRESETS } from '@voxel-studio/render-runtime/effects/particles/ParticlePresets.js';

const VFX_PRESET_ALIASES = Object.freeze({
  flame_jet: 'flame',
});

export function resolveVfxEmitterConfig(vfx) {
  if (!vfx || typeof vfx !== 'object') return null;
  const presetName = VFX_PRESET_ALIASES[vfx.preset] || vfx.preset;
  const preset = PARTICLE_PRESETS[presetName];
  if (!preset?.config) return null;
  const scale = Math.max(0.3, Math.min(2, Number(vfx.params?.scale) || 1));
  const config = {
    ...preset.config,
    velocity: preset.config.velocity ? { ...preset.config.velocity } : undefined,
    meshSize: (preset.config.meshSize || 0.1) * scale,
  };
  if (Array.isArray(preset.config.shapeSize)) {
    config.shapeSize = preset.config.shapeSize.map(value => value * scale);
  }
  if (Array.isArray(vfx.anchor?.offset)) config.offset = vfx.anchor.offset.slice(0, 3);
  if (Array.isArray(vfx.dir) && config.velocity) config.velocity.dir = vfx.dir.slice(0, 3);
  return config;
}

/**
 * ParticleSystem — InstancedMesh-based particle emitter driven by motion plan `emit` tracks.
 * Ported from 3d-generate/js/animation/ParticleSystem.js
 *
 * Scans a motion plan for all `emit` configs, creates per-group emitters, spawns particles
 * at the group's animated world position (or AABB for volume mode), simulates physics,
 * interpolates color/scale over lifetime.
 *
 * emitMode: 'point' (group origin+offset) | 'volume' (random within group world AABB)
 *
 * Lifecycle:
 *   setup(motionPlan, modelRoot)  — call when animation starts
 *   update(dt, modelRoot)         — call every frame during playback
 *   dispose()                     — call when animation stops
 */
export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.emitters = [];
  }

  /** Scan motion plan for `emit` tracks and create emitters. */
  setup(motionPlan, modelRoot) {
    this.dispose();
    if (!motionPlan || !modelRoot) return;

    let emitCount = 0;
    for (const [groupId, tracks] of Object.entries(motionPlan)) {
      if (groupId.startsWith('_')) continue;
      const emitterConfig = tracks?.emit || resolveVfxEmitterConfig(tracks?.vfx);
      if (!emitterConfig) continue;

      const boneObj = modelRoot.getObjectByName(groupId);
      if (!boneObj) {
        console.warn('[Particles] bone not found in model:', groupId);
        continue;
      }
      this._createEmitter(groupId, emitterConfig, boneObj);
      emitCount++;
    }
    if (emitCount > 0) console.log('[Particles] setup:', emitCount, 'emitters');
  }

  _createEmitter(groupId, config, boneObj) {
    const rate = config.rate ?? 15;
    const maxLife = (config.lifetime || [0.5, 1.0])[1] || 1;
    const maxCount = Math.min(500, config.maxCount || Math.ceil(rate * maxLife + 5));

    const geometry = config.mesh === 'box'
      ? new THREE.BoxGeometry(1, 1, 1)
      : new THREE.IcosahedronGeometry(0.5, 0);

    const material = new THREE.MeshStandardMaterial({
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });

    const im = new THREE.InstancedMesh(geometry, material, maxCount);
    im.count = 0;
    im.castShadow = false;
    im.receiveShadow = false;
    im.frustumCulled = false;
    this.scene.add(im);

    this.emitters.push({
      groupId,
      boneObj,
      config,
      instancedMesh: im,
      maxCount,
      accumulator: 0,
      particles: [],
      _dummy: new THREE.Object3D(),
      _color: new THREE.Color(),
      _worldPos: new THREE.Vector3(),
      _aabb: new THREE.Box3(),
      _aabbSize: new THREE.Vector3(),
    });
  }

  /** Called every animation frame. dt in seconds. */
  update(dt, modelRoot) {
    for (const em of this.emitters) {
      // 1. Get emitter bone's current world position + AABB
      em.boneObj.getWorldPosition(em._worldPos);

      const emitMode = em.config.emitMode || 'point';
      if (emitMode === 'volume') {
        em._aabb.makeEmpty();
        em.boneObj.traverse(child => {
          if (child.isMesh && child.geometry) {
            child.geometry.computeBoundingBox();
            const childBox = child.geometry.boundingBox.clone();
            childBox.applyMatrix4(child.matrixWorld);
            em._aabb.union(childBox);
          }
        });
        if (em._aabb.isEmpty()) {
          em._aabb.setFromCenterAndSize(em._worldPos, new THREE.Vector3(0.1, 0.1, 0.1));
        }
        em._aabb.getSize(em._aabbSize);
      }

      // 2. Spawn new particles (rate-based)
      em.accumulator += (em.config.rate ?? 15) * dt;
      while (em.accumulator >= 1) {
        em.accumulator -= 1;
        if (em.particles.length < em.maxCount) this._spawn(em);
      }

      // 3. Simulate particles
      const accel = em.config.acceleration || [0, 0, 0];
      const alive = [];
      for (const p of em.particles) {
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vel[0] += accel[0] * dt;
        p.vel[1] += accel[1] * dt;
        p.vel[2] += accel[2] * dt;
        p.pos[0] += p.vel[0] * dt;
        p.pos[1] += p.vel[1] * dt;
        p.pos[2] += p.vel[2] * dt;
        alive.push(p);
      }
      em.particles = alive;

      // 4. Sync to InstancedMesh
      this._syncMesh(em);
    }
  }

  _spawn(em) {
    const cfg = em.config;
    const vel = cfg.velocity || {};
    const dir = vel.dir || [0, 1, 0];
    const speedRange = vel.speed || [1, 2];
    const spread = vel.spread || 0.3;
    const lifeRange = cfg.lifetime || [0.5, 1.0];
    const offset = cfg.offset || [0, 0, 0];
    const emitMode = cfg.emitMode || 'point';

    let sx, sy, sz;
    if (emitMode === 'volume' && em._aabbSize.x > 0) {
      const min = em._aabb.min, max = em._aabb.max;
      sx = min.x + Math.random() * (max.x - min.x);
      sy = min.y + Math.random() * (max.y - min.y);
      sz = min.z + Math.random() * (max.z - min.z);
    } else {
      sx = em._worldPos.x + offset[0];
      sy = em._worldPos.y + offset[1];
      sz = em._worldPos.z + offset[2];
    }

    const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);

    let vx = dir[0], vy = dir[1], vz = dir[2];
    vx += (Math.random() - 0.5) * spread * 2;
    vy += (Math.random() - 0.5) * spread * 2;
    vz += (Math.random() - 0.5) * spread * 2;
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;

    const life = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);

    em.particles.push({
      pos: [sx, sy, sz],
      vel: [(vx / len) * speed, (vy / len) * speed, (vz / len) * speed],
      life,
      maxLife: life,
      rot: [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28],
      rotVel: [(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4],
    });
  }

  _syncMesh(em) {
    const cfg = em.config;
    const meshSize = cfg.meshSize || 0.4;
    const scaleStart = cfg.scaleStart ?? 1;
    const scaleEnd = cfg.scaleEnd ?? 0;
    const effectiveScaleStart = scaleStart < 0.3 ? 1.0 : scaleStart;
    const effectiveScaleEnd = scaleEnd < 0.3 ? 0.0 : scaleEnd;
    const cs = cfg.colorStart || [1, 0.8, 0.2];
    const ce = cfg.colorEnd || [0.5, 0, 0];

    em.instancedMesh.count = em.particles.length;

    for (let i = 0; i < em.particles.length; i++) {
      const p = em.particles[i];
      const t = 1 - p.life / p.maxLife;

      em._dummy.position.set(p.pos[0], p.pos[1], p.pos[2]);

      const s = meshSize * Math.max(0.01, effectiveScaleStart + (effectiveScaleEnd - effectiveScaleStart) * t);
      em._dummy.scale.set(s, s, s);

      p.rot[0] += p.rotVel[0] * 0.016;
      p.rot[1] += p.rotVel[1] * 0.016;
      em._dummy.rotation.set(p.rot[0], p.rot[1], p.rot[2]);

      em._dummy.updateMatrix();
      em.instancedMesh.setMatrixAt(i, em._dummy.matrix);

      const r = cs[0] + (ce[0] - cs[0]) * t;
      const g = cs[1] + (ce[1] - cs[1]) * t;
      const b = cs[2] + (ce[2] - cs[2]) * t;
      em._color.setRGB(r, g, b);
      em.instancedMesh.setColorAt(i, em._color);
    }

    em.instancedMesh.instanceMatrix.needsUpdate = true;
    if (em.instancedMesh.instanceColor) em.instancedMesh.instanceColor.needsUpdate = true;
  }

  /** Remove all emitters + InstancedMeshes from scene. */
  dispose() {
    for (const em of this.emitters) {
      this.scene.remove(em.instancedMesh);
      em.instancedMesh.geometry.dispose();
      em.instancedMesh.material.dispose();
    }
    this.emitters = [];
  }
}
