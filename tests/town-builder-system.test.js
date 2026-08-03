import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { attachPetStateMachine } from '../src/gameplay/pets/PetStateMachine.js';
import {
  BUILDING_LOT_OPTIONS,
  TownBuilderSystem,
  createBuildingPrompt,
  toPlacementFootprint,
} from '../src/demos/chii-island/systems/TownBuilderSystem.js';

function createBuilderFixture(choiceResults) {
  const builder = {
    _petId: 'builder_crab',
    _petName: '螃蟹',
    mesh: new THREE.Group(),
    stopWalking() {},
    stopFollow() { this._followEnabled = false; },
    followTarget(target) { this._followEnabled = true; this._followTarget = target; },
    unlockFacing() {},
  };
  attachPetStateMachine(builder, 'free_roam');
  const scene = new THREE.Scene();
  const removed = [];
  const worldObjects = {
    add() {},
    remove(entity) { removed.push(entity); },
  };
  const objectPlacement = {
    grid: {
      subdivision: 2,
      terrainUnit: 4,
      cellSize: 2,
      findNearestAvailable(_position, footprint) {
        return { position: new THREE.Vector3(12, 0, 18), anchor: { x: 8, z: 9 }, footprint };
      },
    },
  };
  const placement = {
    position: new THREE.Vector3(12, 0, 18),
    anchor: { x: 8, z: 9 },
    footprint: { width: 6, depth: 8 },
  };
  const dialogue = {
    async askChoice() { return choiceResults.shift() || null; },
    async askInput() { return '红瓦木墙的小型宠物工坊'; },
    async say() { return true; },
  };
  const petManager = { resumePet() {} };
  const system = new TownBuilderSystem({
    scene,
    player: { mesh: new THREE.Group(), orientation: new THREE.Vector3(0, 0, 1) },
    petManager,
    builder,
    worldObjects,
    objectPlacement,
    objectEditor: { async openPlacementDraft() { return placement; } },
  });
  return { builder, dialogue, removed, system };
}

test('town building lots convert terrain tiles into placement-grid cells', () => {
  const lot = BUILDING_LOT_OPTIONS.find(option => option.key === '3x4');
  assert.deepEqual(toPlacementFootprint(lot, 2), { width: 6, depth: 8 });
  assert.deepEqual(toPlacementFootprint({ width: 5, depth: 5 }, 2), { width: 10, depth: 10 });
});

test('town building prompt preserves the request and includes the confirmed lot ratio', () => {
  assert.equal(
    createBuildingPrompt('红瓦木墙的小型宠物工坊', { width: 3, depth: 4 }),
    '红瓦木墙的小型宠物工坊，底部长宽比3比4，门高约一只宠物，主体按占地完整展开',
  );
});

test('town builder nothing choice preserves free roam', async () => {
  const fixture = createBuilderFixture([{ key: 'nothing' }]);
  assert.equal(await fixture.system.interact(fixture.builder, fixture.dialogue), false);
  assert.equal(fixture.builder._petState, 'free_roam');
  assert.equal(fixture.system.activeJob, null);
});

test('town builder starts generation only after lot, placement and prompt confirmation', async () => {
  const fixture = createBuilderFixture([
    { key: 'build' },
    { key: '3x4' },
    { key: 'confirm' },
  ]);
  let work = null;
  fixture.system._runBuild = async spec => { work = spec; };

  assert.equal(await fixture.system.interact(fixture.builder, fixture.dialogue), true);
  assert.equal(fixture.builder._petState, 'working');
  assert.deepEqual(work.lot, BUILDING_LOT_OPTIONS[0]);
  assert.deepEqual(work.placement.footprint, { width: 6, depth: 8 });
  assert.equal(work.description, '红瓦木墙的小型宠物工坊');
});
