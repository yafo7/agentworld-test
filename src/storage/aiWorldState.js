const STORAGE_KEY = 'chii-ai-world-state';
const VERSION = 1;

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: VERSION, events: [] };
    const state = JSON.parse(raw);
    if (state.version !== VERSION || !Array.isArray(state.events)) {
      return { version: VERSION, events: [] };
    }
    return state;
  } catch (_) {
    return { version: VERSION, events: [] };
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[AIWorldState] save failed:', error.message);
  }
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

