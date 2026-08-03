import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  CHII_SCALE_CATEGORIES,
  CHII_SCALE_CATEGORY_RULES,
  CHII_SIZE_PROFILES,
  CHII_WORLD_METRICS,
  resolveChiiSizeProfile,
} from '../src/demos/chii-island/data/worldTuningProfile.js';
import { ObjectScalePolicy } from '../src/world/placement/ObjectScalePolicy.js';
import { PlacementGrid } from '../src/world/placement/PlacementGrid.js';

function createEntity(size) {
  const mesh = new THREE.Group();
  const content = new THREE.Group();
  const model = new THREE.Mesh(new THREE.BoxGeometry(...size));
  model.position.y = size[1] / 2;
  content.add(model);
  mesh.add(content);
  return {
    id: 'fixture',
    name: 'fixture',
    category: 'decor',
    mesh,
    _content: content,
    _modelGroup: model,
    getWorldBBox() {
      mesh.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(content);
    },
  };
}

function createPolicy() {
  return new ObjectScalePolicy({
    profiles: CHII_SIZE_PROFILES,
    resolveProfile: resolveChiiSizeProfile,
    cellSize: CHII_WORLD_METRICS.placementCell,
  });
}

test('every world size profile belongs to one of the six scale categories', () => {
  const categories = Object.values(CHII_SCALE_CATEGORIES);
  const allowed = new Set(categories);

  assert.deepEqual(
    Object.keys(CHII_SCALE_CATEGORY_RULES).sort(),
    [...categories].sort(),
  );
  for (const [profileId, profile] of Object.entries(CHII_SIZE_PROFILES)) {
    assert.ok(allowed.has(profile.category), `${profileId} has invalid category ${profile.category}`);
  }
});

test('birthday event table height is governed by its semantic profile, not footprint height', () => {
  const entity = createEntity([4, 8, 2]);
  const identity = createPolicy().normalize(entity, {
    profileId: 'event_table',
    footprint: { width: 3, depth: 2 },
  });
  const size = entity.getWorldBBox().getSize(new THREE.Vector3());

  assert.equal(identity.profileId, 'event_table');
  assert.ok(size.y <= CHII_SIZE_PROFILES.event_table.maxHeight);
  assert.ok(size.y < CHII_WORLD_METRICS.residentHeight);
  assert.ok(size.x <= CHII_SIZE_PROFILES.event_table.maxWidth);
});

test('different raw style bounds normalize to the same semantic target height', () => {
  const pro = createEntity([3, 6, 2]);
  const voxel = createEntity([12, 24, 8]);
  const policy = createPolicy();
  policy.normalize(pro, { profileId: 'small_decor', footprint: { width: 2, depth: 2 } });
  policy.normalize(voxel, { profileId: 'small_decor', footprint: { width: 2, depth: 2 } });

  const proHeight = pro.getWorldBBox().getSize(new THREE.Vector3()).y;
  const voxelHeight = voxel.getWorldBBox().getSize(new THREE.Vector3()).y;
  assert.ok(Math.abs(proHeight - voxelHeight) < 0.0001);
});

test('placement grid explicitly converts terrain tiles to placement cells', () => {
  const grid = new PlacementGrid({ terrainSize: 10 });
  assert.deepEqual(grid.footprintFromTerrainTiles({ width: 3, depth: 4 }), { width: 6, depth: 8 });
  assert.equal(grid.cellsToTerrainTiles(8), 4);
});

test('semantic normalization anchors an offset model to the footprint center and ground', () => {
  const entity = createEntity([2, 4, 2]);
  entity._modelGroup.position.set(3, 4, -2);
  createPolicy().normalize(entity, {
    profileId: 'small_decor',
    footprint: { width: 2, depth: 2 },
  });
  const box = entity.getWorldBBox();
  const center = box.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(center.x) < 0.0001);
  assert.ok(Math.abs(center.z) < 0.0001);
  assert.ok(Math.abs(box.min.y) < 0.0001);
});

test('authored references are measured without changing their existing scale or pivot', () => {
  const entity = createEntity([4, 8, 3]);
  entity._content.scale.setScalar(3);
  entity._modelGroup.position.x = 2;
  const beforeScale = entity._content.scale.x;
  const beforePosition = entity._modelGroup.position.clone();
  const identity = createPolicy().captureAuthored(entity, { profileId: 'building' });

  assert.equal(entity._content.scale.x, beforeScale);
  assert.deepEqual(entity._modelGroup.position.toArray(), beforePosition.toArray());
  assert.equal(identity.source, 'authored_reference');
});

test('generated trees keep backend-authored scale and request a natural footprint', () => {
  const entity = createEntity([8, 12, 7]);
  const policy = createPolicy();
  const identity = policy.normalize(entity, {
    profileId: 'tree',
    footprint: { width: 2, depth: 2 },
  });

  assert.equal(entity._content.scale.x, 1);
  assert.equal(identity.source, 'authored_reference');
  assert.equal(identity.naturalFootprint, true);
});

test('plants and crops preserve their approved authored scale', () => {
  const policy = createPolicy();

  for (const profileId of ['plant', 'crop']) {
    const entity = createEntity([2, 3, 2]);
    entity._content.scale.setScalar(0.58);
    const identity = policy.normalize(entity, {
      profileId,
      footprint: { width: 1, depth: 1 },
    });

    assert.equal(entity._content.scale.x, 0.58);
    assert.equal(identity.scaleCategory, CHII_SCALE_CATEGORIES.PLANT);
    assert.equal(identity.source, 'authored_reference');
    assert.equal(identity.naturalFootprint, true);
  }
});
