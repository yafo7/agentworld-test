import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTownActivityActionLine,
  getTownActivityContinueLine,
  getTownActivityIdleOptions,
  getTownActivityInviteLine,
  getTownActivityPhase,
  getTownActivityStartLine,
  getTownNewYearGreeting,
  getTownSocialDialogueProfile,
  isTownDanceActivity,
  isTownFestivalActivity,
  TOWN_ACTIVITY_MIN_PERFORMANCE_DURATION,
} from '../src/demos/chii-island/data/townSocialActivities.js';

test('town activity policy classifies festival and dance activities', () => {
  assert.equal(TOWN_ACTIVITY_MIN_PERFORMANCE_DURATION, 10);
  assert.equal(isTownFestivalActivity('birthday'), true);
  assert.equal(isTownFestivalActivity('campfire'), false);
  assert.equal(isTownDanceActivity('campfire'), true);
  assert.equal(isTownDanceActivity('apple_pick'), false);
});

test('town activity phase projection normalizes authored stages and falls back safely', () => {
  assert.deepEqual(getTownActivityPhase('birthday_intro'), {
    key: 'performing',
    index: 3,
    label: '活动',
  });
  assert.deepEqual(getTownActivityPhase('future_phase'), {
    key: 'future_phase',
    index: 1,
    label: '准备',
  });
});

test('town activity dialogue policy returns resident copy and stable fallbacks', () => {
  assert.equal(getTownSocialDialogueProfile('mako').idle.includes('跑两步'), true);
  assert.equal(getTownSocialDialogueProfile('unknown'), getTownSocialDialogueProfile('generic'));
  assert.deepEqual(getTownNewYearGreeting('unknown'), {
    pet: '新年好！祝你今年遇见的每件小事都刚刚好。',
    player: '新年好！也祝你每天都有新点子。',
  });
  assert.equal(getTownActivityInviteLine('unknown'), '好呀，我收拾一下就过去！');
  assert.equal(
    getTownActivityActionLine('unknown', 'momo', 'momo'),
    'momo：“这个动作我准备好啦！”',
  );
  assert.equal(getTownActivityContinueLine('campfire', 'momo'), '那就再暖一会儿，篝火还没有下班。');
  assert.equal(getTownActivityStartLine('party', 'fangk'), '好，我去叫大家。迟到的那位负责多跳两下。');
});

test('town activity idle options are derived without retaining mutable UI state', () => {
  const opportunity = { type: 'party', acceptLabel: '开始派对' };
  const first = getTownActivityIdleOptions({ petId: 'fangk', wasFollowing: true, opportunity });
  const second = getTownActivityIdleOptions({ petId: 'fangk', wasFollowing: true, opportunity });

  assert.deepEqual(first, [
    { key: 'party', label: '开始派对' },
    { key: 'custom_festival', label: '我想策划一个新节日！' },
    { key: 'free_roam', label: '先在广场自由活动吧！' },
  ]);
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
});
