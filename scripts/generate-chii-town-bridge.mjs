import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const force = process.argv.includes('--force');
const quality = process.argv.find(arg => arg.startsWith('--quality='))?.split('=')[1] || 'pro';
const publishScene = process.argv.find(arg => arg.startsWith('--publish='))?.split('=')[1] || null;
if (!['pro', 'voxel'].includes(quality)) {
  throw new Error(`Unsupported bridge quality: ${quality}`);
}
if (publishScene && !['pro', 'voxel', 'original'].includes(publishScene)) {
  throw new Error(`Unsupported bridge scene: ${publishScene}`);
}
const outputPath = quality === 'voxel'
  ? path.join(root, 'public/generated/styles/voxel/models/town_stone_bridge.json')
  : path.join(root, 'public/generated/models/town_stone_bridge.json');
const publishPath = publishScene
  ? path.join(root, `public/generated/scenes/${publishScene}/models/town_stone_bridge.json`)
  : null;
const prompts = Object.freeze({
  pro: '古石拱桥，占地11×3地块，底部长宽比11:3，连续桥面，低石栏，单拱通水',
  voxel: '体素石桥，占地11×3地块，底部长宽比11:3，连续桥面，低栏，单拱留空，无水体',
});

const promptPacket = Object.freeze({
  operation: 'building_generate',
  prompt_profile: 'chii-v1',
  endpoint: '/api/generate/model',
  prompt: prompts[quality],
  request_hints: {
    quality,
    emitParticles: false,
  },
  preconditions: [
    'town_bridge lot is 11x3 terrain tiles',
    'one terrain tile is 4 world units',
  ],
  validation: {
    concrete_chinese: true,
    one_subject: true,
    footprint_preserved: true,
  },
});

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

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

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function validateBridgeModel(modelJson) {
  const nodes = modelJson?.nodes || [];
  const meshNodes = nodes.filter(node => node.mesh);
  if (meshNodes.length < 3) throw new Error('Generated bridge has too few mesh parts');
  if (quality === 'voxel' && meshNodes.some(node => node.mesh.type !== 'box')) {
    throw new Error('Generated Voxel bridge contains non-box geometry');
  }
  if (nodes.some(node => (
    /water|水体|水面/i.test(String(node.id || node.name || ''))
    || node.tags?.some(tag => tag?.tag === 'water')
  ))) {
    throw new Error('Generated bridge contains its own water instead of an empty arch');
  }

  const THREE = await import('three');
  const { buildModelFromJson } = await import('../src/engine/model/builder.js');
  const model = buildModelFromJson(modelJson);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) throw new Error('Generated bridge has empty geometry');
  const size = bounds.getSize(new THREE.Vector3());
  const longSpan = Math.max(size.x, size.z);
  const crossSpan = Math.min(size.x, size.z);
  if (longSpan / Math.max(crossSpan, 0.001) < 2.2) {
    throw new Error('Generated bridge does not preserve the 11:3 footprint ratio');
  }
  return { meshCount: meshNodes.length, size: size.toArray() };
}

await mkdir(path.dirname(outputPath), { recursive: true });
installBackendFetchProxy();

if (!force && await exists(outputPath)) {
  const existing = JSON.parse(await readFile(outputPath, 'utf8'));
  if (publishPath) {
    await mkdir(path.dirname(publishPath), { recursive: true });
    await copyFile(outputPath, publishPath);
  }
  console.log(`[TownBridge] Reusing existing model (${existing.nodes?.length || 0} nodes)`);
  process.exit(0);
}

const { VoxelContentAdapter } = await import('../src/integrations/content/VoxelContentAdapter.js');
const content = new VoxelContentAdapter();
console.log(`[TownBridge] Generating GPT ${quality} model: ${promptPacket.prompt}`);

const result = await content.generateModel({
  description: promptPacket.prompt,
  quality: promptPacket.request_hints.quality,
});
await validateBridgeModel(result.modelJson);
await writeJson(outputPath, result.modelJson);
if (publishPath) {
  await mkdir(path.dirname(publishPath), { recursive: true });
  await copyFile(outputPath, publishPath);
}
console.log(`[TownBridge] Saved raw backend model ${outputPath} (${result.modelJson.nodes?.length || 0} nodes)`);
if (publishPath) console.log(`[TownBridge] Published byte-for-byte to ${publishPath}`);
