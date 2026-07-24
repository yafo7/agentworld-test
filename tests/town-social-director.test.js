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
    items,
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

  objects.items.push({ id: 'tree', tags: ['apple'] });
  assert.equal(director.getOpportunity(mako).type, 'apple_pick');

  lingq.petState.enterTemporary(PET_STATES.PERFORMING);
  assert.equal(director.getOpportunity(lingq), null);
});
