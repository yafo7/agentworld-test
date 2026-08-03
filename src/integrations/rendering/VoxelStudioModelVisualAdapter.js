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
import { MeshStandardMaterial } from 'three';

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

function copyTextureProperties(source, target) {
  const properties = [
    'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap',
    'envMap', 'lightMap', 'normalMap',
  ];
  for (const property of properties) {
    if (source[property] !== undefined) target[property] = source[property];
  }
}

/**
 * Latest Studio layers target the PBR shader anchors used by Standard/Physical materials.
 * Chii's voxel renderer still emits Lambert materials, so compatibility stays here at the
 * replaceable integration boundary instead of leaking into the parser or renderer.
 */
export function promoteMaterialForVoxelRuntime(material) {
  if (!material || material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) return material;
  if (!material.isMeshLambertMaterial && !material.isMeshPhongMaterial) return material;

  const promoted = new MeshStandardMaterial({
    color: material.color?.clone?.() || 0xffffff,
    emissive: material.emissive?.clone?.() || 0x000000,
    emissiveIntensity: Number.isFinite(material.emissiveIntensity) ? material.emissiveIntensity : 1,
    metalness: 0,
    roughness: material.isMeshPhongMaterial
      ? Math.max(0.2, Math.min(1, 1 - (Number(material.shininess) || 30) / 140))
      : 0.82,
    flatShading: material.flatShading === true,
    vertexColors: material.vertexColors === true,
    transparent: material.transparent === true,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side: material.side,
    shadowSide: material.shadowSide,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    colorWrite: material.colorWrite,
    blending: material.blending,
    blendSrc: material.blendSrc,
    blendDst: material.blendDst,
    blendEquation: material.blendEquation,
    polygonOffset: material.polygonOffset,
    polygonOffsetFactor: material.polygonOffsetFactor,
    polygonOffsetUnits: material.polygonOffsetUnits,
    visible: material.visible,
    toneMapped: material.toneMapped,
    fog: material.fog,
  });
  promoted.name = material.name;
  promoted.alphaHash = material.alphaHash === true;
  promoted.dithering = material.dithering === true;
  promoted.premultipliedAlpha = material.premultipliedAlpha === true;
  if (material.normalScale) promoted.normalScale?.copy?.(material.normalScale);
  promoted.bumpScale = Number.isFinite(material.bumpScale) ? material.bumpScale : promoted.bumpScale;
  promoted.displacementScale = Number.isFinite(material.displacementScale)
    ? material.displacementScale
    : promoted.displacementScale;
  promoted.displacementBias = Number.isFinite(material.displacementBias)
    ? material.displacementBias
    : promoted.displacementBias;
  promoted.userData = {
    ...(material.userData || {}),
    chiiVoxelRuntimeMaterial: {
      sourceType: material.type,
      runtimeCommit: '1203a1e',
    },
  };
  copyTextureProperties(material, promoted);
  promoted.needsUpdate = true;
  return promoted;
}

export function promoteMeshForVoxelRuntime(object, cache = new WeakMap()) {
  if (!object?.isMesh || !object.material) return 0;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  let promotedCount = 0;
  const next = materials.map(material => {
    if (cache.has(material)) return cache.get(material);
    const promoted = promoteMaterialForVoxelRuntime(material);
    cache.set(material, promoted);
    if (promoted !== material) promotedCount += 1;
    return promoted;
  });
  object.material = Array.isArray(object.material) ? next : next[0];
  return promotedCount;
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
    this.promotedMaterialCache = new WeakMap();
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
      promoteMeshForVoxelRuntime(object, this.promotedMaterialCache);
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
        this.modelStyleRegistry?.registerModel?.(root);
        const message = error?.message || String(error);
        this.logger?.warn?.('[VoxelStudioModelVisualAdapter] Runtime failed; using basic presentation:', message);
        root.userData.modelVisualRuntime = {
          source: 'basic-fallback',
          modelId: instanceModelId,
          error: message,
        };
        return { ok: true, source: 'basic-fallback', runtimeError: message, basicBindings };
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
      fur: true,
      foliage: true,
      vegetationSway: true,
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
