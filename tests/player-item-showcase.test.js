import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PlayerItemShowcaseDirector } from '../src/demos/chii-island/presentation/PlayerItemShowcaseDirector.js';

test('equipped item showcase locks a front close-up and plays the generated one-shot', async () => {
  const calls = [];
  const player = {
    mesh: new THREE.Group(),
    async loadAnimation(...args) { calls.push(['load', ...args]); },
    lockTo(x, z) { calls.push(['lock-player', x, z]); },
    unlock() { calls.push(['unlock-player']); },
    playOneShot(...args) { calls.push(['play', ...args]); },
  };
  const camera = {
    lockTo(position, lookAt, fov) { calls.push(['lock-camera', position, lookAt, fov]); },
    unlock(fov) { calls.push(['unlock-camera', fov]); },
  };
  const input = {
    setPointerLockEnabled(enabled) { calls.push(['pointer', enabled]); },
  };
  const children = [];
  const documentRef = {
    body: { append(node) { children.push(node); } },
    exitPointerLock() { calls.push(['exit-pointer']); },
    createElement() {
      return {
        className: '',
        textContent: '',
        remove() { children.splice(children.indexOf(this), 1); },
      };
    },
  };
  const director = new PlayerItemShowcaseDirector({
    player,
    thirdPersonCamera: camera,
    input,
    documentRef,
    durationMs: 10000,
  });

  assert.equal(await director.play({
    item: { name: '苹果' },
    animationPath: '/generated/apple-show.json',
  }), true);
  assert.equal(director.isActive(), true);
  assert.deepEqual(calls[0], [
    'load',
    'equipment_showcase',
    '/generated/apple-show.json',
    { duration: 2.8, loop: false },
  ]);
  assert.ok(calls.some(call => call[0] === 'play' && call[1] === 'equipment_showcase'));
  assert.equal(children[0].textContent, '苹果，锵锵！');

  director.stop();
  assert.equal(director.isActive(), false);
  assert.equal(children.length, 0);
  assert.ok(calls.some(call => call[0] === 'unlock-camera'));
});
