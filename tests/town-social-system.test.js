import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { TownSocialSystem } from '../src/demos/chii-island/systems/TownSocialSystem.js';
import { attachPetStateMachine, PET_STATES } from '../src/gameplay/pets/PetStateMachine.js';
import { WorldObjectRegistry } from '../src/world/WorldObjectRegistry.js';
import { ActivityRegistry } from '../src/gameplay/social/ActivityRegistry.js';
import { ActivityAssetResolver } from '../src/gameplay/social/ActivityAssetResolver.js';
import { createTownActivityRegistrySeed } from '../src/demos/chii-island/data/townActivityRegistry.js';

function makeModel(name) {
  return { format: 2, name, nodes: [], parts: [] };
}

function makePet(id, assetId = id) {
  const pet = {
    _petId: assetId,
    _petName: id,
    _profile: { personalityTags: [], featureTags: [], favoriteActions: [] },
    _originalModelJson: makeModel(id),
    _animPlans: { idle: { _duration: 2, _loop: true } },
    _targetPosition: null,
    mesh: new THREE.Group(),
    _modelGroup: new THREE.Group(),
    stopFollow() { this._followEnabled = false; this._followTarget = null; },
    disableWander() {},
    stopWalking() { this._targetPosition = null; },
    unlockFacing() { this.facing = null; },
    lockFacing(x, z) { this.facing = { x, z }; },
    walkTo(x, z) { this._targetPosition = { x, z }; },
    setPosition(x, y, z) { this.mesh.position.set(x, y, z); this._targetPosition = null; },
    playAnimation(name) { this.animation = name; },
    loadAnimation(name, plan) { this._animPlans[name] = plan; },
    followTarget(target) { this._followEnabled = true; this._followTarget = target; },
    replaceModelFromJson(modelJson) {
      this._originalModelJson = modelJson;
      this._modelGroup = new THREE.Group();
      return true;
    },
  };
  attachPetStateMachine(pet, PET_STATES.FREE_ROAM);
  return pet;
}

function makeWorldEntity(id, name, tags) {
  const mesh = new THREE.Group();
  const content = new THREE.Group();
  mesh.add(content);
  return {
    _instanceId: id,
    id,
    name,
    tags,
    mesh,
    _content: content,
    _originalModelJson: makeModel(name),
    replaceModel(_model, modelJson) { this._originalModelJson = modelJson; },
    getWorldBBox() {
      return new THREE.Box3(
        this.mesh.position.clone().addScalar(-1),
        this.mesh.position.clone().addScalar(1),
      );
    },
  };
}

function makeContentHarness() {
  let serial = 0;
  const savedModels = new Map();
  const calls = { model: [], mount: [], animation: [], chat: [] };
  return {
    calls,
    repository: {
      async saveModel({ modelJson }) {
        const assetId = `social_asset_${++serial}`;
        savedModels.set(assetId, modelJson);
        return { assetId };
      },
      async get(assetId) {
        return { modelJson: savedModels.get(assetId) || null };
      },
    },
    port: {
      async generateModel(request) {
        calls.model.push(request);
        return { modelJson: makeModel(`generated_${serial + 1}`) };
      },
      async mountPart(request) {
        calls.mount.push(request);
        return { modelJson: makeModel(`mounted_${serial + 1}`) };
      },
      async generateAnimation(request) {
        calls.animation.push(request);
        return { plan: { _duration: request.duration, _loop: false } };
      },
      async chat(request) {
        calls.chat.push(request);
        throw new Error('not expected');
      },
    },
  };
}

function makeEquipmentHarness() {
  const calls = [];
  return {
    calls,
    service: {
      async resolveLoadout(request) {
        calls.push(request);
        return {
          modelJson: makeModel(`${request.characterId}-${request.variantId}-outfit`),
          assetId: `outfit:${request.characterId}`,
          loadout: request.loadout,
          source: 'outfit-preset',
        };
      },
    },
  };
}

async function waitFor(predicate, message = 'condition') {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assert.fail(`Timed out waiting for ${message}`);
}

function stubEventPropSpawning(system) {
  system._spawnEventProp = async function spawnEventProp(spec, plan) {
    const entity = makeWorldEntity(`event_${spec.id}`, spec.name, ['活动道具', plan.type]);
    entity.playIdleAnimation = () => {};
    this.scene.add(entity.mesh);
    this.worldObjects.add(entity, {
      modelJson: entity._originalModelJson,
      operation: 'generate',
      placement: { editable: false, source: 'social_event', footprint: spec.footprint },
    });
    entity.mesh.visible = false;
    const prop = {
      entity,
      spec,
      modelJson: entity._originalModelJson,
      particleSystem: null,
      displayScale: entity.mesh.scale.clone(),
      transition: null,
    };
    this.eventProps.push(prop);
    return prop;
  };
}

function stubEventPropEntityCreation(system) {
  system._createEventPropEntity = function createEventPropEntity(spec, plan, _index, result) {
    const entity = makeWorldEntity(`event_${spec.id}_${this.eventProps.length}`, spec.name, ['活动道具', plan.type]);
    entity._originalModelJson = result.modelJson;
    entity._generatedAssetId = result.assetId;
    entity.playIdleAnimation = () => {};
    this.scene.add(entity.mesh);
    this.worldObjects.add(entity, {
      modelJson: result.modelJson,
      operation: 'generate',
      assetId: result.assetId,
      placement: { editable: false, source: 'social_event', footprint: spec.footprint },
    });
    entity.mesh.visible = false;
    const prop = {
      entity,
      spec,
      modelJson: result.modelJson,
      particleSystem: null,
      displayScale: entity.mesh.scale.clone(),
      transition: null,
    };
    this.eventProps.push(prop);
    return prop;
  };
}

function makeDialogue(choices, { sayResult = true } = {}) {
  return {
    async askChoice() { return { key: choices.shift() }; },
    async say() { return sayResult; },
    async askInput() { return null; },
  };
}

function makeCueHarness() {
  const lines = [];
  return {
    lines,
    setHint() {},
    clearHint() {},
    showLine(pet, text) { lines.push({ pet: pet?._petName, text }); },
    update() {},
    hideAll() {},
    dispose() {},
  };
}

function settleAtPreparedSlots(system) {
  const petsById = new Map(system.participants.map(pet => [pet._petName, pet]));
  system.preparedActivity.plan.participants.forEach((id, index) => {
    const pet = petsById.get(id);
    const slot = system.preparedActivity.slots[index];
    if (pet && slot) pet.setPosition(slot.x, slot.y || 0, slot.z);
  });
}

async function completePreparationTasks(system) {
  await waitFor(() => system.preparedActivity, 'activity assets');
  let guard = 0;
  while (!system.activeActivity.prepTask.complete && guard < 12) {
    guard += 1;
    const task = system.activeActivity.prepTask;
    if (task.kind === 'talk_pet') {
      const pet = system.participants.find(candidate => candidate._petName === task.petId);
      assert.ok(pet, `missing invitation pet ${task.petId}`);
      assert.equal(await system.interact(pet, makeDialogue([])), true);
    } else {
      system.player.mesh.position.copy(task.target);
      system.update(0.1);
    }
  }
  assert.equal(system.activeActivity.prepTask.complete, true);
  await waitFor(() => system.activeActivity.status === 'gathering', 'activity gathering');
}

test('daily town activity starts after its option is accepted even when the acknowledgement is dismissed', async () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq');
  const mako = makePet('mako');
  const participants = [fangk, lingq, mako];
  const cues = makeCueHarness();
  const petManager = {
    resumePet() {},
  };
  const contentPort = {
    async generateAnimation({ duration }) {
      return { plan: { _duration: duration, _loop: false } };
    },
    async generateModel() { throw new Error('not expected'); },
    async refineModel() { throw new Error('not expected'); },
    async mountPart() { throw new Error('not expected'); },
    async chat() { throw new Error('not expected'); },
  };
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager,
    participants,
    center: new THREE.Vector3(),
    worldObjects: new WorldObjectRegistry(),
    objectPlacement: null,
    contentPort,
    generatedAssetRepository: { async saveModel() { return { assetId: 'unused' }; } },
    cuePresenter: cues,
  });

  assert.equal(await system.interact(lingq, makeDialogue(['greeting'], { sayResult: null })), true);
  await completePreparationTasks(system);
  assert.equal(system.activeActivity.plan.type, 'greeting');
  assert.equal(system.canInteract(lingq), true);
  assert.equal(system.canInteract(fangk), false);

  settleAtPreparedSlots(system);
  system.update(0.1);
  assert.equal(system.activeActivity.status, 'performing');

  system.update(10.5);
  assert.equal(system.activeActivity.status, 'linger');
  assert.ok(cues.lines.some(line => line.pet === 'mako' && line.text.includes('很有精神')));
  assert.equal(await system.interact(lingq, makeDialogue(['end'])), true);
  assert.equal(system.activeActivity, null);
  assert.equal(lingq.petState.current, PET_STATES.FREE_ROAM);
  assert.equal(mako.petState.current, PET_STATES.FREE_ROAM);
  system.dispose();
});

test('festival activity keeps running and rotates contextual pet lines until fangk ends it', async () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq', 'peacock');
  const mako = makePet('mako', 'horse_7');
  const harness = makeContentHarness();
  const cues = makeCueHarness();
  const worldObjects = new WorldObjectRegistry();
  const campfire = makeWorldEntity('festival_fire', '篝火', ['篝火']);
  worldObjects.add(campfire, { modelJson: campfire._originalModelJson });
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [fangk, lingq, mako],
    center: new THREE.Vector3(),
    worldObjects,
    objectPlacement: null,
    contentPort: harness.port,
    generatedAssetRepository: harness.repository,
    cuePresenter: cues,
  });

  assert.equal(await system.interact(fangk, makeDialogue(['party'])), true);
  await completePreparationTasks(system);
  settleAtPreparedSlots(system);
  system.update(0.1);
  assert.equal(system.activeActivity.status, 'performing');

  system.update(10.5);
  assert.equal(system.activeActivity.status, 'linger');
  for (const pet of [fangk, lingq, mako]) {
    const plan = pet._animPlans[pet.animation];
    assert.equal(plan?._loop, true);
    pet.animation = 'idle';
  }
  system.update(0.1);
  for (const pet of [fangk, lingq, mako]) assert.notEqual(pet.animation, 'idle');
  assert.ok(cues.lines.some(line => line.text.includes('观众请看尾羽')));

  assert.equal(await system.interact(fangk, makeDialogue(['end'])), true);
  assert.equal(system.activeActivity, null);
  system.dispose();
});

test('campfire party reuses resident dance animations before calling the backend', async () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq', 'peacock');
  const mako = makePet('mako', 'horse_7');
  for (const pet of [fangk, lingq, mako]) {
    pet._animPlans.dance = { _duration: 2.8, _loop: true, resident: pet._petName };
  }
  const harness = makeContentHarness();
  const worldObjects = new WorldObjectRegistry();
  const campfire = makeWorldEntity('reused_dance_fire', '篝火', ['篝火']);
  worldObjects.add(campfire, { modelJson: campfire._originalModelJson });
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [fangk, lingq, mako],
    center: new THREE.Vector3(),
    worldObjects,
    objectPlacement: null,
    contentPort: harness.port,
    generatedAssetRepository: harness.repository,
  });

  assert.equal(await system.interact(fangk, makeDialogue(['party'])), true);
  await completePreparationTasks(system);
  assert.equal(harness.calls.animation.length, 0);
  for (const pet of [fangk, lingq, mako]) {
    const prepared = system.preparedActivity.animations.get(pet._petName);
    assert.equal(prepared.key, 'dance');
    assert.equal(prepared.plan, pet._animPlans.dance);
    assert.equal(prepared.source, 'resident-animation-library');
  }

  settleAtPreparedSlots(system);
  system.update(0.1);
  for (const pet of [fangk, lingq, mako]) assert.equal(pet.animation, 'dance');
  system.dispose();
});

test('town activities do not start from the wrong pet dialogue', async () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq', 'peacock');
  const mako = makePet('mako', 'horse_7');
  const worldObjects = new WorldObjectRegistry();
  const appleTree = makeWorldEntity('apple_tree_menu', '苹果树', ['apple']);
  const campfire = makeWorldEntity('campfire_menu', '篝火', ['篝火']);
  worldObjects.add(appleTree, { modelJson: appleTree._originalModelJson });
  worldObjects.add(campfire, { modelJson: campfire._originalModelJson });
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [fangk, lingq, mako],
    center: new THREE.Vector3(),
    worldObjects,
    objectPlacement: null,
    contentPort: {},
    generatedAssetRepository: {},
  });

  const makoLabels = system._idleOptions(mako, false).map(option => option.key);
  const lingqLabels = system._idleOptions(lingq, false).map(option => option.key);
  const fangkLabels = system._idleOptions(fangk, false).map(option => option.key);
  assert.ok(makoLabels.includes('apple_pick'));
  assert.ok(!makoLabels.includes('birthday'));
  assert.ok(lingqLabels.includes('greeting'));
  assert.ok(!lingqLabels.includes('new_year'));
  assert.ok(fangkLabels.includes('campfire'));
  assert.ok(fangkLabels.includes('custom_festival'));
  assert.ok([makoLabels, lingqLabels, fangkLabels].every(options => options.length <= 3));
  system.dispose();
});

test('birthday uses the Original full outfit and restores it after the cake exits', async () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq', 'peacock');
  const mako = makePet('mako', 'horse_7');
  const harness = makeContentHarness();
  const equipment = makeEquipmentHarness();
  const worldObjects = new WorldObjectRegistry();
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [fangk, lingq, mako],
    center: new THREE.Vector3(),
    worldObjects,
    objectPlacement: null,
    contentPort: harness.port,
    generatedAssetRepository: harness.repository,
    equipmentService: equipment.service,
    sceneStyle: 'original',
  });
  stubEventPropSpawning(system);

  assert.equal(await system.interact(fangk, makeDialogue(['birthday'])), true);
  await completePreparationTasks(system);
  assert.equal(system.activeActivity.plan.entry.petId, 'fangk');
  assert.equal(system.activeActivity.plan.exit.petId, 'fangk');
  assert.equal(system.eventProps[0].spec.id, 'birthday_table');
  assert.equal(harness.calls.mount.length, 0);
  assert.equal(equipment.calls.length, 1);

  settleAtPreparedSlots(system);
  system.update(0.1);
  assert.equal(system.activeActivity.status, 'costume_change');
  system.update(1);
  assert.equal(system.temporaryPetModels.has(mako), false);
  system.update(0.8);
  assert.equal(system.temporaryPetModels.has(mako), true);
  system.update(0.5);
  assert.equal(system.activeActivity.status, 'birthday_intro');
  system.update(3);
  assert.equal(system.activeActivity.status, 'performing');
  assert.equal(system.temporaryPetModels.has(mako), true);
  assert.equal(system.canInteract(mako), false);
  assert.equal(system.canInteract(fangk), true);

  assert.equal(await system.interact(fangk, makeDialogue(['end'])), true);
  assert.equal(system.activeActivity.status, 'prop_exit');
  system.update(1.3);
  assert.equal(system.activeActivity, null);
  assert.equal(system.eventProps.length, 0);
  assert.equal(system.temporaryPetModels.size, 0);
  assert.equal(mako._originalModelJson.name, 'mako');
  system.dispose();
});

test('Spring Festival dresses residents, collects greetings and cleans temporary scenery', async () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq', 'peacock');
  const mako = makePet('mako', 'horse_7');
  const appleTree = makeWorldEntity('apple_tree_1', '苹果树', ['树木', 'apple']);
  const church = makeWorldEntity('church_1', '哥特教堂', ['建筑', 'church']);
  const worldObjects = new WorldObjectRegistry();
  worldObjects.add(appleTree, { modelJson: appleTree._originalModelJson });
  worldObjects.add(church, { modelJson: church._originalModelJson });
  const harness = makeContentHarness();
  const equipment = makeEquipmentHarness();
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [fangk, lingq, mako],
    center: new THREE.Vector3(),
    worldObjects,
    objectPlacement: null,
    contentPort: harness.port,
    generatedAssetRepository: harness.repository,
    equipmentService: equipment.service,
    sceneStyle: 'original',
  });
  stubEventPropSpawning(system);

  assert.equal(await system.interact(fangk, makeDialogue(['new_year'])), true);
  await completePreparationTasks(system);
  assert.equal(system.temporaryPetModels.size, 0);
  assert.equal(system.temporaryWorldModels.size, 2);
  assert.equal(system.eventProps[0].spec.id, 'firecracker');
  assert.equal(system.eventProps.length, 7);
  assert.equal(system.activeActivity.prepTask.steps.length, 3);
  assert.ok(system.eventProps.every(prop => prop.entity.mesh.visible === false));
  assert.equal(harness.calls.mount.length, 2);
  assert.equal(equipment.calls.length, 3);
  const firecracker = system.eventProps[0].entity;

  settleAtPreparedSlots(system);
  system.update(0.1);
  system.update(1);
  system.update(1.2);
  assert.equal(system.activeActivity.status, 'new_year_greetings');
  assert.equal(system.temporaryPetModels.size, 3);
  for (const pet of [fangk, lingq, mako]) {
    assert.equal(await system.interact(pet, makeDialogue([])), true);
  }
  system.update(0.1);
  assert.equal(system.activeActivity.status, 'new_year_dance_gathering');
  assert.equal(firecracker.mesh.visible, true);
  assert.equal(await system.interact(fangk, makeDialogue(['end'])), true);
  assert.equal(system.activeActivity.status, 'prop_exit');
  assert.equal(system.eventProps.find(prop => prop.entity === firecracker).transition.type, 'disappear');
  system.update(1.3);
  assert.equal(system.activeActivity, null);
  assert.equal(system.temporaryPetModels.size, 0);
  assert.equal(system.temporaryWorldModels.size, 0);
  assert.equal(appleTree._originalModelJson.name, '苹果树');
  assert.equal(church._originalModelJson.name, '哥特教堂');
  assert.equal(worldObjects.items.includes(firecracker), false);
  system.dispose();
});

test('repeating the same town activity reuses generated models and animations', async () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq', 'peacock');
  const mako = makePet('mako', 'horse_7');
  const harness = makeContentHarness();
  const equipment = makeEquipmentHarness();
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [fangk, lingq, mako],
    center: new THREE.Vector3(),
    worldObjects: new WorldObjectRegistry(),
    objectPlacement: null,
    contentPort: harness.port,
    generatedAssetRepository: harness.repository,
    equipmentService: equipment.service,
    sceneStyle: 'original',
  });
  stubEventPropEntityCreation(system);

  assert.equal(await system.interact(fangk, makeDialogue(['birthday'])), true);
  await waitFor(() => system.preparedActivity, 'first birthday preparation');
  const firstCounts = {
    model: harness.calls.model.length,
    mount: harness.calls.mount.length,
    animation: harness.calls.animation.length,
  };
  assert.deepEqual(firstCounts, { model: 1, mount: 0, animation: 5 });
  system.stopActivity('test-repeat');

  assert.equal(await system.interact(fangk, makeDialogue(['birthday'])), true);
  await waitFor(() => system.preparedActivity, 'second birthday preparation');
  assert.deepEqual({
    model: harness.calls.model.length,
    mount: harness.calls.mount.length,
    animation: harness.calls.animation.length,
  }, firstCounts);

  system.dispose();
});

test('fangk can cancel an activity while backend animation preparation is pending', async () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq', 'peacock');
  const mako = makePet('mako', 'horse_7');
  let releaseAnimation;
  const animationGate = new Promise(resolve => { releaseAnimation = resolve; });
  const completedStages = [];
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [fangk, lingq, mako],
    center: new THREE.Vector3(),
    worldObjects: new WorldObjectRegistry(),
    objectPlacement: null,
    contentPort: {
      async generateAnimation() { return animationGate; },
    },
    generatedAssetRepository: {},
    runtimeStatus: {
      startJob() { return 'pending_job'; },
      updateJob() {},
      completeJob(_id, stage) { completedStages.push(stage); },
      failJob() {},
      setActivityStatus() {},
    },
  });

  assert.equal(await system.interact(fangk, makeDialogue(['campfire'])), true);
  assert.equal(system.activeActivity.status, 'preparing');
  assert.equal(system.canInteract(fangk), true);
  assert.equal(system.canInteract(mako), false);
  assert.equal(await system.interact(fangk, makeDialogue(['end'])), true);
  assert.equal(system.activeActivity, null);
  assert.ok(completedStages.includes('活动已结束'));

  releaseAnimation({ plan: { _duration: 3, _loop: true } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(system.activeActivity, null);
  system.dispose();
});

test('preparation invitations and landmark task run while activity assets generate', async () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq', 'peacock');
  const mako = makePet('mako', 'horse_7');
  const player = { mesh: new THREE.Group() };
  const worldObjects = new WorldObjectRegistry();
  const campfire = makeWorldEntity('prep_task_fire', '篝火', ['篝火']);
  campfire.mesh.position.set(14, 0, 9);
  worldObjects.add(campfire, { modelJson: campfire._originalModelJson });
  const harness = makeContentHarness();
  let releaseAnimation;
  const animationGate = new Promise(resolve => { releaseAnimation = resolve; });
  harness.port.generateAnimation = async request => {
    harness.calls.animation.push(request);
    return animationGate;
  };
  const activityStatuses = [];
  const system = new TownSocialSystem({
    scene,
    player,
    petManager: { resumePet() {} },
    participants: [fangk, lingq, mako],
    center: new THREE.Vector3(),
    worldObjects,
    objectPlacement: null,
    contentPort: harness.port,
    generatedAssetRepository: harness.repository,
    runtimeStatus: {
      startJob() { return 'prep_task_job'; },
      updateJob() {},
      completeJob() {},
      failJob() {},
      setActivityStatus(title, stage, details) { activityStatuses.push({ title, stage, details }); },
    },
  });

  assert.equal(await system.interact(fangk, makeDialogue(['party'])), true);
  assert.equal(system.activeActivity.status, 'preparing');
  assert.equal(system.activeActivity.prepTask.complete, false);
  assert.equal(system.activeActivity.prepTask.label, '去邀请lingq参加活动');

  assert.equal(await system.interact(lingq, makeDialogue([])), true);
  assert.equal(system.activeActivity.prepTask.label, '去邀请mako参加活动');
  assert.equal(await system.interact(mako, makeDialogue([])), true);
  assert.equal(system.activeActivity.prepTask.label, '去篝火旁给派对留个位置');
  player.mesh.position.copy(campfire.mesh.position);
  system.update(0.1);
  assert.equal(system.activeActivity.prepTask.complete, true);
  assert.equal(activityStatuses.at(-1).details.task.complete, true);

  releaseAnimation({ plan: { _duration: 3, _loop: true } });
  await waitFor(() => system.preparedActivity, 'activity preparation after optional task');
  assert.equal(system.activeActivity.status, 'gathering');
  system.stopActivity('test-complete');
  system.dispose();
});

test('town activity replaces an unreachable ring slot with a reachable nearby slot', () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq');
  const mako = makePet('mako');
  fangk._navigation = {
    isWalkableWorld(position) { return position.z >= -6; },
    findPath(_from, to) { return this.isWalkableWorld(to) ? [to] : []; },
  };
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [fangk, lingq, mako],
    center: new THREE.Vector3(),
    worldObjects: new WorldObjectRegistry(),
    objectPlacement: null,
    contentPort: {},
    generatedAssetRepository: {},
  });
  const plan = system._createPresetPlan('party', fangk);
  const slots = system._slotsFor(plan, new THREE.Vector3(), { props: [] });

  assert.equal(slots.length, plan.participants.length);
  assert.equal(fangk._navigation.isWalkableWorld(slots[0]), true);
  assert.notDeepEqual(slots[0].toArray(), [0, 0, -7.2]);
  system.dispose();
});

test('registered Spring Festival prepares without autonomous backend generation', async () => {
  const scene = new THREE.Scene();
  const participants = ['fangk', 'lingq', 'mako', 'crab'].map(makePet);
  for (const pet of participants) pet._animPlans.dance = { _duration: 4, _loop: true };
  const worldObjects = new WorldObjectRegistry();
  for (const entity of [
    makeWorldEntity('fire', 'campfire', ['绡濈伀']),
    makeWorldEntity('tree', 'apple tree', ['apple']),
    makeWorldEntity('church', 'church', ['church']),
  ]) worldObjects.add(entity, { modelJson: entity._originalModelJson });
  const harness = makeContentHarness();
  const registry = new ActivityRegistry({ seed: createTownActivityRegistrySeed(), sceneStyle: 'original' });
  const resolver = new ActivityAssetResolver({
    sceneStyle: 'original',
    repository: {
      async getModel(binding) { return { modelJson: makeModel(binding.assetId || binding.path), assetId: binding.assetId || binding.path }; },
      async getAnimation(binding) { return { _duration: 4, _loop: true, source: binding.path }; },
    },
  });
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants,
    center: new THREE.Vector3(),
    worldObjects,
    objectPlacement: null,
    contentPort: harness.port,
    generatedAssetRepository: harness.repository,
    equipmentService: makeEquipmentHarness().service,
    sceneStyle: 'original',
    activityRegistry: registry,
    activityAssetResolver: resolver,
  });
  stubEventPropEntityCreation(system);

  const plan = system._createPresetPlan('new_year', participants[0]);
  assert.equal(system._beginActivity(plan), true);
  await waitFor(() => system.preparedActivity, 'registered Spring Festival');
  assert.deepEqual(harness.calls, { model: [], mount: [], animation: [], chat: [] });
  assert.equal(system.preparedActivity.props.length, 7);
  assert.equal(system.preparedActivity.worldMounts.length, 2);
  system.stopActivity('test-complete');
  system.dispose();
});

test('an exact registered custom activity bypasses the AI planner', async () => {
  const scene = new THREE.Scene();
  const lingq = makePet('lingq');
  const mako = makePet('mako');
  const harness = makeContentHarness();
  const concept = '和 mako 一起转圈玩';
  const registeredPlan = {
    id: 'custom_daily_registered',
    type: 'custom_daily',
    scale: 'daily',
    title: '转圈招呼会',
    concept,
    hostId: 'lingq',
    exitPetId: 'lingq',
    initiatorId: 'lingq',
    participants: ['lingq', 'mako'],
    locationId: 'church_square',
    targetObjectIds: [],
    actionPrompts: { lingq: '展开尾羽转圈', mako: '点头踏步转圈' },
    props: [],
    autoEnd: false,
    performanceDuration: 10,
    beats: ['invite', 'gather', 'perform', 'host_exit'],
    dialogue: { proposal: '转圈吗', accept: '走吧', ready: '站好啦', reaction: null, ambient: [], end: '转完啦' },
  };
  const registry = new ActivityRegistry({
    sceneStyle: 'original',
    seed: [{ id: 'town.daily.turn.v1', status: 'ready', sceneStyle: 'original', type: 'custom_daily', plan: registeredPlan }],
  });
  const choices = ['custom_daily', 'confirm'];
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [lingq, mako],
    center: new THREE.Vector3(),
    worldObjects: new WorldObjectRegistry(),
    objectPlacement: null,
    contentPort: harness.port,
    generatedAssetRepository: harness.repository,
    activityRegistry: registry,
  });
  const dialogue = {
    async askChoice() { return { key: choices.shift() }; },
    async askInput() { return concept; },
    async say() { return true; },
  };

  assert.equal(await system.interact(lingq, dialogue), true);
  assert.equal(system.activeActivity.plan.registryId, 'town.daily.turn.v1');
  assert.equal(harness.calls.chat.length, 0);
  system.dispose();
});

test('a new custom activity becomes ready only after successful completion', async () => {
  const scene = new THREE.Scene();
  const lingq = makePet('lingq');
  const harness = makeContentHarness();
  const registry = new ActivityRegistry({ sceneStyle: 'original' });
  const system = new TownSocialSystem({
    scene,
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [lingq],
    center: new THREE.Vector3(),
    worldObjects: new WorldObjectRegistry(),
    objectPlacement: null,
    contentPort: harness.port,
    generatedAssetRepository: harness.repository,
    activityRegistry: registry,
  });
  const plan = system._validatePlan({
    id: 'new_custom_activity',
    type: 'custom_daily',
    scale: 'daily',
    title: '尾羽点头练习',
    concept: '练习点头',
    hostId: 'lingq',
    exitPetId: 'lingq',
    initiatorId: 'lingq',
    participants: ['lingq'],
    locationId: 'church_square',
    targetObjectIds: [],
    actionPrompts: { lingq: '展开尾羽轻轻点头' },
    props: [],
    autoEnd: false,
    performanceDuration: 10,
    beats: ['invite', 'gather', 'perform', 'host_exit'],
    dialogue: { proposal: '练习吗', accept: '开始吧', ready: '站好啦', reaction: null, ambient: [], end: '练完啦' },
  });

  assert.equal(system._beginActivity(plan), true);
  const draftId = system.activeActivity.registration.id;
  assert.equal(registry.get(draftId).status, 'draft');
  await waitFor(() => system.preparedActivity, 'custom activity preparation');
  system.stopActivity('host-ended');
  assert.equal(registry.get(draftId).status, 'ready');
  assert.equal(registry.get(draftId).stats.runs, 1);
  system.dispose();
});

test('town social reports story progress only for successful completion reasons', () => {
  const harness = makeContentHarness();
  const completions = [];
  const system = new TownSocialSystem({
    scene: new THREE.Scene(),
    player: { mesh: new THREE.Group() },
    petManager: { resumePet() {} },
    participants: [makePet('fangk'), makePet('lingq')],
    center: new THREE.Vector3(),
    worldObjects: new WorldObjectRegistry(),
    objectPlacement: null,
    contentPort: harness.port,
    generatedAssetRepository: harness.repository,
    onActivityCompleted: event => completions.push(event),
  });
  const plan = {
    id: 'activity-success',
    type: 'party',
    initiatorId: 'fangk',
    participants: ['fangk', 'lingq'],
  };

  system.activeActivity = { plan, jobId: null };
  system.data.active = { id: plan.id, type: plan.type, status: 'linger' };
  assert.equal(system.stopActivity('host-ended'), true);
  assert.deepEqual(completions, [{
    activityId: 'activity-success',
    activityType: 'party',
    initiatorId: 'fangk',
    participantIds: ['fangk', 'lingq'],
    reason: 'host-ended',
  }]);

  system.activeActivity = {
    plan: { ...plan, id: 'activity-timeout' },
    jobId: null,
  };
  system.data.active = { id: 'activity-timeout', type: plan.type, status: 'gathering' };
  assert.equal(system.stopActivity('gather-timeout'), true);
  assert.equal(completions.length, 1);
  system.dispose();
});
