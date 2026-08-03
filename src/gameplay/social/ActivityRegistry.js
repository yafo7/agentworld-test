const READY_STATUS = 'ready';
const REGISTRATION_STATUSES = new Set(['draft', 'preparing', READY_STATUS, 'incompatible', 'retired']);

const FAMILY_KEYWORDS = Object.freeze([
  ['new_year', ['春节', '新年', '团圆', '拜年']],
  ['birthday', ['生日', '寿星', '蛋糕']],
  ['campfire', ['篝火', '烤火', '火堆']],
  ['apple_pick', ['苹果', '摘果']],
  ['greeting', ['招呼', '问好', '打招呼']],
]);

const ACTION_KEYWORDS = Object.freeze([
  ['dance', ['跳舞', '舞蹈', '踏步']],
  ['eat', ['吃', '品尝', '食物']],
  ['pick', ['摘', '拿起苹果', '咬下苹果']],
  ['greet', ['招呼', '问好', '挥手', '点头']],
  ['construct', ['建造', '施工', '摆桌', '推桌']],
  ['dress', ['换装', '新衣', '转身']],
]);

function clone(value) {
  if (value == null) return value;
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value || '').trim();
}

function unique(values) {
  return [...new Set((values || []).map(text).filter(Boolean))].sort();
}

function normalizeConcept(value) {
  return text(value).toLowerCase().replace(/[\s，。！？、,.!?:：；;"'（）()【】\[\]]+/g, '');
}

function classifyByKeywords(value, definitions, fallback) {
  const source = text(value);
  return definitions.find(([, keywords]) => keywords.some(keyword => source.includes(keyword)))?.[0] || fallback;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableObject(value[key])]));
}

function hashText(value) {
  const source = JSON.stringify(stableObject(value));
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function familyFor(value) {
  const explicit = text(value.family);
  if (explicit) return explicit;
  const type = text(value.type || value.plan?.type);
  if (type && !type.startsWith('custom_')) return type;
  return classifyByKeywords(
    [value.title, value.concept, value.plan?.title, value.plan?.concept].filter(Boolean).join(' '),
    FAMILY_KEYWORDS,
    type || 'custom',
  );
}

function actionRolesFor(value) {
  const prompts = value.actionPrompts || value.plan?.actionPrompts || {};
  const roles = Object.values(prompts).map(prompt => classifyByKeywords(prompt, ACTION_KEYWORDS, 'perform'));
  return unique(roles);
}

function propRolesFor(value) {
  const props = value.props || value.plan?.props || [];
  return unique(props.map(prop => prop.archetype || prop.sizeProfile || prop.id));
}

function jaccard(left, right) {
  const a = new Set(left || []);
  const b = new Set(right || []);
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter(value => b.has(value)).length;
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

export function createActivitySignature(value = {}) {
  const plan = value.plan || value;
  const family = familyFor(value);
  const scale = text(value.scale || plan.scale) || 'daily';
  const locationRole = text(value.locationRole || plan.locationId) || 'church_square';
  const beats = unique(value.beatTypes || plan.beats);
  const actionRoles = unique(value.actionRoles || actionRolesFor(plan));
  const propRoles = unique(value.propRoles || propRolesFor(plan));
  const participantCount = Number(value.participantCount || plan.participants?.length) || 1;
  const participantRoles = unique(value.participantRoles || [
    'initiator',
    ...(plan.subjectId ? ['subject'] : []),
    ...(participantCount > 1 ? ['guest'] : []),
  ]);
  const subjectId = text(value.subjectId || plan.subjectId) || null;
  const semanticTags = unique([
    family,
    ...(value.semanticTags || []),
    ...(plan.semanticTags || []),
  ]);
  const descriptor = {
    family,
    scale,
    locationRole,
    beats,
    actionRoles,
    propRoles,
    participantRoles,
    participantCount,
    subjectId,
    semanticTags,
  };
  return { ...descriptor, hash: hashText(descriptor) };
}

export function createActivityCanonicalKey(value = {}) {
  const plan = value.plan || value;
  const signature = value.signature || createActivitySignature(value);
  const type = text(value.type || plan.type) || signature.family;
  if (!type.startsWith('custom_')) return `preset:${type}:${signature.subjectId || 'any'}`;
  const concept = normalizeConcept(value.concept || plan.concept || value.title || plan.title);
  return `custom:${signature.scale}:${concept}:${signature.hash}`;
}

export function activitySimilarity(leftValue, rightValue) {
  const left = leftValue.signature || createActivitySignature(leftValue);
  const right = rightValue.signature || createActivitySignature(rightValue);
  const family = left.family === right.family ? 1 : jaccard(left.semanticTags, right.semanticTags);
  const scale = left.scale === right.scale ? 1 : 0;
  const location = left.locationRole === right.locationRole ? 1 : 0;
  const participantCount = 1 - Math.min(1, Math.abs(left.participantCount - right.participantCount) / 6);
  return Number((
    family * 0.25
    + scale * 0.05
    + jaccard(left.beats, right.beats) * 0.2
    + location * 0.15
    + jaccard(left.propRoles, right.propRoles) * 0.15
    + jaccard(left.actionRoles, right.actionRoles) * 0.1
    + ((jaccard(left.participantRoles, right.participantRoles) + participantCount) / 2) * 0.1
  ).toFixed(4));
}

export function normalizeActivityRegistration(record, { sceneStyle = 'original' } = {}) {
  if (!record || typeof record !== 'object') throw new TypeError('Activity registration must be an object');
  const signature = createActivitySignature(record);
  const status = REGISTRATION_STATUSES.has(record.status) ? record.status : 'draft';
  const id = text(record.id) || `activity.${signature.family}.${signature.hash}.v1`;
  return {
    id,
    revision: Math.max(1, Number(record.revision) || 1),
    status,
    origin: text(record.origin) || 'player_created',
    sceneStyle: text(record.sceneStyle) || sceneStyle,
    type: text(record.type || record.plan?.type) || signature.family,
    family: signature.family,
    title: text(record.title || record.plan?.title) || id,
    semanticTags: signature.semanticTags,
    canonicalKey: text(record.canonicalKey) || createActivityCanonicalKey({ ...record, signature }),
    signature,
    derivedFrom: text(record.derivedFrom) || null,
    plan: clone(record.plan || null),
    layout: clone(record.layout || {}),
    assets: clone(record.assets || { models: {}, animations: {}, outfits: {}, mounts: {}, vfx: [] }),
    execution: clone(record.execution || {}),
    task: clone(record.task || null),
    camera: clone(record.camera || {}),
    compatibility: clone(record.compatibility || { sceneStyles: [text(record.sceneStyle) || sceneStyle] }),
    provenance: clone(record.provenance || {}),
    stats: {
      runs: Math.max(0, Number(record.stats?.runs) || 0),
      failures: Math.max(0, Number(record.stats?.failures) || 0),
      lastResult: record.stats?.lastResult || null,
    },
  };
}

export class ActivityRegistry {
  constructor({ seed = [], store = null, sceneStyle = 'original', similarThreshold = 0.75 } = {}) {
    this.sceneStyle = sceneStyle;
    this.store = store;
    this.similarThreshold = similarThreshold;
    this.records = new Map();
    for (const record of seed) this._set(record, false);
    for (const record of store?.list?.(sceneStyle) || []) {
      const seeded = this.records.get(record.id);
      if (seeded?.origin === 'curated') {
        this._set({ ...seeded, stats: record.stats || seeded.stats }, false);
      } else {
        this._set(record, false);
      }
    }
  }

  list({ status = null } = {}) {
    return [...this.records.values()]
      .filter(record => !status || record.status === status)
      .map(clone);
  }

  get(id) {
    return clone(this.records.get(id) || null);
  }

  findReadyByType(type) {
    return clone([...this.records.values()].find(record => record.status === READY_STATUS && record.type === type) || null);
  }

  findReadyByConcept(type, concept) {
    const normalized = normalizeConcept(concept);
    if (!normalized) return null;
    return clone([...this.records.values()].find(record => (
      record.status === READY_STATUS
      && record.type === type
      && normalizeConcept(record.plan?.concept || record.title) === normalized
    )) || null);
  }

  resolve(intent, { readyOnly = true } = {}) {
    const normalizedIntent = normalizeActivityRegistration({
      ...intent,
      id: 'activity.intent',
      status: 'draft',
      sceneStyle: this.sceneStyle,
    }, { sceneStyle: this.sceneStyle });
    const candidates = [...this.records.values()].filter(record => (
      record.sceneStyle === this.sceneStyle && (!readyOnly || record.status === READY_STATUS)
    ));
    const exact = candidates.find(record => record.canonicalKey === normalizedIntent.canonicalKey);
    if (exact) return { match: 'exact', score: 1, record: clone(exact) };
    const ranked = candidates
      .map(record => ({ record, score: activitySimilarity(normalizedIntent, record) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best && best.score >= this.similarThreshold) {
      return { match: 'similar', score: best.score, record: clone(best.record) };
    }
    return { match: 'none', score: best?.score || 0, record: null };
  }

  register(record) {
    const normalized = normalizeActivityRegistration(record, { sceneStyle: this.sceneStyle });
    const previous = this.records.get(normalized.id);
    this.records.set(normalized.id, normalized);
    try {
      this.store?.replaceScene?.(this.sceneStyle, [...this.records.values()]);
    } catch (error) {
      if (previous) this.records.set(normalized.id, previous);
      else this.records.delete(normalized.id);
      throw error;
    }
    return clone(normalized);
  }

  createDraft(plan, { similar = null, id = null } = {}) {
    const signature = createActivitySignature(plan);
    return this.register({
      id: id || `activity.${signature.family}.${signature.hash}.v1`,
      status: 'draft',
      origin: similar ? 'ai_derived' : 'player_created',
      sceneStyle: this.sceneStyle,
      type: plan.type,
      title: plan.title,
      concept: plan.concept,
      derivedFrom: similar?.id || null,
      plan,
      layout: similar?.layout || {},
      assets: similar?.assets || {},
      provenance: { createdAt: Date.now() },
    });
  }

  markReady(id, patch = {}) {
    const current = this.records.get(id);
    if (!current) throw new TypeError(`Unknown activity registration: ${id}`);
    return this.register({
      ...current,
      ...patch,
      id,
      revision: current.revision + 1,
      status: READY_STATUS,
      provenance: {
        ...current.provenance,
        ...patch.provenance,
        verifiedAt: patch.provenance?.verifiedAt || Date.now(),
      },
    });
  }

  recordRun(id, result = 'completed') {
    const current = this.records.get(id);
    if (!current) return null;
    const failed = ['failed', 'gather-timeout'].includes(result);
    const completed = ['completed', 'host-ended', 'auto-completed'].includes(result);
    return this.register({
      ...current,
      stats: {
        ...current.stats,
        runs: current.stats.runs + (completed ? 1 : 0),
        failures: current.stats.failures + (failed ? 1 : 0),
        lastResult: result,
      },
    });
  }

  _set(record, persist) {
    const normalized = normalizeActivityRegistration(record, { sceneStyle: this.sceneStyle });
    if (normalized.sceneStyle !== this.sceneStyle) return null;
    this.records.set(normalized.id, normalized);
    if (persist) this.store?.replaceScene?.(this.sceneStyle, [...this.records.values()]);
    return normalized;
  }
}

export const ACTIVITY_REGISTRATION_STATUSES = Object.freeze([...REGISTRATION_STATUSES]);
