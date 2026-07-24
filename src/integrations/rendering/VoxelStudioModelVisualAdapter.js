import {
  EffectSlotManager,
  MaterialTagRuntime,
  RuntimeIndex,
  createEffectRuntime,
} from '@voxel-studio/render-runtime';
import {
  clearFlameAuraFromRoot,
  createFlameAuraForObject,
  tickFlameAura,
} from '@voxel-studio/render-runtime/effects/companions/FlameAura.js';
import {
  clearParticleEffectsFromRoot,
  createParticleEffectForObject,
  tickParticleEffects,
} from '@voxel-studio/render-runtime/effects/particles/ParticleCompanion.js';

import { applyBasicMaterialTagPresentation } from '../../engine/model/MaterialTagPresentation.js';
import { ModelVisualPort } from '../../ports/ModelVisualPort.js';
import { ModelWaterTagPresenter } from './ModelWaterTagPresenter.js';

function hasTags(parts) {
  return parts.some(part => Array.isArray(part?.tags) && part.tags.length > 0);
}

function findRenderObject(root, partId) {
  const partObject = root?.getObjectByName?.(partId) || null;
  if (partObject?.isMesh && !partObject.isInstancedMesh) return partObject;
  let mesh = null;
  partObject?.traverse?.(object => {
    if (!mesh && object.isMesh && !object.isInstancedMesh) mesh = object;
  });
  return mesh;
}

export class VoxelStudioModelVisualAdapter extends ModelVisualPort {
  constructor({ scene, camera = null, vocabulary = null, modelStyleRegistry = null, logger = console } = {}) {
    super();
    if (!scene) throw new TypeError('VoxelStudioModelVisualAdapter scene is required');
    this.scene = scene;
    this.camera = camera;
    this.modelStyleRegistry = modelStyleRegistry;
    this.logger = logger;
    this.elapsed = 0;
    this.bindings = new Map();
    this.pending = new Map();
    this.settling = new Map();
    this.attachmentSequence = 0;
    this.modelWater = new ModelWaterTagPresenter();
    this.runtimeIndex = new RuntimeIndex();
    this.effectRuntime = createEffectRuntime().runtime;
    this.effectSlotManager = new EffectSlotManager({
      runtimeIndex: this.runtimeIndex,
      scene,
      effectBatchCoordinator: null,
      envMapProvider: { getCurrentEnvMap: () => scene.environment || null },
    });
    this.materialTags = new MaterialTagRuntime({
      vocabulary,
      runtimeIndex: this.runtimeIndex,
      effectSlotManager: this.effectSlotManager,
      effectRuntime: this.effectRuntime,
      applyMatcap: () => false,
      createCompanion: (type, target, params) => this._createCompanion(type, target, params),
    });
  }

  _createCompanion(type, target, params = {}) {
    if (type === 'FlameAura') {
      return Boolean(createFlameAuraForObject(target, params));
    }
    if (type?.startsWith('Particles:')) {
      const preset = type.slice('Particles:'.length).trim().toLowerCase();
      return createParticleEffectForObject(target, { preset, overrides: params });
    }
    return false;
  }

  async attachModel({ root, parts = [], model = null, modelJson = null, modelId = null } = {}) {
    if (!root) throw new TypeError('attachModel root is required');
    const inFlight = this.pending.get(root);
    if (inFlight?.promise) return inFlight.promise;
    const settling = this.settling.get(root);
    if (settling) {
      await settling;
      if (this.settling.get(root) === settling) this.settling.delete(root);
      const resumedInFlight = this.pending.get(root);
      if (resumedInFlight?.promise) return resumedInFlight.promise;
    }
    this.detachModel(root);
    const basicBindings = Array.isArray(root.userData?.materialTagBindings)
      ? root.userData.materialTagBindings
      : applyBasicMaterialTagPresentation(root, parts);
    if (!hasTags(parts)) {
      this.modelStyleRegistry?.registerModel?.(root);
      return { ok: true, source: 'basic', taggedParts: 0, basicBindings };
    }

    const runtimeModel = model || root._voxelModel || {
      name: modelJson?.name || root.name,
      style: modelJson?.style,
      parts,
    };
    const baseModelId = modelId || `${runtimeModel.name || root.name || 'model'}:${root.uuid}`;
    const instanceModelId = `${baseModelId}:visual-${++this.attachmentSequence}`;
    this.runtimeIndex.registerHierarchy(instanceModelId, runtimeModel);
    const targets = [];
    for (const part of parts) {
      if (part?.isGroup || !part?.mesh) continue;
      const object = findRenderObject(root, part.id);
      if (!object) continue;
      const globalPartId = `${instanceModelId}:${part.id}`;
      this.runtimeIndex.registerMesh(globalPartId, object, {
        modelId: instanceModelId,
        rawPartId: part.id,
        source: 'chii-model-visuals',
        mode: 'mesh',
      });
      targets.push({ object, globalPartId });
    }

    const pending = { root, modelId: instanceModelId, targets, promise: null };
    const task = (async () => {
      let result;
      try {
        result = await this.materialTags.applyModel(instanceModelId, runtimeModel);
      } catch (error) {
        if (this.pending.get(root) === pending) this.pending.delete(root);
        this._releaseRecord(pending);
        throw error;
      }
      if (this.pending.get(root) !== pending) {
        this._releaseRecord(pending);
        return { ok: false, source: 'voxel-studio-render-runtime', cancelled: true, basicBindings };
      }
      this.pending.delete(root);
      result.modelWaterParts = this.modelWater.attachModel(root, parts);
      this.modelStyleRegistry?.registerModel?.(root);
      const binding = { ...pending, promise: undefined, result };
      this.bindings.set(root, binding);
      root.userData.modelVisualRuntime = {
        source: 'voxel-studio-render-runtime',
        modelId: instanceModelId,
        taggedParts: result.taggedParts,
        appliedParts: result.appliedParts,
        skipped: result.skipped,
        diagnostics: result.diagnostics,
      };
      return { ok: true, source: 'voxel-studio-render-runtime', basicBindings, ...result };
    })();
    pending.promise = task;
    this.pending.set(root, pending);
    return task;
  }

  detachModel(root) {
    this.modelStyleRegistry?.unregisterModel?.(root);
    let detached = false;
    const pending = this.pending.get(root);
    if (pending) {
      this.pending.delete(root);
      this._releaseRecord(pending);
      const settling = Promise.resolve(pending.promise).catch(() => {}).finally(() => {
        if (this.settling.get(root) === settling) this.settling.delete(root);
      });
      this.settling.set(root, settling);
      detached = true;
    }
    const binding = this.bindings.get(root);
    if (binding) {
      this._releaseRecord(binding);
      this.bindings.delete(root);
      detached = true;
    }
    if (root?.userData) delete root.userData.modelVisualRuntime;
    return detached;
  }

  _releaseRecord(record) {
    if (!record) return;
    this.modelWater.detachModel(record.root);
    clearFlameAuraFromRoot(record.root);
    clearParticleEffectsFromRoot(record.root);
    for (const { object, globalPartId } of record.targets || []) {
      this.effectSlotManager.clearEffects(object, { restoreOriginalMaterial: true });
      this.runtimeIndex.unregisterPart(globalPartId);
    }
    if (record.modelId) this.runtimeIndex.registerHierarchy(record.modelId, { parts: [] });
  }

  update(dt = 0) {
    this.elapsed += Math.max(0, Number(dt) || 0);
    this.modelWater.update(this.elapsed);
    tickParticleEffects(dt, this.camera);
    for (const root of this.bindings.keys()) {
      this.effectRuntime.updateRuntimeUniforms(root, { uTime: this.elapsed });
      tickFlameAura(root, this.elapsed, this.camera);
    }
  }

  getCapabilities() {
    return {
      source: 'voxel-studio-render-runtime',
      materialTags: true,
      triplanarWoodStone: true,
      glass: true,
      emissive: true,
      shaderFire: true,
      matcap: false,
      companionParticles: true,
      modelWater: true,
      modelWaterImplementation: 'chii-adapter-v1',
    };
  }

  dispose() {
    for (const root of [...this.pending.keys()]) this.detachModel(root);
    for (const root of [...this.bindings.keys()]) this.detachModel(root);
    this.modelWater.dispose();
    this.runtimeIndex.clear();
  }
}
