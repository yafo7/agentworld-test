import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ChiiInteractionController } from '../src/demos/chii-island/systems/ChiiInteractionController.js';

function promptElement() {
  return {
    hidden: false,
    textContent: '',
    classList: {
      values: new Set(),
      add(value) {
        this.values.add(value);
      },
      remove(value) {
        this.values.delete(value);
      },
    },
  };
}

function createHarness({ withInterior = true, withNearbyObject = true } = {}) {
  const pressed = new Set();
  const calls = [];
  const church = { name: '哥特教堂' };
  const interiorHit = {
    type: 'enter',
    label: '进入哥特教堂',
    position: new THREE.Vector3(0, 0, -2),
    distance: 2,
    entry: { entity: church },
  };
  const objectHit = {
    entity: church,
    position: new THREE.Vector3(0, 0, -1.5),
    distance: 1.5,
  };
  const idleState = {
    is: () => false,
    isBusy: () => false,
  };

  const controller = new ChiiInteractionController({
    input: { justPressed: code => pressed.has(code) },
    player: {
      mesh: { position: new THREE.Vector3() },
      orientation: new THREE.Vector3(0, 0, -1),
    },
    architect: {
      getPosition: () => new THREE.Vector3(100, 0, 100),
    },
    bear: {
      getPosition: () => new THREE.Vector3(100, 0, 100),
      petState: idleState,
      _wanderEnabled: true,
      _followEnabled: false,
      unlockFacing() {},
    },
    petManager: {
      findNearest: () => null,
      pauseNear() {},
    },
    townSocialSystem: {
      isTownPet: () => false,
      canInteract: () => false,
    },
    forestTempleSystem: {
      findInteraction: () => null,
    },
    buildingInteriorSystem: {
      findInteraction: () => withInterior ? interiorHit : null,
    },
    objectPlacement: {
      isEditable: () => true,
      findNearestEditable: () => withNearbyObject ? objectHit : null,
    },
    bearHome: { x: 0, z: 0 },
    handlers: {
      onInterior: hit => calls.push(['interior', hit]),
      onObject: entity => calls.push(['object', entity]),
    },
  });

  return { controller, pressed, calls, church, interiorHit, objectHit };
}

test('church entry uses E while the same building management uses F', () => {
  const previousDocument = globalThis.document;
  const elements = new Map();
  globalThis.document = {
    getElementById: id => elements.get(id) || null,
  };

  try {
    for (const id of [
      'interact-prompt',
      'interact-prompt-key',
      'interact-prompt-text',
      'interact-prompt-secondary',
      'interact-prompt-secondary-key',
      'interact-prompt-secondary-text',
    ]) {
      elements.set(id, promptElement());
    }

    const harness = createHarness({ withNearbyObject: false });
    const { controller, pressed, calls, church, interiorHit } = harness;

    controller.update(true);
    assert.equal(elements.get('interact-prompt-key').textContent, 'E');
    assert.equal(elements.get('interact-prompt-text').textContent, '进入哥特教堂');
    assert.equal(elements.get('interact-prompt-secondary').hidden, false);
    assert.equal(elements.get('interact-prompt-secondary-key').textContent, 'F');
    assert.equal(elements.get('interact-prompt-secondary-text').textContent, '管理“哥特教堂”');

    pressed.add('KeyE');
    controller.update(true);
    assert.deepEqual(calls, [['interior', interiorHit]]);

    pressed.clear();
    pressed.add('KeyF');
    controller.update(true);
    assert.deepEqual(calls.at(-1), ['object', church]);
    assert.equal(calls.filter(call => call[0] === 'interior').length, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('an editable object without another interaction only responds to F', () => {
  const previousDocument = globalThis.document;
  const elements = new Map();
  globalThis.document = {
    getElementById: id => elements.get(id) || null,
  };

  try {
    for (const id of [
      'interact-prompt',
      'interact-prompt-key',
      'interact-prompt-text',
      'interact-prompt-secondary',
      'interact-prompt-secondary-key',
      'interact-prompt-secondary-text',
    ]) {
      elements.set(id, promptElement());
    }

    const { controller, pressed, calls, church } = createHarness({ withInterior: false });
    controller.update(true);
    assert.equal(elements.get('interact-prompt-key').textContent, 'F');
    assert.equal(elements.get('interact-prompt-text').textContent, '管理“哥特教堂”');
    assert.equal(elements.get('interact-prompt-secondary').hidden, true);

    pressed.add('KeyE');
    controller.update(true);
    assert.deepEqual(calls, []);

    pressed.clear();
    pressed.add('KeyF');
    controller.update(true);
    assert.deepEqual(calls, [['object', church]]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('town interaction prompt does not stop a busy pet gathering for an activity', () => {
  const previousDocument = globalThis.document;
  const elements = new Map();
  globalThis.document = {
    getElementById: id => elements.get(id) || null,
  };

  try {
    for (const id of [
      'interact-prompt',
      'interact-prompt-key',
      'interact-prompt-text',
      'interact-prompt-secondary',
      'interact-prompt-secondary-key',
      'interact-prompt-secondary-text',
    ]) {
      elements.set(id, promptElement());
    }

    let stopCalls = 0;
    let facingCalls = 0;
    const fangk = {
      _petName: 'fangk',
      petState: { isBusy: () => true },
      getPosition: () => new THREE.Vector3(0, 0, -2),
      stopWalking() { stopCalls += 1; },
      lockFacing() { facingCalls += 1; },
    };
    const townSocialSystem = {
      isTownPet: pet => pet === fangk,
      canInteract: pet => pet === fangk,
      isHandlingActivePet: pet => pet === fangk,
      getInteractionLabel: () => '问问fangk活动进展',
    };
    const controller = new ChiiInteractionController({
      input: { justPressed: () => false },
      player: {
        mesh: { position: new THREE.Vector3() },
        orientation: new THREE.Vector3(0, 0, -1),
      },
      architect: { getPosition: () => new THREE.Vector3(100, 0, 100) },
      bear: {
        getPosition: () => new THREE.Vector3(100, 0, 100),
        petState: { is: () => false, isBusy: () => false },
        _wanderEnabled: false,
        _followEnabled: false,
        unlockFacing() {},
      },
      petManager: {
        findNearest: (_position, _range, predicate) => predicate(fangk)
          ? { pet: fangk, position: fangk.getPosition(), dist: 2 }
          : null,
        pauseNear() {},
      },
      townSocialSystem,
      forestTempleSystem: { findInteraction: () => null },
      buildingInteriorSystem: { findInteraction: () => null },
      objectPlacement: { findNearestEditable: () => null },
      bearHome: { x: 0, z: 0 },
      handlers: {},
    });

    controller.update(true);

    assert.equal(elements.get('interact-prompt-text').textContent, '问问fangk活动进展');
    assert.equal(stopCalls, 0);
    assert.equal(facingCalls, 0);
  } finally {
    globalThis.document = previousDocument;
  }
});
