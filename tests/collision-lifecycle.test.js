import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { WorldObjectRegistry } from '../src/world/WorldObjectRegistry.js';
import { ColliderRegistry } from '../src/world/physics/ColliderRegistry.js';
import {
  buildPhysicsAssetPlan,
  clearPhysicsAssetPlanCache,
} from '../src/world/physics/PhysicsAssetBuilder.js';
import { COLLIDER_STRATEGIES } from '../src/world/physics/ColliderStrategy.js';

async function placeholderModel() {
  return JSON.parse(await readFile(
    new URL('../public/generated/models/placeholder.json', import.meta.url),
    'utf8',
  ));
}

function fakePhysics() {
  let nextBody = 1;
  let nextCollider = 1;
  const events = [];
  return {
    events,
    createStaticBody() {
      const body = { id: `body-${nextBody++}` };
      events.push(['create', body.id]);
      return body;
    },
    addStaticBoxToBody(body, ...args) {
      const collider = { id: `collider-${nextCollider++}`, body };
      events.push(['box', body.id, ...args]);
      return collider;
    },
    addStaticCylinderToBody(body, ...args) {
      const collider = { id: `collider-${nextCollider++}`, body };
      events.push(['cylinder', body.id, ...args]);
      return collider;
    },
    removeRigidBody(body) {
      events.push(['remove', body.id]);
    },
  };
}

function entity(id, modelJson, category = 'house') {
  const mesh = new THREE.Group();
  const content = new THREE.Group();
  mesh.add(content);
  return {
    id,
    _instanceId: `instance-${id}`,
    category,
    mesh,
    _content: content,
    _originalModelJson: modelJson,
    getWorldBBox: () => new THREE.Box3(
      new THREE.Vector3(-1, 0, -1),
      new THREE.Vector3(1, 2, 1),
    ),
  };
}

test('collision plans select a bounded set of important mesh parts and cache by model revision', async () => {
  clearPhysicsAssetPlanCache();
  const modelJson = await placeholderModel();
  const profile = {
    key: 'test-building:v1',
    mode: 'compound',
    maxBoxes: 2,
    minVolume: 0,
    minPlanArea: 0,
    minHeight: 0,
    minExtent: 0,
    rankBy: 'volume',
    fallbackToBounds: true,
  };

  const first = buildPhysicsAssetPlan({ modelJson, profile });
  const second = buildPhysicsAssetPlan({ modelJson, profile });

  assert.equal(first, second);
  assert.equal(first.sourceMeshCount, 3);
  assert.equal(first.selectedMeshCount, 2);
  assert.equal(first.boxes.length, 2);
  assert.equal(first.fallbackUsed, false);
  assert.equal(first.strategy, COLLIDER_STRATEGIES.VOXEL_AABB);
  assert.ok(first.boxes.every((box) => box.rotation.equals(new THREE.Quaternion())));
});

test('voxel AABB strategy converts rotated important parts into axis-aligned boxes', async () => {
  const modelJson = await placeholderModel();
  modelJson.nodes[1].mesh.params.width = 1.2;
  modelJson.nodes[1].mesh.params.depth = 0.2;
  modelJson.nodes[1].transform.quat = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
  const profile = {
    key: 'rotated-part:v1',
    mode: 'compound',
    maxBoxes: 1,
    minVolume: 0,
    minPlanArea: 0,
    minHeight: 0,
    minExtent: 0,
    rankBy: 'volume',
    fallbackToBounds: true,
  };

  const voxelPlan = buildPhysicsAssetPlan({
    modelJson,
    profile,
    strategy: COLLIDER_STRATEGIES.VOXEL_AABB,
  });

  assert.ok(voxelPlan.boxes[0].rotation.equals(new THREE.Quaternion()));
  assert.ok(voxelPlan.boxes[0].halfExtents.x > 0.45);
  assert.ok(voxelPlan.boxes[0].halfExtents.z > 0.45);
});

test('collider instances share shape plans but own separate Rapier bodies', async () => {
  const modelJson = await placeholderModel();
  const physics = fakePhysics();
  const registry = new ColliderRegistry(physics);
  const first = entity('first', modelJson);
  const second = entity('second', modelJson);

  const firstRecord = registry.registerEntity(first);
  const secondRecord = registry.registerEntity(second);

  assert.equal(firstRecord.plan, secondRecord.plan);
  assert.notEqual(firstRecord.body, secondRecord.body);
  assert.equal(registry.summary().assets, 2);
});

test('collider strategy defaults to voxel AABB and can rebuild existing entities as original bounds', async () => {
  const modelJson = await placeholderModel();
  const physics = fakePhysics();
  const registry = new ColliderRegistry(physics);
  const tree = entity('switchable-tree', modelJson, 'tree');
  tree.mesh.userData.collider = { type: 'tree' };

  const voxelRecord = registry.registerEntity(tree);
  assert.equal(registry.strategy, COLLIDER_STRATEGIES.VOXEL_AABB);
  assert.equal(voxelRecord.plan.strategy, COLLIDER_STRATEGIES.VOXEL_AABB);
  assert.ok(physics.events.some((event) => event[0] === 'box'));

  const summary = registry.setStrategy(COLLIDER_STRATEGIES.LEGACY_BOUNDS);
  const legacyRecord = registry.get(tree);
  assert.equal(summary.strategy, COLLIDER_STRATEGIES.LEGACY_BOUNDS);
  assert.equal(legacyRecord.profileKey.startsWith('legacy-tree:'), true);
  assert.ok(physics.events.some((event) => event[0] === 'cylinder'));
  assert.ok(physics.events.some((event) => event[0] === 'remove' && event[1] === voxelRecord.body.id));
});

test('original bounds strategy keeps the configured single building footprint collider', async () => {
  const modelJson = await placeholderModel();
  const physics = fakePhysics();
  const registry = new ColliderRegistry(physics, {
    strategy: COLLIDER_STRATEGIES.LEGACY_BOUNDS,
  });
  const building = entity('legacy-building', modelJson, 'house');
  building.mesh.position.set(8, 0, 4);
  building.mesh.userData.collider = { type: 'building', width: 6, depth: 10 };

  const record = registry.registerEntity(building);
  const boxEvent = physics.events.find((event) => event[0] === 'box');

  assert.equal(record.profileKey.startsWith('legacy-building:'), true);
  assert.equal(record.colliders.length, 1);
  assert.equal(boxEvent[2], 3);
  assert.equal(boxEvent[4], 5);
  assert.equal(boxEvent[5], 8);
  assert.equal(boxEvent[7], 4);
});

test('bridge keeps a walkable deck and two rail colliders in both strategies', async () => {
  const modelJson = await placeholderModel();
  const physics = fakePhysics();
  const registry = new ColliderRegistry(physics);
  const bridge = entity('town-bridge', modelJson, 'building');
  bridge.mesh.position.set(10, 0, -6);
  bridge.mesh.userData.collider = {
    type: 'bridge',
    length: 44,
    width: 12,
    deckY: 0,
    deckThickness: 0.2,
    railHeight: 1.4,
    railThickness: 0.4,
  };

  const voxelRecord = registry.registerEntity(bridge);
  assert.equal(voxelRecord.profileKey.startsWith('bridge:'), true);
  assert.equal(voxelRecord.colliders.length, 3);
  const deckEvent = physics.events.find(event => event[0] === 'box');
  assert.equal(deckEvent[2], 22);
  assert.equal(deckEvent[3], 0.1);
  assert.equal(deckEvent[4], 6);

  registry.setStrategy(COLLIDER_STRATEGIES.LEGACY_BOUNDS);
  const legacyRecord = registry.get(bridge);
  assert.equal(legacyRecord.profileKey.startsWith('bridge:'), true);
  assert.equal(legacyRecord.colliders.length, 3);
});

test('bridge uses fitted visual deck and rail segments when the scene supplies them', async () => {
  const modelJson = await placeholderModel();
  const physics = fakePhysics();
  const registry = new ColliderRegistry(physics);
  const bridge = entity('segmented-bridge', modelJson, 'building');
  bridge.mesh.position.set(10, 0, -6);
  bridge.mesh.userData.collider = {
    type: 'bridge',
    length: 44,
    width: 12,
    deckSegments: [
      {
        center: [-2, 0.2, 0],
        halfExtents: [2.1, 0.15, 4.5],
        rotation: [0, 0, 0.08, 0.9968],
      },
      {
        center: [2, 0.2, 0],
        halfExtents: [2.1, 0.15, 4.5],
        rotation: [0, 0, -0.08, 0.9968],
      },
    ],
    railSegments: [
      {
        center: [0, 0.8, -5.5],
        halfExtents: [4, 0.7, 0.2],
        rotation: [0, 0, 0, 1],
      },
    ],
  };

  const record = registry.registerEntity(bridge);
  const boxEvents = physics.events.filter(event => event[0] === 'box');

  assert.equal(record.colliders.length, 3);
  assert.equal(boxEvents.length, 3);
  assert.deepEqual(boxEvents[0].slice(2, 8), [2.1, 0.15, 4.5, 8, 0.2, -6]);
  assert.equal(boxEvents[0][8].z, 0.08);
  assert.equal(boxEvents[0][8].w, 0.9968);
});

test('refine prepares a new model revision before atomically replacing the old collider instance', async () => {
  const originalJson = await placeholderModel();
  const refinedJson = structuredClone(originalJson);
  refinedJson.nodes[1].mesh.params.width = 1.4;
  const physics = fakePhysics();
  const registry = new ColliderRegistry(physics);
  const target = entity('target', originalJson);
  const originalRecord = registry.registerEntity(target, { operation: 'original', assetId: 'tree-house' });
  const prepared = registry.prepareEntity(target, {
    modelJson: refinedJson,
    operation: 'refine',
    assetId: 'tree-house-refined',
  });

  assert.equal(registry.get(target), originalRecord);
  assert.equal(prepared.revision.parentRevisionId, originalRecord.revision.revisionId);
  const nextRecord = registry.commitPrepared(prepared);

  const firstNewCollider = physics.events.findIndex((event) => event[0] === 'box' && event[1] === nextRecord.body.id);
  const oldBodyRemoved = physics.events.findIndex((event) => event[0] === 'remove' && event[1] === originalRecord.body.id);
  assert.ok(firstNewCollider >= 0);
  assert.ok(oldBodyRemoved > firstNewCollider);
  assert.equal(nextRecord.revision.operation, 'refine');
  assert.notEqual(nextRecord.revision.contentHash, originalRecord.revision.contentHash);
});

test('mount creates a child model revision while preserving the entity collider identity', async () => {
  const originalJson = await placeholderModel();
  const mountedJson = structuredClone(originalJson);
  mountedJson.nodes.push({
    id: 'mounted-lamp',
    transform: { pos: [0.5, 0.8, 0] },
    mesh: { type: 'box', params: { width: 0.3, height: 0.5, depth: 0.3 }, color: 0xffff66 },
  });
  const physics = fakePhysics();
  const registry = new ColliderRegistry(physics);
  const target = entity('mounted-target', originalJson);
  const originalRecord = registry.registerEntity(target, { operation: 'original', assetId: 'base-object' });

  const mountedRecord = registry.replaceEntity(target, {
    modelJson: mountedJson,
    operation: 'mount',
    assetId: 'mounted-object',
  });

  assert.equal(registry.summary().assets, 1);
  assert.equal(mountedRecord.revision.operation, 'mount');
  assert.equal(mountedRecord.revision.parentRevisionId, originalRecord.revision.revisionId);
  assert.notEqual(mountedRecord.revision.revisionId, originalRecord.revision.revisionId);
});

test('world object additions and removals create and destroy runtime collider instances', async () => {
  const modelJson = await placeholderModel();
  const physics = fakePhysics();
  const colliders = new ColliderRegistry(physics);
  const worldObjects = new WorldObjectRegistry();
  colliders.bindWorldObjects(worldObjects);
  const generated = entity('generated', modelJson, 'decor');

  worldObjects.add(generated, {
    modelJson,
    operation: 'generate',
    assetId: 'generated-asset',
  });
  assert.equal(colliders.get(generated).revision.operation, 'generate');

  const body = colliders.get(generated).body;
  worldObjects.remove(generated);
  assert.equal(colliders.get(generated), null);
  assert.ok(physics.events.some((event) => event[0] === 'remove' && event[1] === body.id));
});

test('plants remain non-solid even when a runtime model exists', async () => {
  const modelJson = await placeholderModel();
  const physics = fakePhysics();
  const registry = new ColliderRegistry(physics);
  const plant = entity('flower', modelJson, 'plant');

  assert.equal(registry.registerEntity(plant), null);
  assert.equal(registry.summary().colliders, 0);
});
