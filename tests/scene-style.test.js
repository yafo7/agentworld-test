import assert from 'node:assert/strict';
import test from 'node:test';
import { createChiiAssetCatalog } from '../src/demos/chii-island/data/assetCatalog.js';
import {
  getChiiSceneStyle,
  normalizeChiiSceneStyle,
  setChiiSceneStyle,
} from '../src/demos/chii-island/data/sceneStyle.js';

test('scene style overrides environment assets but preserves characters and buildings', () => {
  const pro = createChiiAssetCatalog('pro');
  const voxel = createChiiAssetCatalog('voxel');

  assert.equal(pro.oak.model, 'generated/models/oak.json');
  assert.equal(voxel.oak.model, 'generated/styles/voxel/models/oak.json');
  assert.equal(voxel.campfire.animations.burn, 'generated/styles/voxel/animations/campfire_burn.json');
  assert.equal(voxel.forestTrophy.model, pro.forestTrophy.model);
  assert.equal(voxel.forestTrophy.animations.wait, pro.forestTrophy.animations.wait);
  assert.equal(voxel.forestTent.model, pro.forestTent.model);
  assert.equal(voxel.windmill.model, pro.windmill.model);
  assert.equal(voxel.nailong.model, pro.nailong.model);
  assert.equal(voxel.mako.model, pro.mako.model);
});

test('scene style preference is normalized and stored', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(getChiiSceneStyle(storage), 'voxel');
  assert.equal(setChiiSceneStyle('voxel', storage), 'voxel');
  assert.equal(getChiiSceneStyle(storage), 'voxel');
  assert.equal(normalizeChiiSceneStyle('unknown'), 'voxel');
});
