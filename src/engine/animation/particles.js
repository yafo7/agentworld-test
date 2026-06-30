import * as THREE from 'three';

/**
 * Particle emitter for 'emit' animation tracks.
 * Implemented with InstancedMesh per API reference §6.3.
 *
 * Usage:
 *   const emitter = new ParticleEmitter(emitConfig, group);
 *   emitter.addToScene(scene);
 *   // in animation loop:
 *   emitter.update(dt);
 *   // when done:
 *   emitter.removeFromScene(scene);
 */
export class ParticleEmitter {
  constructor(config, group) {
    this.config = config;
    this.group = group;
    this.particles = [];
    this.accumulator = 0;

    const { rate, lifetime, mesh, meshSize } = config;
    const maxLifetime = Array.isArray(lifetime) ? lifetime[1] : lifetime;
    const maxCount = Math.min(500, Math.ceil(rate * maxLifetime + 5));

    const geo = mesh === 'box'
      ? new THREE.BoxGeometry(1, 1, 1)
      : new THREE.IcosahedronGeometry(0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });

    this.instancedMesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.instancedMesh.count = 0;
    this.instancedMesh.castShadow = false;
    this.instancedMesh.frustumCulled = false;

    this.dummy = new THREE.Object3D();
  }

  addToScene(scene) {
    scene.add(this.instancedMesh);
  }

  removeFromScene(scene) {
    scene.remove(this.instancedMesh);
    this.instancedMesh.geometry.dispose();
    this.instancedMesh.material.dispose();
  }

  update(dt) {
    const cfg = this.config;
    const worldPos = new THREE.Vector3();
    this.group.getWorldPosition(worldPos);

    // Spawn new particles
    this.accumulator += cfg.rate * dt;
    while (this.accumulator >= 1) {
      this._spawn(worldPos);
      this.accumulator -= 1;
    }

    // Simulate existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const accel = cfg.acceleration || [0, 0, 0];
      p.vel[0] += accel[0] * dt;
      p.vel[1] += accel[1] * dt;
      p.vel[2] += accel[2] * dt;
      p.pos[0] += p.vel[0] * dt;
      p.pos[1] += p.vel[1] * dt;
      p.pos[2] += p.vel[2] * dt;
    }

    // Render to InstancedMesh
    const { meshSize, colorStart, colorEnd, scaleStart, scaleEnd } = cfg;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const t = 1 - p.life / p.maxLife;
      const s = meshSize * (scaleStart + (scaleEnd - scaleStart) * t);
      const r = colorStart[0] + (colorEnd[0] - colorStart[0]) * t;
      const g = colorStart[1] + (colorEnd[1] - colorStart[1]) * t;
      const b = colorStart[2] + (colorEnd[2] - colorStart[2]) * t;

      this.dummy.position.set(p.pos[0], p.pos[1], p.pos[2]);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
      this.instancedMesh.setColorAt(i, new THREE.Color(r, g, b));
    }

    this.instancedMesh.count = this.particles.length;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  _spawn(worldPos) {
    const cfg = this.config;
    const offset = cfg.offset || [0, 0, 0];

    let pos;
    if (cfg.emitMode === 'volume') {
      pos = this._randomPointInAABB();
    } else {
      pos = [worldPos.x + offset[0], worldPos.y + offset[1], worldPos.z + offset[2]];
    }

    const dir = cfg.velocity?.dir || [0, 1, 0];
    const speedRange = cfg.velocity?.speed || [1, 3];
    const spread = cfg.velocity?.spread ?? 0.3;

    let vx = dir[0] + (Math.random() - 0.5) * spread * 2;
    let vy = dir[1] + (Math.random() - 0.5) * spread * 2;
    let vz = dir[2] + (Math.random() - 0.5) * spread * 2;
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);

    const lifeMin = cfg.lifetime?.[0] ?? 0.5;
    const lifeMax = cfg.lifetime?.[1] ?? 1.5;
    const life = lifeMin + Math.random() * (lifeMax - lifeMin);

    this.particles.push({
      pos: [...pos],
      vel: [(vx / len) * speed, (vy / len) * speed, (vz / len) * speed],
      life,
      maxLife: life,
    });
  }

  _randomPointInAABB() {
    // Simplified: use group world position as center with small random offset
    const wp = new THREE.Vector3();
    this.group.getWorldPosition(wp);
    return [
      wp.x + (Math.random() - 0.5) * 2,
      wp.y + (Math.random() - 0.5) * 2,
      wp.z + (Math.random() - 0.5) * 2,
    ];
  }
}
