export class ActivityReservationService {
  constructor() {
    this.owners = new Map();
    this.activityResources = new Map();
  }

  tryReserve(activityId, resources) {
    if (!activityId) throw new TypeError('Activity id is required');
    const requested = [...new Set((resources || []).filter(Boolean))];
    const conflicts = requested
      .map(resource => ({ resource, owner: this.owners.get(resource) }))
      .filter(entry => entry.owner && entry.owner !== activityId);
    if (conflicts.length) return { ok: false, conflicts };

    const owned = this.activityResources.get(activityId) || new Set();
    for (const resource of requested) {
      this.owners.set(resource, activityId);
      owned.add(resource);
    }
    this.activityResources.set(activityId, owned);
    return { ok: true, resources: [...owned] };
  }

  release(activityId) {
    const resources = this.activityResources.get(activityId);
    if (!resources) return [];
    for (const resource of resources) {
      if (this.owners.get(resource) === activityId) this.owners.delete(resource);
    }
    this.activityResources.delete(activityId);
    return [...resources];
  }

  ownerOf(resource) {
    return this.owners.get(resource) || null;
  }

  isReserved(resource) {
    return this.owners.has(resource);
  }
}
