import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const outputRoot = path.join(repoRoot, 'public/generated/styles/voxel');
const modelRoot = path.join(outputRoot, 'models');
const animationRoot = path.join(outputRoot, 'animations');

const assets = [
  { id: 'oak', file: 'oak', prompt: '高大深棕树干橡树，方块深绿树冠' },
  { id: 'normal', file: 'normal_tree', prompt: '中等棕色树干，层叠方块绿色树冠' },
  { id: 'apple', file: 'apple_tree', prompt: '棕色树干苹果树，方块绿叶和红苹果' },
  { id: 'glowgrass', file: 'glowgrass', prompt: '一丛青绿色方块荧光草，叶尖发亮' },
  { id: 'pinkFlower', file: 'pink_flower', prompt: '一株粉色方块花，绿色短茎和双叶' },
  { id: 'grassClump', file: 'grass_clump', prompt: '一丛鲜绿色方块小草，叶片向外散开' },
  { id: 'trumpetFlower', file: 'trumpet_flower', prompt: '一株紫色喇叭花，绿色方块茎叶' },
  { id: 'blueTulips', file: 'blue_tulips', prompt: '一丛蓝色郁金香，绿色方块茎叶' },
  { id: 'wheatField', file: 'wheat_field', prompt: '一小簇金色成熟小麦，方块麦穗整齐' },
  { id: 'flowerPot', file: 'flower_pot', prompt: '红陶方块花盆，盛开彩色小花和绿叶' },
  { id: 'giantCarrot', file: 'giant_carrot', prompt: '巨大橙色方块胡萝卜，顶部绿色叶簇' },
  {
    id: 'campfire',
    file: 'campfire',
    prompt: '圆形灰石篝火，棕色木柴和方块火焰',
    animation: { file: 'campfire_burn', prompt: '火焰持续上下跳动并冒出火星', duration: 2.5, emitParticles: true },
  },
  {
    id: 'forestTrophy',
    file: 'forest_temple_trophy',
    prompt: '银金色CS2冠军奖杯，黑色方块底座',
    animation: { file: 'forest_trophy_wait', prompt: '底座不动，奖杯上下跳动并冒出星光', duration: 2.5, emitParticles: true },
  },
  { id: 'forestTent', file: 'forest_temple_tent', prompt: '绿色三角露营帐篷，门帘和固定绳' },
  {
    id: 'pastoralWorkScaffold',
    file: 'pastoral_work_scaffold',
    prompt: 'north和south分组施工横幅围成方形',
    animation: { file: 'pastoral_work_scaffold_dust', prompt: 'north和south持续冒出灰尘粒子', duration: 2, emitParticles: true },
  },
];

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const baseUrl = option('--base', 'http://127.0.0.1:5173/api/voxel').replace(/\/$/, '');
const only = option('--only')?.split(',').map(value => value.trim()).filter(Boolean) || null;
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const individual = args.includes('--individual');
const animationsOnly = args.includes('--animations-only');
const batchSize = Math.max(1, Number(option('--batch-size', '5')) || 5);

async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

async function requestJson(endpoint, body, timeoutMs = 1_800_000) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function generateOne(asset) {
  const response = await fetch(`${baseUrl}/api/generate/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: asset.prompt, provider: 'gpt', mode: 'voxel' }),
    signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok) throw new Error(`model HTTP ${response.status}: ${await response.text()}`);
  const text = await response.text();
  let modelJson = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const event = JSON.parse(line.slice(5).trim());
    if (event.stage === 'error' || event.error) throw new Error(event.error || 'generation failed');
    if (event.done || event.stage === 'result') modelJson = event.modelJson;
  }
  if (!modelJson) throw new Error('model response did not contain modelJson');
  return modelJson;
}

function validateVoxelModel(asset, modelJson) {
  const meshes = (modelJson.nodes || []).filter(node => node.mesh);
  if (meshes.length === 0) throw new Error(`${asset.id} generated no meshes`);
  const invalid = meshes.filter(node => node.mesh.type !== 'box');
  if (invalid.length > 0) throw new Error(`${asset.id} contains non-voxel meshes: ${invalid.map(node => node.mesh.type).join(', ')}`);
}

async function saveModel(asset, modelJson) {
  validateVoxelModel(asset, modelJson);
  const file = path.join(modelRoot, `${asset.file}.json`);
  await writeFile(file, `${JSON.stringify(modelJson, null, 2)}\n`, 'utf8');
  console.log(`[chii-ai] model ${asset.id} -> ${path.relative(repoRoot, file)}`);
}

async function generateModels(selected) {
  const pending = [];
  for (const asset of selected) {
    const file = path.join(modelRoot, `${asset.file}.json`);
    if (!force && await exists(file)) console.log(`[chii-ai] reuse ${asset.id}`);
    else pending.push(asset);
  }

  for (let start = 0; start < pending.length; start += batchSize) {
    const chunk = pending.slice(start, start + batchSize);
    console.log(`[chii-ai] generating batch ${start + 1}-${start + chunk.length} of ${pending.length}`);
    let results = [];
    if (!individual) {
      try {
        const data = await requestJson('/api/generate/batch', {
          descriptions: chunk.map(asset => asset.prompt),
          provider: 'gpt',
          mode: 'voxel',
        });
        results = data.results || [];
      } catch (error) {
        console.warn(`[chii-ai] batch failed, retrying individually: ${error.message}`);
      }
    }

    for (let index = 0; index < chunk.length; index += 1) {
      const asset = chunk[index];
      const result = results.find(item => item.index === index);
      const modelJson = result?.success ? result.modelJson : await generateOne(asset);
      await saveModel(asset, modelJson);
    }
  }
}

async function generateAnimations(selected) {
  for (const asset of selected.filter(item => item.animation)) {
    const target = path.join(animationRoot, `${asset.animation.file}.json`);
    if (!force && await exists(target)) {
      console.log(`[chii-ai] reuse ${asset.id} animation`);
      continue;
    }
    const modelJson = JSON.parse(await readFile(path.join(modelRoot, `${asset.file}.json`), 'utf8'));
    console.log(`[chii-ai] animation ${asset.id}`);
    const data = await requestJson('/api/generate/animation', {
      mode: 'quick',
      modelJson,
      description: asset.animation.prompt,
      duration: asset.animation.duration,
      provider: 'gpt',
      emitParticles: asset.animation.emitParticles,
    }, 600_000);
    if (!data.ok || !data.plan) throw new Error(`${asset.id} animation did not return a plan`);
    await writeFile(target, `${JSON.stringify(data.plan, null, 2)}\n`, 'utf8');
  }
}

async function writeManifest(selected) {
  const entries = [];
  for (const asset of selected) {
    const modelPath = path.join(modelRoot, `${asset.file}.json`);
    const modelJson = JSON.parse(await readFile(modelPath, 'utf8'));
    entries.push({
      id: asset.id,
      prompt: asset.prompt,
      provider: 'gpt',
      mode: 'voxel',
      model: path.relative(repoRoot, modelPath).replaceAll('\\', '/'),
      animation: asset.animation ? `public/generated/styles/voxel/animations/${asset.animation.file}.json` : null,
      meshCount: (modelJson.nodes || []).filter(node => node.mesh).length,
    });
  }
  const manifest = { style: 'voxel', generatedAt: new Date().toISOString(), assets: entries };
  await writeFile(path.join(outputRoot, 'scene-style-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

const selected = only ? assets.filter(asset => only.includes(asset.id)) : assets;
if (selected.length === 0) throw new Error('No matching assets selected');

console.log(`[chii-ai] ${dryRun ? 'dry-run ' : ''}scene voxel variants: ${selected.map(asset => asset.id).join(', ')}`);
if (!dryRun) {
  await mkdir(modelRoot, { recursive: true });
  await mkdir(animationRoot, { recursive: true });
  if (!animationsOnly) await generateModels(selected);
  await generateAnimations(selected);
  await writeManifest(assets);
}
