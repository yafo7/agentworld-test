import assert from 'node:assert/strict';
import test from 'node:test';
import { VoxelModel } from '../src/engine/model/VoxelData.js';

test('VoxelModel preserves Studio extension fields through parse clone and serialize', () => {
  const source = {
    name: 'Tagged mount model',
    type: 'lowpoly',
    format: 2,
    style: 'voxel',
    nodes: [
      {
        id: 'root',
        locked: false,
        tags: ['base:wood', 'emissive'],
        customNodeField: { owner: 'studio' },
        transform: { pos: [0, 0, 0] },
      },
      {
        id: 'beam',
        parent: 'root',
        locked: false,
        tags: ['base:metal'],
        transform: { pos: [1, 2, 3] },
        mesh: {
          type: 'cylinder',
          params: { radiusTop: 0.2, radiusBottom: 0.2, height: 1 },
          color: 0xabcdef,
          boneFrom: 'root',
          boneTo: 'tip',
        },
      },
    ],
    _meta: {
      ai: { provider: 'gpt' },
      mounts: [{ partId: 'beam', placement: 'top' }],
      customMeta: true,
    },
    extensionBlock: { version: 2 },
  };

  const output = VoxelModel.fromJSON(source).resolveMirrors().optimize().toJSON();
  assert.equal(output.style, 'voxel');
  assert.deepEqual(output.extensionBlock, { version: 2 });
  assert.deepEqual(output._meta.mounts, source._meta.mounts);
  assert.equal(output._meta.customMeta, true);
  assert.equal(output.nodes[0].locked, false);
  assert.deepEqual(output.nodes[0].tags, source.nodes[0].tags);
  assert.deepEqual(output.nodes[0].customNodeField, { owner: 'studio' });
  assert.equal(output.nodes[1].mesh.boneFrom, 'root');
  assert.equal(output.nodes[1].mesh.boneTo, 'tip');

  const cloned = VoxelModel.fromJSON(source).clone().toJSON();
  assert.deepEqual(cloned._meta.mounts, source._meta.mounts);
  assert.deepEqual(cloned.nodes[1].tags, source.nodes[1].tags);
  assert.equal(cloned.nodes[1].mesh.boneTo, 'tip');
});
