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

test('Forge scene repository lists and loads an immutable catalog world', async () => {
  const map = json({
    id: 'map-plain', name: 'Plain', box: { size: [96, 16, 96] },
    terrain: { resolutionX: 2, resolutionZ: 2, heights: [0, 0, 0, 0] },
    waterBodies: [], objects: [], assets: [], grassLayers: [], spawnPoints: [[0, 1, 0]],
  });
  const scheme = json({ id: 'scheme-plain', name: 'Plain', settings: {} });
  const bindings = json({ schemaVersion: 2, worldId: 'wf-plain', gameplayPreset: 'exploration', objects: {}, zones: {}, spawns: { player: [0, 1, 0] } });
  const manifest = json({
    schemaVersion: 2,
    kind: 'chii-worldforge-world',
    worldId: 'wf-plain',
    runtime: { threeRevision: '160' },
    files: { map: 'map.json', renderScheme: 'render-scheme.json', bindings: 'chii-bindings.json' },
    hashes: { map: hash(map), renderScheme: hash(scheme), bindings: hash(bindings) },
  });
  const catalog = json({
    schemaVersion: 1,
    kind: 'chii-world-catalog',
    worlds: [{ id: 'wf-plain', name: 'Plain', packageRoot: 'wf-plain/revisions/v1' }],
  });
  const files = new Map([
    ['/worlds/catalog.json', catalog],
    ['/worlds/wf-plain/revisions/v1/manifest.json', manifest],
    ['/worlds/wf-plain/revisions/v1/map.json', map],
    ['/worlds/wf-plain/revisions/v1/render-scheme.json', scheme],
    ['/worlds/wf-plain/revisions/v1/chii-bindings.json', bindings],
  ]);
  const repository = new ForgeSceneRepository({
    catalogRoot: '/worlds',
    fetcher: async url => new Response(files.get(url), { status: files.has(url) ? 200 : 404 }),
  });

  assert.equal((await repository.list())[0].id, 'wf-plain');
  const world = await repository.load('wf-plain');
  assert.equal(world.manifest.worldId, 'wf-plain');
  assert.equal(world.bindings.gameplayPreset, 'exploration');
  assert.equal(world.descriptor.packageRoot, 'wf-plain/revisions/v1');
});
