import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ForgeSceneRepository } from '../src/assets/repositories/ForgeSceneRepository.js';

const json = value => `${JSON.stringify(value)}\n`;
const hash = value => createHash('sha256').update(value).digest('hex');

function fixture({ corruptMap = false } = {}) {
  const values = {
    'map.json': json({ id: 'map-1', name: 'Chii Forge', size: { x: 192, y: 24, z: 192 } }),
    'render-scheme.json': json({ id: 'scheme-1', name: 'Chii', settings: {} }),
    'chii-bindings.json': json({ schemaVersion: 1, objects: {}, zones: {}, spawns: {} }),
  };
  values['manifest.json'] = json({
    schemaVersion: 1,
    kind: 'chii-forge-scene',
    sceneId: 'chii-island-forge-v1',
    runtime: { threeRevision: '160' },
    files: { map: 'map.json', renderScheme: 'render-scheme.json', bindings: 'chii-bindings.json' },
    hashes: {
      map: hash(corruptMap ? 'different' : values['map.json']),
      renderScheme: hash(values['render-scheme.json']),
      bindings: hash(values['chii-bindings.json']),
    },
  });
  return async url => {
    const file = url.split('/').pop();
    return new Response(values[file], { status: values[file] ? 200 : 404 });
  };
}

test('Forge scene repository validates and normalizes a published scene package', async () => {
  const repository = new ForgeSceneRepository({ root: '/forge', fetcher: fixture() });
  const scene = await repository.load();
  assert.equal(scene.map.id, 'map-1');
  assert.equal(scene.renderScheme.id, 'scheme-1');
  assert.equal(scene.bindings.schemaVersion, 1);
  assert.equal(await repository.load(), scene);
});

test('Forge scene repository rejects the first changed published file', async () => {
  const repository = new ForgeSceneRepository({ root: '/forge', fetcher: fixture({ corruptMap: true }) });
  await assert.rejects(repository.load(), /integrity failed: map/);
});
