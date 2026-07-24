import assert from 'node:assert/strict';
import test from 'node:test';
import { validateActivityPlan } from '../src/gameplay/social/ActivityPlanValidator.js';
import { ActivityReservationService } from '../src/gameplay/social/ActivityReservationService.js';
import { SocialEventCoordinator } from '../src/gameplay/social/SocialEventCoordinator.js';
import { SocialActivityPlanner } from '../src/gameplay/social/SocialActivityPlanner.js';
import { attachPetStateMachine, PET_STATES } from '../src/gameplay/pets/PetStateMachine.js';

function makePet(id, initialState) {
  const pet = {
    _petId: id,
    _petName: id,
    _followEnabled: initialState === PET_STATES.FOLLOWING,
    _followTarget: initialState === PET_STATES.FOLLOWING ? { name: 'player' } : null,
    _followDistance: 3,
    _followSpeed: 6,
    _targetPosition: null,
    stopFollow() { this._followEnabled = false; this._followTarget = null; },
    disableWander() {},
    stopWalking() { this._targetPosition = null; },
    unlockFacing() {},
    playAnimation(name) { this.animation = name; },
    walkTo(x, z) { this._targetPosition = { x, z }; },
    setPosition(x, y, z) { this.position = { x, y, z }; this._targetPosition = null; },
    followTarget(target, distance, speed) {
      this._followEnabled = true;
      this._followTarget = target;
      this._followDistance = distance;
      this._followSpeed = speed;
    },
  };
  attachPetStateMachine(pet, initialState);
  return pet;
}

test('activity plans are bounded to known pets, objects and concise prompts', () => {
  const plan = validateActivityPlan({
    type: 'custom_daily',
    initiatorId: 'lingq',
    participants: ['lingq', 'mako', 'lingq'],
    hostId: 'fangk',
    locationId: 'apple_tree',
    targetObjectIds: ['apple_tree_1'],
    actionPrompts: {
      lingq: '展开尾羽开心挥手打一个特别特别长的招呼',
      mako: '点头回应',
    },
  }, {
    availablePetIds: ['fangk', 'lingq', 'mako'],
    availableObjectIds: ['apple_tree_1'],
  });

  assert.deepEqual(plan.participants, ['lingq', 'mako']);
  assert.ok(Array.from(plan.actionPrompts.lingq).length <= 12);
  assert.equal(plan.cleanup, 'automatic');
  assert.deepEqual(plan.entry, { type: 'pet_dialogue', petId: 'lingq' });
  assert.deepEqual(plan.exit, { type: 'automatic' });
  assert.throws(() => validateActivityPlan({
    type: 'greeting',
    participants: ['not_here'],
    hostId: 'fangk',
  }, { availablePetIds: ['fangk'] }), /Unknown activity pets/);
  assert.throws(() => validateActivityPlan({
    type: 'birthday',
    participants: ['fangk', 'mako'],
    hostId: 'fangk',
    initiatorId: 'mako',
  }, { availablePetIds: ['fangk', 'mako'] }), /must start through fangk dialogue/);
});

test('activity reservations reject conflicting pets and release atomically', () => {
  const reservations = new ActivityReservationService();
  assert.equal(reservations.tryReserve('a', ['pet:mako', 'location:square']).ok, true);
  const blocked = reservations.tryReserve('b', ['pet:mako']);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.conflicts[0].owner, 'a');
  reservations.release('a');
  assert.equal(reservations.tryReserve('b', ['pet:mako']).ok, true);
});

test('social coordinator restores each pet to its exact pre-activity state', () => {
  const player = { name: 'player' };
  const follower = makePet('mako', PET_STATES.FOLLOWING);
  follower._followTarget = player;
  const roaming = makePet('lingq', PET_STATES.FREE_ROAM);
  let resumed = 0;
  const coordinator = new SocialEventCoordinator({
    petManager: { resumePet() { resumed += 1; } },
    gatherTimeout: 0,
  });

  coordinator.start({
    plan: { id: 'hello' },
    participants: [follower, roaming],
    slots: [{ x: 1, z: 1 }, { x: -1, z: -1 }],
  });
  assert.equal(follower.petState.current, PET_STATES.PERFORMING);
  assert.equal(roaming.petState.current, PET_STATES.PERFORMING);
  coordinator.update(0.1);
  coordinator.finish();

  assert.equal(follower.petState.current, PET_STATES.FOLLOWING);
  assert.equal(follower._followTarget, player);
  assert.equal(roaming.petState.current, PET_STATES.FREE_ROAM);
  assert.equal(resumed, 1);
});

test('AI planner cannot override dialogue entry, fangk exit, limits or concise prompts', async () => {
  const responses = [
    '```json\n{"type":"party","title":"转圈招呼会","hostId":"mako","participants":["mako"],"locationId":"church_square","actionPrompts":{"mako":"围着广场连续转很多很多圈再挥手"}}\n```',
    JSON.stringify({
      type: 'birthday',
      title: '云朵点心节',
      hostId: 'lingq',
      participants: ['lingq', 'mako'],
      locationId: 'church_square',
      actionPrompts: { lingq: '展开尾羽跳舞', mako: '抬起前蹄踏步' },
      props: [
        { id: 'cloud_cake', name: '云朵蛋糕', prompt: '白色云朵蛋糕放在蓝色小木桌上', footprint: { width: 2, depth: 2 } },
      ],
    }),
  ];
  const calls = [];
  const planner = new SocialActivityPlanner({
    contentPort: {
      async chat(request) {
        calls.push(request);
        return responses.shift();
      },
    },
  });
  const pets = [
    { id: 'fangk', profile: {} },
    { id: 'lingq', profile: {} },
    { id: 'mako', profile: {} },
  ];
  const objects = [{ id: 'campfire_1', name: '篝火', tags: ['篝火'] }];

  const daily = await planner.planDaily({ concept: '一起转圈问好', initiatorId: 'lingq', pets, objects });
  assert.equal(daily.type, 'custom_daily');
  assert.equal(daily.entry.petId, 'lingq');
  assert.equal(daily.exit.type, 'automatic');
  assert.deepEqual(daily.participants, ['lingq', 'mako']);
  assert.ok(Array.from(daily.actionPrompts.mako).length <= 12);

  const repeatedDaily = await planner.planDaily({ concept: '一起转圈问好', initiatorId: 'lingq', pets, objects });
  assert.equal(repeatedDaily.type, 'custom_daily');
  assert.equal(calls.length, 1);

  const festival = await planner.planFestival({ concept: '云朵点心节', pets, objects });
  assert.equal(festival.type, 'custom_festival');
  assert.equal(festival.entry.petId, 'fangk');
  assert.equal(festival.exit.petId, 'fangk');
  assert.equal(festival.participants[0], 'fangk');
  assert.ok(festival.participants.length <= 6);
  assert.ok(festival.props.length <= 2);
  assert.ok(Array.from(festival.props[0].prompt).length <= 20);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.profile === 'planner'));
});
