import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildModelFromJson } from '../src/engine/model/builder.js';
import { normalizeAnimationPlan } from '../src/engine/animation/normalizePlan.js';
import { ACT_ZERO_PROTAGONIST_ASSETS } from '../src/demos/chii-island/presentation/ActZeroCrashDirector.js';

const root = new URL('../public/generated/story/act0/', import.meta.url);
const publicRoot = new URL('../public/', import.meta.url);
const modelJson = JSON.parse(readFileSync(new URL('angel.json', root), 'utf8'));
const bossRoot = new URL('boss/', root);
const bossModelJson = JSON.parse(readFileSync(new URL('model.json', bossRoot), 'utf8'));

test('Act Zero angel is a backend-generated local runtime asset', () => {
  const model = buildModelFromJson(modelJson);
  let meshCount = 0;
  model.traverse(object => {
    if (object.isMesh) meshCount += 1;
  });

  assert.ok(meshCount > 0);
  assert.equal(modelJson._meta?.ai?.provider, 'gpt');
  assert.equal(modelJson._meta?.chiiStoryAsset, 'act0_angel');
});

test('every Act Zero angel animation targets a part in the same model', () => {
  const model = buildModelFromJson(modelJson);
  for (const name of ['idle', 'talk', 'generating', 'falling', 'panic']) {
    const raw = JSON.parse(readFileSync(new URL(`angel_${name}.json`, root), 'utf8'));
    const plan = normalizeAnimationPlan(raw, {
      duration: raw._duration,
      loop: true,
      model,
    });
    const targetIds = Object.keys(plan).filter(key => !key.startsWith('_'));
    assert.ok(targetIds.length > 0, `${name} has no animation targets`);
    for (const targetId of targetIds) {
      assert.ok(model.getObjectByName(targetId), `${name} targets missing part ${targetId}`);
    }
  }
});

test('Act Zero boss is a backend-generated local runtime asset', () => {
  const model = buildModelFromJson(bossModelJson);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', bossRoot), 'utf8'));
  let meshCount = 0;
  model.traverse(object => {
    if (object.isMesh) meshCount += 1;
  });

  assert.ok(meshCount > 0);
  assert.equal(bossModelJson._meta?.ai?.provider, 'gpt');
  assert.equal(bossModelJson._meta?.chiiStoryAsset, 'act0_boss');
  assert.equal(bossModelJson._meta?.chiiGenerationQuality, 'voxel');
  assert.equal(manifest.source, 'autonomous_backend');
  assert.match(manifest.promptPacket.prompt, /黑色方块人/);
  assert.match(manifest.promptPacket.prompt, /黄色篮球服/);
  assert.match(manifest.promptPacket.prompt, /篮球/);
});

test('every Act Zero boss animation targets a part in the same model', () => {
  const model = buildModelFromJson(bossModelJson);
  for (const name of ['idle', 'talk', 'panic']) {
    const raw = JSON.parse(readFileSync(new URL(`${name}.json`, bossRoot), 'utf8'));
    const plan = normalizeAnimationPlan(raw, {
      duration: raw._duration,
      loop: true,
      model,
    });
    const targetIds = Object.keys(plan).filter(key => !key.startsWith('_'));
    assert.ok(targetIds.length > 0, `${name} has no animation targets`);
    for (const targetId of targetIds) {
      assert.ok(model.getObjectByName(targetId), `${name} targets missing part ${targetId}`);
    }
  }
});

test('Act Zero and the island use the same classic Phrolova conductor', () => {
  const protagonistJson = JSON.parse(readFileSync(
    new URL(ACT_ZERO_PROTAGONIST_ASSETS.modelPath, publicRoot),
    'utf8',
  ));
  const protagonist = buildModelFromJson(protagonistJson);
  const mainSource = readFileSync(
    new URL('../src/demos/chii-island/main.js', import.meta.url),
    'utf8',
  );

  assert.equal(protagonistJson._meta?.chiiCandidateId, 'a');
  assert.equal(protagonistJson._meta?.chiiCandidateSlug, 'classic-conductor');
  assert.match(mainSource, /characterEquipment\.loadJson\(CHII_PLAYER_CHARACTER\.model\)/);
  assert.match(mainSource, /player\.replaceModelFromJson\(playerBaseModelJson/);
  assert.doesNotMatch(mainSource, /assetRepository\.getModel\('nailong'\)/);

  for (const path of Object.values(ACT_ZERO_PROTAGONIST_ASSETS.animationPaths)) {
    const raw = JSON.parse(readFileSync(new URL(path, publicRoot), 'utf8'));
    const plan = normalizeAnimationPlan(raw, {
      duration: raw._duration,
      loop: raw._loop,
      model: protagonist,
    });
    const targetIds = Object.keys(plan).filter(key => !key.startsWith('_'));
    assert.ok(targetIds.length > 0);
    for (const targetId of targetIds) {
      assert.ok(protagonist.getObjectByName(targetId), `missing protagonist part ${targetId}`);
    }
  }
});
