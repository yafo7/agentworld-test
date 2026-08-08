function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizePosition(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return {
    x: value.x,
    y: Number.isFinite(value.y) ? value.y : 0,
    z: value.z,
  };
}

function normalizeTarget(value) {
  if (!value || typeof value !== 'object') return null;
  const type = ['pet', 'object', 'position'].includes(value.type) ? value.type : null;
  if (!type) return null;
  const id = String(value.id || '').trim() || null;
  const position = normalizePosition(value.position);
  if (type !== 'position' && !id && !position) return null;
  if (type === 'position' && !position) return null;
  return { type, id, position };
}

function normalizeProjection(ownerId, value, order) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const target = normalizeTarget(value.target);
  if (!id || !target) return null;
  const progress = value.progress && Number.isFinite(value.progress.total)
    ? {
        current: Math.max(0, Number(value.progress.current) || 0),
        total: Math.max(1, Number(value.progress.total) || 1),
      }
    : null;
  return {
    id,
    ownerId,
    source: String(value.source || 'gameplay'),
    title: String(value.title || '').trim(),
    label: String(value.label || value.title || id).trim(),
    kind: String(value.kind || 'visit'),
    target,
    trigger: value.trigger === 'interact' ? 'interact' : 'proximity',
    radius: Math.max(0, Number(value.radius) || 0),
    progress,
    priority: Number(value.priority) || 0,
    status: 'active',
    _order: order,
  };
}

export class ObjectiveProjectionStore {
  constructor() {
    this.entries = new Map();
    this.listeners = new Set();
    this.order = 0;
    this.disposed = false;
  }

  publish(ownerId, projection) {
    if (this.disposed) return null;
    const owner = String(ownerId || '').trim();
    if (!owner) throw new TypeError('Objective projection requires an owner id');
    const normalized = normalizeProjection(owner, projection, ++this.order);
    if (!normalized) throw new TypeError('Objective projection requires an id and valid target');
    this.entries.set(owner, normalized);
    this._emit();
    return this.getCurrent();
  }

  clear(ownerId) {
    if (this.disposed) return false;
    const removed = this.entries.delete(String(ownerId || '').trim());
    if (removed) this._emit();
    return removed;
  }

  getCurrent() {
    const current = [...this.entries.values()].sort((a, b) => (
      b.priority - a.priority || b._order - a._order
    ))[0];
    if (!current) return null;
    const copy = clone(current);
    delete copy._order;
    return copy;
  }

  subscribe(listener, { emitCurrent = true } = {}) {
    if (typeof listener !== 'function') throw new TypeError('Objective listener must be a function');
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    if (emitCurrent) listener(this.getCurrent());
    return () => this.listeners.delete(listener);
  }

  _emit() {
    const current = this.getCurrent();
    for (const listener of this.listeners) listener(current);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.entries.clear();
    this.listeners.clear();
  }
}
