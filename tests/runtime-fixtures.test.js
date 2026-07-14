import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { VoxelModel } from '../src/engine/model/VoxelData.js';
import { buildModelFromJson } from '../src/engine/model/builder.js';
import { normalizeAnimationPlan } from '../src/engine/animation/normalizePlan.js';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

test('synced nailong runtime JSON parses and builds a non-empty Three hierarchy', async () => {
  const json = await readJson('../public/generated/models/nailong.json');
  const model = VoxelModel.fromJSON(json).resolveMirrors().optimize();
  assert.ok(model.parts.length > 0);

  const group = buildModelFromJson(json);
  let meshCount = 0;
  group.traverse((child) => { if (child.isMesh) meshCount += 1; });
  assert.ok(meshCount > 0);
  assert.equal(group.userData.modelJson, json);
});

test('synced idle animation normalizes to a playable motion plan', async () => {
  const raw = await readJson('../public/generated/animations/nailong_idle.json');
  const plan = normalizeAnimationPlan(raw, { duration: 2, loop: true });
  assert.ok(plan);
  assert.ok(plan._duration > 0);
  assert.equal(typeof plan._loop, 'boolean');
  assert.ok(Object.keys(plan).some((key) => !key.startsWith('_')));
});

