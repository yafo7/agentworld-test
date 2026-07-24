import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { TownSocialSystem } from '../src/demos/chii-island/systems/TownSocialSystem.js';
import { attachPetStateMachine, PET_STATES } from '../src/gameplay/pets/PetStateMachine.js';
import { WorldObjectRegistry } from '../src/world/WorldObjectRegistry.js';

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
    const prop = { entity, spec, modelJson: entity._originalModelJson, particleSystem: null };
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
    const prop = { entity, spec, modelJson: result.modelJson, particleSystem: null };
    this.eventProps.push(prop);
    return prop;
  };
}

function makeDialogue(choices) {
  return {
    async askChoice() { return { key: choices.shift() }; },
    async say() { return true; },
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

test('daily town activity starts from its assigned pet and ends automatically', async () => {
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

  assert.equal(await system.interact(lingq, makeDialogue(['greeting'])), true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(system.activeActivity.plan.type, 'greeting');
  assert.equal(system.canInteract(lingq), false);
  assert.equal(system.canInteract(fangk), true);

  lingq._targetPosition = null;
  mako._targetPosition = null;
  system.update(0.1);
  assert.equal(system.activeActivity.status, 'performing');

  system.update(3.5);
  assert.equal(system.activeActivity.status, 'wind_down');
  assert.ok(cues.lines.some(line => line.pet === 'mako' && line.text.includes('很有精神')));
  system.update(3);
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
  await waitFor(() => system.preparedActivity, 'party preparation');
  for (const pet of [fangk, lingq, mako]) pet._targetPosition = null;
  system.update(0.1);
  assert.equal(system.activeActivity.status, 'performing');

  system.update(5);
  assert.equal(system.activeActivity.status, 'performing');
  assert.ok(cues.lines.some(line => line.text.includes('观众请看尾羽')));

  assert.equal(await system.interact(fangk, makeDialogue(['end'])), true);
  assert.equal(system.activeActivity, null);
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

test('birthday prepares a temporary hat and cake, then fangk restores everything', async () => {
  const scene = new THREE.Scene();
  const fangk = makePet('fangk');
  const lingq = makePet('lingq', 'peacock');
  const mako = makePet('mako', 'horse_7');
  const harness = makeContentHarness();
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
  });
  stubEventPropSpawning(system);

  assert.equal(await system.interact(fangk, makeDialogue(['birthday'])), true);
  await waitFor(() => system.preparedActivity, 'birthday preparation');
  assert.equal(system.activeActivity.plan.entry.petId, 'fangk');
  assert.equal(system.activeActivity.plan.exit.petId, 'fangk');
  assert.equal(system.eventProps[0].spec.id, 'birthday_table');
  assert.equal(harness.calls.mount.length, 1);

  for (const pet of [fangk, lingq, mako]) pet._targetPosition = null;
  system.update(0.1);
  assert.equal(system.activeActivity.status, 'birthday_intro');
  system.update(3);
  assert.equal(system.activeActivity.status, 'performing');
  assert.equal(system.temporaryPetModels.has(mako), true);
  assert.equal(system.canInteract(mako), false);
  assert.equal(system.canInteract(fangk), true);

  assert.equal(await system.interact(fangk, makeDialogue(['end'])), true);
  assert.equal(system.activeActivity, null);
  assert.equal(system.eventProps.length, 0);
  assert.equal(system.temporaryPetModels.size, 0);
  assert.equal(mako._originalModelJson.name, 'mako');
  system.dispose();
});

test('new year keeps outfits, lanterns and firecrackers temporary until fangk ends it', async () => {
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
  stubEventPropSpawning(system);

  assert.equal(await system.interact(fangk, makeDialogue(['new_year'])), true);
  await waitFor(() => system.preparedActivity, 'new year preparation');
  assert.equal(system.temporaryPetModels.size, 3);
  assert.equal(system.temporaryWorldModels.size, 2);
  assert.equal(system.eventProps[0].spec.id, 'firecracker');
  assert.equal(harness.calls.mount.length, 5);
  const firecracker = system.eventProps[0].entity;

  assert.equal(await system.interact(fangk, makeDialogue(['end'])), true);
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
  });
  stubEventPropEntityCreation(system);

  assert.equal(await system.interact(fangk, makeDialogue(['birthday'])), true);
  await waitFor(() => system.preparedActivity, 'first birthday preparation');
  const firstCounts = {
    model: harness.calls.model.length,
    mount: harness.calls.mount.length,
    animation: harness.calls.animation.length,
  };
  assert.deepEqual(firstCounts, { model: 1, mount: 1, animation: 4 });
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
