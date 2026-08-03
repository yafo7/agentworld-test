function horizontalDistanceSquared(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export class WorldObjectRegistry {
  constructor(initial = []) {
    this.items = [];
    this.listeners = new Set();
    this.metadata = new WeakMap();
    for (const entity of initial) this.add(entity);
  }

  add(entity, metadata = {}) {
    if (entity && !this.items.includes(entity)) {
      this.items.push(entity);
      this.metadata.set(entity, metadata);
      this._emit({ type: 'added', entity, metadata });
    } else if (entity) {
      this.updateMetadata(entity, metadata);
    }
    return entity;
  }

  remove(entity) {
    const index = this.items.indexOf(entity);
    if (index >= 0) {
      const metadata = this.getMetadata(entity);
      this.items.splice(index, 1);
      this.metadata.delete(entity);
      this._emit({ type: 'removed', entity, metadata });
    }
    return index >= 0;
  }

  getMetadata(entity) {
    return this.metadata.get(entity) || {};
  }

  updateMetadata(entity, patch = {}) {
    const metadata = { ...this.getMetadata(entity), ...patch };
    if (entity) {
      this.metadata.set(entity, metadata);
      this._emit({ type: 'updated', entity, metadata, patch });
    }
    return metadata;
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit(event) {
    for (const listener of this.listeners) listener(event);
  }

  findById(id) {
    return this.items.find((item) => item.id === id || item._instanceId === id) || null;
  }

  findByName(name) {
    return this.items.find((item) => item.name === name || item._petName === name) || null;
  }

  query(predicate) {
    return this.items.filter(predicate);
  }

  nearest(position, { range = Infinity, predicate = null } = {}) {
    let result = null;
    let bestDistanceSquared = range * range;
    for (const item of this.items) {
      if (predicate && !predicate(item)) continue;
      const itemPosition = item.mesh?.position || item.position || item.getPosition?.();
      if (!itemPosition) continue;
      const distanceSquared = horizontalDistanceSquared(position, itemPosition);
      if (distanceSquared <= bestDistanceSquared) {
        result = item;
        bestDistanceSquared = distanceSquared;
      }
    }
    return result ? { item: result, distance: Math.sqrt(bestDistanceSquared) } : null;
  }

  isOccupied(position, minDistance, predicate = null) {
    return !!this.nearest(position, { range: minDistance, predicate });
  }
}
