import assert from 'node:assert/strict';
import test from 'node:test';
import { attachPetStateMachine, PET_STATES } from '../src/gameplay/pets/PetStateMachine.js';

function makePet() {
  return {
    _petState: 'idle',
    _followEnabled: false,
    stopFollow() { this._followEnabled = false; },
    disableWander() { this._wanderEnabled = false; },
  };
}

test('legacy _petState assignments pass through one state owner', () => {
  const pet = makePet();
  const state = attachPetStateMachine(pet);
  pet._petState = PET_STATES.FOLLOWING;
  assert.equal(state.current, PET_STATES.FOLLOWING);
  assert.equal(pet._petState, PET_STATES.FOLLOWING);
});

test('commanded work ends idle while autonomous work resumes free roam', () => {
  const commandedPet = makePet();
  const commanded = attachPetStateMachine(commandedPet, PET_STATES.FOLLOWING);
  commandedPet._followEnabled = true;
  commanded.enterWork();
  assert.equal(commanded.current, PET_STATES.WORKING);
  assert.equal(commandedPet._followEnabled, false);
  commanded.completeWork();
  assert.equal(commanded.current, PET_STATES.IDLE);

  const autonomousPet = makePet();
  const autonomous = attachPetStateMachine(autonomousPet, PET_STATES.FREE_ROAM);
  autonomous.enterWork({ autonomous: true });
  autonomous.completeWork();
  assert.equal(autonomous.current, PET_STATES.FREE_ROAM);
});

