import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildModelFromJson } from '../src/engine/model/builder.js';
import {
  hasMaterialTags,
  resolveEffectiveMaterialTags,
} from '../src/engine/model/MaterialTagPresentation.js';

test('material tag resolver inherits tags except emissive', () => {
  const parts = [
    { id: 'root', tags: [{ tag: 'base', value: 'wood' }, { tag: 'emissive', value: 1 }] },
    { id: 'child', parent: 'root', tags: [{ tag: 'fire', value: 0.5 }] },
  ];
  const tags = resolveEffectiveMaterialTags(parts);
  assert.deepEqual(tags.get('child').map(tag => tag.tag), ['base', 'fire']);
});

test('builder applies conservative material presentation only to tagged parts', () => {
  const json = {
    name: 'tagged lamp',
    nodes: [
      { id: 'root', transform: { pos: [0, 0, 0] } },
      {
        id: 'lamp',
        parent: 'root',
        transform: { pos: [0, 0, 0] },
        mesh: { type: 'box', params: { width: 1, height: 1, depth: 1 }, color: 0xffffff },
        tags: [{ tag: 'emissive', value: 0.75 }],
      },
    ],
  };
  const root = buildModelFromJson(json);
  const lamp = root.getObjectByName('lamp');
  assert.equal(hasMaterialTags(json), true);
  assert.equal(lamp.material.userData.chiiMaterialTags[0].tag, 'emissive');
  assert.ok(lamp.material.emissiveIntensity > 0);
  assert.ok(lamp.material instanceof THREE.Material);
});
