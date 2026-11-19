import { CHII_MAIN_WORLD_ID } from './worldForgeWorlds.js';

export const CHII_ACTIVE_WORLD_STORAGE_KEY = 'chii-active-world-v1';
export const CHII_NEXT_WORLD_STORAGE_KEY = 'chii-next-world-v1';

export function getActiveWorldId(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(CHII_ACTIVE_WORLD_STORAGE_KEY) || CHII_MAIN_WORLD_ID;
  } catch {
    return CHII_MAIN_WORLD_ID;
  }
}

export function consumeActiveWorldId(
  storage = globalThis.localStorage,
  transitionStorage = globalThis.sessionStorage,
) {
  let nextWorldId = null;
  try {
    nextWorldId = transitionStorage?.getItem(CHII_NEXT_WORLD_STORAGE_KEY);
    transitionStorage?.removeItem(CHII_NEXT_WORLD_STORAGE_KEY);
  } catch {}
  const normalized = String(nextWorldId || CHII_MAIN_WORLD_ID);
  try {
    storage?.setItem(CHII_ACTIVE_WORLD_STORAGE_KEY, normalized);
  } catch {}
  return normalized;
}

export function setActiveWorldId(
  worldId,
  storage = globalThis.localStorage,
  transitionStorage = globalThis.sessionStorage,
) {
  const normalized = String(worldId || CHII_MAIN_WORLD_ID);
  try {
    storage?.setItem(CHII_ACTIVE_WORLD_STORAGE_KEY, normalized);
  } catch {
    // A blocked storage backend must not prevent world switching.
  }
  try {
    transitionStorage?.setItem(CHII_NEXT_WORLD_STORAGE_KEY, normalized);
  } catch {}
  return normalized;
}

export function clearActiveWorldId(storage = globalThis.localStorage) {
  return setActiveWorldId(CHII_MAIN_WORLD_ID, storage);
}
