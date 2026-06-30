// Voxel Runtime loader — isolates Runtime ESM import and THREE injection.

let voxelRuntime = null;
let runtimePromise = null;

/**
 * Initialize and return the Voxel Studio runtime.
 * Injects THREE via the v2 create({THREE}) API.
 */
export function initRuntime(THREE) {
  if (voxelRuntime) return Promise.resolve(voxelRuntime);
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const three = THREE || window.THREE;
    const mod = await import(`${'/api/voxel'}/api/templates/module.js`);
    // v2 runtime prefers create({THREE}) injection; fall back to global export for older backends
    voxelRuntime = mod.create ? mod.create({ THREE: three }) : mod.voxelStudioRuntime;
    console.log('[Runtime] Voxel Studio runtime loaded');
    return voxelRuntime;
  })();

  return runtimePromise;
}

export function getRuntime() {
  return voxelRuntime;
}

/**
 * Reset runtime (useful for testing or hot-reload scenarios).
 */
export function resetRuntime() {
  voxelRuntime = null;
  runtimePromise = null;
}
