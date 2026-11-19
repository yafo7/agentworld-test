import assert from 'node:assert/strict';
import test from 'node:test';
import { describeResidentThemes, residentThemeAnimations, validateThemeEdits } from '../src/demos/chii-island/data/residentThemes.js';
import { SocialEventCoordinator } from '../src/gameplay/social/SocialEventCoordinator.js';
import { attachPetStateMachine } from '../src/gameplay/pets/PetStateMachine.js';
import { PromptCompiler } from '../src/gameplay/ai/prompts/PromptCompiler.js';

test('fangk has parallel themes with optional daily actions and ordered inspection actions', () => {
  const themes = describeResidentThemes('fangk', ['idle', 'run', 'construct', 'exercise', 'dance']);
  assert.equal(themes.daily.mode, 'choice');
  assert.equal(themes.work.mode, 'sequence');
  assert.equal(themes.work.actions[0].kind, 'visit');
  assert.equal(themes.work.actions[2].animation, 'construct');
  assert.equal(themes.exercise.role, 'lead');
  assert.equal(themes.festival.role, 'host');
  assert.ok(Object.values(themes).every(theme => !('nextStateId' in theme)));
});

test('scoped edits retain the island transition and can prepare a new activity animation', () => {
  const animations = ['idle', 'dance'];
  const themes = describeResidentThemes('lingq', animations);
  const edits = [{ themeId: 'festival', role: 'dancer', actions: [
    { kind: 'perform', name: '开场热身', seconds: 4, generation: { prompt: '双翼交替伸展' } },
    { kind: 'perform', name: '表演舞步', seconds: 16, animation: 'dance' },
  ] }];
  assert.throws(() => validateThemeEdits(edits, themes, animations, 'daily'));
  const { festival } = validateThemeEdits(edits, themes, animations, 'festival');
  assert.deepEqual(festival.actions.map(action => action.kind), ['activity', 'perform', 'perform']);
  assert.equal(festival.actions[1].generation.prompt, '双翼交替伸展');
  assert.equal(festival.when, themes.festival.when);
  assert.throws(() => validateThemeEdits([{ themeId: 'festival', actions: [{ kind: 'stroll', name: '跑出站位', seconds: 3 }] }], themes, animations));
});

test('asking only to watch a festival replaces the dancer routine and formation instruction', () => {
  const themes = describeResidentThemes('lingq', ['idle', 'dance']);
  const { festival } = validateThemeEdits([{ themeId: 'festival', role: 'spectator' }], themes, ['idle', 'dance']);
  assert.equal(festival.actions[0].name, '到场边找个位置');
  assert.deepEqual(festival.actions.map(action => action.kind), ['activity', 'wait']);
});

test('exercise and nod use only joints available on the selected model', () => {
  const clips = residentThemeAnimations({ nodes: [{ id: 'body' }, { id: 'head' }, { id: 'leftWing' }] });
  assert.ok(clips.exercise.body && clips.exercise.leftWing && clips.nod.head);
  assert.ok(!clips.exercise.rightWing);
});

test('shared activity starts with confirmed arrivals and releases residents whose routes are blocked', () => {
  const makePet = x => {
    const pet = { position: { x, z: 0 } };
    attachPetStateMachine(pet, 'free_roam');
    return pet;
  };
  const host = makePet(0);
  const dancer = makePet(3);
  const stuck = makePet(15);
  const coordinator = new SocialEventCoordinator({ petManager: {}, gatherTimeout: 8 });
  let cast;
  coordinator.start({
    plan: { id: 'event' }, participants: [host, dancer, stuck],
    slots: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 7, z: 0 }],
    selectArrivals: arrived => arrived.includes(host) && arrived.length > 1,
    onPerform: event => { cast = event.participants; },
  });
  coordinator.update(7);
  assert.equal(cast, undefined);
  coordinator.update(1);
  assert.deepEqual(cast, [host, dancer]);
  assert.equal(stuck.petState.current, 'free_roam');
  coordinator.finish();
  assert.equal(host.petState.current, 'free_roam');
});

test('AI receives the theme edit contract with a resident and a scope', () => {
  const context = { task: 'editThemes', scope: 'festival', residents: [{ residentId: 'fangk', playerDirection: '先做热身' }] };
  const packet = new PromptCompiler().compile({ operation: 'resident.behavior', input: { context } });
  assert.equal(packet.templateId, 'resident-themes-v1');
  assert.deepEqual(JSON.parse(packet.payload.messages[1].content), context);
});

test('the crab and saved walking edits execute actual strolls', () => {
  const animations = ['idle', 'walk', 'construct'];
  const { daily } = describeResidentThemes('builder_crab', animations);
  assert.equal(daily.actions.find(action => action.name === '横步热身').kind, 'stroll');
  const edits = [{ themeId: 'daily', actions: [{ kind: 'perform', name: '四处走走', animation: 'walk', seconds: 8 }] }];
  const updated = validateThemeEdits(edits, { daily }, animations);
  assert.deepEqual(updated.daily.actions, [{ kind: 'stroll', name: '四处走走', seconds: 8 }]);
});

test('festival gathering retries a stopped resident once the temporary obstruction clears', () => {
  const guest = { position:{x:0,z:0}, moving:false, attempts:0,
    isWalking() { return this.moving; },
    walkTo() { this.moving = ++this.attempts > 1; },
  };
  attachPetStateMachine(guest,'free_roam');
  const coordinator = new SocialEventCoordinator({petManager:{}});
  coordinator.start({plan:{id:'festival'},participants:[guest],slots:[{x:8,z:0}],selectArrivals:()=>false});
  coordinator.update(1.1);
  assert.equal(guest.attempts,2);
  coordinator.update(2);
  assert.equal(guest.attempts,2);
  guest.position.x=8;
  coordinator.update(.05);
  assert.equal(coordinator.active.phase,'performing');
});
