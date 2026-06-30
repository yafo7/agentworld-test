import { assetCache } from '../../storage/assetCache.js';
import { buildModelFromJson } from './builder.js';

/**
 * Load a model JSON from path and build a Three.js object.
 * Integrates with assetCache to avoid redundant fetch() calls.
 *
 * @param {string} modelPath — path relative to public root (e.g. 'generated/models/xxx.json')
 * @param {THREE.Object3D|null} fallbackMesh — mesh to return on failure
 * @returns {Promise<THREE.Object3D|null>}
 */
export async function loadModel(modelPath, fallbackMesh = null) {
  try {
    const modelJson = await assetCache.load(modelPath, async (path) => {
      const resp = await fetch(`/${path}`);
      if (!resp.ok) {
        console.warn(`[ModelLoader] ${path} not found (${resp.status})`);
        return null;
      }
      return resp.json();
    });

    if (!modelJson) return fallbackMesh;
    const mesh = buildModelFromJson(modelJson);
    mesh.userData.modelJson = modelJson;
    return mesh;
  } catch (err) {
    console.warn(`[ModelLoader] Failed to load ${modelPath}:`, err.message);
    return fallbackMesh;
  }
}
