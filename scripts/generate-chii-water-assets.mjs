import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const force = process.argv.includes('--force');

const assets = Object.freeze([
  {
    id: 'island_waterfall',
    name: '森林瀑布',
    prompt: '三层灰岩森林瀑布，宽蓝色水帘，底部浅水潭，完整岩石底座',
    footprint: { width: 3, depth: 2 },
    requiredWaterTags: ['fall', 'pool'],
  },
  {
    id: 'town_fountain',
    name: '小镇喷泉',
    prompt: '圆形白石小镇喷泉，中央三股水柱，双层水池，矮石底座',
    footprint: { width: 2, depth: 2 },
    requiredWaterTags: ['fall', 'pool'],
  },
]);

function installBackendFetchProxy() {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    let url = typeof input === 'string' ? input : input?.url;
    if (url?.startsWith('/api/voxel/')) url = `${backendBase}/${url.slice('/api/voxel/'.length)}`;
    return nativeFetch(url, init);
  };
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

function waterTagValues(modelJson) {
  const values = new Set();
  for (const node of modelJson?.nodes || []) {
    for (const tag of node.tags || []) {
      if (tag?.tag === 'water') values.add(tag.value);
    }
  }
  return values;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

installBackendFetchProxy();
const { VoxelContentAdapter } = await import('../src/integrations/content/VoxelContentAdapter.js');
const content = new VoxelContentAdapter();

for (const asset of assets) {
  const outputPath = path.join(root, 'public/generated/models', `${asset.id}.json`);
  if (!force && await exists(outputPath)) {
    console.log(`[WaterAsset:${asset.id}] reuse`);
    continue;
  }
  console.log(`[WaterAsset:${asset.id}] ${asset.prompt}`);
  const result = await content.generateModel({ description: asset.prompt, quality: 'voxel' });
  const tags = waterTagValues(result.modelJson);
  const missing = asset.requiredWaterTags.filter(value => !tags.has(value));
  if (missing.length) {
    throw new Error(`${asset.id} missing water tags: ${missing.join(', ')}`);
  }
  await writeJson(outputPath, {
    ...result.modelJson,
    name: asset.name,
    _meta: {
      ...(result.modelJson?._meta || {}),
      chiiAssetRole: 'water_landmark',
      chiiAssetId: asset.id,
      chiiPromptProfile: 'chii-v1',
      chiiGenerationQuality: 'voxel',
      chiiResetBaseline: '1203a1e',
      chiiPrompt: asset.prompt,
      chiiWorldFootprint: { ...asset.footprint, unit: 'terrain_tile' },
      chiiBackendMetadata: result.metadata || null,
    },
  });
  console.log(`[WaterAsset:${asset.id}] saved`);
}
