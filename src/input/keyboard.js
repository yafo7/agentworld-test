// Low-level keyboard state tracking.
// Tracks which keys are currently pressed. Game logic reads state, doesn't receive events.

const keys = {};
const _justPressed = {};
const _consumeQueue = new Set();

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!keys[k]) _justPressed[k] = true; // only on first press, not repeat
  keys[k] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

/** Returns true if the given key is currently held down. Case-insensitive. */
export function isKeyDown(key) {
  return !!keys[key.toLowerCase()];
}

/**
 * Returns true once per key-press edge (keydown, not repeat).
 * The edge is consumed — subsequent calls return false until the next press.
 */
export function consumeKeyPress(key) {
  const k = key.toLowerCase();
  if (_justPressed[k]) {
    delete _justPressed[k];
    return true;
  }
  return false;
}
