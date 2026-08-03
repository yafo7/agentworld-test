import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOWN_ACTIVITY_ANIMATION_SPECS,
  TOWN_ACTIVITY_MODEL_SPECS,
  TOWN_ACTIVITY_MOUNT_SPECS,
  activityAnimationPath,
  activityMountPath,
} from '../src/demos/chii-island/data/townActivityAssetSpecs.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const retryMount = process.argv.includes('--retry-mount');
const failures = [];
const subjectPaths = Object.freeze({
  fangk: 'public/generated/scenes/original/models/fangk.json',
  lingq: 'public/generated/scenes/original/models/lingq.json',
  mako: 'public/generated/scenes/original/models/mako.json',
  crab: 'public/generated/scenes/original/models/crab.json',
  apple_tree: 'public/generated/scenes/original/models/apple_tree.json',
  church: 'public/generated/scenes/original/models/church.json',
});

function installBackendFetchProxy() {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    let url = typeof input === 'string' ? input : input?.url;
    if (url?.startsWith('/api/voxel/')) url = `${backendBase}/${url.slice('/api/voxel/'.length)}`;
    return nativeFetch(url, init);
  };
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function writeJson(relativePath, value) {
  const outputPath = path.join(root, relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function withMeta(modelJson, spec, operation) {
  return {
    ...modelJson,
    name: spec.name || modelJson.name || spec.id,
    _meta: {
      ...(modelJson._meta || {}),
      chiiActivityAssetId: spec.id,
      chiiActivityOperation: operation,
      chiiPromptProfile: 'chii-v1',
      chiiSceneStyle: 'original',
      chiiPrompt: spec.prompt || spec.part || null,
    },
  };
}

async function withRetry(label, operation, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`[TownActivity] ${label} attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

installBackendFetchProxy();
const { VoxelContentAdapter } = await import('../src/integrations/content/VoxelContentAdapter.js');
const content = new VoxelContentAdapter();
const generatedModels = new Map();

for (const spec of Object.values(TOWN_ACTIVITY_MODEL_SPECS)) {
  if (!force && await exists(`public/${spec.path}`)) {
    generatedModels.set(spec.id, await readJson(`public/${spec.path}`));
    console.log(`[TownActivity] reuse model ${spec.id}`);
    continue;
  }
  console.log(`[TownActivity] generate model ${spec.id}: ${spec.prompt}`);
  if (dryRun) continue;
  try {
    const result = await withRetry(`model ${spec.id}`, () => content.generateModel({ description: spec.prompt, quality: 'voxel' }));
    const modelJson = withMeta(result.modelJson, spec, 'generate');
    generatedModels.set(spec.id, modelJson);
    await writeJson(`public/${spec.path}`, modelJson);
  } catch (error) {
    failures.push({ id: spec.id, operation: 'generate-model', error: error.message });
  }
}

for (const spec of Object.values(TOWN_ACTIVITY_MOUNT_SPECS)) {
  const output = `public/${activityMountPath(spec.id)}`;
  if (!force && await exists(output)) {
    console.log(`[TownActivity] reuse mount ${spec.id}`);
    continue;
  }
  console.log(`[TownActivity] mount ${spec.id}: ${spec.part} -> ${spec.placement}`);
  if (dryRun) continue;
  try {
    if (spec.knownMountIncompatible && !retryMount) {
      throw new Error('known mount incompatibility; use --retry-mount after a backend update');
    }
    const primaryModelJson = await readJson(subjectPaths[spec.subjectId]);
    const secondary = spec.modelSpecId
      ? generatedModels.get(spec.modelSpecId)
        || await readJson(`public/${Object.values(TOWN_ACTIVITY_MODEL_SPECS).find(item => item.id === spec.modelSpecId).path}`)
      : spec.part;
    const result = await withRetry(`mount ${spec.id}`, () => content.mountPart({
      primaryModelJson,
      part: secondary,
      placement: spec.placement,
    }));
    await writeJson(output, withMeta(result.modelJson, spec, 'mount'));
  } catch (error) {
    if (!spec.fallbackRefine) {
      failures.push({ id: spec.id, operation: 'mount', error: error.message });
      continue;
    }
    console.warn(`[TownActivity] ${spec.id} uses refine fallback after mount incompatibility`);
    try {
      const primaryModelJson = await readJson(subjectPaths[spec.subjectId]);
      const result = await withRetry(`refine fallback ${spec.id}`, () => content.refineModel({
        modelJson: primaryModelJson,
        description: spec.fallbackRefine,
      }), 2);
      await writeJson(output, withMeta(result.modelJson, {
        ...spec,
        prompt: spec.fallbackRefine,
      }, 'mount-refine-fallback'));
    } catch (fallbackError) {
      failures.push({
        id: spec.id,
        operation: 'mount-refine-fallback',
        error: `${error.message}; ${fallbackError.message}`,
      });
    }
  }
}

for (const spec of Object.values(TOWN_ACTIVITY_ANIMATION_SPECS)) {
  const output = `public/${activityAnimationPath(spec.id)}`;
  if (!force && await exists(output)) {
    console.log(`[TownActivity] reuse animation ${spec.id}`);
    continue;
  }
  console.log(`[TownActivity] generate animation ${spec.id}: ${spec.prompt}`);
  if (dryRun) continue;
  let modelJson = null;
  if (spec.subjectId) modelJson = await readJson(subjectPaths[spec.subjectId]);
  if (spec.modelSpecId) {
    modelJson = generatedModels.get(spec.modelSpecId)
      || await readJson(`public/${Object.values(TOWN_ACTIVITY_MODEL_SPECS).find(item => item.id === spec.modelSpecId).path}`);
  }
  try {
    if (!modelJson) throw new Error(`missing model for ${spec.id}`);
    const result = await withRetry(`animation ${spec.id}`, () => content.generateAnimation({
      modelJson,
      description: spec.prompt,
      duration: spec.duration,
      emitParticles: !!spec.emitParticles,
    }));
    await writeJson(output, {
      ...result.plan,
      _duration: spec.duration,
      _loop: spec.loop,
      _meta: {
        ...(result.plan?._meta || {}),
        chiiActivityAssetId: spec.id,
        chiiPromptProfile: 'chii-v1',
        chiiSceneStyle: 'original',
        prompt: spec.prompt,
      },
    });
  } catch (error) {
    failures.push({ id: spec.id, operation: 'generate-animation', error: error.message });
  }
}

if (failures.length) {
  console.error(`[TownActivity] ${failures.length} assets failed:`);
  for (const failure of failures) console.error(JSON.stringify(failure));
  process.exitCode = 1;
} else {
  console.log(`[TownActivity] ${dryRun ? 'dry-run complete' : 'asset preparation complete'}`);
}
