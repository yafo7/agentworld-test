import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHII_STORY_DEVELOPMENT_BASELINE } from '../src/demos/chii-island/story/storyDevelopmentBaseline.js';
import {
  DEFAULT_CHII_SCENE_STYLE,
  getChiiSceneProfile,
} from '../src/demos/chii-island/data/sceneStyle.js';
import { createChiiAssetCatalog } from '../src/demos/chii-island/data/assetCatalog.js';

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function stableTextSha256(text) {
  const normalized = String(text).replace(/\r\n?/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function sha256(path) {
  return stableTextSha256(readFileSync(path, 'utf8'));
}

export function verifyChiiStoryBaseline() {
  const baseline = CHII_STORY_DEVELOPMENT_BASELINE;
  const profile = getChiiSceneProfile(baseline.sceneStyle);
  const manifestPath = resolve(workspace, 'public/generated/scenes/original/manifest.json');
  const errors = [];

  if (DEFAULT_CHII_SCENE_STYLE !== baseline.sceneStyle) {
    errors.push(`Default scene is ${DEFAULT_CHII_SCENE_STYLE}, expected ${baseline.sceneStyle}`);
  }
  if (profile.snapshotId !== baseline.sceneSnapshotId) {
    errors.push(`Original snapshot is ${profile.snapshotId}, expected ${baseline.sceneSnapshotId}`);
  }
  if (!existsSync(manifestPath)) {
    errors.push('Original scene manifest is missing');
    return { baseline, errors, assetCount: 0 };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.freezeBoundary !== baseline.sceneSnapshotId) {
    errors.push(`Manifest boundary is ${manifest.freezeBoundary}, expected ${baseline.sceneSnapshotId}`);
  }

  for (const asset of manifest.assets || []) {
    const target = resolve(workspace, asset.target);
    if (!existsSync(target)) {
      errors.push(`Missing frozen asset: ${asset.target}`);
    } else if (asset.sourceSha256 && sha256(target) !== asset.sourceSha256) {
      errors.push(`Frozen asset changed: ${asset.target}`);
    }
  }

  const catalog = createChiiAssetCatalog('original');
  for (const residentId of baseline.residentIds) {
    if (!catalog[residentId]?.model) errors.push(`Resident is absent from Original catalog: ${residentId}`);
  }

  return { baseline, errors, assetCount: manifest.assets?.length || 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyChiiStoryBaseline();
  if (result.errors.length > 0) {
    console.error(`[story-baseline] FAILED (${result.errors.length})`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`[story-baseline] OK: ${result.baseline.id}, ${result.assetCount} frozen assets verified`);
  }
}
