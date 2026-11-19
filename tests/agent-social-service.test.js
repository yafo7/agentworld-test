import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentMemory } from '../src/gameplay/agents/AgentMemory.js';
import { AgentSocialService } from '../src/gameplay/agents/AgentSocialService.js';
import { attachPetStateMachine } from '../src/gameplay/pets/PetStateMachine.js';

function runtime(id) {
  const pet = { _petState: 'free_roam', _petName: id, stopWalking() {}, lockFacing() {}, unlockFacing() {}, playAnimation() {} };
  attachPetStateMachine(pet, 'free_roam');
  return { profile: { identity: { residentId: id, displayName: id } }, pet, memory: new AgentMemory({ residentId: id }) };
}

test('social greeting creates directional memories and relationship changes', async () => {
  const momo = runtime('momo');
  const yafo = runtime('yafo');
  const runtimes = new Map([['momo', momo], ['yafo', yafo]]);
  const service = new AgentSocialService({ getRuntime: id => runtimes.get(id), wait: async () => {} });
  const result = await service.greet(momo, 'yafo');
  assert.equal(result.accepted, true);
  assert.ok(momo.memory.getRelationship('yafo').affection > 0);
  assert.ok(yafo.memory.getRelationship('momo').familiarity > 0);
  assert.equal(momo.pet.petState.current, 'free_roam');
  service.dispose();
});

test('neighbors play their personal greeting gestures and return to free roam', async () => {
  const first = runtime('lingq');
  const second = runtime('mako');
  const played = [];
  second.pet.playAnimation = key => played.push(key);
  const service = new AgentSocialService({ getRuntime: () => second, wait: async () => {} });
  service.getGreetingGestures = id => id === 'mako' ? [
    { name: '抬蹄', animation: 'jump', seconds: 2 }, { name: '点头', animation: 'nod', seconds: 2 },
  ] : [];
  await service.greet(first, 'mako');
  assert.deepEqual(played, ['jump', 'nod', 'idle']);
  assert.equal(second.pet.petState.current, 'free_roam');
  assert.equal(service.conversations.size, 0);
  service.dispose();
});

test('cooperation and conflict update both directional relationships', async () => {
  const momo = runtime('momo');
  const yafo = runtime('yafo');
  const runtimes = new Map([['momo', momo], ['yafo', yafo]]);
  momo.memory.updateRelationship('yafo', { familiarity: 0.2, affection: 0.1, trust: 0.1 });
  const service = new AgentSocialService({ getRuntime: id => runtimes.get(id), wait: async () => {} });

  const cooperation = await service.cooperate(momo, 'yafo', { activity: '转圈圈' });
  assert.equal(cooperation.accepted, true);
  assert.ok(momo.memory.getRelationship('yafo').trust > 0.1);
  assert.ok(yafo.memory.getRelationship('momo').affection > 0);

  service.recordConflict(momo, yafo, { reason: '都想先玩秋千', severity: 0.2 });
  assert.ok(momo.memory.getRelationship('yafo').tension >= 0.2);
  assert.ok(yafo.memory.getRelationship('momo').tension >= 0.2);
  service.reconcile(momo, yafo);
  assert.ok(momo.memory.getRelationship('yafo').tension < 0.2);
  service.dispose();
});
