import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeAnimationPlan } from '../src/engine/animation/normalizePlan.js';
import { buildModelFromJson } from '../src/engine/model/builder.js';

const root = new URL('../public/generated/player-candidates/phrolova/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const animationNames = ['idle', 'walk', 'run', 'jump', 'special'];

test('Phrolova casting bundle contains five distinct GPT Voxel candidates', () => {
  assert.equal(manifest.candidates.length, 5);
  assert.equal(new Set(manifest.candidates.map(candidate => candidate.promptPacket.prompt)).size, 5);
  assert.ok(manifest.candidates.every(candidate => (
    candidate.promptPacket.prompt.includes('双眼')
    && !candidate.promptPacket.prompt.includes('单眼')
  )));

  for (const candidate of manifest.candidates) {
    const modelJson = JSON.parse(readFileSync(new URL(`${candidate.slug}/model.json`, root), 'utf8'));
    const model = buildModelFromJson(modelJson);
    let meshCount = 0;
    model.traverse(object => {
      if (object.isMesh) meshCount += 1;
    });

    assert.ok(meshCount > 0, `${candidate.id} has no meshes`);
    assert.equal(modelJson._meta?.ai?.provider, 'gpt');
    assert.equal(modelJson._meta?.chiiAssetRole, 'player_candidate');
    assert.equal(modelJson._meta?.chiiCandidateId, candidate.id);
    assert.equal(
      modelJson._meta?.chiiGenerationQuality,
      candidate.promptPacket.request_hints.quality,
    );
    if (candidate.promptPacket.request_hints.quality === 'voxel-pro') {
      assert.ok(meshCount >= 60, `${candidate.id} did not produce a high-detail voxel model`);
      assert.deepEqual(
        [...new Set(modelJson.nodes.filter(node => node.mesh).map(node => node.mesh.type))],
        ['box'],
      );
    }
  }

  assert.deepEqual(
    manifest.candidates.slice(3).map(candidate => candidate.promptPacket.request_hints.quality),
    ['voxel-pro', 'voxel-pro'],
  );
});

test('every candidate animation targets its own model parts', () => {
  for (const candidate of manifest.candidates) {
    const modelJson = JSON.parse(readFileSync(new URL(`${candidate.slug}/model.json`, root), 'utf8'));
    const model = buildModelFromJson(modelJson);

    for (const animationName of animationNames) {
      const raw = JSON.parse(
        readFileSync(new URL(`${candidate.slug}/${animationName}.json`, root), 'utf8'),
      );
      const plan = normalizeAnimationPlan(raw, {
        duration: raw._duration,
        loop: raw._loop,
        model,
      });
      const targetIds = Object.keys(plan).filter(key => !key.startsWith('_'));
      assert.ok(targetIds.length > 0, `${candidate.id}:${animationName} has no targets`);
      for (const targetId of targetIds) {
        assert.ok(
          model.getObjectByName(targetId),
          `${candidate.id}:${animationName} targets missing part ${targetId}`,
        );
      }
    }
  }
});

test('every candidate special animation contains a particle emitter', () => {
  for (const candidate of manifest.candidates) {
    const special = JSON.parse(
      readFileSync(new URL(`${candidate.slug}/special.json`, root), 'utf8'),
    );
    const hasEmitter = Object.entries(special).some(
      ([key, tracks]) => !key.startsWith('_') && tracks?.emit,
    );
    assert.equal(hasEmitter, true, `${candidate.id} special has no emit track`);
  }
});
