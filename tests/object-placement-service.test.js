import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WorldObjectRegistry } from '../src/world/WorldObjectRegistry.js';
import { ObjectPlacementService } from '../src/world/placement/ObjectPlacementService.js';
import { PlacementGrid } from '../src/world/placement/PlacementGrid.js';

function createEntity(id, position, size = [2, 2, 2]) {
  const mesh = new THREE.Group();
  mesh.position.copy(position);
  const content = new THREE.Group();
  const model = new THREE.Mesh(new THREE.BoxGeometry(...size));
  model.position.y = size[1] / 2;
  content.add(model);
  mesh.add(content);
  return {
    id,
    _instanceId: id,
    name: id,
    mesh,
    _content: content,
    _modelGroup: model,
    _originalModelJson: { id, parts: [] },
    getWorldBBox() {
      this.mesh.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(this._content);
    },
  };
}

function createFixture({ terrainSize = 6, layout = null } = {}) {
  const terrainLayout = layout || Array.from({ length: terrainSize }, () => Array(terrainSize).fill('grass'));
  const grid = new PlacementGrid({ terrainSize, terrainLayout });
  const worldObjects = new WorldObjectRegistry();
  const scene = new THREE.Scene();
  const colliderCalls = [];
  const colliderRegistry = {
    replaceEntity(entity, options) {
      colliderCalls.push({ entity, options });
    },
  };
  const placement = new ObjectPlacementService({ grid, worldObjects, scene, colliderRegistry });
  return { grid, worldObjects, scene, colliderCalls, placement };
}

function addEditable(fixture, entity, footprint = { width: 2, depth: 2 }) {
  fixture.scene.add(entity.mesh);
  fixture.worldObjects.add(entity, {
    modelJson: entity._originalModelJson,
    assetId: entity.id,
    placement: { editable: true, footprint, source: 'curated' },
  });
}

test('object placement previews atomically and rebuilds collision only after confirm', () => {
  const fixture = createFixture();
  const firstPosition = fixture.grid.positionFor({ x: 1, z: 1 }, { width: 2, depth: 2 }).clone();
  const occupiedPosition = fixture.grid.positionFor({ x: 4, z: 1 }, { width: 2, depth: 2 }).clone();
  const freePosition = fixture.grid.positionFor({ x: 7, z: 7 }, { width: 2, depth: 2 }).clone();
  const first = createEntity('first', firstPosition);
  const occupied = createEntity('occupied', occupiedPosition);
  addEditable(fixture, first);
  addEditable(fixture, occupied);

  fixture.placement.begin(first);
  fixture.placement.moveToWorld(occupiedPosition);
  assert.equal(fixture.placement.active.valid, false);
  assert.equal(fixture.placement.confirm(), false);
  assert.equal(fixture.colliderCalls.length, 0);

  fixture.placement.moveToWorld(freePosition);
  fixture.placement.setUserScale(1.5);
  assert.equal(fixture.placement.active.valid, true);
  assert.equal(fixture.placement.confirm(), true);

  const record = fixture.grid.get(first);
  const metadata = fixture.worldObjects.getMetadata(first);
  assert.deepEqual(record.footprint, { width: 3, depth: 3 });
  assert.deepEqual(metadata.placement.footprint, { width: 3, depth: 3 });
  assert.equal(first._content.scale.x, 1.5);
  assert.equal(fixture.colliderCalls.length, 1);
  assert.equal(fixture.colliderCalls[0].options.operation, 'transform');
});

test('scale previews return to the same footprint center without cumulative drift', () => {
  const fixture = createFixture({ terrainSize: 8 });
  const originalPosition = fixture.grid.positionFor({ x: 3, z: 3 }, { width: 3, depth: 3 }).clone();
  const building = createEntity('building', originalPosition, [5, 6, 3]);
  addEditable(fixture, building, { width: 3, depth: 3 });

  fixture.placement.begin(building);
  fixture.placement.setUserScale(2);
  fixture.placement.setUserScale(0.5);
  fixture.placement.setUserScale(1);

  assert.deepEqual(fixture.placement.active.anchor, { x: 3, z: 3 });
  assert.deepEqual(fixture.placement.active.footprint, { width: 3, depth: 3 });
  assert.ok(building.mesh.position.distanceTo(originalPosition) < 0.0001);
});

test('scale previews compensate for a model pivot away from its footprint center', () => {
  const fixture = createFixture({ terrainSize: 8 });
  const footprintCenter = fixture.grid.positionFor({ x: 4, z: 4 }, { width: 4, depth: 4 }).clone();
  const building = createEntity('offset-building', footprintCenter, [6, 8, 4]);
  building._modelGroup.position.x = 2.5;
  building._modelGroup.position.z = -1.5;
  addEditable(fixture, building, { width: 4, depth: 4 });

  fixture.placement.begin(building);
  fixture.placement.setUserScale(1.5);
  const enlargedCenter = building.getWorldBBox().getCenter(new THREE.Vector3());
  fixture.placement.setUserScale(1);
  const restoredCenter = building.getWorldBBox().getCenter(new THREE.Vector3());

  assert.ok(Math.hypot(enlargedCenter.x - footprintCenter.x, enlargedCenter.z - footprintCenter.z) < 0.0001);
  assert.ok(Math.hypot(restoredCenter.x - footprintCenter.x, restoredCenter.z - footprintCenter.z) < 0.0001);
});

test('remove cancels an uncommitted preview and undo restores occupancy', () => {
  const fixture = createFixture();
  const originalPosition = fixture.grid.positionFor({ x: 1, z: 1 }, { width: 2, depth: 2 }).clone();
  const entity = createEntity('removable', originalPosition);
  addEditable(fixture, entity);

  fixture.placement.begin(entity);
  fixture.placement.moveByCells(3, 2);
  assert.notDeepEqual(entity.mesh.position.toArray(), originalPosition.toArray());
  fixture.placement.remove(entity);

  assert.equal(fixture.worldObjects.findById(entity.id), null);
  assert.equal(fixture.grid.get(entity), null);
  assert.deepEqual(entity.mesh.position.toArray(), originalPosition.toArray());

  const restored = fixture.placement.undoRemove();
  assert.equal(restored, entity);
  assert.equal(fixture.worldObjects.findById(entity.id), entity);
  assert.ok(fixture.grid.get(entity));
  assert.equal(fixture.grid.audit().overlaps.length, 0);
});

test('generated objects normalize into a free footprint and refined models keep that footprint', () => {
  const fixture = createFixture({ terrainSize: 8 });
  const desired = fixture.grid.positionFor({ x: 3, z: 3 }, { width: 2, depth: 2 }).clone();
  const generated = createEntity('generated', desired, [20, 12, 10]);
  const placementMetadata = fixture.placement.prepareGeneratedEntity(generated, desired);

  assert.deepEqual(placementMetadata.footprint, { width: 2, depth: 2 });
  assert.ok(placementMetadata.normalizationScale < 1);
  addEditable(fixture, generated, placementMetadata.footprint);
  fixture.worldObjects.updateMetadata(generated, { placement: placementMetadata });

  const previousFootprint = { ...fixture.grid.get(generated).footprint };
  const nextModelJson = { id: 'generated-refined', parts: [{ id: 'larger' }] };
  generated._modelGroup.geometry.dispose();
  generated._modelGroup.geometry = new THREE.BoxGeometry(40, 16, 20);
  generated._modelGroup.position.y = 8;
  generated._originalModelJson = nextModelJson;
  fixture.worldObjects.updateMetadata(generated, { modelJson: nextModelJson, operation: 'refine' });
  fixture.placement.reconcileModel(generated);

  assert.deepEqual(fixture.grid.get(generated).footprint, previousFootprint);
  assert.ok(generated._content.scale.x < placementMetadata.normalizationScale);
  assert.equal(fixture.colliderCalls.at(-1).options.modelJson, nextModelJson);
});

test('generated placement fails instead of overlapping blocked terrain', () => {
  const layout = Array.from({ length: 4 }, () => Array(4).fill('water'));
  const fixture = createFixture({ terrainSize: 4, layout });
  const generated = createEntity('blocked', new THREE.Vector3(), [2, 2, 2]);
  assert.throws(
    () => fixture.placement.prepareGeneratedEntity(generated, new THREE.Vector3()),
    /没有可放置新物件的空地/,
  );
});
