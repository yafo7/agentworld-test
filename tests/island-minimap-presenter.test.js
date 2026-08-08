import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyMiniMapObject,
  resolveMiniMapPetIconId,
  worldToLocalMap,
} from '../src/demos/chii-island/presentation/IslandMiniMapPresenter.js';

test('local minimap keeps the player centered while world content moves around it', () => {
  const transform = { centerX: 88, centerY: 88, scale: 2 };
  const player = { x: 10, z: -6 };
  assert.deepEqual(worldToLocalMap(player, player, transform), { x: 88, y: 88 });
  assert.deepEqual(
    worldToLocalMap({ x: 14, z: -10 }, player, transform),
    { x: 96, y: 80 },
  );
});

test('minimap recognizes campfires, trees, crops, and plants from world tags', () => {
  assert.equal(classifyMiniMapObject({ name: '篝火', tags: ['城镇', '聚会'] }), 'campfire');
  assert.equal(classifyMiniMapObject({ name: '苹果树', tags: ['树木', 'apple'] }), 'tree');
  assert.equal(classifyMiniMapObject({ name: '胡萝卜', tags: ['crop', 'farm'] }), 'crop');
  assert.equal(classifyMiniMapObject({ name: '粉花', tags: ['plant', 'flower'] }), 'plant');
  assert.equal(classifyMiniMapObject({ name: '哥特教堂', tags: ['church'] }), null);
});

test('minimap resolves a dedicated portrait for each named resident', () => {
  assert.equal(resolveMiniMapPetIconId({ _residentId: 'momo' }), 'momo');
  assert.equal(resolveMiniMapPetIconId({ _petId: 'horse_7' }), 'mako');
  assert.equal(resolveMiniMapPetIconId({ _profile: { id: 'sky_bird' } }), 'yafo');
  assert.equal(resolveMiniMapPetIconId({ _petId: 'peacock' }), 'lingq');
  assert.equal(resolveMiniMapPetIconId({ _petId: 'fangke' }), 'fangk');
  assert.equal(resolveMiniMapPetIconId({ _petId: 'croc_axe' }), 'mok');
  assert.equal(resolveMiniMapPetIconId({ _profile: { id: 'crab' } }), 'builder_crab');
});

test('minimap keeps the generic portrait only as a fallback for generated pets', () => {
  assert.equal(resolveMiniMapPetIconId({ _residentId: 'summoned_pet_42' }), 'fallback');
  assert.equal(resolveMiniMapPetIconId(null), 'fallback');
});
