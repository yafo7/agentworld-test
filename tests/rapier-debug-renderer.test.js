import assert from 'node:assert/strict';
import test from 'node:test';
import { RapierDebugRenderer } from '../src/engine/physics/RapierDebugRenderer.js';

test('Rapier debug renderer rebuilds BufferAttributes when debug data grows', () => {
  const vertices = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    1, 0, 0,
    1, 1, 0,
  ]);
  const colors = new Float32Array([
    1, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 1, 0,
  ]);
  const renderer = new RapierDebugRenderer({
    debugRender: () => ({ vertices, colors }),
  });

  assert.equal(renderer.mesh.geometry.getAttribute('position').count, 0);
  renderer.enabled = true;
  renderer.update();

  assert.equal(renderer.mesh.visible, true);
  assert.equal(renderer.mesh.geometry.getAttribute('position').count, vertices.length / 3);
  assert.equal(renderer.mesh.geometry.getAttribute('color').count, colors.length / 3);
  assert.equal(renderer.mesh.geometry.drawRange.count, vertices.length / 3);
});
