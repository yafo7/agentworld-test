import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { buildModelFromJson } from '../src/engine/model/builder.js';
import {
  CHURCH_INTERIOR_ASSET_SPECS,
  CHURCH_INTERIOR_PLAN,
  EMPTY_INTERIOR_PLAN,
} from '../src/demos/chii-island/data/interiorPlans.js';

test('church interior plan keeps a readable nave, furniture scale, and empty fallback room', () => {
  assert.deepEqual(CHURCH_INTERIOR_PLAN.size, { width: 26, depth: 38, height: 14 });
  assert.ok(CHURCH_INTERIOR_PLAN.size.depth > CHURCH_INTERIOR_PLAN.size.width);
  assert.equal(CHURCH_INTERIOR_PLAN.furniture.filter(item => item.assetId === 'churchPew').length, 10);
  assert.equal(CHURCH_INTERIOR_PLAN.furniture.filter(item => item.assetId === 'churchAltar').length, 1);
  assert.equal(CHURCH_INTERIOR_PLAN.furniture.filter(item => item.assetId === 'churchStatue').length, 1);
  assert.ok(
    Math.abs(CHURCH_INTERIOR_PLAN.exitTrigger.z - CHURCH_INTERIOR_PLAN.playerSpawn.z) <= 5.6,
  );
  assert.ok(
    CHURCH_INTERIOR_PLAN.playerSpawn.z + CHURCH_INTERIOR_PLAN.camera.distance
      < CHURCH_INTERIOR_PLAN.size.depth / 2,
  );
  assert.deepEqual(EMPTY_INTERIOR_PLAN.furniture, []);
  assert.ok(
    Math.abs(EMPTY_INTERIOR_PLAN.exitTrigger.z - EMPTY_INTERIOR_PLAN.playerSpawn.z) <= 5.6,
  );
  assert.ok(
    EMPTY_INTERIOR_PLAN.playerSpawn.z + EMPTY_INTERIOR_PLAN.camera.distance
      < EMPTY_INTERIOR_PLAN.size.depth / 2,
  );
});

for (const spec of Object.values(CHURCH_INTERIOR_ASSET_SPECS)) {
  test(`${spec.assetId} is a local GPT 5.6 Voxel model with a concrete Chii prompt`, async () => {
    assert.equal(spec.quality, 'voxel');
    assert.match(spec.prompt, /[\u4e00-\u9fff]/);
    assert.ok([...spec.prompt].length <= 32);
    assert.ok(spec.targetSize.width > 0);
    assert.ok(spec.targetSize.height > 0);
    assert.ok(spec.targetSize.depth > 0);

    const modelJson = JSON.parse(await fs.readFile(
      new URL(`../public/generated/models/${spec.fileName}.json`, import.meta.url),
      'utf8',
    ));
    assert.equal(modelJson._meta?.chiiAssetRole, spec.assetId);
    assert.equal(modelJson._meta?.chiiPromptProfile, 'chii-v1');
    assert.equal(modelJson._meta?.chiiGenerationQuality, spec.quality);
    assert.deepEqual(modelJson._meta?.chiiTargetSize, spec.targetSize);
    assert.deepEqual(modelJson._meta?.chiiBackendMetadata, {
      provider: 'gpt',
      model: 'gpt-5.6-sol-high',
      mode: spec.quality,
      timing: null,
    });

    const model = buildModelFromJson(modelJson);
    const bounds = new THREE.Box3().setFromObject(model);
    assert.equal(bounds.isEmpty(), false);
    assert.ok(modelJson.nodes.length > 0);
  });
}
