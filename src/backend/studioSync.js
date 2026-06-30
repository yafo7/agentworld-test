// Sync agentworld generated models to local 3d-generate studio (localhost:8000).
// This lets the studio viewer (http://localhost:8000 / batch_viewer.html) browse
// all models that exist in agentworld's public/generated/ directory.

const STUDIO_URL = 'http://localhost:8000';

/**
 * Save a single model to the local 3d-generate studio.
 *
 * @param {object} modelJson — v2 model JSON
 * @param {string} name — model display name
 * @param {string} [description='']
 * @returns {Promise<object|null>}
 */
export async function saveModelToStudio(modelJson, name, description = '') {
  try {
    const resp = await fetch(`${STUDIO_URL}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: description || name,
        modelJson,
        timestamp: Date.now(),
      }),
    });
    const data = await resp.json();
    if (data.ok) {
      console.log(`[StudioSync] Saved "${name}" to local studio (${STUDIO_URL})`);
    } else {
      console.warn(`[StudioSync] Failed to save "${name}":`, data.error);
    }
    return data;
  } catch (err) {
    // Studio may be offline — warn once, don't spam
    console.warn(`[StudioSync] ${STUDIO_URL} unreachable — model "${name}" not synced (${err.message})`);
    return null;
  }
}

/**
 * Dev helper: expose a global function so you can sync a loaded model from the
 * browser console, e.g.:
 *   syncModelToStudio(entity.modelJson, entity.name)
 */
export function installGlobalSync() {
  if (typeof window !== 'undefined') {
    window.syncModelToStudio = saveModelToStudio;
    console.log('[StudioSync] Global window.syncModelToStudio() installed for dev use');
  }
}
