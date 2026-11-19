import { createAgentEvent } from './AgentContracts.js';

function clone(value) {
  if (value == null) return value;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function tokens(value) {
  return new Set(String(value || '').toLowerCase().split(/[\s,，。；;、:：|/]+/).filter(Boolean));
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let count = 0;
  for (const item of a) if (b.has(item)) count += 1;
  return count / Math.max(a.size, b.size);
}

function clampSigned(value) {
  return Math.min(1, Math.max(-1, Number(value) || 0));
}

function emptyRelationship() {
  return {
    familiarity: 0,
    affection: 0,
    trust: 0,
    respect: 0,
    tension: 0,
    sharedInterests: [],
    sharedMemoryIds: [],
    lastInteractionAt: null,
  };
}

export class AgentMemory {
  constructor({ residentId, saved = null, episodicLimit = 120 } = {}) {
    if (!residentId) throw new TypeError('AgentMemory requires residentId');
    this.residentId = residentId;
    this.episodicLimit = Math.max(20, Number(episodicLimit) || 120);
    this.episodic = (saved?.episodic || []).map(createAgentEvent);
    this.semanticFacts = clone(saved?.semanticFacts || []);
    this.reflections = clone(saved?.reflections || []);
    this.promises = clone(saved?.promises || []);
    this.relationships = clone(saved?.relationships || {});
    this.workingMemoryIds = [...(saved?.workingMemoryIds || [])].slice(-12);
    this.reflectionPressure = Number(saved?.reflectionPressure) || 0;
  }

  remember(input) {
    const event = createAgentEvent(input);
    const existing = this.episodic.findIndex(item => item.id === event.id);
    if (existing >= 0) this.episodic[existing] = event;
    else this.episodic.push(event);
    if (this.episodic.length > this.episodicLimit) {
      const removable = this.episodic.findIndex(item => item.importance < 0.8);
      this.episodic.splice(removable >= 0 ? removable : 0, 1);
    }
    this.workingMemoryIds.push(event.id);
    this.workingMemoryIds = this.workingMemoryIds.slice(-12);
    this.reflectionPressure += event.importance;
    return clone(event);
  }

  learnFact(fact = {}) {
    const subject = String(fact.subject || '').trim();
    const predicate = String(fact.predicate || '').trim();
    if (!subject || !predicate) throw new TypeError('Semantic fact requires subject and predicate');
    const key = `${subject}:${predicate}`;
    const normalized = {
      id: fact.id || `fact:${key}`,
      subject,
      predicate,
      object: clone(fact.object),
      confidence: Math.min(1, Math.max(0, Number(fact.confidence) || 0.7)),
      sourceMemoryIds: [...new Set(fact.sourceMemoryIds || [])],
      shareable: fact.shareable !== false,
      lastConfirmedAt: Number(fact.lastConfirmedAt) || Date.now(),
    };
    const index = this.semanticFacts.findIndex(item => item.id === normalized.id);
    if (index >= 0) this.semanticFacts[index] = normalized;
    else this.semanticFacts.push(normalized);
    return clone(normalized);
  }

  addReflection(reflection = {}) {
    const record = {
      id: reflection.id || `reflection_${Date.now().toString(36)}`,
      summary: String(reflection.summary || '').slice(0, 300),
      sourceMemoryIds: [...new Set(reflection.sourceMemoryIds || [])],
      tags: [...new Set(reflection.tags || [])],
      at: Number(reflection.at) || Date.now(),
    };
    if (!record.summary) return null;
    this.reflections.push(record);
    this.reflections = this.reflections.slice(-30);
    this.reflectionPressure = 0;
    return clone(record);
  }

  retrieve(query = {}, { limit = 8, now = Date.now() } = {}) {
    const queryTokens = tokens([query.text, ...(query.tags || []), query.goalId].filter(Boolean).join(' '));
    const relatedActors = new Set(query.actors || []);
    return this.episodic.map(event => {
      const eventTokens = tokens([event.summary, ...event.tags].join(' '));
      const relevance = overlap(queryTokens, eventTokens);
      const ageHours = Math.max(0, now - event.at) / 3_600_000;
      const recency = Math.exp(-ageHours / 36);
      const social = event.actors.some(actor => relatedActors.has(actor)) ? 1 : 0;
      const goal = query.goalId && event.tags.includes(query.goalId) ? 1 : 0;
      const score = relevance * 0.3 + event.importance * 0.25 + recency * 0.2 + goal * 0.15 + social * 0.1;
      return { event, score };
    }).sort((a, b) => b.score - a.score).slice(0, limit).map(item => clone(item.event));
  }

  updateRelationship(targetId, delta = {}, { memoryId = null, interests = [] } = {}) {
    const id = String(targetId || '').trim();
    if (!id || id === this.residentId) return null;
    const relationship = { ...emptyRelationship(), ...(this.relationships[id] || {}) };
    for (const key of ['familiarity', 'affection', 'trust', 'respect']) {
      relationship[key] = clampSigned(relationship[key] + (Number(delta[key]) || 0));
    }
    relationship.tension = Math.min(1, Math.max(0, relationship.tension + (Number(delta.tension) || 0)));
    relationship.sharedInterests = [...new Set([...relationship.sharedInterests, ...interests])].slice(0, 20);
    if (memoryId) relationship.sharedMemoryIds = [...new Set([...relationship.sharedMemoryIds, memoryId])].slice(-30);
    relationship.lastInteractionAt = Date.now();
    this.relationships[id] = relationship;
    return clone(relationship);
  }

  getRelationship(targetId) {
    return clone({ ...emptyRelationship(), ...(this.relationships[targetId] || {}) });
  }

  snapshot() {
    return clone({
      workingMemoryIds: this.workingMemoryIds,
      episodic: this.episodic,
      semanticFacts: this.semanticFacts,
      reflections: this.reflections,
      promises: this.promises,
      relationships: this.relationships,
      reflectionPressure: this.reflectionPressure,
    });
  }
}
