import { entityPosition, behaviorFingerprint } from '../../../gameplay/agents/IslandWorldInformation.js';
import { normalizeAnimationPlan } from '../../../engine/animation/normalizePlan.js';
import { TownActivityAssetCache } from '../../../storage/TownActivityAssetCache.js';
import { generatedAssets } from '../../../assets/repositories/GeneratedAssetRepository.js';

/** Adapter to existing movement, animation, model and persistence systems. */
export class ChiiResidentBehaviorBody {
  constructor({ placementGrid, generationController, getPets, scope, cache = new TownActivityAssetCache({ assetRepository: generatedAssets }) }) {
    Object.assign(this, { placementGrid, generationController, getPets, scope, cache });
    this.reservations = new Map();
    this.destinations = new WeakMap();
  }

  release(runtime) { this.reservations.delete(runtime.profile.identity.residentId); }
  baseModel(runtime) { return runtime.behaviorVariantModel && runtime.pet._originalModelJson === runtime.behaviorVariantModel ? runtime.behaviorBaseModel : runtime.pet._originalModelJson; }

  stroll(runtime, entity, pace) {
    const origin = entityPosition(runtime.pet);
    const center = entityPosition(entity) || origin;
    if (!origin) return null;
    const angle = Math.random() * Math.PI * 2;
    for (let index = 0; index < 8; index += 1) {
      const heading = angle + index * Math.PI / 4;
      const point = { x: center.x + Math.cos(heading) * 5, z: center.z + Math.sin(heading) * 5 };
      if (Math.hypot(point.x - origin.x, point.z - origin.z) < 2) continue;
      if (this.placementGrid && !this.placementGrid.isWorldPositionAvailable(point)) continue;
      if (runtime.pet._navigation && !runtime.pet._navigation.findPath(origin, point)?.length) continue;
      if (runtime.pet.walkTo?.(point.x, point.z, pace === 'run' ? 5 : 3) === false) continue;
      return point;
    }
    return null;
  }

  approach(runtime, entity) {
    const origin = entityPosition(runtime.pet);
    const center = entityPosition(entity);
    if (!origin || !center) return null;
    this.release(runtime);
    const id = runtime.profile.identity.residentId;
    const offset = parseInt(behaviorFingerprint(id), 36) % 16;
    for (const radius of [3, 5, 8, 12, 16]) {
      for (let i = 0; i < 16; i += 1) {
        const angle = ((i + offset) / 16) * Math.PI * 2;
        const point = { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius };
        if (this.placementGrid && !this.placementGrid.isWorldPositionAvailable(point)) continue;
        if ([...this.reservations.values()].some(p => Math.hypot(p.x - point.x, p.z - point.z) < 2)) continue;
        if (this.getPets().some(p => p !== runtime.pet && entityPosition(p) && Math.hypot(entityPosition(p).x - point.x, entityPosition(p).z - point.z) < 1.5)) continue;
        if (runtime.pet._navigation && !runtime.pet._navigation.findPath(origin, point)?.length) continue;
        if (runtime.pet.walkTo(point.x, point.z, 3) === false) continue;
        this.reservations.set(id, point);
        this.destinations.set(runtime, { entity, center, point });
        return point;
      }
    }
    return null;
  }

  near(runtime, entity) {
    const a = entityPosition(runtime.pet), b = entityPosition(entity);
    const destination = this.destinations.get(runtime);
    const atPreparedPoint = a && b && destination?.entity === entity && destination.center.x === b.x && destination.center.z === b.z
      && Math.hypot(a.x - destination.point.x, a.z - destination.point.z) <= 1;
    return Boolean(atPreparedPoint || (a && b && Math.hypot(a.x - b.x, a.z - b.z) <= 4));
  }

  async prepare(runtime, graph, isCurrent, { cachedOnly = false } = {}) {
    const assets = new Map();
    const generated = graph.states.filter(s => s.generation);
    if (generated.length > 2) throw new Error('一次安排最多准备两个新动作');
    const base = this.baseModel(runtime);
    const baseRevision = behaviorFingerprint(base);
    for (const state of generated) {
      if (!isCurrent()) throw new Error('行为准备已过期');
      if (!base) throw new Error('居民模型尚未准备好');
      const request = state.generation;
      let modelJson = base;
      let assetId = null;
      const prefix = `resident-behavior:${this.scope}:${runtime.profile.identity.residentId}:${baseRevision}`;
      if (request.modelChange) {
        const key = `${prefix}:model:${behaviorFingerprint(request.modelChange)}`;
        const variant = await this.cache.getOrCreateModel(key, async () => {
          if (cachedOnly) throw new Error('模型缓存不存在，需要重新安排');
          const completed = await this.generationController.run({ operation: 'model.refine', source: { kind: 'resident_behavior', text: request.modelChange }, target: { identity: runtime.profile.identity.displayName }, input: { modelJson: base }, semanticPlanning: 'disabled' });
          if (!completed.result?.modelJson || !completed.result.assetId) throw new Error('后端未返回可保存的模型变体');
          return completed.result;
        }, { kind: 'resident_behavior_model', subjectId: runtime.profile.identity.residentId, prompt: request.modelChange });
        modelJson = variant.modelJson;
        assetId = variant.assetId;
      }
      if (!isCurrent()) throw new Error('行为准备已过期');
      const key = `${prefix}:animation:${behaviorFingerprint({ model: modelJson, prompt: request.prompt })}`;
      const cached = await this.cache.getOrCreateAnimation(key, async () => {
        if (cachedOnly) throw new Error('动作缓存不存在，需要重新安排');
        const completed = await this.generationController.run({ operation: 'animation.generate', source: { kind: 'resident_behavior', text: request.prompt }, input: { modelJson, description: request.prompt }, constraints: { duration: 3, emitParticles: false }, semanticPlanning: 'disabled' });
        const plan = completed.result?.plan;
        if (!plan || typeof plan !== 'object' || (!plan._baked && !Object.keys(plan).some(k => !k.startsWith('_')))) throw new Error('后端没有返回有效动作');
        return { plan };
      }, { kind: 'resident_behavior_animation', subjectId: runtime.profile.identity.residentId, prompt: request.prompt });
      if (!isCurrent() || behaviorFingerprint(this.baseModel(runtime)) !== baseRevision) throw new Error('居民外观已变化，动作需要重新准备');
      assets.set(state.id, { key: `behavior_${behaviorFingerprint(key)}`, plan: cached.plan, modelJson: request.modelChange ? modelJson : null, assetId, baseRevision });
    }
    return assets;
  }

  perform(runtime, state, asset) {
    const pet = runtime.pet;
    pet.stopWalking?.();
    const position = entityPosition(pet);
    if (position) this.reservations.set(runtime.profile.identity.residentId, position);
    if (state.kind === 'wait') { pet.playAnimation?.('idle'); return () => this.release(runtime); }
    if (state.generation && !asset) throw new Error('新动作尚未准备好');
    const original = pet._originalModelJson;
    if (asset && behaviorFingerprint(original) !== asset.baseRevision) throw new Error('当前模型与动作不兼容');
    if (asset?.modelJson && !pet.replaceModelFromJson(asset.modelJson, { preserveCurrentScale: true })) throw new Error('模型变体无法加载');
    if (asset?.modelJson) { runtime.behaviorBaseModel = original; runtime.behaviorVariantModel = asset.modelJson; }
    try {
      if (asset) {
        const plan = normalizeAnimationPlan(asset.plan, { model: pet._modelGroup, duration: 3, loop: true });
        if (!plan) throw new Error('动作无法播放');
        pet.loadAnimation(asset.key, plan);
      }
      pet.playAnimation?.(asset?.key || state.animation);
    } catch (error) {
      if (asset?.modelJson && pet._originalModelJson === asset.modelJson) pet.replaceModelFromJson(original, { preserveCurrentScale: true });
      runtime.behaviorBaseModel = null;
      runtime.behaviorVariantModel = null;
      throw error;
    }
    return () => {
      this.release(runtime);
      if (asset?.modelJson && pet._originalModelJson === asset.modelJson) pet.replaceModelFromJson(original, { preserveCurrentScale: true });
      runtime.behaviorBaseModel = null;
      runtime.behaviorVariantModel = null;
      if (runtime._canAct()) pet.playAnimation?.('idle');
    };
  }
}
