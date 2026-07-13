// Voxel Runtime loader — isolates Runtime ESM import and THREE injection.

import { createLocalVoxelRuntime } from './localVoxelRuntime.js';

let voxelRuntime = null;
let runtimePromise = null;

const REMOTE_RUNTIME_TIMEOUT_MS = 4000;

function timeoutAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`runtime request timed out after ${ms}ms`)), ms);
  });
}

/**
 * Initialize and return the Voxel Studio runtime.
 * Injects THREE via the v2 create({THREE}) API.
 */
export function initRuntime(THREE) {
  if (voxelRuntime) return Promise.resolve(voxelRuntime);
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const three = THREE || window.THREE;
    try {
      const mod = await Promise.race([
        import(`${'/api/voxel'}/api/templates/module.js`),
        timeoutAfter(REMOTE_RUNTIME_TIMEOUT_MS),
      ]);
      voxelRuntime = mod.create ? mod.create({ THREE: three }) : mod.voxelStudioRuntime;
      console.log('[Runtime] Voxel Studio runtime loaded');
    } catch (error) {
      voxelRuntime = createLocalVoxelRuntime();
      console.warn('[Runtime] Remote runtime unavailable; using bundled runtime:', error.message);
    }
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
