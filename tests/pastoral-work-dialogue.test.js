import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectMountWorkRequest,
  collectRefineWorkRequest,
} from '../src/demos/chii-island/systems/pastoralWorkDialogue.js';
import { describePastoralIdea } from '../src/demos/chii-island/systems/pastoralSlice.js';

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

test('pastoral autonomous ideas describe the exact work before player approval', () => {
  assert.equal(
    describePastoralIdea({ action: 'create', description: '木制田园工具架' }),
    '我想在附近做一个木制田园工具架。可以吗？',
  );
  assert.equal(
    describePastoralIdea({ action: 'refine', targetName: '苹果树', description: '挂满红色小苹果' }),
    '我想把“苹果树”调整成挂满红色小苹果。可以试试吗？',
  );
  assert.equal(
    describePastoralIdea({ action: 'mount', targetName: '风车', position: '门口', part: '一盏黄色小灯' }),
    '我想在“风车”的门口加上一盏黄色小灯。可以吗？',
  );
});
