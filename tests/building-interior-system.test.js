import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WorldObjectRegistry } from '../src/world/WorldObjectRegistry.js';
import { BuildingInteriorSystem } from '../src/demos/chii-island/systems/BuildingInteriorSystem.js';

function room(roomType, x) {
  return {
    roomType,
    origin: { x, y: 0, z: 0 },
    root: { visible: false },
    spawnWorld: { x, y: 0, z: 5 },
    exitWorld: new THREE.Vector3(x, 0, 7),
    lookDirection: { x: 0, y: 0, z: -1 },
    camera: { yaw: 0, pitch: 0.2, distance: 6 },
  };
}

function harness() {
  const calls = [];
  const worldObjects = new WorldObjectRegistry();
  const churchEntity = {
    id: 'church_entity',
    category: 'house',
    mesh: { visible: true },
  };
  worldObjects.add(churchEntity, { assetId: 'church' });
  const player = {
    setTerrainConstraintEnabled: enabled => calls.push(['terrain', enabled]),
    setFlightAllowed: enabled => calls.push(['flight', enabled]),
    teleport: (position, options) => calls.push(['teleport', { ...position }, options]),
  };
  const cameraController = {
    yaw: 1,
    pitch: 0.3,
    distance: 8,
    snapTo: (position, options) => calls.push(['camera', { ...position }, options]),
  };
  const pageLoading = {
    show: copy => calls.push(['show', copy.title]),
    hide: () => calls.push(['hide']),
  };
  const rooms = new Map([
    ['church', room('church', 520)],
    ['empty', room('empty', 590)],
  ]);
  const system = new BuildingInteriorSystem({
    player,
    cameraController,
    pageLoading,
    rooms,
    worldObjects,
    buildings: [
      { type: 'church', gridX: 34, gridZ: 6, width: 8, depth: 11 },
      { type: 'windmill', gridX: 7, gridZ: 25, width: 4, depth: 4 },
      { type: 'temple', gridX: 33, gridZ: 35, width: 11, depth: 8 },
    ],
    center: [0, 0],
    gridSize: 50,
    transitionTimings: { reveal: 0, settle: 0, fade: 0 },
    onInteriorChanged: inside => calls.push(['interior', inside]),
  });
  return { system, calls, rooms, churchEntity };
}

test('church door enters the furnished room and its inside door returns outside', async () => {
  const { system, calls, rooms, churchEntity } = harness();
  const churchEntry = system.entries.find(entry => entry.buildingId === 'church');
  assert.equal(churchEntry.entity, churchEntity);
  const enterHit = system.findInteraction(churchEntry.position, 6);

  assert.equal(enterHit.label, '进入哥特教堂');
  await system.interact(enterHit);
  assert.equal(system.isInside(), true);
  assert.equal(system.getLocationName(), '哥特教堂内部');
  assert.equal(rooms.get('church').root.visible, true);
  assert.deepEqual(calls.filter(call => call[0] === 'terrain').at(-1), ['terrain', false]);
  assert.deepEqual(calls.filter(call => call[0] === 'flight').at(-1), ['flight', false]);
  assert.deepEqual(calls.filter(call => call[0] === 'interior').at(-1), ['interior', true]);
  assert.deepEqual(calls.find(call => call[0] === 'teleport')[1], rooms.get('church').spawnWorld);

  system.cooldownUntil = 0;
  const exitHit = system.findInteraction(rooms.get('church').exitWorld, 6);
  assert.equal(exitHit.label, '离开哥特教堂');
  await system.interact(exitHit);

  assert.equal(system.isInside(), false);
  assert.equal(rooms.get('church').root.visible, false);
  assert.deepEqual(calls.filter(call => call[0] === 'terrain').at(-1), ['terrain', true]);
  assert.deepEqual(calls.filter(call => call[0] === 'flight').at(-1), ['flight', true]);
  assert.deepEqual(calls.filter(call => call[0] === 'interior').at(-1), ['interior', false]);
  system.dispose();
});

test('windmill and temple reuse the empty room template', () => {
  const { system } = harness();
  assert.equal(system.entries.find(entry => entry.buildingId === 'windmill').roomType, 'empty');
  assert.equal(system.entries.find(entry => entry.buildingId === 'temple').roomType, 'empty');
  system.dispose();
});
