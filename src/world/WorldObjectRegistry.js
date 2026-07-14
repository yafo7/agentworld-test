function horizontalDistanceSquared(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export class WorldObjectRegistry {
  constructor(initial = []) {
    this.items = initial;
  }

  add(entity) {
    if (entity && !this.items.includes(entity)) this.items.push(entity);
    return entity;
  }

  remove(entity) {
    const index = this.items.indexOf(entity);
    if (index >= 0) this.items.splice(index, 1);
    return index >= 0;
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

