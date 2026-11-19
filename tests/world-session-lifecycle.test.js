import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldSessionController } from '../src/demos/chii-island/systems/WorldSessionController.js';

function fixture() {
  const calls = [];
  const pending = [];
  const controller = new WorldSessionController({
    currentWorldId: 'main',
    repository: { load: id => new Promise((resolve, reject) => pending.push({ id, resolve, reject })) },
    persistence: { flush: () => calls.push('flush') },
    selectWorld: id => calls.push(id),
    pageLoading: { reload: () => calls.push('reload') },
  });
  return { controller, calls, pending };
}

test('world loading admits one transition and flushes before committing its destination', async () => {
  const { controller, calls, pending } = fixture();
  const first = controller.enter('forest');
  assert.equal(controller.isTransitioning(), true);
  assert.equal(await controller.enter('town'), false);
  assert.equal(pending.length, 1);
  pending[0].resolve({});
  assert.equal(await first, true);
  assert.deepEqual(calls, ['flush', 'forest', 'reload']);
});

for (const close of ['cancelPendingTransition', 'dispose']) {
  test(`${close} prevents a late world load from changing the saved destination`, async () => {
    const { controller, calls, pending } = fixture();
    const first = controller.enter('forest');
    controller[close]();
    pending[0].resolve({});
    assert.equal(await first, false);
    assert.deepEqual(calls, []);
  });
}

test('load failure releases the transition for retry', async () => {
  const { controller, calls, pending } = fixture();
  const first = controller.enter('forest');
  pending[0].reject(new Error('missing map'));
  await assert.rejects(first, /missing map/);
  assert.equal(controller.isTransitioning(), false);
  assert.deepEqual(calls, []);
  const retry = controller.enter('forest');
  pending[1].resolve({});
  assert.equal(await retry, true);
});

test('a failed save leaves the destination unchanged and allows retry', async () => {
  const { controller, calls, pending } = fixture();
  controller.persistence.flush = () => { throw new Error('storage full'); };
  const first = controller.enter('forest');
  pending[0].resolve({});
  await assert.rejects(first, /storage full/);
  assert.equal(controller.isTransitioning(), false);
  assert.deepEqual(calls, []);
});
