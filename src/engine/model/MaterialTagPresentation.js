import * as THREE from 'three';

const NON_INHERITED_TAGS = new Set(['emissive']);
const SUPPORTED_TAGS = new Set(['base', 'water', 'emissive', 'fire', 'smoke']);
let activePresenter = null;

function normalizeTag(entry) {
  if (typeof entry === 'string') return { tag: entry, value: true };
  if (!entry || typeof entry !== 'object' || !entry.tag) return null;
  return { tag: entry.tag, value: entry.value, ...(entry.variant ? { variant: entry.variant } : {}) };
}

export function hasMaterialTags(modelJson) {
  const parts = modelJson?.nodes || modelJson?.meshes || modelJson?.parts || [];
  return parts.some(part => Array.isArray(part?.tags) && part.tags.length > 0);
}

export function resolveEffectiveMaterialTags(parts = []) {
  const byId = new Map(parts.map(part => [part.id, part]));
  const resolved = new Map();
  const resolving = new Set();

  function resolve(part) {
    if (!part?.id) return [];
    if (resolved.has(part.id)) return resolved.get(part.id);
    if (resolving.has(part.id)) return [];
    resolving.add(part.id);

    const tags = new Map();
    const parent = part.parent ? byId.get(part.parent) : null;
    for (const inherited of resolve(parent)) {
      if (!NON_INHERITED_TAGS.has(inherited.tag)) tags.set(inherited.tag, inherited);
    }
    for (const raw of part.tags || []) {
      const tag = normalizeTag(raw);
      if (tag) tags.set(tag.tag, tag);
    }
    const result = [...tags.values()];
    resolved.set(part.id, result);
    resolving.delete(part.id);
    return result;
  }

  for (const part of parts) resolve(part);
  return resolved;
}

function toStandardMaterial(source) {
  const material = new THREE.MeshStandardMaterial({
    color: source.color?.clone?.() || new THREE.Color(0x888888),
    emissive: source.emissive?.clone?.() || new THREE.Color(0x000000),
    emissiveIntensity: source.emissiveIntensity || 0,
    flatShading: source.flatShading !== false,
    transparent: !!source.transparent,
    opacity: source.opacity ?? 1,
    side: source.side ?? THREE.FrontSide,
    depthWrite: source.depthWrite !== false,
    vertexColors: !!source.vertexColors,
    map: source.map || null,
  });
  material.name = source.name;
  return material;
}

function applyTagsToMaterial(source, tags) {
  const byTag = new Map(tags.map(tag => [tag.tag, tag]));
  const base = byTag.get('base');
  const water = byTag.get('water');
  const emissive = byTag.get('emissive');
  const fire = byTag.get('fire');
  let material = source.clone();

  if (['gold', 'silver', 'metal', 'glass'].includes(base?.value) || water) {
    material.dispose();
    material = toStandardMaterial(source);
  }

  if (base?.value === 'gold') {
    material.color.set(0xd9ad45);
    material.metalness = 0.72;
    material.roughness = 0.3;
  } else if (base?.value === 'silver') {
    material.color.set(0xcbd3dc);
    material.metalness = 0.76;
    material.roughness = 0.27;
  } else if (base?.value === 'metal') {
    material.metalness = 0.68;
    material.roughness = 0.35;
  } else if (base?.value === 'glass') {
    material.transparent = true;
    material.opacity = Math.min(material.opacity, 0.48);
    material.depthWrite = false;
    material.metalness = 0.05;
    material.roughness = 0.12;
  }

  if (water) {
    material.color.lerp(new THREE.Color(0x62bde8), 0.55);
    material.transparent = true;
    material.opacity = Math.min(material.opacity, water.value === 'fall' ? 0.68 : 0.76);
    material.depthWrite = false;
    material.metalness = 0.05;
    material.roughness = water.value === 'fall' ? 0.28 : 0.16;
  }

  if (emissive || fire) {
    const strength = Number(emissive?.value ?? fire?.value ?? 0.5) || 0.5;
    const fireColor = fire?.variant === 'blue' ? 0x4aa8ff : fire?.variant === 'green' ? 0x58e07d : 0xff7a24;
    const color = new THREE.Color(fire ? fireColor : material.color);
    if (!material.emissive) {
      const upgraded = toStandardMaterial(material);
      material.dispose();
      material = upgraded;
    }
    material.emissive.copy(color);
    material.emissiveIntensity = THREE.MathUtils.clamp(strength * 1.6, 0.25, 1.6);
  }

  material.userData = {
    ...material.userData,
    chiiMaterialTags: tags.map(tag => ({ ...tag })),
  };
  material.needsUpdate = true;
  return material;
}

export function applyBasicMaterialTagPresentation(root, parts = []) {
  const effectiveTags = resolveEffectiveMaterialTags(parts);
  const bindings = [];
  for (const part of parts) {
    const tags = effectiveTags.get(part.id) || [];
    const supported = tags.filter(tag => SUPPORTED_TAGS.has(tag.tag));
    if (!supported.length) continue;
    const object = root.getObjectByName(part.id);
    if (!object) continue;
    object.userData.materialTags = supported.map(tag => ({ ...tag }));
    if (object.isMesh && object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const tagged = materials.map(material => applyTagsToMaterial(material, supported));
      object.material = Array.isArray(object.material) ? tagged : tagged[0];
    }
    bindings.push({ partId: part.id, tags: supported.map(tag => ({ ...tag })) });
  }
  root.userData.materialTagBindings = bindings;
  return bindings;
}

export function setMaterialTagPresenter(presenter = null) {
  if (presenter && typeof presenter.attachModel !== 'function') {
    throw new TypeError('Material tag presenter must implement attachModel()');
  }
  activePresenter = presenter;
  return activePresenter;
}

export function getMaterialTagPresenter() {
  return activePresenter;
}

export function detachMaterialTagPresentation(root) {
  if (!root) return false;
  const detached = activePresenter?.detachModel?.(root) || false;
  if (root.userData) {
    delete root.userData.materialTagPresentationReady;
    delete root.userData.modelVisualRuntime;
  }
  return detached;
}

export function reattachMaterialTagPresentation(root, context = {}) {
  if (!root) return [];
  const model = context.model || root._voxelModel || null;
  const parts = context.parts || model?.parts || [];
  return applyMaterialTagPresentation(root, parts, {
    model,
    modelJson: context.modelJson || root.userData?.modelJson || null,
    modelId: context.modelId || null,
  });
}

export function applyMaterialTagPresentation(root, parts = [], context = {}) {
  if (!activePresenter) return applyBasicMaterialTagPresentation(root, parts);
  const task = Promise.resolve(activePresenter.attachModel({
    root,
    parts,
    model: context.model || root?._voxelModel || null,
    modelJson: context.modelJson || root?.userData?.modelJson || null,
    modelId: context.modelId || null,
  })).catch(error => {
    console.warn('[MaterialTags] Runtime presentation failed, using basic fallback:', error.message);
    if (!Array.isArray(root?.userData?.materialTagBindings)) {
      applyBasicMaterialTagPresentation(root, parts);
    }
    return { ok: false, source: 'basic-fallback', error };
  });
  root.userData.materialTagPresentationReady = task;
  return root.userData.materialTagBindings || [];
}
