import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'public/generated/story/act0');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const force = process.argv.includes('--force');
const only = process.argv.find(arg => arg.startsWith('--only='))?.split('=')[1] || null;

const promptPacket = Object.freeze({
  operation: 'pet_generate',
  prompt_profile: 'chii-v1',
  endpoint: '/api/generate/model',
  prompt: '一个白金色小天使，圆脸短身，发光双翼，头顶金色光环',
  request_hints: {
    quality: 'voxel',
    emitParticles: false,
  },
});

const animationPackets = Object.freeze({
  idle: { description: '悬空轻扇双翼', duration: 2.4, emitParticles: false },
  talk: { description: '挥手认真点头', duration: 2.0, emitParticles: false },
  generating: { description: '张开双翼快速转圈', duration: 2.8, emitParticles: true },
  falling: { description: '双翼持续快速扇动', duration: 2.4, emitParticles: false },
  panic: { description: '慌张快速挥动双翼', duration: 2.0, emitParticles: false },
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
const modelPath = path.join(outputDir, 'angel.json');

let modelJson = null;
if ((!force || only) && await exists(modelPath)) {
  modelJson = JSON.parse(await readFile(modelPath, 'utf8'));
  console.log('[ActZeroAngel] Reusing existing angel model');
} else {
  console.log(`[ActZeroAngel] Generating model: ${promptPacket.prompt}`);
  const result = await content.generateModel({
    description: promptPacket.prompt,
    quality: promptPacket.request_hints.quality,
  });
  modelJson = {
    ...result.modelJson,
    name: '第0幕天使',
    _meta: {
      ...(result.modelJson?._meta || {}),
      chiiStoryAsset: 'act0_angel',
      chiiPromptProfile: promptPacket.prompt_profile,
    },
  };
  await writeJson(modelPath, modelJson);
  console.log('[ActZeroAngel] Model saved');
}

for (const [name, packet] of Object.entries(animationPackets)) {
  if (only && name !== only) continue;
  const outputPath = path.join(outputDir, `angel_${name}.json`);
  if (!force && await exists(outputPath)) {
    console.log(`[ActZeroAngel] Reusing ${name} animation`);
    continue;
  }
  console.log(`[ActZeroAngel] Generating ${name}: ${packet.description}`);
  const result = await content.generateAnimation({
    modelJson,
    description: packet.description,
    duration: packet.duration,
    emitParticles: packet.emitParticles,
  });
  await writeJson(outputPath, {
    ...result.plan,
    _duration: result.plan?._duration ?? packet.duration,
    _loop: true,
    _name: `第0幕天使_${name}`,
    _type: name,
    _modelId: 'act0_angel',
  });
  console.log(`[ActZeroAngel] ${name} animation saved`);
}

await writeJson(path.join(outputDir, 'manifest.json'), {
  id: 'act0_angel',
  source: 'autonomous_backend',
  promptPacket,
  animationPackets,
  model: 'generated/story/act0/angel.json',
  animations: Object.fromEntries(
    Object.keys(animationPackets).map(name => [
      name,
      `generated/story/act0/angel_${name}.json`,
    ]),
  ),
});

console.log(`[ActZeroAngel] Bundle ready at ${outputDir}`);
