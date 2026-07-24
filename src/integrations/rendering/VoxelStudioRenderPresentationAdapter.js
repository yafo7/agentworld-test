import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { RenderPipeline, RenderStyleManager } from '@voxel-studio/render-runtime';
import { createToneMapPass } from '@voxel-studio/render-runtime/passes/ToneMapPass.js';
import { removeCelPatch } from '@voxel-studio/render-runtime/shaders/ToonRamp.js';

import { RenderPresentationPort } from '../../ports/RenderPresentationPort.js';

const STORAGE_KEY = 'chii-render-presentation-v1';
const STYLES = new Set(['current', 'cel']);
const QUALITIES = new Set(['low', 'medium', 'high', 'ultra']);
const PIXEL_RATIO_LIMIT = Object.freeze({ low: 0.75, medium: 1, high: 1.5, ultra: 2 });

function normalizeSettings(value = {}) {
  return {
    style: STYLES.has(value.style) ? value.style : 'current',
    quality: QUALITIES.has(value.quality) ? value.quality : 'high',
    postProcessing: value.postProcessing === true,
  };
}

function readSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage?.getItem?.(STORAGE_KEY) || 'null') || {});
  } catch {
    return normalizeSettings();
  }
}

function isTaggedOrSpecial(mesh) {
  if (Array.isArray(mesh.userData?.materialTags) && mesh.userData.materialTags.length) return true;
  if (mesh.userData?.skipShaderApply || mesh.userData?.isFlameAura || mesh.userData?.chiiModelWater) return true;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some(material => (
    material?.isShaderMaterial
    || material?.userData?.effectMaterialType
    || material?.userData?.effectVariant
    || material?.userData?.chiiModelWater
  ));
}

function toStandardMaterial(source) {
  const material = new THREE.MeshStandardMaterial({
    color: source.color?.clone?.() || new THREE.Color(0xcccccc),
    emissive: source.emissive?.clone?.() || new THREE.Color(0x000000),
    emissiveIntensity: source.emissiveIntensity ?? 0,
    map: source.map || null,
    alphaMap: source.alphaMap || null,
    vertexColors: !!source.vertexColors,
    flatShading: source.flatShading !== false,
    transparent: !!source.transparent,
    opacity: source.opacity ?? 1,
    alphaTest: source.alphaTest ?? 0,
    side: source.side ?? THREE.FrontSide,
    depthWrite: source.depthWrite !== false,
    depthTest: source.depthTest !== false,
    roughness: 0.82,
    metalness: 0,
  });
  material.name = source.name;
  return material;
}

export class VoxelStudioRenderPresentationAdapter extends RenderPresentationPort {
  constructor({
    renderer,
    scene,
    camera,
    lightRig = null,
    storage = globalThis.localStorage,
    devicePixelRatio = globalThis.devicePixelRatio || 1,
    logger = console,
  } = {}) {
    super();
    if (!renderer || !scene || !camera) {
      throw new TypeError('VoxelStudioRenderPresentationAdapter renderer, scene, and camera are required');
    }
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.lightRig = lightRig;
    this.storage = storage;
    this.devicePixelRatio = Math.max(0.5, Number(devicePixelRatio) || 1);
    this.logger = logger;
    this.elapsed = 0;
    this.refreshElapsed = 0;
    this.lastError = null;
    this.settings = readSettings(storage);
    this.modelRoots = new Set();
    this.rootMeshes = new Map();
    this.meshRegistry = new Map();
    this.convertedMaterials = new Map();

    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.renderPass.name = 'ChiiRenderPass';
    this.toneMapPass = createToneMapPass();
    this.toneMapPass.name = 'ChiiColorGradePass';
    this.toneMapPass.uniforms.uLUTStrength.value = 0;
    this.toneMapPass.uniforms.uSaturation.value = 1.03;
    this.toneMapPass.uniforms.uContrast.value = 1.02;
    this.toneMapPass.uniforms.uTint.value.set(1, 1, 1);
    this.outputPass = new OutputPass();
    this.outputPass.name = 'ChiiOutputPass';

    this.pipeline = new RenderPipeline({ renderer, scene, camera, composer: null });
    this.pipeline.registerPass(this.renderPass, 'mainComposer', 0, { id: 'chii-render' });
    this.pipeline.registerPass(this.toneMapPass, 'presentation', 10, { id: 'chii-color-grade' });
    this.pipeline.registerPass(this.outputPass, 'overlay', 100, { id: 'chii-output' });

    this.renderStyle = new RenderStyleManager({
      THREE,
      renderer,
      scene,
      meshRegistry: this.meshRegistry,
      renderPresets: {
        mode: 'pbr',
        applyPBR() {},
        applyInk() {},
        applyCel() {},
        setCelOutlineStyle() {},
        getLightDirection: () => {
          const position = this.lightRig?.sunLight?.position;
          return position ? position.clone().normalize() : new THREE.Vector3(0.5, 1, 0.5).normalize();
        },
      },
    });
    if (lightRig?.sunLight) this.scene.userData.directionalLight = lightRig.sunLight;

    this.setQuality(this.settings.quality, { persist: false });
    this.setStyle(this.settings.style, { persist: false });
    this.setPostProcessing(this.settings.postProcessing, { persist: false });
  }

  registerModel(root) {
    if (!root) return false;
    root.userData.isModelRoot = true;
    this.modelRoots.add(root);
    this._refreshRoot(root);
    return true;
  }

  unregisterModel(root) {
    const meshes = this.rootMeshes.get(root);
    if (meshes) {
      for (const mesh of meshes) {
        this._restoreMeshMaterial(mesh);
        this.meshRegistry.delete(mesh.uuid);
      }
    }
    this.rootMeshes.delete(root);
    this.modelRoots.delete(root);
    if (root?.userData) delete root.userData.isModelRoot;
    return Boolean(meshes);
  }

  setStyle(style, { persist = true } = {}) {
    this.settings.style = STYLES.has(style) ? style : 'current';
    this.refreshModels();
    if (this.settings.style === 'cel') {
      for (const mesh of this.meshRegistry.values()) this._prepareCelMesh(mesh);
      this.renderStyle.applyStyle({
        renderMode: 'cel',
        cartoon: {
          bands: 4,
          rampStrength: 0.72,
          shadowFloor: 0.24,
          highlightFactor: 0.92,
          outlineStrength: 0,
          outlineWidth: 0,
        },
      });
    } else {
      this.renderStyle.applyPBR();
      for (const mesh of [...this.convertedMaterials.keys()]) this._restoreMeshMaterial(mesh);
    }
    if (persist) this._persist();
    return this.settings.style;
  }

  setQuality(quality, { persist = true } = {}) {
    this.settings.quality = QUALITIES.has(quality) ? quality : 'high';
    this.pipeline.setQualityTier(this.settings.quality);
    const ratio = Math.min(this.devicePixelRatio, PIXEL_RATIO_LIMIT[this.settings.quality]);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = this.settings.quality !== 'low';
    if (persist) this._persist();
    return this.settings.quality;
  }

  setPostProcessing(enabled, { persist = true } = {}) {
    this.settings.postProcessing = enabled === true;
    this.pipeline.composer = this.settings.postProcessing ? this.composer : null;
    this.pipeline.dirty = true;
    if (this.settings.postProcessing) this.pipeline.notifySceneLoaded(3);
    if (persist) this._persist();
    return this.settings.postProcessing;
  }

  render(dt = 0) {
    const delta = Math.max(0, Number(dt) || 0);
    this.elapsed += delta;
    this.refreshElapsed += delta;
    if (this.refreshElapsed >= 1) {
      this.refreshElapsed = 0;
      this.refreshModels();
    }
    try {
      this.pipeline.renderFrame(delta, this.elapsed, { meshCount: this.meshRegistry.size });
    } catch (error) {
      this.lastError = error;
      this.pipeline.composer = null;
      this.settings.postProcessing = false;
      this.logger.error?.('[RenderPresentation] Pipeline fallback:', error);
      this.renderer.render(this.scene, this.camera);
    }
  }

  resize(width, height) {
    if (!(width > 0 && height > 0)) return;
    this.composer.setSize(width, height);
  }

  refreshModels() {
    for (const root of [...this.modelRoots]) {
      this._refreshRoot(root);
    }
  }

  _refreshRoot(root) {
    const previous = this.rootMeshes.get(root) || new Set();
    const current = new Set();
    root.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh) return;
      current.add(object);
      if (isTaggedOrSpecial(object)) {
        this._restoreMeshMaterial(object);
        this.meshRegistry.delete(object.uuid);
        return;
      }
      this.meshRegistry.set(object.uuid, object);
      if (this.settings.style === 'cel') {
        this._prepareCelMesh(object);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) this.renderStyle.applyCelToMaterial(material);
      }
    });
    for (const mesh of previous) {
      if (current.has(mesh)) continue;
      this._restoreMeshMaterial(mesh);
      this.meshRegistry.delete(mesh.uuid);
    }
    this.rootMeshes.set(root, current);
  }

  _prepareCelMesh(mesh) {
    if (!mesh?.material || isTaggedOrSpecial(mesh) || this.convertedMaterials.has(mesh)) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const created = [];
    const converted = originals.map(material => {
      if (material?.isMeshStandardMaterial) return material;
      if (!material?.isMeshLambertMaterial) return material;
      const standard = toStandardMaterial(material);
      created.push(standard);
      return standard;
    });
    if (!created.length) return;
    this.convertedMaterials.set(mesh, { original: mesh.material, created });
    mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
  }

  _restoreMeshMaterial(mesh) {
    const record = this.convertedMaterials.get(mesh);
    const materials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
    for (const material of materials) removeCelPatch(material);
    if (!record) return;
    mesh.material = record.original;
    for (const material of record.created) material.dispose();
    this.convertedMaterials.delete(mesh);
  }

  getSettings() {
    return { ...this.settings };
  }

  getCapabilities() {
    return {
      source: 'voxel-studio-render-runtime',
      renderPipeline: true,
      styles: ['current', 'cel'],
      qualityTiers: [...QUALITIES],
      postProcessing: ['subtle-color-grade'],
      fallback: 'direct-renderer',
    };
  }

  getStats() {
    return {
      settings: this.getSettings(),
      models: this.modelRoots.size,
      meshes: this.meshRegistry.size,
      qualityTier: this.pipeline.getCurrentTier(),
      pipeline: this.pipeline.getStats(),
      lastError: this.lastError?.message || null,
    };
  }

  _persist() {
    try {
      this.storage?.setItem?.(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Rendering preferences remain active for the current session.
    }
  }

  dispose() {
    this.setStyle('current', { persist: false });
    for (const root of [...this.modelRoots]) this.unregisterModel(root);
    this.pipeline.dispose();
    this.composer.dispose();
    this.toneMapPass.uniforms.uLUT.value?.dispose?.();
    if (this.scene.userData.directionalLight === this.lightRig?.sunLight) {
      delete this.scene.userData.directionalLight;
    }
  }
}
