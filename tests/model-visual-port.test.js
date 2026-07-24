import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import materialTagVocabulary from '@voxel-studio/render-runtime/model/material-tags-v1.json' with { type: 'json' };
import { getParticleEffectStats } from '@voxel-studio/render-runtime/effects/particles/ParticleCompanion.js';
import { buildModelFromJson } from '../src/engine/model/builder.js';
import { setMaterialTagPresenter } from '../src/engine/model/MaterialTagPresentation.js';
import { VoxelStudioModelVisualAdapter } from '../src/integrations/rendering/VoxelStudioModelVisualAdapter.js';
import { ModelVisualPort, assertModelVisualPort } from '../src/ports/ModelVisualPort.js';
import { WorldObjectRegistry } from '../src/world/WorldObjectRegistry.js';
import { WorldModelVisualLifecycle } from '../src/world/model/WorldModelVisualLifecycle.js';

test('model visual port exposes a stable rendering boundary', () => {
  class ProbePort extends ModelVisualPort {
    async attachModel() { return { ok: true }; }
    detachModel() { return true; }
  }
  assert.ok(assertModelVisualPort(new ProbePort()));
});

test('voxel studio adapter applies tagged materials and can detach them', async () => {
  setMaterialTagPresenter(null);
  const json = {
    name: 'visual probe',
    style: 'voxel',
    nodes: [
      { id: 'root', transform: { pos: [0, 0, 0] } },
      {
        id: 'wood',
        parent: 'root',
        transform: { pos: [0, 0, 0] },
        mesh: { type: 'box', params: { width: 1, height: 1, depth: 1 }, color: 0x9b7047 },
        tags: [{ tag: 'base', value: 'wood' }],
      },
    ],
  };
  const root = buildModelFromJson(json);
  const adapter = new VoxelStudioModelVisualAdapter({
    scene: new THREE.Scene(),
    vocabulary: materialTagVocabulary,
  });
  const result = await adapter.attachModel({
    root,
    parts: root._voxelModel.parts,
    model: root._voxelModel,
    modelJson: json,
  });

  const wood = root.getObjectByName('wood');
  assert.equal(result.ok, true);
  assert.equal(result.appliedParts, 1);
  assert.equal(root.userData.modelVisualRuntime.source, 'voxel-studio-render-runtime');
  assert.ok(wood.material.userData.shaderPatchChain.some(entry => entry.key === 'effectVariant'));
  adapter.update(0.25);
  assert.equal(adapter.detachModel(root), true);
  assert.equal(root.userData.modelVisualRuntime, undefined);
  adapter.dispose();
  setMaterialTagPresenter(null);
});

test('detaching an in-flight material attachment cannot leave a stale binding', async () => {
  setMaterialTagPresenter(null);
  const json = {
    name: 'pending probe',
    nodes: [{
      id: 'fire',
      transform: { pos: [0, 0, 0] },
      mesh: { type: 'box', params: { width: 1, height: 1, depth: 1 }, color: 0xff7722 },
      tags: [{ tag: 'fire', value: 0.8 }],
    }],
  };
  const root = buildModelFromJson(json);
  const adapter = new VoxelStudioModelVisualAdapter({
    scene: new THREE.Scene(),
    vocabulary: materialTagVocabulary,
  });
  let finish;
  adapter.materialTags.applyModel = () => new Promise(resolve => { finish = resolve; });

  const attaching = adapter.attachModel({ root, parts: root._voxelModel.parts, model: root._voxelModel });
  assert.equal(adapter.pending.size, 1);
  assert.equal(adapter.detachModel(root), true);
  finish({ taggedParts: 1, appliedParts: 1, skipped: [], diagnostics: [] });
  const result = await attaching;

  assert.equal(result.cancelled, true);
  assert.equal(adapter.pending.size, 0);
  assert.equal(adapter.bindings.size, 0);
  adapter.dispose();
});

test('material tags create and clean up fire smoke and model water presentation', async () => {
  setMaterialTagPresenter(null);
  const json = {
    name: 'element probe',
    nodes: [
      {
        id: 'fire-smoke',
        transform: { pos: [0, 0, 0] },
        mesh: { type: 'box', params: { width: 1, height: 1, depth: 1 }, color: 0xff7722 },
        tags: [{ tag: 'fire', value: 0.75 }, { tag: 'smoke', value: 0.5 }],
      },
      {
        id: 'pool',
        transform: { pos: [2, 0, 0] },
        mesh: { type: 'box', params: { width: 2, height: 0.2, depth: 2 }, color: 0x55aadd },
        tags: [{ tag: 'water', value: 'pool' }],
      },
    ],
  };
  const root = buildModelFromJson(json);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(root);
  const adapter = new VoxelStudioModelVisualAdapter({ scene, camera, vocabulary: materialTagVocabulary });

  const result = await adapter.attachModel({ root, parts: root._voxelModel.parts, model: root._voxelModel });
  const fire = root.getObjectByName('fire-smoke');
  const pool = root.getObjectByName('pool');
  const waterUniform = pool.material.userData.waterUniforms.uTime;

  assert.equal(result.createdCompanions, 2);
  assert.equal(result.modelWaterParts, 1);
  assert.ok(fire.userData.companionEffects?.FlameAura);
  assert.equal(getParticleEffectStats().emitters, 1);
  assert.equal(pool.material.userData.chiiModelWater, true);
  adapter.update(0.5);
  assert.equal(waterUniform.value, 0.5);

  adapter.detachModel(root);
  assert.equal(fire.userData.companionEffects, undefined);
  assert.equal(getParticleEffectStats().emitters, 0);
  assert.equal(pool.userData.chiiModelWater, undefined);
  assert.notEqual(pool.material.userData.chiiModelWater, true);
  adapter.dispose();
});

test('world object removal detaches visuals and registry re-add reattaches them', async () => {
  const calls = [];
  setMaterialTagPresenter({
    async attachModel({ root }) {
      calls.push(['attach', root]);
      return { ok: true };
    },
    detachModel(root) {
      calls.push(['detach', root]);
      return true;
    },
  });
  const root = new THREE.Group();
  root._voxelModel = { parts: [] };
  root.userData.materialTagPresentationReady = Promise.resolve();
  const entity = { _modelGroup: root };
  const registry = new WorldObjectRegistry([entity]);
  const lifecycle = new WorldModelVisualLifecycle({ worldObjects: registry });

  registry.remove(entity);
  registry.add(entity);
  await root.userData.materialTagPresentationReady;

  assert.deepEqual(calls.map(([type]) => type), ['detach', 'attach']);
  lifecycle.dispose();
  setMaterialTagPresenter(null);
});
