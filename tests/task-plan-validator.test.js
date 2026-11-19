import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTaskPlan } from '../src/gameplay/objectives/TaskPlanValidator.js';

test('task plan validator keeps explicit dialogue entry, guidance, and completion targets', () => {
  const plan = validateTaskPlan({
    title: '去篝火旁集合',
    entry: { petId: 'fangk' },
    objective: { verb: 'visit', targetId: 'campfire', count: 1 },
    guidanceTargetId: 'campfire',
    completion: { targetId: 'campfire' },
    dialogue: { start: '火苗已经开始点名啦！', complete: '很好，一个人都没烤糊。' },
  }, { availableIds: new Set(['fangk', 'campfire']) });
  assert.equal(plan.entry.petId, 'fangk');
  assert.equal(plan.objective.targetId, 'campfire');
  assert.equal(plan.completion.targetId, 'campfire');
});

test('task plan validator rejects invented targets', () => {
  assert.throws(() => validateTaskPlan({
    entry: { petId: 'fangk' },
    objective: { verb: 'visit', targetId: 'invented-place' },
    completion: { targetId: 'invented-place' },
  }, { availableIds: new Set(['fangk', 'campfire']) }), /Unknown task target/);
});
