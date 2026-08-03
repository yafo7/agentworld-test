import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedRoot = path.join(root, 'public/generated');
const historyRoot = path.join(generatedRoot, 'history/2026-07-28-gpt56-reset');
const targetRoot = path.join(generatedRoot, 'scenes/original');

const MODEL_NAMES = Object.freeze([
  'nailong',
  'oak',
  'normal_tree',
  'apple_tree',
  'glowgrass',
  'pink_flower',
  'grass_clump',
  'trumpet_flower',
  'blue_tulips',
  'wheat_field',
  'flower_pot',
  'giant_carrot',
  'windmill',
  'church',
  'temple',
  'town_stone_bridge',
  'church_pew',
  'church_altar',
  'church_angel_statue',
  'stump',
  'campfire',
  'forest_temple_trophy',
  'forest_temple_tent',
  'pastoral_work_scaffold',
  'fangk',
  'momo',
  'mako',
  'mok',
  'lingq',
  'yafo',
  'crab',
]);

const ANIMATION_NAMES = Object.freeze([
  'nailong_idle',
  'nailong_walk',
  'nailong_run',
  'nailong_jump',
  'nailong_wave_left',
  'nailong_fan_spark',
  'campfire_burn',
  'forest_trophy_wait',
  'pastoral_work_scaffold_dust',
  'fangk_idle',
  'fangk_run',
  'fangk_construct',
  'fangk_dance',
  'momo_idle',
  'momo_walk',
  'momo_run',
  'momo_chop',
  'momo_smash',
  'momo_wave',
  'momo_magic',
  'mako_idle',
  'mako_run',
  'mako_jump',
  'mako_dance',
  'mok_idle',
  'mok_run',
  'mok_jump',
  'lingq_idle',
  'lingq_run',
  'lingq_jump',
  'lingq_dance',
  'yafo_idle',
  'yafo_run',
  'yafo_jump',
  'crab_idle',
  'crab_walk',
  'crab_run',
  'crab_jump',
  'crab_construct',
  'crab_dance',
]);

// This is the environment override table used by the default Voxel scene
// immediately before the 2026-07-28 reset. Residents and buildings stayed
// on the shared pre-reset assets.
const VOXEL_MODEL_OVERRIDES = new Set([
  'oak',
  'normal_tree',
  'apple_tree',
  'glowgrass',
  'pink_flower',
  'grass_clump',
  'trumpet_flower',
  'blue_tulips',
  'wheat_field',
  'flower_pot',
  'giant_carrot',
  'campfire',
  'pastoral_work_scaffold',
]);

const VOXEL_ANIMATION_OVERRIDES = new Set([
  'campfire_burn',
  'pastoral_work_scaffold_dust',
]);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toProjectPath(filePath) {
  return path.relative(root, filePath).replaceAll('\\', '/');
}

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function resolveSource(kind, name, useVoxelOverride) {
  const fileName = `${name}.json`;
  const historyPath = useVoxelOverride
    ? path.join(historyRoot, 'styles/voxel', kind, fileName)
    : path.join(historyRoot, kind, fileName);
  if (await exists(historyPath)) {
    return { path: historyPath, provenance: 'pre-iteration-backup' };
  }

  const preservedPath = useVoxelOverride
    ? path.join(generatedRoot, 'styles/voxel', kind, fileName)
    : path.join(generatedRoot, kind, fileName);
  if (!await exists(preservedPath)) {
    throw new Error(`Missing Original scene source: ${toProjectPath(preservedPath)}`);
  }
  return {
    path: preservedPath,
    provenance: name === 'town_stone_bridge'
      ? 'compatibility-fallback'
      : 'unchanged-by-reset',
  };
}

async function install(kind, name, useVoxelOverride) {
  const source = await resolveSource(kind, name, useVoxelOverride);
  const target = path.join(targetRoot, kind, `${name}.json`);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source.path, target);
  return {
    kind,
    name,
    provenance: source.provenance,
    source: toProjectPath(source.path),
    sourceSha256: await sha256(source.path),
    target: toProjectPath(target),
  };
}

const assets = [];
for (const name of MODEL_NAMES) {
  assets.push(await install('models', name, VOXEL_MODEL_OVERRIDES.has(name)));
}
for (const name of ANIMATION_NAMES) {
  assets.push(await install('animations', name, VOXEL_ANIMATION_OVERRIDES.has(name)));
}

const manifest = {
  schemaVersion: 2,
  sceneId: 'original',
  label: 'Original',
  freezeBoundary: 'before-2026-07-28-large-iteration',
  boundaryTimestamp: '2026-07-28T09:24:23+08:00',
  sourceSnapshot: 'public/generated/history/2026-07-28-gpt56-reset',
  sourcePolicy: 'pre-reset default Voxel environment with pre-reset shared residents and buildings',
  features: {
    worldWater: false,
    waterLandmarks: false,
    forestBeach: false,
  },
  knownFallbacks: {
    town_stone_bridge: 'The pre-iteration bridge was overwritten before the reset backup ran; retain the current validated bridge while all recoverable scene assets use the exact backup.',
  },
  assets,
};

await writeFile(
  path.join(targetRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(`[OriginalScene] Rebuilt ${assets.length} assets from the pre-iteration boundary.`);
