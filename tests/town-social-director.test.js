import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { TownSocialDirector } from '../src/demos/chii-island/systems/TownSocialDirector.js';
import { TownSocialMemory } from '../src/gameplay/social/TownSocialMemory.js';
import { attachPetStateMachine, PET_STATES } from '../src/gameplay/pets/PetStateMachine.js';

function makePet(id, profile = {}) {
  const pet = {
    _petName: id,
    _profile: profile,
    mesh: new THREE.Group(),
    stopFollow() {},
    disableWander() {},
    getPosition() { return this.mesh.position.clone(); },
  };
  attachPetStateMachine(pet, PET_STATES.FREE_ROAM);
  return pet;
}

function makeObjects(items) {
  return {
    items: items.map((item, index) => ({
      ...item,
      mesh: item.mesh || { position: new THREE.Vector3(index * 2, 0, 0) },
    })),
    query(predicate) { return this.items.filter(predicate); },
  };
}

test('town opportunities require context and rotate away from recent activities', () => {
  const fangk = makePet('fangk', {
    personalityTags: ['认真', '可靠'],
    featureTags: ['喜欢组织', '擅长集体活动'],
  });
  const lingq = makePet('lingq', { featureTags: ['喜欢展示'] });
  const mako = makePet('mako', { featureTags: ['喜欢运动'] });
  const objects = makeObjects([{ id: 'fire', tags: ['篝火'] }]);
  const memory = new TownSocialMemory();
  const director = new TownSocialDirector({
    participants: [fangk, lingq, mako],
    worldObjects: objects,
    memory,
  });

  assert.equal(director.getOpportunity(fangk).type, 'campfire');
  assert.equal(director.getOpportunity(mako), null);
  assert.equal(director.getOpportunity(lingq).type, 'greeting');

  memory.recordCompleted('campfire', { initiatorId: 'fangk', outcome: 'auto-completed' });
  assert.equal(director.getOpportunity(fangk).type, 'party');

  objects.items.push({ id: 'tree', tags: ['apple'], mesh: { position: new THREE.Vector3(3, 0, 0) } });
  assert.equal(director.getOpportunity(mako).type, 'apple_pick');

  lingq.petState.enterTemporary(PET_STATES.PERFORMING);
  assert.equal(director.getOpportunity(lingq), null);
});

test('town target selection prefers the nearest reachable apple tree', () => {
  const mako = makePet('mako');
  mako.mesh.position.set(0, 0, 0);
  mako._navigation = {
    findPath(from, to) {
      if (to.x === 4) return [];
      return [{ x: to.x, y: 0, z: to.z }];
    },
  };
  const blockedNearTree = { id: 'blocked', tags: ['apple'], mesh: { position: new THREE.Vector3(4, 0, 0) } };
  const reachableTree = { id: 'reachable', tags: ['apple'], mesh: { position: new THREE.Vector3(8, 0, 0) } };
  const director = new TownSocialDirector({
    participants: [mako],
    worldObjects: makeObjects([blockedNearTree, reachableTree]),
  });

  const opportunity = director.getOpportunity(mako);
  assert.equal(opportunity.type, 'apple_pick');
  assert.deepEqual(director.targetsFor(opportunity.definition, mako), [reachableTree]);
});
