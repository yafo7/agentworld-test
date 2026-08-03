import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'public/generated/story/act0/boss');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const force = process.argv.includes('--force');
const only = process.argv.find(arg => arg.startsWith('--only='))?.split('=')[1] || null;

const promptPacket = Object.freeze({
  operation: 'model_generate',
  prompt_profile: 'chii-v1',
  endpoint: '/api/generate/model',
  prompt: '一个黑色方块人，方头方肢，穿黄色篮球服，右手抱橙色篮球',
  request_hints: {
    quality: 'voxel',
    emitParticles: false,
  },
});

const animationPackets = Object.freeze({
  idle: {
    description: '坐着轻轻呼吸',
    duration: 2.4,
    emitParticles: false,
    loop: true,
  },
  talk: {
    description: '坐着挥左手说话',
    duration: 2.0,
    emitParticles: false,
    loop: true,
  },
  panic: {
    description: '惊慌挥动四肢',
    duration: 1.8,
    emitParticles: false,
    loop: true,
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

await mkdir(outputDir, { recursive: true });
installBackendFetchProxy();

const { VoxelContentAdapter } = await import('../src/integrations/content/VoxelContentAdapter.js');
const content = new VoxelContentAdapter();
const modelPath = path.join(outputDir, 'model.json');

let modelJson = null;
if ((!force || only) && await exists(modelPath)) {
  modelJson = JSON.parse(await readFile(modelPath, 'utf8'));
  console.log('[ActZeroBoss] Reusing existing boss model');
} else {
  console.log(`[ActZeroBoss] Generating model: ${promptPacket.prompt}`);
  const result = await content.generateModel({
    description: promptPacket.prompt,
    quality: promptPacket.request_hints.quality,
  });
  modelJson = {
    ...result.modelJson,
    name: '老大',
    _meta: {
      ...(result.modelJson?._meta || {}),
      chiiStoryAsset: 'act0_boss',
      chiiPromptProfile: promptPacket.prompt_profile,
      chiiGenerationQuality: promptPacket.request_hints.quality,
      chiiBackendMetadata: result.metadata || null,
    },
  };
  await writeJson(modelPath, modelJson);
  console.log('[ActZeroBoss] Model saved');
}

for (const [name, packet] of Object.entries(animationPackets)) {
  if (only && name !== only) continue;
  const outputPath = path.join(outputDir, `${name}.json`);
  if (!force && await exists(outputPath)) {
    console.log(`[ActZeroBoss] Reusing ${name} animation`);
    continue;
  }
  console.log(`[ActZeroBoss] Generating ${name}: ${packet.description}`);
  const result = await content.generateAnimation({
    modelJson,
    description: packet.description,
    duration: packet.duration,
    emitParticles: packet.emitParticles,
  });
  await writeJson(outputPath, {
    ...result.plan,
    _duration: result.plan?._duration ?? packet.duration,
    _loop: packet.loop,
    _name: `老大_${name}`,
    _type: name,
    _modelId: 'act0_boss',
    _meta: {
      chiiPromptProfile: promptPacket.prompt_profile,
      prompt: packet.description,
      emitParticles: packet.emitParticles,
    },
  });
  console.log(`[ActZeroBoss] ${name} animation saved`);
}

await writeJson(path.join(outputDir, 'manifest.json'), {
  id: 'act0_boss',
  source: 'autonomous_backend',
  promptPacket,
  animationPackets,
  model: 'generated/story/act0/boss/model.json',
  animations: Object.fromEntries(
    Object.keys(animationPackets).map(name => [
      name,
      `generated/story/act0/boss/${name}.json`,
    ]),
  ),
});

console.log(`[ActZeroBoss] Bundle ready at ${outputDir}`);
