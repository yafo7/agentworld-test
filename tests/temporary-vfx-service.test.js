import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  TemporaryVfxService,
  getTemporaryVfxPreset,
} from '../src/demos/chii-island/presentation/TemporaryVfxService.js';

test('temporary VFX presets share one lifecycle service', () => {
  const scene = new THREE.Scene();
  const target = new THREE.Group();
  scene.add(target);
  const service = new TemporaryVfxService({ scene });

  const key = service.playPreset('idea', { target, key: 'idea:test', duration: 0.1 });
  assert.equal(key, 'idea:test');
  assert.equal(service.effects.size, 1);
  assert.ok(getTemporaryVfxPreset('dust'));

  service.update(0.2);
  assert.equal(service.effects.size, 0);
  service.dispose();
});

test('temporary VFX scales within bounds for a large visual target', () => {
  const scene = new THREE.Scene();
  const target = new THREE.Group();
  const visual = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 2));
  visual.position.y = 4.5;
  target.add(visual);
  scene.add(target);
  const service = new TemporaryVfxService({ scene });
  const key = service.playPreset('workStart', { target });
  assert.equal(service.effects.get(key).visualScale, 1.8);
  service.dispose();
});
