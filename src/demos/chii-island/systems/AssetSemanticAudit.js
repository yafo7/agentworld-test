const IMPLEMENTED_MATERIAL_TAGS = new Set(['base', 'water', 'emissive', 'fire', 'smoke']);
const SUPPORTED_MOTION_OPERATORS = new Set([
  'bounce', 'slide', 'swing', 'sway', 'breathe', 'wave', 'drop', 'impulse',
  'launch', 'dash', 'slash', 'spin', 'pointTo', 'shift', 'squash', 'flow',
  'emit', 'lockWorldRot', 'position', 'rotation', 'scale', 'tilt',
]);

function increment(counts, key, amount = 1) {
  const normalized = String(key || 'unknown');
  counts[normalized] = (counts[normalized] || 0) + amount;
}

function modelParts(modelJson) {
  if (Array.isArray(modelJson?.nodes)) return modelJson.nodes;
  if (Array.isArray(modelJson?.meshes)) return modelJson.meshes;
  if (Array.isArray(modelJson?.parts)) return modelJson.parts;
  return [];
}

function partMesh(part) {
  if (part?.mesh) return part.mesh;
  if (part?.type && !part?.isGroup && !part?.group) return part;
  return null;
}

function normalizedTags(part) {
  if (!Array.isArray(part?.tags)) return [];
  return part.tags.map(tag => {
    if (typeof tag === 'string') return { tag, value: true };
    return tag && typeof tag === 'object' ? tag : null;
  }).filter(tag => tag?.tag);
}

export function auditModelJson(modelJson, assetId = 'model') {
  const parts = modelParts(modelJson);
  const meshTypes = {};
  const materialTypes = {};
  const materialTags = {};
  const unsupportedTags = {};
  let meshes = 0;
  let groups = 0;

  for (const part of parts) {
    const mesh = partMesh(part);
    if (mesh) {
      meshes += 1;
      increment(meshTypes, mesh.type || mesh.geometry?.type || 'legacy');
      increment(materialTypes, mesh.material?.type || (mesh.material ? 'inline' : 'color'));
    } else {
      groups += 1;
    }
    for (const entry of normalizedTags(part)) {
      increment(materialTags, entry.tag);
      if (!IMPLEMENTED_MATERIAL_TAGS.has(entry.tag)) increment(unsupportedTags, entry.tag);
    }
  }

  return {
    assetId,
    name: modelJson?.name || assetId,
    format: Array.isArray(modelJson?.nodes) ? 'nodes-v2'
      : Array.isArray(modelJson?.meshes) ? 'meshes-v1'
        : Array.isArray(modelJson?.parts) ? 'parts-legacy' : 'unknown',
    parts: parts.length,
    groups,
    meshes,
    meshTypes,
    materialTypes,
    materialTags,
    unsupportedTags,
  };
}

function unwrapPlan(raw) {
  return raw?.plan || raw?.animation || raw?.motionPlan || raw || null;
}

export function auditAnimationPlan(raw, assetId = 'animation') {
  const plan = unwrapPlan(raw);
  const operators = {};
  const unsupportedOperators = {};
  let tracks = 0;
  if (plan && typeof plan === 'object') {
    for (const [partId, motions] of Object.entries(plan)) {
      if (partId.startsWith('_') || !motions || typeof motions !== 'object') continue;
      tracks += 1;
      for (const operator of Object.keys(motions)) {
        if (operator.startsWith('_')) continue;
        increment(operators, operator);
        if (!SUPPORTED_MOTION_OPERATORS.has(operator)) increment(unsupportedOperators, operator);
      }
    }
  }
  return {
    assetId,
    duration: Number(raw?.duration || plan?._duration || 0),
    tracks,
    operators,
    unsupportedOperators,
  };
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source || {})) increment(target, key, value);
}

export class AssetSemanticAudit {
  constructor({ models = {}, renderer = null, runtime = null } = {}) {
    this.renderer = renderer;
    this.runtime = runtime;
    this.models = Object.entries(models).map(([id, json]) => auditModelJson(json, id));
    this.animations = new Map();
  }

  recordAnimations(assetId, animations = {}) {
    for (const [name, plan] of Object.entries(animations || {})) {
      const id = `${assetId}:${name}`;
      this.animations.set(id, auditAnimationPlan(plan, id));
    }
  }

  snapshot() {
    const totals = {
      models: this.models.length,
      parts: 0,
      groups: 0,
      meshes: 0,
      materialTags: {},
      unsupportedTags: {},
      meshTypes: {},
      materialTypes: {},
      animations: this.animations.size,
      animationTracks: 0,
      motionOperators: {},
      unsupportedMotionOperators: {},
    };
    for (const model of this.models) {
      totals.parts += model.parts;
      totals.groups += model.groups;
      totals.meshes += model.meshes;
      mergeCounts(totals.materialTags, model.materialTags);
      mergeCounts(totals.unsupportedTags, model.unsupportedTags);
      mergeCounts(totals.meshTypes, model.meshTypes);
      mergeCounts(totals.materialTypes, model.materialTypes);
    }
    for (const animation of this.animations.values()) {
      totals.animationTracks += animation.tracks;
      mergeCounts(totals.motionOperators, animation.operators);
      mergeCounts(totals.unsupportedMotionOperators, animation.unsupportedOperators);
    }

    const info = this.renderer?.info;
    return {
      runtime: this.runtime,
      totals,
      render: info ? {
        calls: info.render.calls,
        triangles: info.render.triangles,
        points: info.render.points,
        lines: info.render.lines,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length || 0,
      } : null,
      models: this.models,
      animations: [...this.animations.values()],
    };
  }

  print() {
    const report = this.snapshot();
    console.groupCollapsed('[Chii Asset Audit]', report.totals);
    console.table(report.models);
    if (report.animations.length) console.table(report.animations);
    console.log('Runtime:', report.runtime);
    console.log('Render snapshot:', report.render);
    console.groupEnd();
    return report;
  }
}

export function createAssetSemanticAudit(options) {
  return new AssetSemanticAudit(options);
}
