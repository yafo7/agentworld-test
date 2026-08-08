import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { generateTerrainLayout } from '../src/engine/world/terrain.js';
import {
  createChiiAssetCatalog,
  getChiiSceneAssetIds,
} from '../src/demos/chii-island/data/assetCatalog.js';
import {
  CHII_SCENE_STYLES,
  getChiiSceneProfile,
  getChiiSceneStyle,
  normalizeChiiSceneStyle,
  setChiiSceneStyle,
} from '../src/demos/chii-island/data/sceneStyle.js';
import { generateSceneLayout } from '../src/demos/chii-island/systems/sceneLayout.js';

test('scene profiles expose Original, Pro, and Forge while preserving the archived Voxel catalog', () => {
  const pro = createChiiAssetCatalog('pro');
  const voxel = createChiiAssetCatalog('voxel');
  const original = createChiiAssetCatalog('original');
  const forge = createChiiAssetCatalog('forge');

  assert.deepEqual(CHII_SCENE_STYLES, ['original', 'pro', 'forge']);
  assert.equal(pro.oak.model, 'generated/scenes/pro/models/oak.json');
  assert.equal(voxel.oak.model, 'generated/scenes/voxel/models/oak.json');
  assert.equal(original.oak.model, 'generated/scenes/original/models/oak.json');
  assert.equal(voxel.campfire.animations.burn, 'generated/scenes/voxel/animations/campfire_burn.json');
  assert.equal(pro.mako.model, 'generated/scenes/pro/models/mako.json');
  assert.equal(voxel.mako.model, 'generated/scenes/voxel/models/mako.json');
  assert.equal(original.mako.model, 'generated/scenes/original/models/mako.json');
  assert.equal(forge.mako.model, original.mako.model);
  assert.equal(getChiiSceneProfile('forge').features.worldForge, true);
  assert.notEqual(pro.windmill.model, voxel.windmill.model);
  assert.notEqual(voxel.windmill.model, original.windmill.model);
  assert.equal(original.islandWaterfall, undefined);
  assert.equal(original.townFountain, undefined);
  assert.equal(getChiiSceneAssetIds('original').includes('islandWaterfall'), false);
  assert.equal(getChiiSceneAssetIds('original').includes('townFountain'), false);
});

test('legacy static scene snapshots only reference files in their own directory', async () => {
  for (const sceneId of ['original', 'pro']) {
    const manifestUrl = new URL(`../public/generated/scenes/${sceneId}/manifest.json`, import.meta.url);
    const manifest = JSON.parse(await fs.readFile(manifestUrl, 'utf8'));
    assert.equal(manifest.sceneId, sceneId);
    assert.ok(manifest.assets.length >= 70);
    for (const entry of manifest.assets) {
      assert.match(entry.target, new RegExp(`^public/generated/scenes/${sceneId}/`));
      await fs.access(new URL(`../${entry.target}`, import.meta.url));
    }
  }
});

test('Original scene keeps tile water but excludes the later beach and water presentation', () => {
  const profile = getChiiSceneProfile('original');
  const terrain = generateTerrainLayout(50, profile.terrainSeed);
  const plan = generateSceneLayout(terrain, 50, profile.layoutSeed, {
    features: profile.features,
  });

  assert.equal(profile.features.worldWater, false);
  assert.equal(profile.features.waterLandmarks, false);
  assert.equal(profile.features.forestBeach, false);
  assert.equal(plan.town.fountain, null);
  assert.equal(plan.forestTemple.waterfall, null);
  assert.equal(plan.beach.spawn, null);
  assert.equal(plan.beach.sandCells.size, 0);
  assert.equal(plan.beach.rockCells.size, 0);
  assert.ok(plan.modifiedLayout.flat().includes('water'));
});

test('recoverable Original assets match the pre-iteration backup byte for byte', async () => {
  const manifest = JSON.parse(await fs.readFile(
    new URL('../public/generated/scenes/original/manifest.json', import.meta.url),
    'utf8',
  ));
  assert.equal(manifest.freezeBoundary, 'before-2026-07-28-large-iteration');
  assert.equal(manifest.boundaryTimestamp, '2026-07-28T09:24:23+08:00');
  assert.equal(
    manifest.sourceSnapshot,
    'public/generated/history/2026-07-28-gpt56-reset',
  );
  assert.deepEqual(
    manifest.assets
      .filter(entry => entry.provenance === 'compatibility-fallback')
      .map(entry => entry.name),
    ['town_stone_bridge'],
  );

  const sources = new Map(manifest.assets.map(entry => [entry.name, entry.source]));
  assert.equal(
    sources.get('momo'),
    'public/generated/history/2026-07-28-gpt56-reset/models/momo.json',
  );
  assert.equal(
    sources.get('church'),
    'public/generated/history/2026-07-28-gpt56-reset/models/church.json',
  );
  assert.equal(
    sources.get('glowgrass'),
    'public/generated/history/2026-07-28-gpt56-reset/styles/voxel/models/glowgrass.json',
  );
  assert.equal(
    sources.get('campfire_burn'),
    'public/generated/history/2026-07-28-gpt56-reset/styles/voxel/animations/campfire_burn.json',
  );

  for (const entry of manifest.assets.filter(asset => asset.provenance === 'pre-iteration-backup')) {
    const source = await fs.readFile(new URL(`../${entry.source}`, import.meta.url));
    const target = await fs.readFile(new URL(`../${entry.target}`, import.meta.url));
    assert.deepEqual(target, source, `${entry.name} does not match its frozen source`);
  }
});

test('town bridge keeps the raw backend hierarchy while layout owns its 11x3 footprint', async () => {
  const pro = createChiiAssetCatalog('pro');
  const voxel = createChiiAssetCatalog('voxel');
  const bridgeJson = JSON.parse(await fs.readFile(
    new URL(`../public/${pro.townBridge.model}`, import.meta.url),
    'utf8',
  ));
  const voxelBridgeSource = await fs.readFile(
    new URL('../public/generated/styles/voxel/models/town_stone_bridge.json', import.meta.url),
  );
  const voxelBridgeRuntime = await fs.readFile(
    new URL(`../public/${voxel.townBridge.model}`, import.meta.url),
  );
  const voxelBridgeJson = JSON.parse(voxelBridgeSource);
  const voxelManifest = JSON.parse(await fs.readFile(
    new URL('../public/generated/scenes/voxel/manifest.json', import.meta.url),
    'utf8',
  ));
  const profile = getChiiSceneProfile('pro');
  const terrain = generateTerrainLayout(50, profile.terrainSeed);
  const scene = generateSceneLayout(terrain, 50, profile.layoutSeed, {
    features: profile.features,
  });
  const deckGroup = bridgeJson.nodes.find(node => node.id === 'bridgeDeck');
  const directDeckParts = bridgeJson.nodes.filter(node => (
    node.parent === deckGroup?.id
    && node.mesh?.type === 'box'
  ));

  assert.ok(deckGroup);
  assert.ok(directDeckParts.length >= 3);
  assert.ok(bridgeJson.nodes.length > 0);
  assert.equal(scene.town.bridge.width, 11);
  assert.equal(scene.town.bridge.depth, 3);
  assert.deepEqual(voxelBridgeRuntime, voxelBridgeSource);
  assert.ok(voxelBridgeJson.nodes.length < bridgeJson.nodes.length);
  assert.ok(voxelBridgeJson.nodes.every(node => !node.mesh || node.mesh.type === 'box'));
  assert.equal(
    voxelManifest.assets.find(asset => asset.name === 'town_stone_bridge')?.source,
    'public/generated/styles/voxel/models/town_stone_bridge.json',
  );
});

test('scene style preference is normalized and stored', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(getChiiSceneStyle(storage), 'original');
  assert.equal(setChiiSceneStyle('voxel', storage), 'voxel');
  assert.equal(getChiiSceneStyle(storage), 'voxel');
  assert.equal(setChiiSceneStyle('original', storage), 'original');
  assert.equal(getChiiSceneStyle(storage), 'original');
  assert.equal(normalizeChiiSceneStyle('unknown'), 'original');
});
