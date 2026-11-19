function clone(value) {
  if (value == null) return value;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export class AgentReplayHarness {
  constructor({ limit = 300 } = {}) {
    this.limit = Math.max(20, Number(limit) || 300);
    this.frames = [];
  }

  record(label, snapshot, traceCursor = 0) {
    const frame = { index: this.frames.length, label, snapshot: clone(snapshot), traceCursor };
    this.frames.push(frame);
    if (this.frames.length > this.limit) this.frames.shift();
    return clone(frame);
  }

  export() {
    return clone({ schemaVersion: 1, frames: this.frames });
  }

  replay(visitor) {
    return this.frames.map(frame => visitor(clone(frame)));
  }

  clear() { this.frames.length = 0; }
}
