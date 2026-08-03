import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PastoralWorkEffects } from '../src/demos/chii-island/presentation/PastoralWorkEffects.js';

test('pastoral work effects own fallback effects, scaffold fade and reveal restoration', () => {
  const scene = new THREE.Scene();
  const presenter = new PastoralWorkEffects({ scene });
  const pet = { _petId: 'momo', mesh: new THREE.Group() };
  pet.mesh.position.set(3, 0, 4);
  const target = new THREE.Group();
  target.scale.set(2, 3, 4);
  target.rotation.y = 0.42;

  const stars = presenter.playWorkStart(pet, 2);
  const dust = presenter.playDust(new THREE.Vector3(1, 0, 2), 1.1);
  const scaffold = presenter.startScaffold({
    targetPos: new THREE.Vector3(2, 0, 1),
    size: new THREE.Vector3(4, 3, 2),
  });
  presenter.reveal(target);

  assert.equal(stars.name, 'PastoralStarBurst');
  assert.equal(dust.name, 'PastoralDustBurst');
  assert.equal(scaffold.group.name, 'PastoralWorkScaffold');
  assert.equal(presenter.effects.length, 3);
  assert.equal(target.scale.x, 1.64);

  presenter.update(0.2);
  assert.deepEqual(stars.position.toArray(), pet.mesh.position.toArray());
  presenter.stopScaffold(scaffold);
  presenter.update(0.86);
  assert.equal(presenter.effects.includes(scaffold), false);
  assert.equal(scaffold.group.parent, null);

  presenter.dispose();
  presenter.dispose();
  assert.equal(presenter.effects.length, 0);
  assert.equal(presenter.reveals.length, 0);
  assert.equal(scene.children.length, 0);
  assert.deepEqual(target.scale.toArray(), [2, 3, 4]);
  assert.equal(target.rotation.y, 0.42);
});

test('pastoral work effects preserve TemporaryVfxService delegation and owned cleanup', () => {
  const scene = new THREE.Scene();
  const calls = [];
  const stopped = [];
  let serial = 0;
  const presenter = new PastoralWorkEffects({
    scene,
    vfxService: {
      playPreset(name, options) {
        calls.push({ name, options });
        return options.key || `generated:${++serial}`;
      },
      stop(key) {
        stopped.push(key);
        return true;
      },
    },
  });
  const pet = { _petId: 'momo', mesh: new THREE.Group() };
  const position = new THREE.Vector3(1, 0, 2);

  assert.equal(presenter.playWorkStart(pet, 2), 'pastoral-work-start:momo');
  assert.equal(presenter.playDust(position, 0.8), 'generated:1');
  assert.deepEqual(calls, [
    {
      name: 'workStart',
      options: {
        target: pet.mesh,
        duration: 2,
        key: 'pastoral-work-start:momo',
      },
    },
    { name: 'dust', options: { position, duration: 0.8 } },
  ]);

  presenter.dispose();
  presenter.dispose();
  assert.deepEqual(stopped.sort(), ['generated:1', 'pastoral-work-start:momo']);
  assert.equal(presenter.playDust(position), null);
});

test('pastoral work effects keep authored scaffold animation and particle lifecycle', () => {
  const scene = new THREE.Scene();
  const presenter = new PastoralWorkEffects({
    scene,
    scaffoldModelJson: { format: 2, name: 'Scaffold', nodes: [], parts: [] },
    scaffoldAnimationPlan: {
      duration: 3,
      motionPlan: {},
    },
  });

  const effect = presenter.startScaffold({
    targetPos: new THREE.Vector3(5, 0, 6),
    size: new THREE.Vector3(5, 2, 4),
  });
  assert.equal(effect.plan._duration, 3);
  assert.equal(effect.plan._loop, true);
  assert.ok(effect.particles);
  assert.equal(effect.group.position.x, 5);

  presenter.update(0.1);
  presenter.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(presenter.effects.length, 0);
});
