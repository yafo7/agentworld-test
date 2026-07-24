import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  PET_BUBBLE_VARIANTS,
  PetBubblePresenter,
} from '../src/demos/chii-island/presentation/PetBubblePresenter.js';

function fakeBubbleFactory(calls) {
  return (_mesh, options) => {
    calls.push({ phase: 'create', variant: options.variant });
    return {
      sprite: {
        position: new THREE.Vector3(),
        scale: new THREE.Vector3(1, 1, 1),
      },
      show(text, showOptions) {
        calls.push({ phase: 'show', text, variant: showOptions.variant });
      },
      hide() {},
      dispose() {},
      get isVisible() { return true; },
    };
  };
}

test('all PetBubblePresenter spoken lines use the shared cartoon pet bubble', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {};
  try {
    const calls = [];
    const pet = { mesh: new THREE.Group(), _petName: 'momo' };
    const presenter = new PetBubblePresenter({ bubbleFactory: fakeBubbleFactory(calls) });
    presenter.showLine(pet, '今天的风把我的午觉吹跑啦。');

    assert.equal(PET_BUBBLE_VARIANTS.speech, 'pet');
    assert.deepEqual(calls, [
      { phase: 'create', variant: 'pet' },
      { phase: 'show', text: '今天的风把我的午觉吹跑啦。', variant: 'pet' },
    ]);
    presenter.dispose();
  } finally {
    globalThis.document = previousDocument;
  }
});

test('idea hints retain the lightbulb variant in the same presenter', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {};
  try {
    const calls = [];
    const pet = { mesh: new THREE.Group(), _petName: 'yafo' };
    const presenter = new PetBubblePresenter({ bubbleFactory: fakeBubbleFactory(calls) });
    presenter.setHint(pet, '我有个想法！');

    assert.deepEqual(calls, [
      { phase: 'create', variant: 'pet' },
      { phase: 'show', text: '我有个想法！', variant: 'idea' },
    ]);
    presenter.dispose();
  } finally {
    globalThis.document = previousDocument;
  }
});
