function positionOf(value) {
  const position = value?.mesh?.position || value?.position || value;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  return { x: position.x, y: Number(position.y) || 0, z: position.z };
}

function distanceSquared(a, b) {
  if (!a || !b) return Infinity;
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

function petName(pet, fallback) {
  return pet?._petName || pet?._profile?.name || fallback;
}

function incompleteTask(activity) {
  if (activity?.stageTask && !activity.stageTask.complete) return activity.stageTask;
  if (activity?.prepTask && !activity.prepTask.skipped && !activity.prepTask.complete) {
    return activity.prepTask;
  }
  return null;
}

function newYearGreetingTarget(activity, findPet, playerPosition) {
  if (activity?.status !== 'new_year_greetings') return null;
  const greeted = activity.greetedPetIds || new Set();
  return (activity.plan?.participants || [])
    .filter(id => !greeted.has(id))
    .map(id => ({ id, pet: findPet(id) }))
    .filter(entry => positionOf(entry.pet))
    .sort((a, b) => (
      distanceSquared(positionOf(a.pet), playerPosition)
      - distanceSquared(positionOf(b.pet), playerPosition)
    ))[0] || null;
}

export function createTownActivityObjectiveProjection(activity, {
  findPet = () => null,
  playerPosition = null,
} = {}) {
  if (!activity?.plan) return null;
  const ownerId = `town-activity:${activity.plan.id}`;
  const base = {
    ownerId,
    source: 'town_activity',
    title: activity.plan.title,
    priority: 100,
  };
  const task = incompleteTask(activity);
  const greetingTarget = newYearGreetingTarget(activity, findPet, playerPosition);

  if (greetingTarget) {
    const total = activity.plan.participants.length;
    const current = activity.greetedPetIds?.size || 0;
    return {
      ...base,
      id: `${ownerId}:greet:${greetingTarget.id}`,
      label: `去和${petName(greetingTarget.pet, greetingTarget.id)}拜年`,
      kind: 'talk_pet',
      target: { type: 'pet', id: greetingTarget.id },
      trigger: 'interact',
      radius: 4.5,
      progress: { current, total },
    };
  }

  if (task?.kind === 'talk_pet' && task.petId) {
    const stepIndex = task.stepIndex || 0;
    const stepTotal = task.steps?.length || 1;
    return {
      ...base,
      id: `${ownerId}:invite:${task.petId}:${stepIndex}`,
      label: task.label,
      kind: 'talk_pet',
      target: { type: 'pet', id: task.petId },
      trigger: 'interact',
      radius: 4.5,
      progress: { current: stepIndex, total: stepTotal },
    };
  }

  const taskPosition = positionOf(task?.target);
  if (taskPosition) {
    const stepIndex = task.stepIndex || 0;
    const stepTotal = task.steps?.length || 1;
    return {
      ...base,
      id: `${ownerId}:visit:${activity.status}:${stepIndex}`,
      label: task.label,
      kind: 'visit',
      target: { type: 'position', position: taskPosition },
      trigger: 'proximity',
      radius: task.radius || 5,
      progress: stepTotal > 1 ? { current: stepIndex, total: stepTotal } : null,
    };
  }

  const exitPetId = activity.plan.exitPetId;
  const exitPet = findPet(exitPetId);
  if (!exitPetId || !positionOf(exitPet)) return null;
  return {
    ...base,
    id: `${ownerId}:return:${exitPetId}`,
    label: `找${petName(exitPet, exitPetId)}商量活动收尾`,
    kind: 'return_host',
    target: { type: 'pet', id: exitPetId },
    trigger: 'interact',
    radius: 4.5,
    progress: null,
  };
}
