import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentMemory } from '../src/gameplay/agents/AgentMemory.js';
import { AnimalAgentStore } from '../src/storage/AnimalAgentStore.js';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('memory retrieval combines relevance, importance, recency, goal, and social context', () => {
  const now = 1_000_000;
  const memory = new AgentMemory({ residentId: 'momo' });
  memory.remember({ id: 'old', type: 'walk', at: now - 200_000_000, summary: '在道路散步', tags: ['road'], importance: 0.1 });
  memory.remember({ id: 'garden', type: 'build', at: now - 1000, summary: '和玩家修建花园', tags: ['garden', 'world.propose'], actors: ['player'], importance: 0.9 });
  const result = memory.retrieve({ text: '花园', tags: ['garden'], actors: ['player'], goalId: 'world.propose' }, { now });
  assert.equal(result[0].id, 'garden');
});

test('relationship dimensions are directional and bounded', () => {
  const memory = new AgentMemory({ residentId: 'momo' });
  memory.updateRelationship('yafo', { affection: 2, trust: 0.2, tension: -1 }, { interests: ['flower'] });
  assert.equal(memory.getRelationship('yafo').affection, 1);
  assert.equal(memory.getRelationship('yafo').trust, 0.2);
  assert.deepEqual(memory.getRelationship('yafo').sharedInterests, ['flower']);
});

test('agent persistence stays isolated by scene scope', () => {
  const local = storage();
  const original = new AnimalAgentStore({ storage: local, scope: 'original' });
  const forge = new AnimalAgentStore({ storage: local, scope: 'forge' });
  original.save('momo', { memory: { episodic: [{ id: 'one' }] } });
  assert.equal(original.load('momo').memory.episodic[0].id, 'one');
  assert.equal(forge.load('momo'), null);
});

test('batch persistence writes once and preserves residents not present in the current runtime', () => {
  const local = storage();
  const store = new AnimalAgentStore({ storage: local, scope: 'original' });
  store.save('summoned', { memory: { episodic: [{ id: 'old' }] } });
  let reads = 0;
  let writes = 0;
  const counted = new AnimalAgentStore({ scope: 'original', storage: {
    getItem: key => { reads++; return local.getItem(key); },
    setItem: (key, value) => { writes++; return local.setItem(key, value); },
  } });
  const snapshots = { momo: { state: { day: 1 } }, yafo: { state: { day: 2 } } };
  counted.saveMany(snapshots);
  assert.equal(reads, 1);
  assert.equal(writes, 1);
  snapshots.momo.state.day = 99;
  assert.deepEqual(store.load('momo'), { state: { day: 1 } });
  assert.equal(store.load('summoned').memory.episodic[0].id, 'old');
});
