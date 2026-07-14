import * as THREE from 'three';
import { ParticleSystem } from '../../../engine/animation/particles.js';
import { buildModelFromJson } from '../../../engine/model/builder.js';

const RUN_DUST_PLAN = {
  _bearFeet: {
    emit: {
      emitMode: 'point',
      mesh: 'sphere',
      meshSize: 0.08,
      rate: 10,
      lifetime: [0.3, 0.6],
      velocity: { dir: [0, 0.3, 0], speed: [0.2, 0.6], spread: 0.5 },
      acceleration: [0, -0.5, 0],
      colorStart: [0.75, 0.65, 0.45],
      colorEnd: [0.5, 0.4, 0.3, 0],
      scaleStart: [0.4, 0.4, 0.4],
      scaleEnd: [0.05, 0.05, 0.05],
    },
  },
};

const CHOP_SPARK_PLAN = {
  _chopEmitter: {
    emit: {
      emitMode: 'volume',
      mesh: 'sphere',
      meshSize: 0.1,
      rate: 30,
      lifetime: [0.4, 0.9],
      velocity: { dir: [0, 0.5, 0], speed: [0.5, 2], spread: 0.7 },
      acceleration: [0, -1.5, 0],
      colorStart: [1, 0.6, 0.1],
      colorEnd: [1, 0.2, 0, 0],
      scaleStart: [0.5, 0.5, 0.5],
      scaleEnd: [0.05, 0.05, 0.05],
    },
  },
};

const STUMP_BURST_PLAN = {
  _burstEmitter: {
    emit: {
      emitMode: 'volume',
      mesh: 'sphere',
      meshSize: 0.12,
      rate: 200,
      lifetime: [0.5, 1],
      velocity: { dir: [0, 1, 0], speed: [1, 3], spread: 0.8 },
      acceleration: [0, -2, 0],
      colorStart: [0.5, 0.8, 0.3],
      colorEnd: [0.2, 0.5, 0.1, 0],
      scaleStart: [0.3, 0.3, 0.3],
      scaleEnd: [0.05, 0.05, 0.05],
    },
  },
};

export class TreeChopSequence {
  constructor({ scene, bear, player, assetRepository }) {
    this.scene = scene;
    this.bear = bear;
    this.player = player;
    this.assetRepository = assetRepository;
    this.chopParticles = null;
    this.chopEmitter = null;
    this.reveals = [];
    this.bursts = [];

    this.runEmitter = new THREE.Object3D();
    this.runEmitter.name = 'bearFeetEmitter';
    this.runEmitter.position.set(0, 0.1, 0);
    this.bear.mesh.add(this.runEmitter);
    this.runDust = new ParticleSystem(scene);
    this.runDust.setup(RUN_DUST_PLAN, bear.mesh);
    this.bear.onRunDust?.(() => {});
  }

  async start(tree) {
    if (!tree) return false;
    let stumpJson = null;
    try {
      stumpJson = await this.assetRepository.getModel('stump');
    } catch (_) {}

    this._stopChopParticles();
    this.chopEmitter = new THREE.Object3D();
    this.chopEmitter.name = '_chopEmitter';
    tree.mesh.add(this.chopEmitter);
    const box = new THREE.Box3().setFromObject(tree.mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    this.chopEmitter.position.set(0, size.y * 0.5, 0);
    this.chopParticles = new ParticleSystem(this.scene);
    this.chopParticles.setup(CHOP_SPARK_PLAN, tree.mesh);

    this.bear.chopTree(tree, () => {
      this._stopChopParticles();
      if (stumpJson) {
        try {
          const stumpGroup = buildModelFromJson(stumpJson);
          if (stumpGroup) this._revealStump(tree, stumpGroup, stumpJson);
        } catch (error) {
          console.warn('[TreeChop] Stump build failed:', error.message);
        }
      } else if (tree._content) {
        tree._content.scale.set(0.3, 0.3, 0.3);
      }
      this.bear.followTarget(this.player.mesh, 3, 6);
    });
    return true;
  }

  update(dt) {
    this.runDust.update(dt, this.bear.mesh);
    this.chopParticles?.update(dt, this.bear.mesh);

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.elapsed += dt;
      burst.particles.update(dt, burst.tree.mesh);
      if (burst.elapsed >= 0.3) {
        burst.particles.dispose();
        burst.emitter.removeFromParent();
        this.bursts.splice(i, 1);
      }
    }

    for (let i = this.reveals.length - 1; i >= 0; i--) {
      const reveal = this.reveals[i];
      reveal.elapsed += dt;
      const progress = Math.min(reveal.elapsed / reveal.duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      reveal.group.scale.setScalar(0.82 + 0.18 * eased);
      reveal.group.rotation.y = Math.sin((1 - progress) * Math.PI) * 0.035;
      if (progress < 1) continue;
      reveal.group.scale.setScalar(1);
      reveal.group.rotation.y = 0;
      reveal.tree.replaceModel(reveal.group, reveal.stumpJson);
      this.reveals.splice(i, 1);
    }
  }

  _revealStump(tree, group, stumpJson) {
    this._burst(tree);
    group.scale.setScalar(0.82);
    tree._content.add(group);
    const box = new THREE.Box3().setFromObject(group);
    group.position.y = -box.min.y * 0.82;
    this.reveals.push({ tree, group, stumpJson, elapsed: 0, duration: 1 });
  }

  _burst(tree) {
    const emitter = new THREE.Object3D();
    emitter.name = '_burstEmitter';
    tree.mesh.add(emitter);
    const box = new THREE.Box3().setFromObject(tree.mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    emitter.position.set(0, size.y * 0.5, 0);
    const particles = new ParticleSystem(this.scene);
    particles.setup(STUMP_BURST_PLAN, tree.mesh);
    this.bursts.push({ tree, emitter, particles, elapsed: 0 });
  }

  _stopChopParticles() {
    this.chopParticles?.dispose();
    this.chopParticles = null;
    this.chopEmitter?.removeFromParent();
    this.chopEmitter = null;
  }

  dispose() {
    this._stopChopParticles();
    this.runDust.dispose();
    this.runEmitter.removeFromParent();
    for (const burst of this.bursts) {
      burst.particles.dispose();
      burst.emitter.removeFromParent();
    }
    this.bursts = [];
    this.reveals = [];
  }
}

