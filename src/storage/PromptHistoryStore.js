import { PromptHistoryPort } from '../ports/PromptHistoryPort.js';

const STORAGE_PREFIX = 'chii_prompt_history_v1';

function clone(value) {
  if (value == null) return value;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

export class PromptHistoryStore extends PromptHistoryPort {
  constructor({ storage = globalThis.localStorage || memoryStorage(), scope = 'original', limit = 160 } = {}) {
    super();
    this.storage = storage;
    this.scope = scope;
    this.limit = Math.max(20, Number(limit) || 160);
  }

  append(record) {
    const records = this.list();
    const snapshot = clone({ ...record, recordedAt: record.recordedAt || new Date().toISOString() });
    const index = records.findIndex(item => item.id === snapshot.id);
    if (index >= 0) records[index] = { ...records[index], ...snapshot };
    else records.push(snapshot);
    this.storage.setItem(this._key(), JSON.stringify(records.slice(-this.limit)));
    return clone(snapshot);
  }

  list({ operation = null, status = null } = {}) {
    let records = [];
    try {
      const parsed = JSON.parse(this.storage.getItem(this._key()) || '[]');
      records = Array.isArray(parsed) ? parsed : [];
    } catch {
      records = [];
    }
    return clone(records.filter(record => (
      (!operation || record.operation === operation) && (!status || record.status === status)
    )));
  }

  addFeedback(receiptId, feedback = {}) {
    const records = this.list();
    const record = records.find(item => item.id === receiptId || item.receiptId === receiptId);
    if (!record) return null;
    record.feedback = {
      accepted: feedback.accepted !== false,
      reasons: [...new Set((feedback.reasons || []).map(String).filter(Boolean))].slice(0, 8),
      note: String(feedback.note || '').slice(0, 240),
      recordedAt: new Date().toISOString(),
    };
    this.storage.setItem(this._key(), JSON.stringify(records.slice(-this.limit)));
    return clone(record);
  }

  clear() {
    this.storage.removeItem(this._key());
  }

  _key() {
    return `${STORAGE_PREFIX}:${this.scope}`;
  }
}

export { STORAGE_PREFIX as PROMPT_HISTORY_STORAGE_PREFIX };
