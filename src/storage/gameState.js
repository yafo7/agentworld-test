/**
 * Lightweight global state store with pub/sub.
 * Suitable for cross-system state that doesn't belong to a single entity.
 */

const state = {};
const listeners = new Map(); // key -> Set(callback)

export const gameState = {
  /**
   * Set a state value and notify subscribers.
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    const old = state[key];
    state[key] = value;
    const cbs = listeners.get(key);
    if (cbs) cbs.forEach((cb) => cb(value, old, key));
  },

  /**
   * Get a state value.
   * @param {string} key
   * @param {any} defaultValue
   * @returns {any}
   */
  get(key, defaultValue) {
    return key in state ? state[key] : defaultValue;
  },

  /**
   * Subscribe to changes on a key.
   * @param {string} key
   * @param {Function} callback — (newValue, oldValue, key) => void
   * @returns {Function} unsubscribe
   */
  subscribe(key, callback) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(callback);
    return () => listeners.get(key)?.delete(callback);
  },

  /**
   * Batch update multiple keys.
   * @param {Object} updates — { key: value, ... }
   */
  batch(updates) {
    Object.entries(updates).forEach(([k, v]) => this.set(k, v));
  },

  /**
   * Get a snapshot of all state (for debug/save).
   * @returns {Object}
   */
  snapshot() {
    return { ...state };
  },

  /**
   * Replace entire state (for load/reset).
   * @param {Object} newState
   */
  reset(newState = {}) {
    Object.keys(state).forEach((k) => delete state[k]);
    this.batch(newState);
  },
};
