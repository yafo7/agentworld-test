const STORAGE_KEY = 'chii-ai-world-state';
const VERSION = 1;
let state = { version: VERSION, events: [] };
const listeners = new Set();

// The live event list stays in memory. ChiiScenePersistenceSystem snapshots and
// restores it per scene style; this old standalone key is intentionally retired.
try {
  globalThis.localStorage?.removeItem(STORAGE_KEY);
} catch (_) {}

function readState() {
  return state;
}

function writeState(nextState) {
  state = nextState;
  const snapshot = getAIWorldEvents();
  for (const listener of listeners) listener(snapshot);
}

export function recordAIWorldEvent(event) {
  if (!event?.id || !event?.type) return;
  const state = readState();
  const next = { ...event, updatedAt: Date.now() };
  const index = state.events.findIndex(item => item.id === event.id);
  if (index >= 0) state.events[index] = next;
  else state.events.push(next);
  writeState(state);
}

export function getAIWorldEvents(type = null) {
  const events = readState().events.map(event => ({ ...event }));
  return type ? events.filter(event => event.type === type) : events;
}

export function removeAIWorldEvent(id) {
  const state = readState();
  state.events = state.events.filter(event => event.id !== id);
  writeState(state);
}

export function clearAIWorldEvents() {
  state = { version: VERSION, events: [] };
  writeState(state);
}

export function replaceAIWorldEvents(events = []) {
  const nextEvents = Array.isArray(events)
    ? events.filter(event => event?.id && event?.type).map(event => ({ ...event }))
    : [];
  writeState({ version: VERSION, events: nextEvents });
  return getAIWorldEvents();
}

export function onAIWorldEventsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
