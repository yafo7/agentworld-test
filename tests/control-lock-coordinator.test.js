import assert from 'node:assert/strict';
import test from 'node:test';
import { ControlLockCoordinator } from '../src/gameplay/control/ControlLockCoordinator.js';

test('control locks combine independent owners by capability', () => {
  const locks = new ControlLockCoordinator();
  locks.set('inventory', true, ['camera', 'movement']);
  locks.set('dialogue', true, ['camera', 'interaction']);

  assert.equal(locks.isBlocked('camera'), true);
  assert.equal(locks.isBlocked('movement'), true);
  assert.equal(locks.isBlocked('interaction'), true);
  assert.deepEqual(locks.blockers('camera'), ['inventory', 'dialogue']);

  locks.release('inventory');
  assert.equal(locks.isBlocked('movement'), false);
  assert.deepEqual(locks.blockers('camera'), ['dialogue']);
});

test('setting an owner inactive releases all of its channels', () => {
  const locks = new ControlLockCoordinator();
  locks.set('act-zero', true, ['*']);
  assert.equal(locks.isBlocked('special'), true);
  locks.set('act-zero', false, ['*']);
  assert.equal(locks.isBlocked('special'), false);
});
