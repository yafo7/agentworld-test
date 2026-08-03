export class ActivityReservationService {
  constructor() {
    this.owners = new Map();
    this.reservationResources = new Map();
  }

  tryReserve(ownerId, resources) {
    if (!ownerId) throw new TypeError('Reservation owner id is required');
    const requested = [...new Set((resources || []).filter(Boolean))];
    const conflicts = requested
      .map(resource => ({ resource, owner: this.owners.get(resource) }))
      .filter(entry => entry.owner && entry.owner !== ownerId);
    if (conflicts.length) return { ok: false, conflicts };

    const owned = this.reservationResources.get(ownerId) || new Set();
    for (const resource of requested) {
      this.owners.set(resource, ownerId);
      owned.add(resource);
    }
    this.reservationResources.set(ownerId, owned);
    return { ok: true, resources: [...owned] };
  }

  release(ownerId) {
    const resources = this.reservationResources.get(ownerId);
    if (!resources) return [];
    for (const resource of resources) {
      if (this.owners.get(resource) === ownerId) this.owners.delete(resource);
    }
    this.reservationResources.delete(ownerId);
    return [...resources];
  }

  ownerOf(resource) {
    return this.owners.get(resource) || null;
  }

  isReserved(resource) {
    return this.owners.has(resource);
  }

  clear() {
    const released = [...this.owners.keys()];
    this.owners.clear();
    this.reservationResources.clear();
    return released;
  }

  dispose() {
    this.clear();
  }
}
