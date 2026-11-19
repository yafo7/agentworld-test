export function behaviorFingerprint(value) {
  const text = JSON.stringify(value ?? null);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

export function entityPosition(entity) {
  const p = entity?.getPosition?.() || entity?.mesh?.position || entity?.position;
  return p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z } : null;
}

/** Facts are local. AI gets bounded summaries and IDs, never scene geometry. */
export class IslandWorldInformation {
  constructor({ registry, getClimate = () => null, getStory = () => null, scope = 'original', now = Date.now }) {
    Object.assign(this, { registry, getClimate, getStory, scope, now });
    this.ids = new WeakMap();
    this.sequence = 0;
    this.revision = 0;
    this.entities = new Map();
    this.snapshot = null;
  }

  describe(entity) {
    const meta = this.registry.getMetadata(entity);
    if (meta.persistenceMode === 'temporary' || ['interior', 'social_event', 'building_draft'].includes(meta.category)) return null;
    const position = entityPosition(entity);
    if (!position) return null;
    let id = entity._chiiSaveId || meta.saveId || entity._instanceId || entity.id;
    if (!id) {
      if (!this.ids.has(entity)) this.ids.set(entity, `place-${++this.sequence}`);
      id = this.ids.get(entity);
    }
    const name = String(meta.name || entity.name || '岛上物品').slice(0, 60);
    const tags = [...new Set([...(entity.tags || []), ...(meta.tags || []), meta.category].filter(Boolean))].map(String).sort();
    const description = String(meta.description || meta.prompt || '').slice(0, 160);
    const text = [name, description, ...tags].join(' ');
    const affordances = ['observe'];
    if (/树|tree|grove|shade/i.test(text)) affordances.push('shade', 'rest', 'gather');
    if (/咖啡|cafe|café|coffee|长椅|bench/i.test(text)) affordances.push('rest', 'gather');
    const fact = { id: String(id), name, tags: tags.slice(0, 12), description, affordances, position,
      region: meta.region || entity._region || null,
      shapeRevision: behaviorFingerprint({ asset: meta.assetId, placement: meta.placement, transform: meta.transform }) };
    return { ...fact, version: behaviorFingerprint(fact) };
  }

  refresh(trigger = 'periodic') {
    const previous = this.snapshot;
    this.entities.clear();
    const objects = [];
    for (const entity of this.registry.items) {
      const fact = this.describe(entity);
      if (!fact) continue;
      this.entities.set(fact.id, entity);
      objects.push(fact);
    }
    objects.sort((a, b) => a.id.localeCompare(b.id));
    const climate = this.getClimate();
    const story = this.getStory();
    const facts = { scope: this.scope, objects, climate: { weather: climate?.weather?.type || null, hour: Math.floor(climate?.time?.hour ?? 12), month: climate?.time?.month ?? null }, story: { islandDay: story?.islandDay || 1, chapter: story?.chapter || null } };
    const fingerprint = behaviorFingerprint(facts);
    const changed = !previous || previous.fingerprint !== fingerprint;
    if (changed) this.revision += 1;
    const old = new Map(previous?.objects.map(o => [o.id, o]) || []);
    const events = objects.filter(o => old.get(o.id)?.version !== o.version).map(o => ({ type: old.has(o.id) ? 'changed' : 'added', id: o.id, name: o.name }));
    const ids = new Set(objects.map(o => o.id));
    for (const o of old.values()) if (!ids.has(o.id)) events.push({ type: 'removed', id: o.id, name: o.name });
    this.snapshot = { ...facts, revision: this.revision, fingerprint, trigger, at: this.now(), events: events.slice(-32) };
    return { changed, snapshot: this.snapshot };
  }

  resolve(id) { return this.entities.get(id) || null; }

  current(id, version) {
    const entity = this.resolve(id);
    return !!entity && this.registry.items.includes(entity) && this.describe(entity)?.version === version;
  }

  publicSnapshot() {
    const s = this.snapshot;
    if (!s) return null;
    // Resting places first; totals still include objects beyond the detail limit.
    const groups = [s.objects.filter(o => o.affordances.includes('rest') && !o.affordances.includes('shade')), s.objects.filter(o => o.affordances.includes('shade')), s.objects.filter(o => !o.affordances.includes('rest'))];
    const ordered = [];
    for (let i = 0; ordered.length < 80 && groups.some(g => i < g.length); i += 1) for (const group of groups) if (group[i] && ordered.length < 80) ordered.push(group[i]);
    return { scope: s.scope, revision: s.revision, trigger: s.trigger, climate: s.climate, story: s.story, events: s.events,
      totals: { objects: s.objects.length, shade: s.objects.filter(o => o.affordances.includes('shade')).length, restingPlaces: s.objects.filter(o => o.affordances.includes('rest')).length },
      objects: ordered.slice(0, 80).map(({ position, ...o }) => o) };
  }
}
