import assert from 'node:assert/strict';
import test from 'node:test';
import { ChiiInteractionSession } from '../src/demos/chii-island/systems/ChiiInteractionSession.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function makeFixture(overrides = {}) {
  const pending = deferred();
  const calls = [];
  let onDialogueEnd = null;
  const player = {
    lockTo(x, z) { calls.push(['player-lock', x, z]); },
    unlock() { calls.push(['player-unlock']); },
  };
  const dialogueSystem = {
    setOnDialogueEnd(callback) { onDialogueEnd = callback; },
    setPetSpeakerName(name) { calls.push(['speaker', name]); },
    hide() { calls.push(['hide']); onDialogueEnd?.(); },
  };
  const dialogueCamera = {
    focusDialogue(pet) { calls.push(['focus', pet._petName]); },
    release(pet) { calls.push(['release', pet?._petName]); },
    setDialogueLock(locked, pet) { calls.push(['camera-lock', locked, pet?._petName]); },
  };
  const session = new ChiiInteractionSession({
    player,
    thirdPersonCamera: { unlock(duration) { calls.push(['third-person-unlock', duration]); } },
    dialogueSystem,
    dialogueCamera,
    pastoralSlice: { interact: () => pending.promise },
    forestTempleSystem: {
      interact: () => pending.promise,
      introducePet: () => pending.promise,
    },
    regionGameplay: { interactTownPet: () => pending.promise },
    forestTrophy: { mesh: { position: { x: 4, z: 5 } } },
    forestTent: { mesh: { position: { x: 7, z: 8 } } },
    documentTarget: { exitPointerLock() { calls.push(['pointer-unlock']); } },
    logger: { warn() {} },
    ...overrides,
  });
  return { session, pending, calls, dialogueSystem };
}

test('interaction session owns the blocking town route and releases it once', async () => {
  const { session, pending, calls } = makeFixture();
  const pet = { _petName: 'mako', _hasIntroduced: true };
  const operation = session.beginTownPetDialogue(pet);

  assert.equal(session.isActive(), true);
  session.dispose();
  session.dispose();
  assert.equal(session.isActive(), false);

  pending.resolve(true);
  await operation;
  assert.deepEqual(calls.filter(call => call[0] === 'camera-lock'), [
    ['camera-lock', true, 'mako'],
    ['camera-lock', false, 'mako'],
  ]);
});

test('forest interaction teardown restores player and pet without a late callback', async () => {
  const { session, pending, calls } = makeFixture();
  const pet = {
    lockFacing(x, z) { calls.push(['pet-lock', x, z]); },
    unlockFacing() { calls.push(['pet-unlock']); },
  };
  const operation = session.beginForestInteraction({ type: 'trophy', pet });

  session.dispose();
  pending.resolve(true);
  await operation;

  assert.equal(calls.filter(call => call[0] === 'player-unlock').length, 1);
  assert.equal(calls.filter(call => call[0] === 'pet-unlock').length, 1);
  assert.deepEqual(calls.find(call => call[0] === 'player-lock'), ['player-lock', 4, 5]);
});

test('pastoral interaction preserves its non-blocking route contract', async () => {
  const { session, pending } = makeFixture();
  const operation = session.beginPastoralPetDialogue({ _petName: 'momo' });
  assert.equal(session.isActive(), false);
  pending.resolve(true);
  assert.equal(await operation, true);
});
