function comparableName(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function getVoxelModel(model) {
  return model?._voxelModel || model || null;
}

export function normalizeAnimationPlan(raw, { duration = 2, loop = true, model = null } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw.plan || raw.animation || raw.motionPlan || raw;
  if (!source || typeof source !== 'object') return null;

  const plan = { ...source };
  if (plan._duration === undefined) plan._duration = Number(raw.duration) || duration;
  if (plan._loop === undefined) plan._loop = raw.loop === undefined ? loop : raw.loop !== false;

  const voxelModel = getVoxelModel(model);
  if (!Array.isArray(voxelModel?.parts)) return plan;

  const names = new Map();
  for (const part of voxelModel.parts) {
    for (const candidate of [part.id, part.name]) {
      const key = comparableName(candidate);
      if (key && !names.has(key)) names.set(key, part.id);
    }
  }

  for (const key of Object.keys(plan)) {
    if (key.startsWith('_') || voxelModel.getPart?.(key)) continue;
    const replacement = names.get(comparableName(key));
    if (!replacement || replacement === key) continue;
    if (plan[replacement] === undefined) plan[replacement] = plan[key];
    delete plan[key];
  }
  return plan;
}
