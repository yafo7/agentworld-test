// Voxel Studio (local 3d-generate studio) integration for Chii Island.
// Bridges models created in the studio UI into the in-game model library.
// Uses the Vite proxy `/studio` -> `http://localhost:8000`.

const STUDIO_BASE = '/studio';

/**
 * Fetch the list of models saved in the local Voxel Studio.
 * Endpoint: GET /studio/api/models
 * @returns {Promise<Array>}
 */
export async function fetchStudioAssets() {
  try {
    const resp = await fetch(`${STUDIO_BASE}/api/models`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const commits = data.commits || [];

    const assets = [];
    for (const commit of commits) {
      const hash = commit.hash;
      const models = commit.models || [];
      for (const model of models) {
        assets.push({
          source: 'studio',
          assetType: 'voxel',
          assetId: `${hash}/${model.folder}`,
          name: model.name || '未命名',
          displayName: model.name || '未命名',
          commit: hash,
          folder: model.folder,
          description: model.description || '',
          category: 'decor',
          tags: model.description ? [model.description.slice(0, 40)] : [],
          hasIdleAnimation: true, // we will try to load animations on demand
        });
      }
    }

    console.log(`[StudioLibrary] Loaded ${assets.length} models from Voxel Studio`);
    return assets;
  } catch (err) {
    console.warn('[StudioLibrary] Failed to load studio models:', err.message);
    return [];
  }
}

/**
 * Load a single model JSON from the studio.
 * Endpoint: GET /studio/api/model/{commit}/{folder}
 * @param {string} commit
 * @param {string} folder
 * @returns {Promise<Object|null>}
 */
export async function loadStudioModel(commit, folder) {
  try {
    const url = `${STUDIO_BASE}/api/model/${encodeURIComponent(commit)}/${encodeURIComponent(folder)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.warn('[StudioLibrary] Failed to load studio model:', err.message);
    return null;
  }
}

/**
 * Load animations associated with a studio model.
 * Endpoint: GET /studio/api/animations/{commit}/{folder}
 * @param {string} commit
 * @param {string} folder
 * @returns {Promise<Array>}
 */
export async function loadStudioAnimations(commit, folder) {
  try {
    const url = `${STUDIO_BASE}/api/animations/${encodeURIComponent(commit)}/${encodeURIComponent(folder)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.animations || []).map((anim) => ({
      ...anim,
      plan: anim.plan || anim.animation || anim,
    }));
  } catch (err) {
    console.warn('[StudioLibrary] Failed to load studio animations:', err.message);
    return [];
  }
}

/**
 * Resolve a studio asset into model JSON + optional idle animation plan.
 * @param {Object} asset — asset object from fetchStudioAssets
 * @returns {Promise<{modelJson: Object|null, animPlan: Object|null}>}
 */
export async function getStudioAsset(asset) {
  if (!asset || asset.source !== 'studio') return { modelJson: null, animPlan: null };
  const modelJson = await loadStudioModel(asset.commit, asset.folder);
  if (!modelJson) return { modelJson: null, animPlan: null };

  const anims = await loadStudioAnimations(asset.commit, asset.folder);
  // Prefer an animation whose name contains "idle", otherwise take the first one.
  const anim =
    anims.find((a) => /idle|待机|空闲/i.test(a.name || '')) || anims[0] || null;
  const animPlan = anim?.plan || null;

  return { modelJson, animPlan };
}
