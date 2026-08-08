import assert from 'node:assert/strict';
import test from 'node:test';
import { createTownActivityObjectiveProjection } from '../src/demos/chii-island/data/townActivityObjectiveProjection.js';

function pet(id, x, z) {
  return { _petName: id, mesh: { position: { x, y: 0, z } } };
}

function activity(overrides = {}) {
  return {
    status: 'preparing',
    plan: {
      id: 'campfire-party',
      title: '篝火晚会',
      participants: ['fangk', 'mako', 'lingq'],
      exitPetId: 'fangk',
    },
    ...overrides,
  };
}

test('town objective points to the pet that must be invited', () => {
  const pets = { mako: pet('mako', 8, 2) };
  const projection = createTownActivityObjectiveProjection(activity({
    prepTask: {
      kind: 'talk_pet', petId: 'mako', label: '去邀请mako参加活动',
      stepIndex: 0, steps: [{}, {}], complete: false, skipped: false,
    },
  }), { findPet: id => pets[id] });
  assert.equal(projection.kind, 'talk_pet');
  assert.deepEqual(projection.target, { type: 'pet', id: 'mako' });
  assert.deepEqual(projection.progress, { current: 0, total: 2 });
});

test('town objective points to visit tasks and preserves their radius', () => {
  const projection = createTownActivityObjectiveProjection(activity({
    prepTask: {
      kind: 'visit', label: '去教堂门前', target: { x: 12, y: 0, z: -20 },
      radius: 7, stepIndex: 1, steps: [{}, {}, {}], complete: false, skipped: false,
    },
  }));
  assert.equal(projection.kind, 'visit');
  assert.equal(projection.radius, 7);
  assert.deepEqual(projection.target.position, { x: 12, y: 0, z: -20 });
});

test('new year greeting points to the nearest ungreeted resident', () => {
  const pets = {
    fangk: pet('fangk', 20, 0),
    mako: pet('mako', 3, 0),
    lingq: pet('lingq', 9, 0),
  };
  const projection = createTownActivityObjectiveProjection(activity({
    status: 'new_year_greetings',
    greetedPetIds: new Set(['fangk']),
    stageTask: { label: '和伙伴拜年', complete: false },
  }), {
    findPet: id => pets[id],
    playerPosition: { x: 0, y: 0, z: 0 },
  });
  assert.equal(projection.target.id, 'mako');
  assert.deepEqual(projection.progress, { current: 1, total: 3 });
});

test('completed activity tasks point back to the exit host', () => {
  const host = pet('fangk', 2, 4);
  const projection = createTownActivityObjectiveProjection(activity({
    status: 'linger',
    stageTask: { label: '继续玩', complete: true },
  }), { findPet: id => id === 'fangk' ? host : null });
  assert.equal(projection.kind, 'return_host');
  assert.equal(projection.target.id, 'fangk');
});
