const TASK_VERBS = new Set(['visit', 'interact', 'collect']);

function shortText(value, fallback, max = 48) {
  return Array.from(String(value || '').trim() || fallback).slice(0, max).join('');
}

export function validateTaskPlan(value, { availableIds = new Set() } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Task plan must be an object');
  }
  const known = availableIds instanceof Set ? availableIds : new Set(availableIds || []);
  const entryPetId = shortText(value.entry?.petId, '', 32);
  const targetId = shortText(value.objective?.targetId, '', 64);
  const guidanceTargetId = shortText(value.guidanceTargetId, targetId, 64);
  const completionTargetId = shortText(value.completion?.targetId, targetId, 64);
  for (const [field, id] of [
    ['entry.petId', entryPetId],
    ['objective.targetId', targetId],
    ['guidanceTargetId', guidanceTargetId],
    ['completion.targetId', completionTargetId],
  ]) {
    if (!id) throw new TypeError(`Task plan requires ${field}`);
    if (known.size > 0 && !known.has(id)) throw new TypeError(`Unknown task target: ${id}`);
  }
  const verb = TASK_VERBS.has(value.objective?.verb) ? value.objective.verb : null;
  if (!verb) throw new TypeError(`Unsupported task verb: ${value.objective?.verb}`);
  return Object.freeze({
    title: shortText(value.title, '岛上小任务', 24),
    entry: Object.freeze({ type: 'pet_dialogue', petId: entryPetId }),
    objective: Object.freeze({
      verb,
      targetId,
      count: Math.max(1, Math.min(9, Math.floor(Number(value.objective?.count) || 1))),
    }),
    guidanceTargetId,
    completion: Object.freeze({ type: 'interaction', targetId: completionTargetId }),
    dialogue: Object.freeze({
      start: shortText(value.dialogue?.start, '一起去看看吧！', 48),
      complete: shortText(value.dialogue?.complete, '完成啦，辛苦你跑这一趟。', 48),
    }),
  });
}

export const TASK_PLAN_VERBS = Object.freeze([...TASK_VERBS]);
