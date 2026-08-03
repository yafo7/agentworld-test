import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { buildModelFromJson } from '../src/engine/model/builder.js';
import { fitBridgeToWorld } from '../src/demos/chii-island/world/ChiiSceneAssembler.js';

test('town bridge aligns its entrance paving instead of the bridge root top', () => {
  const modelJson = JSON.parse(readFileSync(
    new URL('../public/generated/models/town_stone_bridge.json', import.meta.url),
    'utf8',
  ));
  const model = buildModelFromJson(modelJson);
  const rawBounds = new THREE.Box3().setFromObject(model);
  model.position.y = -rawBounds.min.y;

  const mesh = new THREE.Group();
  const content = new THREE.Group();
  content.add(model);
  mesh.add(content);
  mesh.userData.collider = { type: 'bridge' };
  const entity = { mesh, _content: content, _modelGroup: model };

  const result = fitBridgeToWorld(entity, { targetLength: 44, deckWorldY: 0.12 });
  mesh.updateWorldMatrix(true, true);

  assert.equal(result.deckNodeName, 'bridgeDeck');
  assert.equal(result.alignmentSource, 'entrance-deck-pieces');
  assert.ok(result.endpointDeckPieceCount >= 2);
  assert.ok(result.measuredDeckSurface < rawBounds.max.y);
  assert.ok(result.deckColliderSegmentCount >= 10);
  assert.ok(result.railColliderSegmentCount >= 20);
  assert.equal(
    mesh.userData.collider.deckSegments.length,
    result.deckColliderSegmentCount,
  );
  assert.equal(
    mesh.userData.collider.railSegments.length,
    result.railColliderSegmentCount,
  );

  const entranceDeckPieces = model.getObjectByName('bridgeDeck').children
    .filter(child => child.isMesh)
    .map(child => new THREE.Box3().setFromObject(child))
    .filter(bounds => bounds.getSize(new THREE.Vector3()).z >= 2.2)
    .filter(bounds => Math.abs(bounds.getCenter(new THREE.Vector3()).x) >= 20);
  const entranceSurface = Math.max(...entranceDeckPieces.map(bounds => bounds.max.y));
  assert.ok(Math.abs(entranceSurface - 0.12) < 0.001);

  const bridgeBounds = new THREE.Box3().setFromObject(model);
  assert.ok(bridgeBounds.max.y > 4);
  assert.ok(bridgeBounds.min.y < -5);
});

test('town bridge accepts a raw Voxel hierarchy without a bridgeDeck node', () => {
  const model = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.4, 3.2),
    new THREE.MeshBasicMaterial(),
  );
  slab.position.y = 1;
  model.add(slab);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(10, 1, 0.3),
      new THREE.MeshBasicMaterial(),
    );
    rail.position.set(0, 1.7, side * 1.85);
    model.add(rail);
  }
  for (const x of [-4, 4]) {
    const support = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 3.5),
      new THREE.MeshBasicMaterial(),
    );
    support.position.set(x, 0.5, 0);
    model.add(support);
  }

  const mesh = new THREE.Group();
  const content = new THREE.Group();
  content.add(model);
  mesh.add(content);
  mesh.userData.collider = { type: 'bridge' };
  const result = fitBridgeToWorld(
    { mesh, _content: content, _modelGroup: model },
    { targetLength: 44, deckWorldY: 0.12 },
  );
  mesh.updateWorldMatrix(true, true);

  const slabBounds = new THREE.Box3().setFromObject(slab);
  assert.equal(result.deckNodeName, null);
  assert.equal(result.alignmentSource, 'entrance-deck-pieces');
  assert.equal(result.deckColliderSegmentCount, 1);
  assert.equal(result.railColliderSegmentCount, 2);
  assert.ok(Math.abs(slabBounds.max.y - 0.12) < 0.001);
});

test('generated Voxel town bridge stays raw, box-only, and directly alignable', () => {
  const modelJson = JSON.parse(readFileSync(
    new URL('../public/generated/styles/voxel/models/town_stone_bridge.json', import.meta.url),
    'utf8',
  ));
  const model = buildModelFromJson(modelJson);
  const rawBounds = new THREE.Box3().setFromObject(model);
  model.position.y = -rawBounds.min.y;

  const mesh = new THREE.Group();
  const content = new THREE.Group();
  content.add(model);
  mesh.add(content);
  mesh.userData.collider = { type: 'bridge' };
  const result = fitBridgeToWorld(
    { mesh, _content: content, _modelGroup: model },
    { targetLength: 44, deckWorldY: 0.12 },
  );

  assert.ok(modelJson.nodes.every(node => !node.mesh || node.mesh.type === 'box'));
  assert.ok(modelJson.nodes.every(node => (
    !/water/i.test(String(node.id || node.name || ''))
    && !node.tags?.some(tag => tag?.tag === 'water')
  )));
  assert.equal(result.deckNodeName, null);
  assert.ok(result.deckColliderSegmentCount >= 1);
  assert.ok(result.railColliderSegmentCount >= 2);
});
