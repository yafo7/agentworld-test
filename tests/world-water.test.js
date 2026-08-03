import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { generateTerrainLayout } from '../src/engine/world/terrain.js';
import { generateSceneLayout } from '../src/demos/chii-island/systems/sceneLayout.js';
import {
  buildRiverStripGeometry,
  VoxelStudioWorldWaterAdapter,
} from '../src/integrations/rendering/VoxelStudioWorldWaterAdapter.js';

test('continuous river visual follows every deterministic water row', () => {
  const terrain = generateTerrainLayout(50, 42);
  const plan = generateSceneLayout(terrain, 50, 99);
  const geometry = buildRiverStripGeometry({
    riverData: plan.riverData,
    center: [0, 0],
    gridSize: 50,
    tileSize: 4,
  });

  assert.ok(geometry);
  assert.equal(geometry.getAttribute('position').count, plan.riverData.byRow.size * 2);
  assert.equal(geometry.index.count, (plan.riverData.byRow.size - 1) * 6);
  assert.equal(geometry.getAttribute('uv').count, geometry.getAttribute('position').count);
  geometry.dispose();
});

test('world water adapter owns and disposes the river presentation independently', () => {
  const terrain = generateTerrainLayout(50, 42);
  const plan = generateSceneLayout(terrain, 50, 99);
  const scene = new THREE.Scene();
  const adapter = new VoxelStudioWorldWaterAdapter({ scene });

  const river = adapter.attachRiver({ riverData: plan.riverData, gridSize: 50, tileSize: 4 });
  assert.ok(river);
  assert.equal(river.userData.sourceCommit, '1203a1e');
  assert.ok(scene.children.includes(river));
  adapter.update(0.5);
  assert.equal(river.material.userData.waterUniforms.uTime.value, 0.5);
  adapter.dispose();
  assert.equal(scene.children.includes(river), false);
});

test('generated waterfall and fountain expose pool and fall material tags', async () => {
  for (const file of ['island_waterfall.json', 'town_fountain.json']) {
    const json = JSON.parse(await fs.readFile(
      new URL(`../public/generated/models/${file}`, import.meta.url),
      'utf8',
    ));
    const waterTags = new Set((json.nodes || []).flatMap(node => (
      (node.tags || []).filter(tag => tag.tag === 'water').map(tag => tag.value)
    )));
    assert.equal(json._meta?.chiiGenerationQuality, 'voxel');
    assert.equal(waterTags.has('pool'), true);
    assert.equal(waterTags.has('fall'), true);
  }
});
