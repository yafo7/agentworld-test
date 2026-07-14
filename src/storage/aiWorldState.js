const STORAGE_KEY = 'chii-ai-world-state';
const VERSION = 1;
let state = { version: VERSION, events: [] };

// AI-created scene state is session-only. Remove snapshots written by older builds.
try {
  globalThis.localStorage?.removeItem(STORAGE_KEY);
} catch (_) {}

function readState() {
  return state;
}

function writeState(nextState) {
  state = nextState;
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
  const events = readState().events;
  return type ? events.filter(event => event.type === type) : events;
}

export function removeAIWorldEvent(id) {
  const state = readState();
  state.events = state.events.filter(event => event.id !== id);
  writeState(state);
}

export function clearAIWorldEvents() {
  state = { version: VERSION, events: [] };
}
