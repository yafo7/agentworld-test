import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHURCH_INTERIOR_ASSET_SPECS,
  GOTHIC_INTERIOR_REFERENCES,
} from '../src/demos/chii-island/data/interiorPlans.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'public/generated/models');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const force = process.argv.includes('--force');

function installBackendFetchProxy() {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    let url = typeof input === 'string' ? input : input?.url;
    if (url?.startsWith('/api/voxel/')) {
      url = `${backendBase}/${url.slice('/api/voxel/'.length)}`;
    }
    return nativeFetch(url, init);
  };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

await mkdir(outputDir, { recursive: true });
installBackendFetchProxy();

const { VoxelContentAdapter } = await import('../src/integrations/content/VoxelContentAdapter.js');
const content = new VoxelContentAdapter();

for (const spec of Object.values(CHURCH_INTERIOR_ASSET_SPECS)) {
  const outputPath = path.join(outputDir, `${spec.fileName}.json`);
  if (!force && await exists(outputPath)) {
    const existing = JSON.parse(await readFile(outputPath, 'utf8'));
    console.log(`[ChurchInterior] Reusing ${spec.assetId} (${existing.nodes?.length || 0} nodes)`);
    continue;
  }

  console.log(`[ChurchInterior] Generating ${spec.assetId}: ${spec.prompt}`);
  const result = await content.generateModel({
    description: spec.prompt,
    quality: spec.quality,
  });
  const modelJson = {
    ...result.modelJson,
    name: spec.name,
    _meta: {
      ...(result.modelJson?._meta || {}),
      chiiAssetRole: spec.assetId,
      chiiPromptProfile: 'chii-v1',
      chiiGenerationQuality: spec.quality,
      chiiBackendMetadata: result.metadata || null,
      chiiSourceReferences: GOTHIC_INTERIOR_REFERENCES,
      chiiTargetSize: spec.targetSize,
    },
  };
  await writeJson(outputPath, modelJson);
  console.log(`[ChurchInterior] Saved ${outputPath} (${modelJson.nodes?.length || 0} nodes)`);
}
