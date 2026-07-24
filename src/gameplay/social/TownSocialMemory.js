export class TownSocialMemory {
  constructor({ recentLimit = 8 } = {}) {
    this.recentLimit = recentLimit;
    this.sequence = 0;
    this.started = new Map();
    this.completed = new Map();
    this.recent = [];
  }

  recordStarted(type, initiatorId = null) {
    this.sequence += 1;
    this.started.set(type, (this.started.get(type) || 0) + 1);
    return { sequence: this.sequence, type, initiatorId, outcome: 'started' };
  }

  recordCompleted(type, { initiatorId = null, outcome = 'completed' } = {}) {
    this.sequence += 1;
    const entry = { sequence: this.sequence, type, initiatorId, outcome };
    if (outcome === 'completed' || outcome === 'host-ended' || outcome === 'auto-completed') {
      this.completed.set(type, (this.completed.get(type) || 0) + 1);
    }
    this.recent.unshift(entry);
    this.recent.length = Math.min(this.recent.length, this.recentLimit);
    return entry;
  }

  completedCount(type) {
    return this.completed.get(type) || 0;
  }

  lastSequence(type) {
    return this.recent.find(entry => entry.type === type)?.sequence ?? -1;
  }

  wasRecent(type, depth = 2) {
    return this.recent.slice(0, depth).some(entry => entry.type === type);
  }

  snapshot() {
    return {
      sequence: this.sequence,
      completed: Object.fromEntries(this.completed),
      recent: this.recent.map(entry => ({ ...entry })),
    };
  }
}
