import * as THREE from 'three';
import { StaticEntity } from '../../../engine/entity/StaticEntity.js';
import { buildModelFromJson } from '../../../engine/model/builder.js';
import { applyAnimation } from '../../../engine/animation/player.js';
import { ParticleSystem } from '../../../engine/animation/particles.js';
import { defaultContentGeneration } from '../../../integrations/content/VoxelContentAdapter.js';
import { generatedAssets } from '../../../assets/repositories/GeneratedAssetRepository.js';
import { getGridWorldPosition, worldToGridCoordinates } from '../../../engine/world/terrain.js';
import { recordAIWorldEvent } from '../../../storage/aiWorldState.js';
import { attachPetStateMachine } from '../../../gameplay/pets/PetStateMachine.js';
import { AIWorldActionService } from '../../../gameplay/ai/AIWorldActionService.js';
import { PetWorkCoordinator } from '../../../gameplay/ai/PetWorkCoordinator.js';
import { replaceStaticEntityModel } from '../../../world/model/replaceStaticEntityModel.js';
import {
  collectMountWorkRequest,
  collectRefineWorkRequest,
} from './pastoralWorkDialogue.js';
import { PetBubblePresenter } from '../presentation/PetBubblePresenter.js';
import {
  appendChiiGenerationConstraint,
  resolveChiiSizeProfile,
} from '../data/worldTuningProfile.js';

function dist2(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shortConcrete(text, fallback) {
  return String(text || fallback || '')
    .replace(/[，。！？、,.!?]/g, ' ')
    .replace(/\s+/g, '')
    .slice(0, 24);
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch (_) {}
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

export function describePastoralIdea(idea) {
  if (!idea) return '我刚才的想法被风吹跑了。';
  if (idea.action === 'refine') {
    return `我想把“${idea.targetName}”调整成${idea.description}。可以试试吗？`;
  }
  if (idea.action === 'mount') {
    return `我想在“${idea.targetName}”的${idea.position}加上${idea.part}。可以吗？`;
  }
  return `我想在附近做一个${idea.description}。可以吗？`;
}

export function createPastoralSlice({
  scene,
  player,
  staticEntities,
  worldObjects = null,
  pets,
  dialogueSystem,
  center = [0, 0],
  gridSize = 50,
  terrainLayout = null,
  setDialogueLock = null,
  focusDialogueCamera = null,
  focusWorkCamera = null,
  workScaffoldModelJson = null,
  workScaffoldAnimationPlan = null,
  runtimeStatus = null,
  contentPort = defaultContentGeneration,
  generatedAssetRepository = generatedAssets,
  colliderRegistry = null,
  objectPlacement = null,
  onGeneratedObject = null,
  bubblePresenter = null,
  camera = null,
  vfxService = null,
}) {
  const _pets = pets.filter(Boolean);
  const _busyPets = new Set();
  const _planningPets = new Set();
  const _pendingIdeas = new Map();
  const _objects = worldObjects?.items || staticEntities;
  const _effects = [];
  const _reveals = [];
  const _ideaBubbles = bubblePresenter || new PetBubblePresenter({ camera, vfxService });

  for (const pet of _pets) {
    attachPetStateMachine(pet, pet._petState || 'idle');
    pet._initialInteractionDone = !!pet._initialInteractionDone;
    pet._pastoralAutonomousTimer = 20;
  }

  function setState(pet, state) {
    pet.petState.transition(state, { reason: 'pastoral-state-change' });
    if (state !== 'following') pet.stopFollow?.();
    if (state !== 'free_roam') pet.disableWander?.();
    if (state === 'idle') pet.playAnimation?.('idle');
  }

  function startFollowing(pet) {
    clearPendingIdea(pet, { resume: false });
    pet._initialInteractionDone = true;
    pet.petState.transition('following', { reason: 'player-follow-command' });
    pet.disableWander?.();
    pet.unlockFacing?.();
    pet.followTarget(player.mesh, 3.2, 6.0);
  }

  function startFreeRoam(pet) {
    clearPendingIdea(pet, { resume: false });
    pet._initialInteractionDone = true;
    pet.stopFollow?.();
    pet.unlockFacing?.();
    pet.petState.transition('free_roam', { reason: 'free-roam-command' });
    pet._pastoralAutonomousTimer = 20;
    pet._nextPetActionAt = 0.8;
    if (!pet._managedByPetManager && typeof pet.enableWander === 'function') {
      const p = pet.mesh.position;
      pet.enableWander(2.0, { minX: p.x - 10, maxX: p.x + 10, minZ: p.z - 10, maxZ: p.z + 10 });
    }
  }

  function getPetName(pet) {
    return pet?._petName || pet?.mesh?.name || '宠物';
  }

  function getTargetName(target) {
    return target?.name || target?._petName || target?.mesh?.name || '这个模型';
  }

  async function askPetChoice(pet, text, options, focusTarget = null) {
    if (focusTarget && focusWorkCamera) focusWorkCamera(pet, focusTarget);
    else focusDialogueCamera?.(pet);
    setDialogueLock?.(true, pet);
    const result = await dialogueSystem.askChoice({ speakerName: getPetName(pet), text, options });
    setDialogueLock?.(false, pet);
    return result;
  }

  async function askPetInput(pet, text, placeholder, focusTarget = null) {
    if (focusTarget && focusWorkCamera) focusWorkCamera(pet, focusTarget);
    else focusDialogueCamera?.(pet);
    setDialogueLock?.(true, pet);
    const result = await dialogueSystem.askInput({ speakerName: getPetName(pet), text, placeholder });
    setDialogueLock?.(false, pet);
    return result;
  }

  function getModelJson(target) {
    return target?._originalModelJson || target?.mesh?.userData?.modelJson || null;
  }

  function getTargetPosition(target) {
    if (!target) return null;
    const mesh = target.mesh || target;
    if (!mesh) return null;
    const box = new THREE.Box3().setFromObject(mesh);
    if (!box.isEmpty()) {
      const center = new THREE.Vector3();
      box.getCenter(center);
      center.y = 0;
      return center;
    }
    return mesh.position?.clone?.() || target.getPosition?.() || null;
  }

  function getWorkPositionForTarget(pet, target, extra = 1.35) {
    const targetPos = getTargetPosition(target);
    if (!targetPos) return null;

    const mesh = target.mesh || target;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    if (!box.isEmpty()) box.getSize(size);

    let dir = new THREE.Vector3().subVectors(pet.mesh.position, targetPos);
    dir.y = 0;
    if (dir.lengthSq() < 0.05) {
      dir.subVectors(player.mesh.position, targetPos);
      dir.y = 0;
    }
    if (dir.lengthSq() < 0.05) dir.set(1, 0, 0);
    dir.normalize();

    const radius = Math.max(size.x, size.z, 1) * 0.5;
    const standDistance = Math.min(Math.max(radius + extra, 2.4), 7.0);
    return {
      targetPos,
      standPos: targetPos.clone().addScaledVector(dir, standDistance),
      effectPos: targetPos.clone().addScaledVector(dir, Math.max(radius + 0.25, 1.0)),
      size: size.lengthSq() > 0.001 ? size : new THREE.Vector3(3, 3, 3),
    };
  }

  function replaceTargetModel(target, modelJson, { operation = 'refine', assetId = null } = {}) {
    if (!target || !modelJson) return false;
    if (target instanceof StaticEntity) {
      const replaced = replaceStaticEntityModel({
        entity: target,
        modelJson,
        colliderRegistry,
        operation,
        assetId,
      });
      if (replaced) {
        const metadata = worldObjects?.getMetadata(target) || {};
        worldObjects?.updateMetadata(target, {
          modelJson,
          operation,
          assetId: assetId || metadata.assetId || target.id,
        });
        objectPlacement?.reconcileModel(target, { operation });
      }
      return replaced;
    }
    if (typeof target.replaceModelFromJson === 'function') {
      return target.replaceModelFromJson(modelJson, {
        preserveCurrentScale: operation === 'mount',
      });
    }
    return false;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function addStarBurst(pet, duration = 2.0) {
    if (vfxService) {
      vfxService.playPreset('workStart', {
        target: pet.mesh,
        duration,
        key: `pastoral-work-start:${pet._petId || pet._petName}`,
      });
      return;
    }
    const group = new THREE.Group();
    group.name = 'PastoralStarBurst';
    const geo = new THREE.OctahedronGeometry(0.2, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe66d, transparent: true, opacity: 0.95, depthWrite: false });
    for (let i = 0; i < 16; i++) {
      const star = new THREE.Mesh(geo, mat.clone());
      star.frustumCulled = false;
      const angle = (i / 16) * Math.PI * 2;
      star.userData = {
        angle,
        radius: 0.9 + Math.random() * 1.2,
        y: 1.0 + Math.random() * 1.6,
        speed: 1.6 + Math.random() * 1.4,
      };
      group.add(star);
    }
    group.frustumCulled = false;
    scene.add(group);
    _effects.push({ type: 'stars', group, pet, timer: 0, duration });
  }

  function addDustBurst(position, duration = 1.1) {
    if (vfxService) {
      vfxService.playPreset('dust', {
        position,
        duration,
      });
      return;
    }
    const group = new THREE.Group();
    group.name = 'PastoralDustBurst';
    group.position.copy(position);
    const geo = new THREE.SphereGeometry(0.16, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x9b7b4a, transparent: true, opacity: 0.65, depthWrite: false });
    for (let i = 0; i < 30; i++) {
      const dust = new THREE.Mesh(geo, mat.clone());
      dust.frustumCulled = false;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.8;
      dust.position.set(0, 0.35 + Math.random() * 0.8, 0);
      dust.userData.velocity = new THREE.Vector3(Math.cos(angle) * speed, 1.0 + Math.random() * 1.0, Math.sin(angle) * speed);
      group.add(dust);
    }
    group.frustumCulled = false;
    scene.add(group);
    _effects.push({ type: 'dust', group, timer: 0, duration });
  }

  function addWorkScaffold(points) {
    if (!points?.targetPos) return null;

    if (workScaffoldModelJson) {
      const group = buildModelFromJson(workScaffoldModelJson);
      if (!group) return null;
      group.name = 'PastoralWorkScaffold';
      group.position.copy(points.targetPos);
      group.frustumCulled = false;
      const size = points.size || new THREE.Vector3(3, 3, 3);
      const footprint = Math.max(size.x, size.z, 3.5);
      const scaffoldScale = THREE.MathUtils.clamp((footprint + 2.0) / 6.4, 0.65, 1.8);
      group.scale.setScalar(scaffoldScale);
      scene.add(group);

      const scaffoldPlan = workScaffoldAnimationPlan?.motionPlan
        ? { ...workScaffoldAnimationPlan.motionPlan, _duration: workScaffoldAnimationPlan.duration || 2, _loop: true }
        : workScaffoldAnimationPlan;
      const particles = scaffoldPlan ? new ParticleSystem(scene) : null;
      particles?.setup(scaffoldPlan, group);
      const effect = {
        type: 'scaffold',
        group,
        particles,
        plan: scaffoldPlan,
        poseMap: null,
        timer: 0,
        duration: Infinity,
        fading: false,
      };
      _effects.push(effect);
      return effect;
    }

    const group = new THREE.Group();
    group.name = 'PastoralWorkScaffold';
    group.position.copy(points.targetPos);
    group.frustumCulled = false;

    const size = points.size || new THREE.Vector3(3, 3, 3);
    const hw = Math.max(1.4, size.x * 0.5 + 0.9);
    const hd = Math.max(1.4, size.z * 0.5 + 0.9);
    const height = Math.max(2.4, Math.min(4.4, size.y + 1.2));
    const baseY = 0.12;

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xc28a45,
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x3b2f2a,
      roughness: 0.85,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const postGeo = new THREE.BoxGeometry(0.18, 1, 0.18);
    const railGeo = new THREE.BoxGeometry(1, 0.14, 0.14);
    const plankGeo = new THREE.BoxGeometry(1, 0.12, 0.5);

    const corners = [
      [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd],
    ];
    for (const [x, z] of corners) {
      const post = new THREE.Mesh(postGeo, woodMat.clone());
      post.position.set(x, baseY + height * 0.5, z);
      post.scale.y = height;
      post.frustumCulled = false;
      group.add(post);
    }

    function addRail(x, y, z, len, rotY, mat = railMat) {
      const rail = new THREE.Mesh(railGeo, mat.clone());
      rail.position.set(x, y, z);
      rail.rotation.y = rotY;
      rail.scale.x = len;
      rail.frustumCulled = false;
      group.add(rail);
    }

    for (const y of [baseY + height * 0.35, baseY + height * 0.72]) {
      addRail(0, y, -hd, hw * 2, 0);
      addRail(0, y, hd, hw * 2, 0);
      addRail(-hw, y, 0, hd * 2, Math.PI / 2);
      addRail(hw, y, 0, hd * 2, Math.PI / 2);
    }

    for (const z of [-hd, hd]) {
      const plank = new THREE.Mesh(plankGeo, woodMat.clone());
      plank.position.set(0, baseY + 0.55, z);
      plank.scale.x = hw * 2;
      plank.frustumCulled = false;
      group.add(plank);
    }

    scene.add(group);
    const effect = { type: 'scaffold', group, timer: 0, duration: Infinity, fading: false };
    _effects.push(effect);
    return effect;
  }

  function removeWorkScaffold(effect) {
    if (!effect) return;
    effect.fading = true;
    effect.timer = 0;
    effect.duration = 0.85;
  }

  function disposeGroup(group) {
    scene.remove(group);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }

  function startReveal(group, duration = 1.0) {
    if (!group) return;
    const baseScale = group.scale.clone();
    group.scale.copy(baseScale).multiplyScalar(0.82);
    _reveals.push({ group, baseScale, timer: 0, duration });
  }

  function updateEffects(dt) {
    for (let i = _effects.length - 1; i >= 0; i--) {
      const e = _effects[i];
      e.timer += dt;
      const t = Math.min(e.timer / e.duration, 1);
      if (e.type === 'stars') {
        e.group.position.copy(e.pet.mesh.position);
        for (const star of e.group.children) {
          const a = star.userData.angle + e.timer * star.userData.speed;
          star.position.set(Math.cos(a) * star.userData.radius, star.userData.y + Math.sin(e.timer * 5 + a) * 0.15, Math.sin(a) * star.userData.radius);
          star.rotation.y += dt * 4;
          star.material.opacity = 0.95 * (1 - t);
        }
      } else if (e.type === 'dust') {
        for (const dust of e.group.children) {
          dust.userData.velocity.y -= 2.0 * dt;
          dust.position.addScaledVector(dust.userData.velocity, dt);
          dust.material.opacity = 0.55 * (1 - t);
        }
      } else if (e.type === 'scaffold') {
        if (e.plan) {
          const duration = e.plan._duration || e.plan.duration || 2;
          e.poseMap = applyAnimation(e.plan, duration, e.group, e.timer % duration, e.poseMap);
          e.particles?.update(dt, e.group);
        }
        const pulse = 0.82 + Math.sin(e.timer * 5) * 0.08;
        if (!e.plan) e.group.position.y = Math.sin(e.timer * 2.8) * 0.03;
        e.group.traverse((obj) => {
          if (!obj.material || !('opacity' in obj.material)) return;
          obj.material.opacity = e.fading ? 0.9 * (1 - t) : (e.plan ? 1 : pulse);
        });
      }
      if (t >= 1 && e.duration !== Infinity) {
        e.particles?.dispose();
        disposeGroup(e.group);
        _effects.splice(i, 1);
      }
    }

    for (let i = _reveals.length - 1; i >= 0; i--) {
      const r = _reveals[i];
      r.timer += dt;
      const t = Math.min(r.timer / r.duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      r.group.scale.copy(r.baseScale).multiplyScalar(0.82 + (1 - 0.82) * ease);
      r.group.rotation.y = Math.sin((1 - t) * Math.PI) * 0.035;
      if (t >= 1) {
        r.group.scale.copy(r.baseScale);
        r.group.rotation.y = 0;
        _reveals.splice(i, 1);
      }
    }
  }

  function isObjectTarget(target, activePet) {
    if (!target || target === activePet) return false;
    if (target instanceof StaticEntity) return true;
    return !!target._petName;
  }

  function findNearestObject(origin, activePet, range = 14) {
    const candidates = [
      ..._objects,
      ..._pets,
    ].filter(t => isObjectTarget(t, activePet));

    let best = null;
    let bestD2 = range * range;
    for (const target of candidates) {
      const pos = target.mesh?.position || target.getPosition?.();
      if (!pos) continue;
      const d = dist2(origin, pos);
      if (d <= bestD2) {
        best = target;
        bestD2 = d;
      }
    }
    return best;
  }

  function getForwardPlacement(fromPlayer = true) {
    const origin = fromPlayer ? player.mesh.position : null;
    const yaw = player.mesh.rotation.y || 0;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
    const base = origin || new THREE.Vector3();

    for (const step of [8, 12, 16, 20]) {
      const candidate = base.clone().addScaledVector(forward, step);
      const grid = worldToGridCoordinates(candidate.x, candidate.z, center[0], center[1], gridSize);
      const tile = terrainLayout?.[grid.gridZ]?.[grid.gridX];
      if (tile === 'water') continue;
      const pos = getGridWorldPosition(grid.gridX, grid.gridZ, center[0], center[1], gridSize);
      const occupied = worldObjects
        ? worldObjects.isOccupied(pos, 3)
        : _objects.some(e => dist2({ x: pos.x, z: pos.z }, e.mesh.position) < 9);
      if (!occupied) return new THREE.Vector3(pos.x, 0, pos.z);
    }
    return base.clone().addScaledVector(forward, 10);
  }

  function nearbyContext(pet) {
    const origin = pet.mesh.position;
    const near = _objects
      .map(obj => ({ obj, d: dist2(origin, obj.mesh.position) }))
      .filter(x => x.d < 18 * 18)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map(x => `${x.obj.name}:${(x.obj.tags || []).join('/') || x.obj.category}`);
    const grid = worldToGridCoordinates(origin.x, origin.z, center[0], center[1], gridSize);
    const tile = terrainLayout?.[grid.gridZ]?.[grid.gridX] || 'grass';
    return { tile, near };
  }

  function waitForPetArrive(pet, timeoutMs = 6500) {
    const start = performance.now();
    return new Promise(resolve => {
      function tick() {
        if (!pet._targetPosition || performance.now() - start > timeoutMs) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      }
      tick();
    });
  }

  function forceWorkState(pet) {
    _busyPets.add(pet);
    pet.petState.enterWork({ autonomous: pet.petState.is('free_roam') });
    pet.stopFollow?.();
    pet.disableWander?.();
    pet.stopWalking?.();
    pet._followEnabled = false;
    pet._followTarget = null;
    pet._wanderEnabled = false;
  }

  async function movePetToWork(pet, standPos, lookAtPos = standPos, { focusCamera = true } = {}) {
    forceWorkState(pet);
    pet.unlockFacing?.();
    pet.lockFacing?.(lookAtPos.x, lookAtPos.z);
    pet.walkTo?.(standPos.x, standPos.z, 4.2);
    await waitForPetArrive(pet);
    pet.lockFacing?.(lookAtPos.x, lookAtPos.z);
    pet.playAnimation?.('idle');
    if (focusCamera) focusWorkCamera?.(pet, lookAtPos);
  }

  async function beginWorkAtTarget(pet, target, { focusCamera = true } = {}) {
    const points = getWorkPositionForTarget(pet, target);
    if (!points) return null;
    await movePetToWork(pet, points.standPos, points.targetPos, { focusCamera });
    return points;
  }

  async function beginWorkAtPosition(pet, targetPos, { focusCamera = true } = {}) {
    await movePetToWork(pet, targetPos, targetPos, { focusCamera });
    return { targetPos, standPos: targetPos, effectPos: targetPos };
  }

  async function playWorkIntro(pet, pointsOrTargetPos, { focusCamera = true } = {}) {
    const targetPos = pointsOrTargetPos?.targetPos || pointsOrTargetPos;
    const effectPos = pointsOrTargetPos?.effectPos || targetPos;
    if (focusCamera) focusWorkCamera?.(pet, targetPos);
    addStarBurst(pet, 2.0);
    await delay(2000);
    pet.lockFacing?.(targetPos.x, targetPos.z);
    const name = getPetName(pet);
    if (name === 'momo' && pet._animPlans.wave) {
      pet.playAnimation('wave');
    } else if (name === 'mok' && pet._animPlans.jump) {
      pet.playAnimation('jump');
    } else if (name === 'yafo' && pet._animPlans.jump) {
      pet.playAnimation('jump');
    } else {
      pet.playAnimation?.(pet._animPlans.construct ? 'construct' : (pet._animPlans.run ? 'run' : 'idle'));
    }
    addDustBurst(effectPos, 1.1);
    if (effectPos.distanceTo(pet.mesh.position) > 2.0) {
      addDustBurst(pet.mesh.position.clone(), 0.8);
    }
    await delay(700);
  }

  async function circleAround(pet, targetPos, turns = 2) {
    const steps = Math.max(8, turns * 8);
    const radius = 3.2;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 * turns;
      const x = targetPos.x + Math.cos(a) * radius;
      const z = targetPos.z + Math.sin(a) * radius;
      pet.walkTo?.(x, z, 4.0);
      await waitForPetArrive(pet, 1800);
    }
  }

  function finishWork(pet, nextState = 'idle') {
    _busyPets.delete(pet);
    pet.unlockFacing?.();
    pet.petState.completeWork(nextState);
    if (nextState === 'following') startFollowing(pet);
    else if (nextState === 'free_roam') startFreeRoam(pet);
    else pet.playAnimation?.('idle');
  }

  const aiActions = new AIWorldActionService({
    contentPort,
    assetRepository: generatedAssetRepository,
  });
  const workCoordinator = new PetWorkCoordinator({
    runtimeStatus,
    startPresentation: addWorkScaffold,
    stopPresentation: removeWorkScaffold,
    playIntro: playWorkIntro,
    finishPet: finishWork,
  });

  function placeGeneratedObject(modelJson, position, name = '田园物件', options = {}) {
    const id = options.id || `pastoral_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const entity = new StaticEntity({
      id,
      name: modelJson.name || name,
      tags: ['Object', '田园', 'AI生成'],
      category: 'decor',
      position: [position.x, 0, position.z],
      scale: 1,
      modelJson,
    });
    entity.mesh.userData.pastoralObject = true;
    entity.mesh.userData.aiEventId = options.eventId || null;
    entity._generatedAssetId = options.assetId || null;
    const placement = objectPlacement?.prepareGeneratedEntity(entity, position, {
      semantic: {
        profileId: options.sizeProfile,
        name: entity.name,
        description: name,
        category: entity.category,
      },
    }) || {
      editable: true,
      source: 'generated',
    };
    if (worldObjects) {
      worldObjects.add(entity, {
        modelJson,
        operation: 'generate',
        assetId: options.assetId || id,
        placement,
      });
    } else {
      _objects.push(entity);
      colliderRegistry?.registerEntity(entity, {
        modelJson,
        operation: 'generate',
        assetId: options.assetId || id,
      });
    }
    scene.add(entity.mesh);
    startReveal(entity.mesh);
    return entity;
  }

  async function generateObjectAt(pet, description, targetPos, nextState = 'following', alreadyAtWork = false, options = {}) {
    const focusCamera = options.focusCamera ?? nextState !== 'free_roam';
    const points = alreadyAtWork
      ? (options.workPoints || { targetPos, standPos: pet.mesh.position.clone(), effectPos: targetPos })
      : await beginWorkAtPosition(pet, targetPos, { focusCamera });
    const concisePrompt = shortConcrete(description, '木制田园装饰');
    const sizeProfile = resolveChiiSizeProfile({ description: concisePrompt });
    const prompt = appendChiiGenerationConstraint(concisePrompt, sizeProfile);
    const result = await workCoordinator.run({
      pet,
      points,
      nextState,
      focusCamera,
      status: {
        title: `${getPetName(pet)} 正在创造`,
        preparing: '准备施工',
        requesting: 'AI 正在生成模型',
        applying: '正在放置新物件',
        complete: '新物件已经放好',
      },
      execute: () => aiActions.createObject({
        description: prompt,
        quality: 'voxel',
        tags: ['pastoral', 'object'],
      }),
      apply: async ({ modelJson, assetId }) => {
        const entityId = `pastoral_${assetId}`;
        const eventId = `pastoral:create:${entityId}`;
        const entity = placeGeneratedObject(modelJson, targetPos, prompt, {
          id: entityId,
          assetId,
          eventId,
          sizeProfile,
        });
        recordAIWorldEvent({
          id: eventId,
          type: 'pastoral_create',
          assetId,
          entityId,
          name: prompt,
          prompt,
          position: [entity.mesh.position.x, 0, entity.mesh.position.z],
        });
        if (nextState === 'free_roam') await circleAround(pet, entity.mesh.position, 2);
        return entity;
      },
    });
    if (result && nextState !== 'free_roam') {
      setTimeout(() => onGeneratedObject?.(result), 0);
    }
    return result;
  }

  async function refineObject(pet, target, description, nextState = 'following', alreadyAtWork = false, options = {}) {
    if (!target) return;
    const focusCamera = options.focusCamera ?? nextState !== 'free_roam';
    const points = alreadyAtWork
      ? (options.workPoints || getWorkPositionForTarget(pet, target))
      : await beginWorkAtTarget(pet, target, { focusCamera });
    if (!points) return;
    const prompt = shortConcrete(description, '变得更田园自然');
    return workCoordinator.run({
      pet,
      points,
      nextState,
      focusCamera,
      status: {
        title: `${getPetName(pet)} 正在调整`,
        preparing: '准备施工',
        requesting: 'AI 正在修改模型',
        applying: '正在替换模型',
        complete: '调整完成',
      },
      execute: () => {
        const modelJson = getModelJson(target);
        if (!modelJson) throw new Error('目标没有可修改模型');
        return aiActions.refineObject({
          modelJson,
          description: prompt,
          name: target.name || prompt,
          tags: ['pastoral', 'refine'],
        });
      },
      apply: async ({ modelJson, assetId }) => {
        replaceTargetModel(target, modelJson, { operation: 'refine', assetId });
        const targetId = target.id || target._petId || target._petName;
        recordAIWorldEvent({
          id: `pastoral:target:${targetId}`,
          type: 'pastoral_target',
          action: 'refine',
          targetId,
          assetId,
          prompt,
        });
        startReveal(target._modelGroup || target.mesh);
        if (nextState === 'free_roam') await circleAround(pet, points.targetPos, 2);
        return target;
      },
    });
  }

  async function mountObject(pet, target, partDescription, positionDescription, nextState = 'following', alreadyAtWork = false, options = {}) {
    if (!target) return;
    const focusCamera = options.focusCamera ?? nextState !== 'free_roam';
    const points = alreadyAtWork
      ? (options.workPoints || getWorkPositionForTarget(pet, target))
      : await beginWorkAtTarget(pet, target, { focusCamera });
    if (!points) return;
    const part = shortConcrete(partDescription, '一个小装饰');
    const where = shortConcrete(positionDescription, '顶部');
    return workCoordinator.run({
      pet,
      points,
      nextState,
      focusCamera,
      status: {
        title: `${getPetName(pet)} 正在装配`,
        preparing: '准备施工',
        requesting: 'AI 正在装配部件',
        applying: '正在更新模型',
        complete: '装配完成',
      },
      execute: () => {
        const modelJson = getModelJson(target);
        if (!modelJson) throw new Error('目标没有可装配模型');
        return aiActions.mountPart({
          modelJson,
          part,
          placement: where,
          name: target.name || part,
          tags: ['pastoral', 'mount'],
        });
      },
      apply: async ({ modelJson, assetId, description: prompt }) => {
        replaceTargetModel(target, modelJson, { operation: 'mount', assetId });
        const targetId = target.id || target._petId || target._petName;
        recordAIWorldEvent({
          id: `pastoral:target:${targetId}`,
          type: 'pastoral_target',
          action: 'mount',
          targetId,
          assetId,
          prompt,
        });
        startReveal(target._modelGroup || target.mesh);
        if (nextState === 'free_roam') await circleAround(pet, points.targetPos, 2);
        return target;
      },
    });
  }

  async function interact(pet) {
    if (!pet) return;
    const name = getPetName(pet);
    if (_busyPets.has(pet) || pet.petState.is('working')) {
      await askPetChoice(pet, '我正在忙呢，等会再来聊天吧。', [{ key: 'ok', label: '好，等你忙完。' }]);
      return;
    }

    const pendingIdea = _pendingIdeas.get(pet);
    if (pendingIdea) {
      await reviewAutonomousIdea(pet, pendingIdea);
      return;
    }

    if (!pet._initialInteractionDone) {
      const choice = await askPetChoice(
        pet,
        '今天准备做点什么呢？',
        [
          { key: 'follow', label: '和我一起玩吧！' },
          { key: 'free_roam', label: '今天随便做点自己喜欢的吧！' },
          { key: 'nothing', label: '没什么。' },
        ],
      );
      if (!choice) return;
      if (choice.key === 'follow') startFollowing(pet);
      if (choice.key === 'free_roam') startFreeRoam(pet);
      return;
    }

    const choice = await askPetChoice(
      pet,
      '我们接下来要做什么？',
      [
        { key: 'create', label: '可以在这里帮我做些装饰吗？' },
        { key: 'refine', label: '可以帮我调整一下这个吗？' },
        { key: 'mount', label: '可以帮我加些装饰吗？' },
        pet._petState === 'following' || pet._followEnabled
          ? { key: 'free_roam', label: '还是随便做点自己喜欢的吧！' }
          : { key: 'follow', label: '和我一起玩吧！' },
        { key: 'nothing', label: '没什么。' },
      ],
    );
    if (!choice) return;

    if (choice.key === 'follow') {
      startFollowing(pet);
      return;
    }

    if (choice.key === 'free_roam') {
      startFreeRoam(pet);
      return;
    }

    if (choice.key === 'nothing') return;

    if (choice.key === 'create') {
      const targetPos = getForwardPlacement(true);
      const workPoints = await beginWorkAtPosition(pet, targetPos, { focusCamera: true });
      const desc = await askPetInput(pet, '你想要什么装饰呢？', '例如：蘑菇灯', targetPos);
      if (!desc) { finishWork(pet, 'idle'); return; }
      await generateObjectAt(pet, desc, targetPos, 'idle', true, { focusCamera: true, workPoints });
      return;
    }

    const target = findNearestObject(player.mesh.position, pet);
    if (!target) return;
    const targetPos = getTargetPosition(target) || target.mesh?.position || target.getPosition?.();

    if (choice.key === 'refine') {
      const request = await collectRefineWorkRequest({
        targetName: getTargetName(target),
        askChoice: (text, options) => askPetChoice(pet, text, options, targetPos),
        askInput: (text, placeholder) => askPetInput(pet, text, placeholder, targetPos),
      });
      if (!request) return;
      const workPoints = await beginWorkAtTarget(pet, target, { focusCamera: true });
      if (!workPoints) return;
      await refineObject(pet, target, request.description, 'idle', true, { focusCamera: true, workPoints });
      return;
    }

    if (choice.key === 'mount') {
      const request = await collectMountWorkRequest({
        targetName: getTargetName(target),
        askChoice: (text, options) => askPetChoice(pet, text, options, targetPos),
        askInput: (text, placeholder) => askPetInput(pet, text, placeholder, targetPos),
      });
      if (!request) return;
      const workPoints = await beginWorkAtTarget(pet, target, { focusCamera: true });
      if (!workPoints) return;
      await mountObject(
        pet,
        target,
        request.part,
        request.placement,
        'idle',
        true,
        { focusCamera: true, workPoints },
      );
    }
  }

  function fallbackAutonomous(profile) {
    const action = pick(profile.autonomousBehavior || ['create']);
    if (action === 'refine') {
      return { action, description: pick(profile.examples?.refine || ['变得更田园']) };
    }
    if (action === 'mount') {
      return {
        action,
        part: pick(profile.examples?.mount || ['小花环']),
        position: pick(profile.examples?.mountPosition || ['顶部']),
      };
    }
    return { action: 'create', description: pick(profile.examples?.create || ['木制田园装饰']) };
  }

  async function planAutonomous(pet) {
    const profile = pet._profile;
    if (!profile) return fallbackAutonomous({ autonomousBehavior: ['create'] });
    const context = nearbyContext(pet);
    const system = '你是奇异岛宠物行为规划器。只输出JSON。短中文，具体，不抽象。';
    const user = [
      `宠物:${profile.name}`,
      `性格:${profile.personalityTags.join('、')}`,
      `特点:${profile.featureTags.join('、')}`,
      `喜欢:${profile.preferredObjects.join('、')}`,
      `可选行为:${profile.autonomousBehavior.join('、')}`,
      `当前位置:${context.tile}`,
      `附近:${context.near.join('；') || '空地'}`,
      '输出格式:{"action":"create|refine|mount","description":"15到20字中文","part":"15到20字中文","position":"具体位置"}',
    ].join('\n');

    try {
      const text = await contentPort.chat({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        profile: 'planner',
        temperature: 0.75,
        maxTokens: 220,
      });
      return parseJsonLoose(text) || fallbackAutonomous(profile);
    } catch (err) {
      console.warn('[Pastoral] autonomous chat failed:', err.message);
      return fallbackAutonomous(profile);
    }
  }

  function resolveAutonomousIdea(pet, plan) {
    const requestedAction = ['create', 'refine', 'mount'].includes(plan?.action)
      ? plan.action
      : 'create';
    const target = requestedAction === 'create'
      ? null
      : findNearestObject(pet.mesh.position, pet, 16);
    if (!target) {
      return {
        action: 'create',
        description: shortConcrete(plan?.description, pet._profile?.examples?.create?.[0] || '木制田园装饰'),
        target: null,
        targetName: null,
      };
    }
    return {
      action: requestedAction,
      description: shortConcrete(plan?.description, '变得更田园自然'),
      part: shortConcrete(plan?.part || plan?.description, '一个小装饰'),
      position: shortConcrete(plan?.position, '顶部'),
      target,
      targetName: getTargetName(target),
    };
  }

  function clearPendingIdea(pet, { resume = true } = {}) {
    if (!pet) return;
    _pendingIdeas.delete(pet);
    pet._pastoralIdeaPending = false;
    _ideaBubbles.clearHint(pet);
    if (!resume || !pet.petState?.is('free_roam')) return;
    pet.unlockFacing?.();
    pet._pastoralAutonomousTimer = 20;
    pet._nextPetActionAt = 0.8;
    if (!pet._managedByPetManager && typeof pet.enableWander === 'function') {
      const p = pet.mesh.position;
      pet.enableWander(2.0, {
        minX: p.x - 10,
        maxX: p.x + 10,
        minZ: p.z - 10,
        maxZ: p.z + 10,
      });
    } else {
      pet.playAnimation?.('idle');
    }
  }

  async function prepareAutonomousIdea(pet) {
    if (
      !pet
      || !pet.petState?.is('free_roam')
      || pet.petState.isBusy()
      || _busyPets.has(pet)
      || _planningPets.has(pet)
      || _pendingIdeas.has(pet)
    ) return;
    _planningPets.add(pet);
    try {
      const plan = await planAutonomous(pet);
      if (!pet.petState?.is('free_roam') || pet.petState.isBusy()) return;
      const idea = resolveAutonomousIdea(pet, plan || {});
      _pendingIdeas.set(pet, idea);
      pet._pastoralIdeaPending = true;
      pet.stopWalking?.();
      pet.disableWander?.();
      pet.playAnimation?.('idle');
      _ideaBubbles.setHint(pet, '我有个想法！', { exclusive: false });
    } catch (err) {
      console.warn('[Pastoral] idea preparation failed:', err.message);
      pet._pastoralAutonomousTimer = 20;
    } finally {
      _planningPets.delete(pet);
    }
  }

  async function executeAutonomousIdea(pet, idea) {
    if (!pet || !idea || !pet.petState?.is('free_roam') || _busyPets.has(pet)) return;
    try {
      if (idea.action === 'refine') {
        await refineObject(pet, idea.target, idea.description, 'free_roam', false, { focusCamera: false });
        return;
      }
      if (idea.action === 'mount') {
        await mountObject(
          pet,
          idea.target,
          idea.part || idea.description,
          idea.position,
          'free_roam',
          false,
          { focusCamera: false },
        );
        return;
      }
      await generateObjectAt(
        pet,
        idea.description,
        pet.mesh.position.clone().add(new THREE.Vector3(Math.random() * 6 - 3, 0, Math.random() * 6 - 3)),
        'free_roam',
        false,
        { focusCamera: false },
      );
    } catch (err) {
      console.warn('[Pastoral] autonomous behavior failed:', err.message);
      startFreeRoam(pet);
    }
  }

  async function reviewAutonomousIdea(pet, idea) {
    const choice = await askPetChoice(
      pet,
      describePastoralIdea(idea),
      [
        { key: 'approve', label: '好啊，就这么做吧！' },
        { key: 'later', label: '先等等，我们再看看。' },
      ],
    );
    if (choice?.key !== 'approve') {
      clearPendingIdea(pet);
      return false;
    }
    clearPendingIdea(pet, { resume: false });
    executeAutonomousIdea(pet, idea).catch(err => {
      console.warn('[Pastoral] approved idea failed:', err.message);
      startFreeRoam(pet);
    });
    return true;
  }

  function update(dt) {
    updateEffects(dt);
    _ideaBubbles.update(dt);
    for (const pet of _pets) {
      if (_pendingIdeas.has(pet)) {
        if (!pet.petState.is('free_roam')) clearPendingIdea(pet, { resume: false });
        continue;
      }
      if (!pet.petState.is('free_roam') || pet.petState.isBusy()) continue;
      pet._pastoralAutonomousTimer = (pet._pastoralAutonomousTimer ?? 20) - dt;
      if (pet._pastoralAutonomousTimer <= 0) {
        pet._pastoralAutonomousTimer = 20;
        prepareAutonomousIdea(pet);
      }
    }
  }

  return {
    interact,
    update,
    startFollowing,
    startFreeRoam,
    hasPendingIdea: pet => _pendingIdeas.has(pet),
    getInteractionLabel: pet => _pendingIdeas.has(pet)
      ? `听听${getPetName(pet)}的想法`
      : `与${getPetName(pet)}对话`,
    dispose: () => _ideaBubbles.dispose(),
  };
}
