import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTownActivityRegistrySeed } from '../src/demos/chii-island/data/townActivityRegistry.js';
import { normalizeAnimationPlan } from '../src/engine/animation/normalizePlan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectFilePaths(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectFilePaths(item, output);
  } else if (value && typeof value === 'object') {
    if (['file_model', 'file_animation'].includes(value.kind) && value.path) output.push(value.path);
    for (const child of Object.values(value)) collectFilePaths(child, output);
  }
  return output;
}

test('town activity seed contains six ready Original registrations', () => {
  const seed = createTownActivityRegistrySeed();
  assert.deepEqual(seed.map(record => record.type), [
    'campfire', 'apple_pick', 'greeting', 'party', 'birthday', 'new_year',
  ]);
  assert.equal(new Set(seed.map(record => record.id)).size, 6);
  assert.ok(seed.every(record => record.status === 'ready' && record.sceneStyle === 'original'));
  assert.ok(seed.every(record => record.execution.manualEnd === true));
  assert.ok(seed.every(record => record.task?.label && record.camera?.performing));
});

test('all registered file assets exist in the local activity library', async () => {
  const paths = [...new Set(collectFilePaths(createTownActivityRegistrySeed()))];
  assert.ok(paths.length >= 20);
  await Promise.all(paths.map(file => access(path.join(root, 'public', file))));
});

test('registered activity JSON parses and animations normalize for the current runtime', async () => {
  const bindings = collectBindings(createTownActivityRegistrySeed());
  const files = [...new Map(bindings
    .filter(binding => ['file_model', 'file_animation'].includes(binding.kind))
    .map(binding => [`${binding.kind}:${binding.path}`, binding])).values()];
  for (const binding of files) {
    const raw = JSON.parse(await readFile(path.join(root, 'public', binding.path), 'utf8'));
    if (binding.kind === 'file_animation') {
      const normalized = normalizeAnimationPlan(raw, {
        duration: Number(raw._duration) || 4,
        loop: raw._loop !== false,
      });
      assert.ok(normalized && Number(normalized._duration) > 0, binding.path);
    } else {
      assert.ok(Array.isArray(raw.nodes) || Array.isArray(raw.parts), binding.path);
    }
  }
});

function collectBindings(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectBindings(item, output);
  } else if (value && typeof value === 'object') {
    if (value.kind) output.push(value);
    for (const child of Object.values(value)) collectBindings(child, output);
  }
  return output;
}
