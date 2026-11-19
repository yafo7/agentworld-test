import assert from 'node:assert/strict';
import test from 'node:test';
import { IslandAgentCoordinator } from '../src/gameplay/agents/IslandAgentCoordinator.js';

function coordinator(store) {
  return new IslandAgentCoordinator({ perception: {}, arbiter: {}, profileResolver: () => null, store });
}

test('coordinator captures each resident once per flush and uses one store batch', () => {
  let captures = 0;
  const batches = [];
  const agents = coordinator({ saveMany: snapshot => batches.push(snapshot) });
  for (const id of ['momo', 'yafo', 'mako']) {
    agents.runtimes.set(id, { snapshot: () => { captures++; return { id }; } });
  }
  const result = agents.flush();
  assert.equal(captures, 3);
  assert.equal(batches.length, 1);
  assert.deepEqual(result, { momo: { id: 'momo' }, yafo: { id: 'yafo' }, mako: { id: 'mako' } });
});

test('storage failure during disposal still releases every resident and reports the failure', () => {
  let released = 0;
  const agents = coordinator({ saveMany: () => { throw new Error('quota exceeded'); } });
  for (const id of ['momo', 'yafo']) {
    agents.runtimes.set(id, { snapshot: () => ({ id }), dispose: () => released++ });
  }
  assert.throws(() => agents.dispose(), /quota exceeded/);
  assert.equal(released, 2);
  assert.equal(agents.disposed, true);
  assert.equal(agents.runtimes.size, 0);
  assert.equal(agents.registerPet({}), null);
  agents.dispose();
  assert.equal(released, 2);
});
