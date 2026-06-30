import { assetCache } from '../../storage/assetCache.js';

/**
 * Load an animation motion plan JSON from path.
 * Integrates with assetCache to avoid redundant fetch() calls.
 *
 * @param {string} animPath — path relative to public root
 * @returns {Promise<object|null>}
 */
export async function loadAnimationPlan(animPath) {
  try {
    return await assetCache.load(animPath, async (path) => {
      const resp = await fetch(`/${path}`);
      if (!resp.ok) return null;
      return resp.json();
    });
  } catch (err) {
    console.warn(`[AnimationPlanLoader] ${animPath} failed:`, err.message);
    return null;
  }
}
