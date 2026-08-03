import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHURCH_INTERIOR_ASSET_SPECS } from '../src/demos/chii-island/data/interiorPlans.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedRoot = path.join(root, 'public/generated');
const historyRoot = path.join(generatedRoot, 'history/2026-07-28-gpt56-reset');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const baseline = '1203a1e';
const force = process.argv.includes('--force');
const skipAnimations = process.argv.includes('--skip-animations');
const metadataOnly = process.argv.includes('--metadata-only');
const selectedGroups = new Set(
  (process.argv.find(arg => arg.startsWith('--group='))?.split('=')[1] || 'all').split(','),
);

const PETS = Object.freeze([
  {
    id: 'momo', name: 'momo',
    prompt: '圆滚滚粉棕色小熊，奶油色口鼻，短手短脚，双手空置，毛茸茸身体',
    animations: { idle: '轻轻呼吸摇摆', walk: '小步向前行走', run: '短腿快速奔跑', chop: '双手向前砍树', smash: '双手向下重击', wave: '抬起左手挥手', magic: '双手放出彩色星光' },
  },
  {
    id: 'mako', name: 'mako',
    prompt: '棕色小马，穿红色7号球衣，黑色短鬃毛，四蹄清楚，双手空置',
    animations: { idle: '站立呼吸甩尾', run: '四蹄快速奔跑', jump: '四蹄用力跳跃', dance: '左右踏步开心跳舞' },
  },
  {
    id: 'yafo', name: 'yafo',
    prompt: '天蓝色小麻雀，圆头短喙，白色肚皮，小翅膀和细短双腿',
    animations: { idle: '轻轻呼吸点头', run: '小步快速奔跑', jump: '张开翅膀向上跳跃' },
  },
  {
    id: 'lingq', name: 'lingq',
    prompt: '蓝绿色孔雀，细长脖子，金色冠羽，彩色扇形尾羽，双腿清楚',
    animations: { idle: '轻轻呼吸摆尾', run: '收起尾羽快速奔跑', jump: '张开翅膀向上跳跃', dance: '展开尾羽左右跳舞' },
  },
  {
    id: 'fangk', name: 'fangk',
    prompt: '和蔼方块人工程师，黑色西装，黄色安全帽，圆框眼镜，双手空置',
    animations: { idle: '站立呼吸点头', run: '摆动双臂向前奔跑', construct: '展开图纸认真施工', dance: '左右踏步挥手跳舞' },
  },
  {
    id: 'mok', name: 'mok',
    prompt: '站立行走绿色鳄鱼，红色背心，双手各拿木柄大斧，粗壮尾巴',
    animations: { idle: '握住双斧呼吸摇摆', run: '提着双斧快速奔跑', jump: '握住双斧用力跳跃' },
  },
  {
    id: 'crab', name: '螃蟹',
    prompt: '橙红色方块螃蟹，圆厚蟹壳，两只大蟹钳，八条短步足，友好眼睛',
    animations: { idle: '左右轻晃两只蟹钳', walk: '八条腿横向行走', run: '八条腿快速横跑', jump: '收腿向上跳跃', construct: '挥动双钳认真施工', dance: '举起双钳左右跳舞' },
  },
]);

const BUILDINGS = Object.freeze([
  { id: 'windmill', name: '巨大风车', prompt: '占地2×2地块巨大田园风车，底部长宽比2:2，石砌圆塔，木制四叶风车，完整大门' },
  { id: 'church', name: '哥特教堂', prompt: '占地5×8地块巨大哥特教堂，底部长宽比5:8，尖顶钟楼，彩色玻璃窗，完整正门' },
  { id: 'temple', name: '古老神殿', prompt: '占地8×5地块西方古老神殿，底部长宽比8:5，石柱长廊，破损山墙，中央入口' },
  { id: 'forest_temple_trophy', name: '冠军奖杯', prompt: '科隆Major风格CS2冠军奖杯，厚重金属杯体，黑色方形底座，杯体与底座分组' },
  { id: 'forest_temple_tent', name: '露营帐篷', prompt: '森林野外双人露营帐篷，绿色防水布，三角入口，木桩绳索，底部平整' },
]);

const DECOR = Object.freeze([
  { id: 'glowgrass', name: '荧光草', prompt: '一丛青绿色荧光草，六片细长叶片，叶尖淡蓝发光', kind: 'plant' },
  { id: 'pink_flower', name: '粉红花', prompt: '一株粉红色五瓣小花，绿色细茎，两片圆叶', kind: 'plant' },
  { id: 'grass_clump', name: '小草', prompt: '一丛鲜绿色小草，八片尖细叶片，根部紧凑', kind: 'plant' },
  { id: 'trumpet_flower', name: '喇叭花', prompt: '一株紫色喇叭花，漏斗花冠，弯曲藤茎，三片绿叶', kind: 'plant' },
  { id: 'blue_tulips', name: '蓝色郁金香', prompt: '一丛三株蓝色郁金香，杯形花朵，直立绿茎，长叶片', kind: 'plant' },
  { id: 'wheat_field', name: '小麦', prompt: '一簇成熟金黄色小麦，直立细秆，饱满麦穗，底部无土块', kind: 'plant' },
  { id: 'giant_carrot', name: '胡萝卜', prompt: '一株橙色胡萝卜露出半截根部，顶部六片绿色羽状叶', kind: 'plant' },
  { id: 'flower_pot', name: '花盆', prompt: '圆口赤陶小花盆，浅色土壤，盆沿清楚，底部平整', kind: 'decor' },
  { id: 'campfire', name: '篝火', prompt: '三根粗木柴围成篝火，中央橙色火焰，灰色石块围成圆圈', kind: 'decor', animations: { burn: '木柴中央火焰持续燃烧' } },
  { id: 'pastoral_work_scaffold', name: '施工横幅', prompt: '四条黄色施工横幅围成正方形区域，四角木桩，黑色警示条纹', kind: 'decor', animations: { dust: '施工区域冒出灰尘' } },
  ...Object.values(CHURCH_INTERIOR_ASSET_SPECS).map(spec => ({
    id: spec.fileName,
    name: spec.name,
    prompt: spec.prompt,
    kind: spec.assetId === 'churchStatue' ? 'decor' : 'furniture',
    assetRole: spec.assetId,
    targetSize: spec.targetSize,
  })),
]);

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function installBackendFetchProxy() {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    let url = typeof input === 'string' ? input : input?.url;
    if (url?.startsWith('/api/voxel/')) url = `${backendBase}/${url.slice('/api/voxel/'.length)}`;
    return nativeFetch(url, init);
  };
}

async function backup(filePath) {
  if (!await exists(filePath)) return;
  const relative = path.relative(generatedRoot, filePath);
  const target = path.join(historyRoot, relative);
  if (await exists(target)) return;
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(filePath, target);
}

async function retry(label, action, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await action(); } catch (error) {
      lastError = error;
      console.warn(`[Reset:${label}] attempt ${attempt} failed: ${error.message}`);
    }
  }
  throw lastError;
}

function modelMetadata(modelJson, spec, quality, metadata, role) {
  return {
    ...modelJson,
    name: spec.name,
    _meta: {
      ...(modelJson?._meta || {}),
      chiiAssetRole: spec.assetRole || role,
      chiiAssetCategory: role,
      chiiAssetId: spec.id,
      chiiPromptProfile: 'chii-v1',
      chiiGenerationQuality: quality,
      chiiBackendMetadata: metadata || null,
      chiiResetBaseline: baseline,
      chiiResetPrompt: spec.prompt,
      ...(spec.targetSize ? { chiiTargetSize: spec.targetSize } : {}),
    },
  };
}

async function generateModelFile(content, spec, quality, outputPath, role) {
  if (metadataOnly && await exists(outputPath)) {
    const current = await readJson(outputPath);
    const repaired = modelMetadata(
      current,
      spec,
      quality,
      current._meta?.chiiBackendMetadata || null,
      role,
    );
    await writeJson(outputPath, repaired);
    console.log(`[Reset:${spec.id}:${quality}] metadata repaired`);
    return repaired;
  }
  if (!force && await exists(outputPath)) {
    const current = await readJson(outputPath);
    if (current._meta?.chiiResetBaseline === baseline && current._meta?.chiiGenerationQuality === quality) {
      console.log(`[Reset:${spec.id}:${quality}] reuse`);
      return current;
    }
  }
  await backup(outputPath);
  console.log(`[Reset:${spec.id}:${quality}] ${spec.prompt}`);
  const result = await retry(`${spec.id}:${quality}`, () => content.generateModel({
    description: spec.prompt,
    quality,
  }));
  const modelJson = modelMetadata(result.modelJson, spec, quality, result.metadata, role);
  await writeJson(outputPath, modelJson);
  return modelJson;
}

async function generateAnimationFile(content, spec, modelJson, name, prompt, outputPath, quality) {
  if (!force && await exists(outputPath)) {
    const current = await readJson(outputPath);
    if (current._meta?.chiiResetBaseline === baseline) return current;
  }
  await backup(outputPath);
  console.log(`[Reset:${spec.id}:${quality}:${name}] ${prompt}`);
  const result = await retry(`${spec.id}:${quality}:${name}`, () => content.generateAnimation({
    modelJson,
    description: prompt,
    duration: name === 'idle' ? 2.5 : 2.2,
    emitParticles: name === 'magic',
  }));
  const plan = {
    ...result.plan,
    _duration: name === 'idle' ? 2.5 : 2.2,
    _loop: ['idle', 'walk', 'run', 'dance', 'burn'].includes(name),
    _name: `${spec.name}-${name}`,
    _meta: { chiiResetBaseline: baseline, chiiAssetId: spec.id, quality, prompt },
  };
  await writeJson(outputPath, plan);
  return plan;
}

function wants(group) {
  return selectedGroups.has('all') || selectedGroups.has(group);
}

installBackendFetchProxy();
const { VoxelContentAdapter } = await import('../src/integrations/content/VoxelContentAdapter.js');
const content = new VoxelContentAdapter();

if (wants('pets')) {
  for (const pet of PETS) {
    for (const quality of ['pro', 'voxel']) {
      const isPro = quality === 'pro';
      const modelPath = isPro
        ? path.join(generatedRoot, 'models', `${pet.id}.json`)
        : path.join(generatedRoot, 'characters/voxel/models', `${pet.id}.json`);
      const animationRoot = isPro
        ? path.join(generatedRoot, 'animations')
        : path.join(generatedRoot, 'characters/voxel/animations');
      const modelJson = await generateModelFile(content, pet, quality, modelPath, 'pet');
      if (skipAnimations) continue;
      for (const [name, prompt] of Object.entries(pet.animations)) {
        await generateAnimationFile(
          content,
          pet,
          modelJson,
          name,
          prompt,
          path.join(animationRoot, `${pet.id}_${name}.json`),
          quality,
        );
      }
    }
  }
  await writeJson(path.join(generatedRoot, 'characters/manifest.json'), {
    version: 1,
    baseline,
    defaultVariant: 'pro',
    characters: PETS.map(pet => ({
      id: pet.id,
      variants: {
        pro: `generated/models/${pet.id}.json`,
        voxel: `generated/characters/voxel/models/${pet.id}.json`,
      },
    })),
  });
}

if (wants('buildings')) {
  for (const building of BUILDINGS) {
    await generateModelFile(
      content,
      building,
      'pro',
      path.join(generatedRoot, 'models', `${building.id}.json`),
      building.id.includes('trophy') || building.id.includes('tent') ? 'interactive_prop' : 'building',
    );
  }
}

if (wants('decor')) {
  for (const decor of DECOR) {
    const modelJson = await generateModelFile(
      content,
      decor,
      'voxel',
      path.join(generatedRoot, 'styles/voxel/models', `${decor.id}.json`),
      decor.kind,
    );
    await backup(path.join(generatedRoot, 'models', `${decor.id}.json`));
    await writeJson(path.join(generatedRoot, 'models', `${decor.id}.json`), modelJson);
    for (const [name, prompt] of Object.entries(decor.animations || {})) {
      const voxelPath = path.join(generatedRoot, 'styles/voxel/animations', `${decor.id}_${name}.json`);
      const plan = await generateAnimationFile(content, decor, modelJson, name, prompt, voxelPath, 'voxel');
      await backup(path.join(generatedRoot, 'animations', `${decor.id}_${name}.json`));
      await writeJson(path.join(generatedRoot, 'animations', `${decor.id}_${name}.json`), plan);
    }
  }
}

console.log(`[Reset] Completed groups: ${[...selectedGroups].join(', ')}`);
