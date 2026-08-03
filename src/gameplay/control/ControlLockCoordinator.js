export class ControlLockCoordinator {
  constructor() {
    this.owners = new Map();
  }

  set(owner, active, channels = []) {
    if (!owner) throw new TypeError('Control lock owner is required');
    if (!active) {
      this.owners.delete(owner);
      return false;
    }
    this.owners.set(owner, new Set(channels));
    return true;
  }

  release(owner) {
    return this.owners.delete(owner);
  }

  isBlocked(channel) {
    for (const channels of this.owners.values()) {
      if (channels.has(channel) || channels.has('*')) return true;
    }
    return false;
  }

  blockers(channel) {
    return [...this.owners]
      .filter(([, channels]) => channels.has(channel) || channels.has('*'))
      .map(([owner]) => owner);
  }

  clear() {
    this.owners.clear();
  }
}
