#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 统一重新生成所有模型 + 动画（中文简短提示词）
// Run: node scripts/regenerate-all.mjs
// 覆盖 public/generated/ 下旧模型与旧动画
// ═══════════════════════════════════════════════════════════════

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API_BASE = 'https://voxel-studio-backend.zeabur.app';
const GENERATED = join(ROOT, 'public', 'generated');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===================================================================
// API helpers
// ===================================================================

async function generateModelSingle(description, provider = 'fireworks') {
  const providers = [provider, 'glm', 'gpt'];
  for (const p of providers) {
    try {
      const resp = await fetch(`${API_BASE}/api/generate/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, provider: p }),
        signal: AbortSignal.timeout(300000),
      });
      if (resp.status === 429) { console.warn(`    429, next...`); continue; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const text = await resp.text();
      let modelJson = null;
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const ev = JSON.parse(line.slice(5).trim());
        if (ev.error) throw new Error(ev.error);
        if (ev.done || ev.stage === 'result') { modelJson = ev.modelJson; break; }
      }
      if (modelJson) return modelJson;
      throw new Error('No modelJson in stream');
    } catch (err) {
      console.warn(`    ${p} failed: ${err.message}`);
    }
  }
  throw new Error('All providers failed');
}

async function generateBatch(descriptions, provider = 'fireworks') {
  const resp = await fetch(`${API_BASE}/api/generate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descriptions, provider }),
    signal: AbortSignal.timeout(300000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Batch HTTP ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function generateAnimation(modelJson, description, duration = 2.5) {
  const providers = ['fireworks', 'glm', 'gpt'];
  for (const p of providers) {
    try {
      const resp = await fetch(`${API_BASE}/api/generate/animation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelJson, description, duration, provider: p }),
        signal: AbortSignal.timeout(180000),
      });
      if (resp.status === 429) { console.warn(`    anim 429, next...`); continue; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.ok && data.plan) return data.plan;
      throw new Error('No plan in response');
    } catch (err) {
      console.warn(`    ${p} anim failed: ${err.message}`);
    }
  }
  throw new Error('All animation providers failed');
}

function saveJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  ✓ saved ${filePath.replace(ROOT, '')}`);
}

// ===================================================================
// Configs — 中文简短提示词（10-20词）
// ===================================================================

const ENVIRONMENTS = [
  { id: 'forest',      name: '森林',     desc: '低多边形森林场景，绿色地面小树苔藓' },
  { id: 'grassland',   name: '草原',     desc: '低多边形草原场景，开阔草地野花阳光' },
  { id: 'pond',        name: '池塘',     desc: '低多边形池塘场景，蓝色水面涟漪清凉' },
];

const ITEMS = [
  { id: 'country_shop', name: '乡村商店', desc: '低多边形乡村小店，木质斜屋顶花箱' },
  { id: 'moss_lamp',    name: '苔藓灯',   desc: '低多边形苔藓小灯，青色柔和发光' },
  { id: 'ns2_console',  name: 'ns2游戏机', desc: '低多边形手持游戏机，彩色屏幕双控' },
  { id: 'pet_house',    name: '宠物小屋', desc: '低多边形宠物小屋，温馨木屋红屋顶' },
  { id: 'player-nezha', name: '哪吒',     desc: '低多边形哪吒角色，风火轮手持长枪' },
  { id: 'ps5_console',  name: 'ps5游戏机', desc: '低多边形立式游戏机，黑白配色未来感' },
  { id: 'sun_stone',    name: '太阳石',   desc: '低多边形太阳石，橙色温暖发光水晶' },
  { id: 'thunder_snow', name: '雷霆大雪绒', desc: '低多边形雪绒玩偶，圆滚滚闪电纹' },
  { id: 'trainer',      name: '训练桩',   desc: '低多边形训练木桩，粗糙木头练功' },
  { id: 'wind_chime',   name: '风铃',     desc: '低多边形绿色风铃，悬挂铃铛植物' },
];

const TREES = [
  { id: 'tree_goldfish', name: '金鱼树', desc: '低多边形金鱼树，金色园艺雕塑' },
  { id: 'tree_marko',    name: '玛扣树', desc: '低多边形古老大树，粗壮树干浓树冠' },
  { id: 'tree_rand_1',   name: '摇光松', desc: '低多边形星光松树，针叶挺拔闪烁' },
  { id: 'tree_rand_2',   name: '幻影柳', desc: '低多边形幽灵垂柳，长枝触地飘渺' },
  { id: 'tree_rand_3',   name: '雷鸣柏', desc: '低多边形尖塔柏树，深色针叶锐利' },
  { id: 'tree_rand_4',   name: '晨露榕', desc: '低多边形气根榕树，宽大叶子蔓延' },
  { id: 'tree_rand_5',   name: '星尘槐', desc: '低多边形星形槐树， delicate 叶子 graceful' },
  { id: 'tree_rand_6',   name: '霜火杨', desc: '低多边形冰火杨树，一半蓝一半红叶' },
  { id: 'tree_witch',    name: '魔女树', desc: '低多边形魔女树，紫色叶子 spooky' },
  { id: 'tree_yafo',     name: 'yafo树', desc: '低多边形热带棕榈，弯曲绿叶 slender' },
];

const PETS = [
  { id: 'momo',   name: 'momo',   desc: '低多边形粉色团子，圆滚滚慵懒 sleepy' },
  { id: '小石芽',  name: '小石芽', desc: '低多边形发芽石头，橙棕温暖 tiny sprout' },
  { id: '扶摇',   name: '扶摇',   desc: '低多边形蓝色小鸟，轻盈羽毛自由飞翔' },
  { id: '皮卡丘',  name: '皮卡丘', desc: '低多边形黄色电气鼠，圆脸可爱 cheek' },
  { id: '雨灯绒',  name: '雨灯绒', desc: '低多边形青色灯笼生物，发光雨滴 shy' },
  { id: '风铃草',  name: '风铃草', desc: '低多边形绿色风铃草，轻盈 musical playful' },
  { id: '马扣',   name: '马扣',   desc: '低多边形棕色小马，忠诚奔跑 hoof' },
];

const ALL_MODELS = [
  ...ENVIRONMENTS.map(a => ({ ...a, subdir: 'models', animSubdir: 'animations', hasWalk: false })),
  ...ITEMS.map(a => ({ ...a, subdir: 'models', animSubdir: 'animations', hasWalk: false })),
  ...TREES.map(a => ({ ...a, subdir: 'models', animSubdir: 'animations', hasWalk: false })),
  ...PETS.map(a => ({ ...a, subdir: 'pets/models', animSubdir: 'pets/animations', hasWalk: true })),
];

// player-nezha 额外标记 hasWalk
const PLAYER_NEZHA = ALL_MODELS.find(a => a.id === 'player-nezha');
if (PLAYER_NEZHA) PLAYER_NEZHA.hasWalk = true;

// ===================================================================
// Main
// ===================================================================

async function main() {
  const targetId = process.argv[2];
  let models = ALL_MODELS;
  if (targetId) {
    models = ALL_MODELS.filter((a) => a.id === targetId);
    if (models.length === 0) {
      console.error(`Unknown model id: ${targetId}`);
      console.error(`Available: ${ALL_MODELS.map((a) => a.id).join(', ')}`);
      process.exit(1);
    }
    console.log(`╔══════════════════════════════════════════════╗`);
    console.log(`║  单独生成: ${models[0].name.padEnd(22, ' ')} ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
  } else {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  统一重新生成所有模型 + 动画（中文提示词）    ║');
    console.log('╚══════════════════════════════════════════════╝\n');
  }

  // ---- Phase 1: Batch generate models ----
  console.log('📦 Phase 1: 批量生成模型...\n');

  // Split into batches to avoid overwhelming the API
  const BATCH_SIZE = targetId ? 1 : 3;
  const batches = [];
  for (let i = 0; i < models.length; i += BATCH_SIZE) {
    batches.push(models.slice(i, i + BATCH_SIZE));
  }

  let successCount = 0;
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`  Batch ${b + 1}/${batches.length}: ${batch.map(a => a.name).join(', ')}`);

    try {
      const result = await generateBatch(batch.map(a => a.desc));
      console.log(`    Batch result: ${result.succeeded}/${result.total} succeeded`);

      for (let i = 0; i < result.results.length; i++) {
        const item = result.results[i];
        const asset = batch[i];
        const file = join(GENERATED, asset.subdir, `${asset.id}.json`);

        if (item.success) {
          saveJson(file, item.modelJson);
          asset._modelJson = item.modelJson; // cache for animation phase
          successCount++;
        } else {
          console.error(`    ✗ ${asset.name} batch failed: ${item.error}`);
          // Fallback: try single generation
          try {
            console.log(`    🔄 ${asset.name} fallback single generation...`);
            const modelJson = await generateModelSingle(asset.desc);
            saveJson(file, modelJson);
            asset._modelJson = modelJson;
            successCount++;
            await sleep(2000);
          } catch (fallbackErr) {
            console.error(`    ✗ ${asset.name} fallback also failed: ${fallbackErr.message}`);
          }
        }
      }
    } catch (err) {
      console.error(`  Batch ${b + 1} failed entirely: ${err.message}`);
      // Fallback entire batch to single generation
      for (const asset of batch) {
        try {
          console.log(`    🔄 ${asset.name} fallback single generation...`);
          const modelJson = await generateModelSingle(asset.desc);
          const file = join(GENERATED, asset.subdir, `${asset.id}.json`);
          saveJson(file, modelJson);
          asset._modelJson = modelJson;
          successCount++;
          await sleep(2000);
        } catch (fallbackErr) {
          console.error(`    ✗ ${asset.name} fallback failed: ${fallbackErr.message}`);
        }
      }
    }

    if (b < batches.length - 1) await sleep(3000);
  }

  console.log(`\n📊 模型生成完成: ${successCount}/${models.length}\n`);

  // ---- Phase 2: Generate animations ----
  console.log('🎬 Phase 2: 生成动画...\n');

  let animSuccess = 0;
  let animTotal = 0;

  for (const asset of models) {
    if (!asset._modelJson) {
      // Try loading from disk if batch already saved but we lost the ref
      const file = join(GENERATED, asset.subdir, `${asset.id}.json`);
      if (existsSync(file)) {
        try { asset._modelJson = JSON.parse(readFileSync(file, 'utf-8')); } catch {}
      }
    }
    if (!asset._modelJson) {
      console.log(`  ⚠ ${asset.name} 无模型，跳过动画`);
      continue;
    }

    // Idle animation for ALL
    const idleFile = join(GENERATED, asset.animSubdir, `${asset.id}_idle.json`);
    animTotal++;
    try {
      const plan = await generateAnimation(
        asset._modelJson,
        '缓慢的呼吸待机动画，轻微上下浮动，平和安静，可循环',
        2.5
      );
      saveJson(idleFile, plan);
      animSuccess++;
    } catch (err) {
      console.error(`  ❌ ${asset.name} idle 动画失败: ${err.message}`);
    }
    await sleep(1500);

    // Walk animation for pets (and player-nezha)
    if (asset.hasWalk) {
      const walkFile = join(GENERATED, asset.animSubdir, `${asset.id}_walk.json`);
      animTotal++;
      try {
        const plan = await generateAnimation(
          asset._modelJson,
          '可爱的行走循环，小步蹦跳，轻微摇摆，可循环',
          asset.id === 'player-nezha' ? 1.0 : 1.5
        );
        saveJson(walkFile, plan);
        animSuccess++;
      } catch (err) {
        console.error(`  ❌ ${asset.name} walk 动画失败: ${err.message}`);
      }
      await sleep(1500);
    }

    // Jump animation for player-nezha only
    if (asset.id === 'player-nezha') {
      const jumpFile = join(GENERATED, asset.animSubdir, `${asset.id}_jump.json`);
      animTotal++;
      try {
        const plan = await generateAnimation(
          asset._modelJson,
          '轻快的跳跃动画，身体向上弹起然后落下，充满活力',
          1.0
        );
        saveJson(jumpFile, plan);
        animSuccess++;
      } catch (err) {
        console.error(`  ❌ ${asset.name} jump 动画失败: ${err.message}`);
      }
      await sleep(1500);
    }
  }

  console.log(`\n📊 动画生成完成: ${animSuccess}/${animTotal}`);
  console.log('\n✅ All done!');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
