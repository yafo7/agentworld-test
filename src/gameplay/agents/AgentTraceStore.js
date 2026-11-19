function clone(value) {
  if (value == null) return value;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export class AgentTraceStore {
  constructor({ limit = 500, now = () => Date.now() } = {}) {
    this.limit = Math.max(20, Number(limit) || 500);
    this.now = now;
    this.entries = [];
    this.sequence = 0;
  }

  append(entry = {}) {
    const record = {
      id: `agent_trace_${++this.sequence}`,
      at: this.now(),
      ...clone(entry),
    };
    this.entries.push(record);
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
    return clone(record);
  }

  list({ residentId = null, type = null } = {}) {
    return clone(this.entries.filter(entry => (
      (!residentId || entry.residentId === residentId) && (!type || entry.type === type)
    )));
  }

  clear() {
    this.entries.length = 0;
  }
}
