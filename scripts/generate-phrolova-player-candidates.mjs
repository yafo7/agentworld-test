import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'public/generated/player-candidates/phrolova');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const force = process.argv.includes('--force');
const requestedVariant = process.argv.find(arg => arg.startsWith('--variant='))?.split('=')[1]?.toLowerCase() || null;
const requestedAnimation = process.argv.find(arg => arg.startsWith('--animation='))?.split('=')[1]?.toLowerCase() || null;

const sourceReferences = Object.freeze([
  'https://wutheringwaves.kurogames.com/en/main/news/detail/2907',
  'https://www.kurobbs.com/mc/post/1395809059164573696',
  'https://www.douyin.com/search/%E9%B8%A3%E6%BD%AE%E5%BC%97%E6%B4%9B%E6%B4%9Bq%E7%89%88%E4%BA%8C%E5%88%9B%E5%9B%BE',
  'https://news.qq.com/rain/a/20260620A08POE00',
]);

const sharedAnimations = Object.freeze({
  idle: {
    description: '自然站立轻轻呼吸',
    duration: 2.4,
    emitParticles: false,
    loop: true,
  },
  walk: {
    description: '双腿交替向前行走',
    duration: 1.2,
    emitParticles: false,
    loop: true,
  },
  run: {
    description: '双腿快速向前奔跑',
    duration: 0.9,
    emitParticles: false,
    loop: true,
  },
  jump: {
    description: '屈膝起跳轻盈落地',
    duration: 1.2,
    emitParticles: false,
    loop: false,
  },
});

const candidates = Object.freeze([
  {
    id: 'a',
    slug: 'classic-conductor',
    title: '方案 A · 彼岸花指挥家',
    intent: '保留最强角色识别度，适合剧情演出和近景。',
    promptPacket: {
      operation: 'model_generate',
      prompt_profile: 'chii-v1',
      endpoint: '/api/generate/model',
      prompt: '灰绿长双辫少女，露出双眼，红白黑指挥礼裙，手持红色彼岸花',
      request_hints: { quality: 'voxel', emitParticles: false },
    },
    special: {
      description: '挥花指挥红色音符',
      duration: 2.0,
      emitParticles: true,
      loop: false,
    },
  },
  {
    id: 'b',
    slug: 'chii-chibi',
    title: '方案 B · 奇异岛短身版',
    intent: '缩短四肢并放大头部，和岛上宠物的可爱比例更协调。',
    promptPacket: {
      operation: 'model_generate',
      prompt_profile: 'chii-v1',
      endpoint: '/api/generate/model',
      prompt: '圆脸短身少女，露出双眼，银绿双辫，红白短礼裙，手持彼岸花',
      request_hints: { quality: 'voxel', emitParticles: false },
    },
    special: {
      description: '挥花转圈冒出音符',
      duration: 2.0,
      emitParticles: true,
      loop: false,
    },
  },
  {
    id: 'c',
    slug: 'adventure-conductor',
    title: '方案 C · 轻装冒险版',
    intent: '减少长裙遮挡，强化跑、跳和探索时的动作轮廓。',
    promptPacket: {
      operation: 'model_generate',
      prompt_profile: 'chii-v1',
      endpoint: '/api/generate/model',
      prompt: '修长银绿发少女，露出双眼，红黑燕尾短裙，黑长靴，手持金色指挥杖',
      request_hints: { quality: 'voxel', emitParticles: false },
    },
    special: {
      description: '挥杖指挥红色音符',
      duration: 2.0,
      emitParticles: true,
      loop: false,
    },
  },
  {
    id: 'd',
    slug: 'gpt-pro-detail',
    title: '方案 D · GPT Pro 精细版',
    intent: '使用 GPT Voxel Pro 增加服装层次和角色细节。',
    promptPacket: {
      operation: 'model_generate',
      prompt_profile: 'chii-v1',
      endpoint: '/api/generate/model',
      prompt: '修长灰绿双辫少女，露出双眼，红白黑指挥礼裙，手持红色彼岸花',
      request_hints: { quality: 'voxel-pro', emitParticles: false },
    },
    special: {
      description: '挥花指挥红色音符',
      duration: 2.0,
      emitParticles: true,
      loop: false,
    },
  },
  {
    id: 'e',
    slug: 'gpt-pro-ai-chibi',
    title: '方案 E · AI Q版电子女儿',
    intent: '使用热门 AI Q 版的大头短身电子女儿比例。',
    promptPacket: {
      operation: 'model_generate',
      prompt_profile: 'chii-v1',
      endpoint: '/api/generate/model',
      prompt: '大头短身圆脸少女，露出粉红双眼，灰绿双辫，红白蓬裙，抱彼岸花',
      request_hints: { quality: 'voxel-pro', emitParticles: false },
    },
    special: {
      description: '抱花转圈冒出星星',
      duration: 2.0,
      emitParticles: true,
      loop: false,
    },
  },
]);

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

function candidateManifest(candidate) {
  return {
    id: candidate.id,
    slug: candidate.slug,
    title: candidate.title,
    intent: candidate.intent,
    source: 'autonomous_backend',
    sourceReferences,
    promptPacket: candidate.promptPacket,
    model: `generated/player-candidates/phrolova/${candidate.slug}/model.json`,
    animations: Object.fromEntries(
      [...Object.keys(sharedAnimations), 'special'].map(name => [
        name,
        `generated/player-candidates/phrolova/${candidate.slug}/${name}.json`,
      ]),
    ),
  };
}

await mkdir(outputRoot, { recursive: true });
installBackendFetchProxy();

const { VoxelContentAdapter } = await import('../src/integrations/content/VoxelContentAdapter.js');
const content = new VoxelContentAdapter();
const selectedCandidates = requestedVariant
  ? candidates.filter(candidate => candidate.id === requestedVariant || candidate.slug === requestedVariant)
  : candidates;

if (selectedCandidates.length === 0) {
  throw new Error(`Unknown candidate variant: ${requestedVariant}`);
}

for (const candidate of selectedCandidates) {
  const outputDir = path.join(outputRoot, candidate.slug);
  const modelPath = path.join(outputDir, 'model.json');
  await mkdir(outputDir, { recursive: true });

  let modelJson;
  if (!force && await exists(modelPath)) {
    modelJson = JSON.parse(await readFile(modelPath, 'utf8'));
    console.log(`[Phrolova:${candidate.id}] Reusing model`);
  } else {
    console.log(`[Phrolova:${candidate.id}] Generating model: ${candidate.promptPacket.prompt}`);
    const result = await content.generateModel({
      description: candidate.promptPacket.prompt,
      quality: candidate.promptPacket.request_hints.quality,
    });
    modelJson = {
      ...result.modelJson,
      name: candidate.title,
      _meta: {
        ...(result.modelJson?._meta || {}),
        chiiAssetRole: 'player_candidate',
        chiiCandidateId: candidate.id,
        chiiCandidateSlug: candidate.slug,
        chiiPromptProfile: candidate.promptPacket.prompt_profile,
        chiiGenerationQuality: candidate.promptPacket.request_hints.quality,
        chiiGenerationMode: result.metadata?.mode || candidate.promptPacket.request_hints.quality,
        chiiBackendMetadata: result.metadata || null,
        chiiSourceReferences: sourceReferences,
      },
    };
    await writeJson(modelPath, modelJson);
    console.log(`[Phrolova:${candidate.id}] Model saved`);
  }

  const animationPackets = {
    ...sharedAnimations,
    special: candidate.special,
  };

  for (const [name, packet] of Object.entries(animationPackets)) {
    if (requestedAnimation && name !== requestedAnimation) continue;
    const outputPath = path.join(outputDir, `${name}.json`);
    if (!force && await exists(outputPath)) {
      console.log(`[Phrolova:${candidate.id}] Reusing ${name}`);
      continue;
    }
    console.log(`[Phrolova:${candidate.id}] Generating ${name}: ${packet.description}`);
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
      _name: `${candidate.title}_${name}`,
      _type: name,
      _modelId: `phrolova_${candidate.id}`,
      _meta: {
        chiiPromptProfile: 'chii-v1',
        prompt: packet.description,
        emitParticles: packet.emitParticles,
      },
    });
    console.log(`[Phrolova:${candidate.id}] ${name} saved`);
  }

  await writeJson(path.join(outputDir, 'manifest.json'), {
    ...candidateManifest(candidate),
    animationPackets,
  });
}

await writeJson(path.join(outputRoot, 'manifest.json'), {
  id: 'phrolova_player_candidates',
  generatedAt: new Date().toISOString(),
  sourceReferences,
  candidates: candidates.map(candidateManifest),
});

console.log(`[Phrolova] Candidate bundle ready at ${outputRoot}`);
