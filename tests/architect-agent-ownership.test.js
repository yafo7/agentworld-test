import assert from 'node:assert/strict';
import test from 'node:test';
import { ArchitectNPC } from '../src/demos/chii-island/entities/ArchitectNPC.js';
import { attachPetStateMachine } from '../src/gameplay/pets/PetStateMachine.js';

test('ArchitectNPC leaves free-roam target selection to its Agent owner', () => {
  const npc = new ArchitectNPC();
  attachPetStateMachine(npc, 'free_roam');
  let picks = 0;
  npc._pickWanderTarget = () => { picks += 1; };
  npc._wanderTimer = npc._wanderInterval;
  npc._agentControlled = true;

  npc._updateMovement(0.1);
  assert.equal(picks, 0);

  npc._agentControlled = false;
  npc._updateMovement(0.1);
  assert.equal(picks, 1);
});
