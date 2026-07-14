import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../public/generated/styles/voxel/', import.meta.url);
const models = [
  'oak', 'normal_tree', 'apple_tree', 'glowgrass', 'pink_flower',
  'grass_clump', 'trumpet_flower', 'blue_tulips', 'wheat_field',
  'flower_pot', 'giant_carrot', 'campfire', 'forest_temple_trophy',
  'forest_temple_tent', 'pastoral_work_scaffold',
];
const animated = [
  ['campfire', 'campfire_burn'],
  ['forest_temple_trophy', 'forest_trophy_wait'],
  ['pastoral_work_scaffold', 'pastoral_work_scaffold_dust'],
];

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), 'utf8'));
}

test('voxel scene variants contain only box meshes', async () => {
  for (const name of models) {
    const model = await readJson(`models/${name}.json`);
    const meshes = (model.nodes || []).filter(node => node.mesh);
    assert.ok(meshes.length > 0, `${name} should contain meshes`);
    assert.deepEqual([...new Set(meshes.map(node => node.mesh.type))], ['box'], `${name} should be voxel-only`);
  }
});

test('voxel scene animations target nodes in their matching model', async () => {
  for (const [modelName, animationName] of animated) {
    const model = await readJson(`models/${modelName}.json`);
    const animation = await readJson(`animations/${animationName}.json`);
    const nodeIds = new Set((model.nodes || []).map(node => node.id));
    const plan = animation.motionPlan || animation;
    const targets = Object.keys(plan).filter(key => !key.startsWith('_'));
    assert.ok(targets.length > 0, `${animationName} should animate or emit from a node`);
    assert.deepEqual(targets.filter(target => !nodeIds.has(target)), [], `${animationName} has missing targets`);
  }
});

test('voxel scene manifest covers every generated environment asset', async () => {
  const manifest = await readJson('scene-style-manifest.json');
  assert.equal(manifest.style, 'voxel');
  assert.equal(manifest.assets.length, models.length);
  assert.ok(manifest.assets.every(asset => asset.provider === 'gpt' && asset.mode === 'voxel'));
});
