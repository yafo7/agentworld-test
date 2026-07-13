import { ArchitectNPC } from '../entities/ArchitectNPC.js';
import { loadStudioAnimations, loadStudioModel } from '../data/studioLibrary.js';
import { getPetProfile } from '../data/petProfiles.js';

const PET_CONFIGS = [
  {
    id: 'horse_7',
    name: 'mako',
    commit: '2026-07-02_16-25-32',
    folder: '一匹棕色的马儿，身上穿着7号红色球衣_2.1m',
    spawn: [-38, 0, -18],
    modelPath: 'generated/models/mako.json',
    animationPaths: {
      idle: 'generated/animations/mako_idle.json',
      run: 'generated/animations/mako_run.json',
      jump: 'generated/animations/mako_jump.json',
      dance: 'generated/animations/mako_dance.json',
    },
  },
  {
    id: 'croc_axe',
    name: 'mok',
    commit: '2026-07-02_15-57-38',
    folder: '一只站立行走的鳄鱼，双手各拿着一把大斧子_2.5m',
    spawn: [38, 0, 18],
    modelPath: 'generated/models/mok.json',
    animationPaths: {
      idle: 'generated/animations/mok_idle.json',
      run: 'generated/animations/mok_run.json',
      jump: 'generated/animations/mok_jump.json',
    },
  },
  {
    id: 'peacock',
    name: 'lingq',
    commit: '2026-07-02_15-49-39',
    folder: '一只孔雀_3.0m',
    spawn: [26, 0, -24],
    modelPath: 'generated/models/lingq.json',
    animationPaths: {
      idle: 'generated/animations/lingq_idle.json',
      run: 'generated/animations/lingq_run.json',
      jump: 'generated/animations/lingq_jump.json',
      dance: 'generated/animations/lingq_dance.json',
    },
  },
  {
    id: 'sky_bird',
    name: 'yafo',
    commit: '2026-07-02_15-09-45',
    folder: '一只天蓝色的小鸟_2.5m',
    spawn: [-30, 0, 30],
    modelPath: 'generated/models/yafo.json',
    animationPaths: {
      idle: 'generated/animations/yafo_idle.json',
      run: 'generated/animations/yafo_run.json',
      jump: 'generated/animations/yafo_jump.json',
    },
  },
];

function matchAnimation(anims, patterns) {
  return anims.find((anim) => {
    const text = `${anim.name || ''} ${anim.description || ''}`;
    return patterns.some((pattern) => pattern.test(text));
  });
}

function makeBounds(x, z, range = 10) {
  return { minX: x - range, maxX: x + range, minZ: z - range, maxZ: z + range };
}

function randomIn(min, max) {
  return min + Math.random() * (max - min);
}

async function fetchJson(path) {
  if (!path) return null;
  try {
    const response = await fetch(`/${path}`);
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
    return response.json();
  } catch (_) {
    return null;
  }
}

export class PetManager {
  constructor({ scene, physics, petSpawns = {}, petBehaviors = {} }) {
    this.scene = scene;
    this.physics = physics;
    this.petSpawns = petSpawns;
    this.petBehaviors = petBehaviors;
    this.pets = [];
  }

  async load() {
    for (const config of PET_CONFIGS.filter(c => c.enabled !== false)) {
      const pet = new ArchitectNPC();
      const spawn = this.petSpawns[config.name] || config.spawn;
      pet.mesh.name = config.name;
      pet._petId = config.id;
      pet._petName = config.name;
      pet._profile = getPetProfile(config.name);
      pet._managedByPetManager = true;
      this._configurePet(pet, config.name, spawn);
      pet._initialInteractionDone = false;

      pet.setPosition(...spawn);
      pet.setOrigin(...spawn);
      pet.initPhysics(this.physics);
      this.scene.add(pet.mesh);
      this.pets.push(pet);

      this._loadPetAssets(pet, config);
    }
  }

  async _loadPetAssets(pet, config) {
    try {
      let modelJson = await fetchJson(config.modelPath);
      if (!modelJson) modelJson = await loadStudioModel(config.commit, config.folder);
      if (modelJson) {
        pet.loadModelFromJson(modelJson);
        if (pet._modelGroup) {
          pet._modelGroup.userData._baseScale = pet._modelGroup.scale.x;
          pet._modelGroup.userData._baseY = pet._modelGroup.position.y;
        }
      }

      if (config.animationPaths) {
        for (const [name, path] of Object.entries(config.animationPaths)) {
          const plan = await fetchJson(path);
          if (plan) pet.loadAnimation(name, plan);
        }
      }

      const needsStudioAnimations = ['idle', 'run', 'jump'].some(name => !pet._animPlans[name]);
      const anims = needsStudioAnimations
        ? await loadStudioAnimations(config.commit, config.folder)
        : [];
      const idle = matchAnimation(anims, [/呼吸|idle|待机/i]);
      const run = matchAnimation(anims, [/奔跑|run|行走|walk/i]);
      const jump = matchAnimation(anims, [/跳跃|飞跃|jump/i]);

      if (!pet._animPlans.idle && idle) pet.loadAnimation('idle', idle.plan || idle);
      if (!pet._animPlans.run && run) pet.loadAnimation('run', run.plan || run);
      if (!pet._animPlans.jump && jump) pet.loadAnimation('jump', jump.plan || jump);
      if (!pet._animPlans.jump && pet._animPlans.run) pet._animPlans.jump = pet._animPlans.run;
      if (!pet._animPlans.run && pet._animPlans.idle) pet._animPlans.run = pet._animPlans.idle;

      console.log(`[PetManager] ${config.name} ready:`, Object.keys(pet._animPlans).join(', '));
    } catch (error) {
      console.warn(`[PetManager] ${config.name} failed:`, error.message);
    }
  }

  _configurePet(pet, name, spawn) {
    const behavior = this.petBehaviors[name] || {};
    pet._petState = behavior.initialState || 'idle';
    pet._petRegion = behavior.region || 'pastoral';
    pet._petBounds = behavior.bounds || makeBounds(spawn[0], spawn[2], 10);
    pet._nextPetActionAt = randomIn(1.0, 3.0);
  }

  registerPet(pet, { name, profile = null, spawn, initialState = 'idle', region = 'pastoral', bounds = null, updateExternally = false } = {}) {
    if (!pet || this.pets.includes(pet)) return pet;
    const petName = name || pet._petName || pet.mesh?.name || 'pet';
    const origin = spawn || [pet.mesh.position.x, pet.mesh.position.y, pet.mesh.position.z];
    pet._petName = petName;
    pet._profile = profile || getPetProfile(petName);
    pet._managedByPetManager = true;
    pet._petState = initialState;
    pet._petRegion = region;
    pet._petBounds = bounds || makeBounds(origin[0], origin[2], 10);
    pet._nextPetActionAt = randomIn(1.0, 3.0);
    pet._petManagerExternalUpdate = updateExternally;
    this.pets.push(pet);
    return pet;
  }

  update(dt) {
    for (const pet of this.pets) {
      if (pet._petState === 'free_roam' && !pet._followEnabled && !pet._pastoralBusy) {
        this._updateRandomAction(pet, dt);
      }
      if (!pet._petManagerExternalUpdate) pet.update(dt);
    }
  }

  _updateRandomAction(pet, dt) {
    pet._nextPetActionAt -= dt;
    if (pet._nextPetActionAt > 0 || pet._targetPosition) return;

    const roll = Math.random();
    const idleThreshold = pet._petRegion === 'church_town' ? 0.48 : 0.42;
    if (roll < idleThreshold) {
      pet.stopWalking();
      pet.playAnimation('idle');
      pet._nextPetActionAt = randomIn(1.8, 3.8);
      return;
    }

    if (pet._petRegion === 'church_town' || roll < 0.78) {
      const b = pet._petBounds;
      pet.walkTo(randomIn(b.minX, b.maxX), randomIn(b.minZ, b.maxZ), randomIn(2.5, 4.2));
      pet._nextPetActionAt = randomIn(2.0, 4.0);
      return;
    }

    pet.stopWalking();
    pet.playAnimation('jump');
    pet._nextPetActionAt = randomIn(1.4, 2.8);
  }

  findNearest(position, range, predicate = null) {
    let best = null;
    let bestDist = range;
    for (const pet of this.pets) {
      if (predicate && !predicate(pet)) continue;
      const p = pet.getPosition();
      const dx = p.x - position.x;
      const dz = p.z - position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= bestDist) {
        best = { pet, dist, position: p, dx, dz };
        bestDist = dist;
      }
    }
    return best;
  }

  pauseNear(position, range) {
    for (const pet of this.pets) {
      if (pet._pastoralBusy || pet._petState === 'working' || pet._petState === 'performing' || pet._petState === 'interacting') continue;
      if (pet._followEnabled) continue;
      const p = pet.getPosition();
      const dx = p.x - position.x;
      const dz = p.z - position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= range) {
        pet.stopWalking();
        pet.lockFacing(position.x, position.z);
      } else if (dist > range + 1 && !pet._followEnabled) {
        pet.unlockFacing();
      }
    }
  }

  resumePet(pet) {
    if (!pet || pet._followEnabled || pet._petState !== 'free_roam') return;
    pet.unlockFacing();
    pet._nextPetActionAt = randomIn(0.5, 1.5);
  }
}
