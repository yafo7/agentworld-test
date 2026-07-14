import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectMountWorkRequest,
  collectRefineWorkRequest,
} from '../src/demos/chii-island/systems/pastoralWorkDialogue.js';

function scriptedDialogue({ choices = [], inputs = [] } = {}) {
  const events = [];
  return {
    events,
    askChoice: async (text) => {
      events.push(['choice', text]);
      return { key: choices.shift() };
    },
    askInput: async (text) => {
      events.push(['input', text]);
      return inputs.shift();
    },
  };
}

test('refine request confirms target and content before returning work data', async () => {
  const dialogue = scriptedDialogue({
    choices: ['confirm_target', 'confirm_work'],
    inputs: ['变成发光森林树'],
  });

  const result = await collectRefineWorkRequest({
    targetName: '苹果树',
    askChoice: dialogue.askChoice,
    askInput: dialogue.askInput,
  });

  assert.deepEqual(result, { description: '变成发光森林树' });
  assert.deepEqual(dialogue.events.map(([type]) => type), ['choice', 'input', 'choice']);
  assert.match(dialogue.events[0][1], /苹果树/);
  assert.match(dialogue.events[2][1], /变成发光森林树/);
});

test('refine request stops immediately when the target is rejected', async () => {
  const dialogue = scriptedDialogue({ choices: ['cancel'] });

  const result = await collectRefineWorkRequest({
    targetName: '苹果树',
    askChoice: dialogue.askChoice,
    askInput: dialogue.askInput,
  });

  assert.equal(result, null);
  assert.deepEqual(dialogue.events.map(([type]) => type), ['choice']);
});

test('mount request collects part and placement before final confirmation', async () => {
  const dialogue = scriptedDialogue({
    choices: ['confirm_target', 'confirm_work'],
    inputs: ['一盏小灯', '屋顶'],
  });

  const result = await collectMountWorkRequest({
    targetName: '田园小屋',
    askChoice: dialogue.askChoice,
    askInput: dialogue.askInput,
  });

  assert.deepEqual(result, { part: '一盏小灯', placement: '屋顶' });
  assert.deepEqual(dialogue.events.map(([type]) => type), ['choice', 'input', 'input', 'choice']);
  assert.match(dialogue.events[3][1], /一盏小灯/);
  assert.match(dialogue.events[3][1], /屋顶/);
});

test('mount request does not return work data when final confirmation is rejected', async () => {
  const dialogue = scriptedDialogue({
    choices: ['confirm_target', 'cancel'],
    inputs: ['一盏小灯', '屋顶'],
  });

  const result = await collectMountWorkRequest({
    targetName: '田园小屋',
    askChoice: dialogue.askChoice,
    askInput: dialogue.askInput,
  });

  assert.equal(result, null);
  assert.deepEqual(dialogue.events.map(([type]) => type), ['choice', 'input', 'input', 'choice']);
});
