/**
 * Chii Island — demo-specific configuration.
 * ⚠️ 2026-07-01: All entity placements removed. Only terrain grid + player remain.
 * Models will be re-created via Voxel Studio and placed through the editor.
 */

import { createUnitEnvironment, getGridWorldPosition } from '../../engine';
import { createLights, ThirdPersonCamera, createRenderer, createScene } from '../../engine';

export const ENV_SPACING = 23;

// Single center environment — no environment model, just terrain grid
export const envGridConfigs = [
  { name: '玛扣大森林', center: [0, 0] },
];

// Entity placements — cleared. New models will be placed via the editor.
export const centerLayout = [];

// Pet house configurations — cleared. New pets will be configured after studio models are ready.
export const houseConfigs = [];
