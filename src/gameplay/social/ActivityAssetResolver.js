function text(value) {
  return String(value || '').trim();
}

function normalizeSubjectId(value) {
  const id = text(value);
  if (id === 'fangke') return 'fangk';
  if (id === 'builder_crab') return 'crab';
  return id;
}

export function activityModelRevision(modelJson) {
  const source = JSON.stringify(modelJson || {});
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function isActivityAssetCompatible(binding, {
  sceneStyle = 'original',
  subjectId = null,
  modelJson = null,
  sizeProfile = null,
  footprint = null,
} = {}) {
  if (!binding) return false;
  if (binding.sceneStyles?.length && !binding.sceneStyles.includes(sceneStyle)) return false;
  if (binding.subjectId && normalizeSubjectId(binding.subjectId) !== normalizeSubjectId(subjectId)) return false;
  if (binding.modelRevision && binding.modelRevision !== activityModelRevision(modelJson)) return false;
  if (binding.sizeProfile && sizeProfile && binding.sizeProfile !== sizeProfile) return false;
  if (binding.footprint && footprint) {
    const sameWidth = Number(binding.footprint.width) === Number(footprint.width);
    const sameDepth = Number(binding.footprint.depth) === Number(footprint.depth);
    const rotated = Number(binding.footprint.width) === Number(footprint.depth)
      && Number(binding.footprint.depth) === Number(footprint.width);
    if (!sameWidth || !sameDepth) {
      if (!binding.allowRotation || !rotated) return false;
    }
  }
  return true;
}

export class ActivityAssetResolver {
  constructor({ repository = null, cache = null, sceneStyle = 'original' } = {}) {
    this.repository = repository;
    this.cache = cache;
    this.sceneStyle = sceneStyle;
  }

  async resolveModel(binding, context = {}) {
    if (!isActivityAssetCompatible(binding, { ...context, sceneStyle: this.sceneStyle })) return null;
    if (binding.kind === 'activity_cache' && binding.cacheKey) {
      return this.cache?.getModel?.(binding.cacheKey) || null;
    }
    if (['generated_model', 'file_model'].includes(binding.kind)) {
      return this.repository?.getModel?.(binding) || null;
    }
    return null;
  }

  async resolveAnimation(binding, { pet = null, modelJson = null } = {}) {
    const resolvedSubjectId = normalizeSubjectId(pet?._profile?.id || pet?._petName || pet?._petId || null);
    if (!isActivityAssetCompatible(binding, {
      sceneStyle: this.sceneStyle,
      subjectId: resolvedSubjectId,
      modelJson,
    })) return null;
    if (binding.kind === 'resident_animation') {
      const plan = pet?._animPlans?.[binding.name];
      return plan ? { key: binding.name, plan, source: binding.kind } : null;
    }
    if (binding.kind === 'activity_cache' && binding.cacheKey) {
      const cached = this.cache?.getAnimation?.(binding.cacheKey);
      return cached?.plan ? { key: binding.key || 'registered_activity', plan: cached.plan, source: binding.kind } : null;
    }
    if (binding.kind === 'file_animation') {
      const plan = await this.repository?.getAnimation?.(binding);
      return plan ? { key: binding.key || 'registered_activity', plan, source: binding.kind } : null;
    }
    return null;
  }

  resolveOutfit(binding, { characterId, baseRevision }) {
    if (!isActivityAssetCompatible(binding, {
      sceneStyle: this.sceneStyle,
      subjectId: characterId,
    })) return null;
    if (binding.baseRevision && binding.baseRevision !== baseRevision) return null;
    return { ...binding };
  }

  resolveVfx(binding) {
    if (!isActivityAssetCompatible(binding, { sceneStyle: this.sceneStyle })) return null;
    return binding.preset ? { ...binding } : null;
  }
}
