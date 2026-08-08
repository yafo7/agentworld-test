import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { resolveVfxEmitterConfig, ParticleSystem } from '../src/engine/animation/particles.js';
import {
  promoteMaterialForVoxelRuntime,
  promoteMeshForVoxelRuntime,
} from '../src/integrations/rendering/VoxelStudioModelVisualAdapter.js';

test('Studio runtime adapter promotes Lambert materials without changing visible identity', () => {
  const source = new THREE.MeshLambertMaterial({
    color: 0x3f8f52,
    emissive: 0x101010,
    transparent: true,
    opacity: 0.72,
  });
  source.name = 'leaf-material';

  const promoted = promoteMaterialForVoxelRuntime(source);

  assert.equal(promoted.isMeshStandardMaterial, true);
  assert.equal(promoted.name, source.name);
  assert.equal(promoted.color.getHex(), source.color.getHex());
  assert.equal(promoted.opacity, 0.72);
  assert.equal(promoted.userData.chiiVoxelRuntimeMaterial.runtimeCommit, '1805dfc');
  assert.equal(promoteMaterialForVoxelRuntime(promoted), promoted);
});

test('Studio runtime adapter preserves shared material identity while promoting a mesh array', () => {
  const shared = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [shared, shared]);

  assert.equal(promoteMeshForVoxelRuntime(mesh), 1);
  assert.equal(mesh.material[0], mesh.material[1]);
  assert.equal(mesh.material[0].isMeshStandardMaterial, true);
});

test('animation particle runtime accepts latest Studio quick-mode vfx tracks', () => {
  const config = resolveVfxEmitterConfig({
    preset: 'sparkle',
    params: { scale: 1.5 },
    anchor: { offset: [0, 1, 0] },
  });
  assert.ok(config);
  assert.deepEqual(config.offset, [0, 1, 0]);
  assert.ok(config.meshSize > 0.07);

  const scene = new THREE.Scene();
  const model = new THREE.Group();
  const head = new THREE.Group();
  head.name = 'head';
  model.add(head);
  const particles = new ParticleSystem(scene);
  particles.setup({ head: { vfx: { preset: 'sparkle' } } }, model);
  assert.equal(particles.emitters.length, 1);
  particles.dispose();
});
