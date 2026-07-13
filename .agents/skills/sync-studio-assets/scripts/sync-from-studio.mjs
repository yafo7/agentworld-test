#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_STUDIO = 'http://localhost:8000';

const ASSETS = [
  {
    id: 'nailong',
    label: 'nailong',
    assetId: 'nailong',
    commit: '2026-07-01_16-40-22',
    folder: '一只站立的奶龙，手里拿着一把红色的折扇_3.7m',
    modelOut: 'public/generated/models/nailong.json',
    animations: [
      ['idle', 'public/generated/animations/nailong_idle.json', ['呼吸', '摇摆', 'idle']],
      ['walk', 'public/generated/animations/nailong_walk.json', ['行走', 'walk']],
      ['run', 'public/generated/animations/nailong_run.json', ['奔跑', 'run']],
      ['jump', 'public/generated/animations/nailong_jump.json', ['跳跃', '飞跃', 'jump']],
      ['wave_left', 'public/generated/animations/nailong_wave_left.json', ['挥舞左手', '左手', 'wave']],
      ['fan_spark', 'public/generated/animations/nailong_fan_spark.json', ['扇子', '闪光', 'fan']],
    ],
  },
  {
    id: 'oak',
    label: 'oak',
    assetId: 'm_1782902681545_6tnbkq',
    commit: '2026-07-01_18-40-24',
    folder: '一颗高大的橡树_4.3m',
    modelOut: 'public/generated/models/oak.json',
  },
  {
    id: 'normal-tree',
    label: 'normal-tree',
    assetId: 'm_1782902809342_g9ssc6',
    commit: '2026-07-01_18-45-21',
    folder: '一颗树_1.5m',
    modelOut: 'public/generated/models/normal_tree.json',
  },
  {
    id: 'apple-tree',
    label: 'apple-tree',
    assetId: 'm_1782902961307_m2rb52',
    commit: '2026-07-01_18-47-39',
    folder: '一颗苹果树_1.7m',
    modelOut: 'public/generated/models/apple_tree.json',
  },
  {
    id: 'glowgrass',
    label: 'glowgrass',
    assetId: 'm_1782903132260_m5dpns',
    commit: '2026-07-01_18-50-19',
    folder: '一丛荧光草_1.9m',
    modelOut: 'public/generated/models/glowgrass.json',
  },
  {
    id: 'pink-flower',
    label: 'pink-flower',
    assetId: 'm_1783324896462_ass32c',
    commit: '2026-07-06_16-00-29',
    folder: '一株粉红色的花_1.1m',
    modelOut: 'public/generated/models/pink_flower.json',
  },
  {
    id: 'grass-clump',
    label: 'grass-clump',
    assetId: 'm_1783324779627_8zhv3i',
    commit: '2026-07-06_15-57-38',
    folder: '一从小草_2.0m',
    modelOut: 'public/generated/models/grass_clump.json',
  },
  {
    id: 'trumpet-flower',
    label: 'trumpet-flower',
    assetId: 'm_1783324640413_upjvb8',
    commit: '2026-07-06_15-54-58',
    folder: '一株喇叭花_2.4m',
    modelOut: 'public/generated/models/trumpet_flower.json',
  },
  {
    id: 'blue-tulips',
    label: 'blue-tulips',
    assetId: 'm_1783495597678_n7mzuq',
    commit: '2026-07-08_15-25-24',
    folder: '一丛蓝色的郁金香_1.2m',
    modelOut: 'public/generated/models/blue_tulips.json',
  },
  {
    id: 'wheat-field',
    label: 'wheat-field',
    assetId: 'wheat-field',
    commit: '8ff94eb',
    folder: '一片麦田_1783494517958',
    modelOut: 'public/generated/models/wheat_field.json',
  },
  {
    id: 'flower-pot',
    label: 'flower-pot',
    assetId: 'flower-pot',
    commit: '8ff94eb',
    folder: '圆木花盆_1783496137463',
    modelOut: 'public/generated/models/flower_pot.json',
  },
  {
    id: 'giant-carrot',
    label: 'giant-carrot',
    assetId: 'giant-carrot',
    commit: '8ff94eb',
    folder: '一根巨大的胡萝卜_1783496035572',
    modelOut: 'public/generated/models/giant_carrot.json',
  },
  {
    id: 'windmill',
    label: 'windmill',
    assetId: 'm_1782903666317_v5xkm7',
    commit: '2026-07-01_18-58-41',
    folder: '一个巨大的风车，底部长宽比是2/2_2.4m',
    modelOut: 'public/generated/models/windmill.json',
  },
  {
    id: 'campfire',
    label: 'campfire',
    assetId: 'm_1783573173496_88n5kf',
    commit: '2026-07-09_12-58-15',
    folder: '一个由原木条堆起来的篝火_1.3m',
    modelOut: 'public/generated/models/campfire.json',
    animations: [
      ['burn', 'public/generated/animations/campfire_burn.json', ['燃烧', '火焰', 'burn']],
    ],
  },
  {
    id: 'forest-trophy',
    label: 'forest-trophy',
    assetId: 'm_1783574625142_cbsm97',
    commit: '2026-07-09_13-22-45',
    folder: '一个圆形的科隆major，cs2的冠军奖杯，不要有把手_59.3s',
    modelOut: 'public/generated/models/forest_temple_trophy.json',
    animations: [
      ['wait', 'public/generated/animations/forest_trophy_wait.json', ['召唤等待', '上下跳动', 'wait']],
    ],
  },
  {
    id: 'forest-tent',
    label: 'forest-tent',
    assetId: 'm_1783574993844_zexjyw',
    commit: '2026-07-09_13-28-22',
    folder: '一个野外的露营帐篷_1.5m',
    modelOut: 'public/generated/models/forest_temple_tent.json',
  },
  {
    id: 'church',
    label: 'church',
    assetId: 'm_1782903418394_5e16ir',
    commit: '2026-07-01_18-53-35',
    folder: '一个巨大的哥特教堂，底部长宽比是5/8_3.4m',
    modelOut: 'public/generated/models/church.json',
  },
  {
    id: 'temple',
    label: 'temple',
    assetId: 'm_1782974628699_589hom',
    commit: '2026-07-02_14-42-30',
    folder: '一座西方的古老神殿，占地的长宽比是8/5_1.3m',
    modelOut: 'public/generated/models/temple.json',
  },
  {
    id: 'stump',
    label: 'stump',
    assetId: 'm_1783233755159_68ulo4',
    commit: '2026-07-05_14-40-00',
    folder: '一个树桩_2.6m',
    modelOut: 'public/generated/models/stump.json',
  },
  {
    id: 'fangk',
    label: 'fangk',
    assetId: 'm_1782981320708_dyg5gl',
    commit: '2026-07-02_16-32-30',
    folder: '一位穿着黑色西装的建筑设计师_2.8m',
    modelOut: 'public/generated/models/fangk.json',
    aliases: ['public/generated/models/architect.json'],
    animations: [
      ['idle', 'public/generated/animations/fangk_idle.json', ['呼吸', 'idle', '待机']],
      ['run', 'public/generated/animations/fangk_run.json', ['奔跑', 'run', '走']],
      ['construct', 'public/generated/animations/fangk_construct.json', ['建造', '施工', '挥舞', 'construct']],
    ],
  },
  {
    id: 'momo',
    label: 'momo',
    assetId: 'm_1782975006671_j3z0xr',
    commit: '2026-07-02_14-47-47',
    folder: '一只粉色，圆滚滚的小熊_2.3m',
    modelOut: 'public/generated/models/momo.json',
    animations: [
      ['idle', 'public/generated/animations/momo_idle.json', ['呼吸', 'idle', '待机']],
      ['walk', 'public/generated/animations/momo_walk.json', ['行走', 'walk']],
      ['run', 'public/generated/animations/momo_run.json', ['奔跑', 'run']],
      ['chop', 'public/generated/animations/momo_chop.json', ['伸手向前攻击', 'chop']],
      ['smash', 'public/generated/animations/momo_smash.json', ['拍击', '闪光', 'smash']],
      ['wave', 'public/generated/animations/momo_wave.json', ['挥舞左手', 'wave']],
      ['magic', 'public/generated/animations/momo_magic.json', ['烟雾', 'magic']],
    ],
  },
  {
    id: 'mako',
    label: 'mako',
    assetId: 'm_1782980861175_k8v1ft',
    commit: '2026-07-02_16-25-32',
    folder: '一匹棕色的马儿，身上穿着7号红色球衣_2.1m',
    modelOut: 'public/generated/models/mako.json',
    animations: [...petAnimations('mako'), ['dance', 'public/generated/animations/mako_dance.json', ['跳舞', '舞蹈', 'dance']]],
  },
  {
    id: 'mok',
    label: 'mok',
    assetId: 'm_1782979209392_2y89nt',
    commit: '2026-07-02_15-57-38',
    folder: '一只站立行走的鳄鱼，双手各拿着一把大斧子_2.5m',
    modelOut: 'public/generated/models/mok.json',
    animations: petAnimations('mok'),
  },
  {
    id: 'lingq',
    label: 'lingq',
    assetId: 'm_1782978762044_zuag8m',
    commit: '2026-07-02_15-49-39',
    folder: '一只孔雀_3.0m',
    modelOut: 'public/generated/models/lingq.json',
    animations: [...petAnimations('lingq'), ['dance', 'public/generated/animations/lingq_dance.json', ['跳舞', '舞蹈', 'dance']]],
  },
  {
    id: 'yafo',
    label: 'yafo',
    assetId: 'm_1782976335773_o6d7e1',
    commit: '2026-07-02_15-09-45',
    folder: '一只天蓝色的小鸟_2.5m',
    modelOut: 'public/generated/models/yafo.json',
    animations: petAnimations('yafo'),
  },
];

ASSETS.find(asset => asset.id === 'fangk')?.animations?.push(
  ['dance', 'public/generated/animations/fangk_dance.json', ['跳舞', '舞蹈', 'dance']]
);

function petAnimations(prefix) {
  return [
    ['idle', `public/generated/animations/${prefix}_idle.json`, ['呼吸', '摇摆', 'idle']],
    ['run', `public/generated/animations/${prefix}_run.json`, ['奔跑', 'run', '行走', 'walk']],
    ['jump', `public/generated/animations/${prefix}_jump.json`, ['跳跃', '飞跃', 'jump']],
  ];
}

function parseArgs(argv) {
  const args = {
    studio: DEFAULT_STUDIO,
    dryRun: false,
    publish: false,
    source: 'runtime',
    only: null,
    all: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--publish') args.publish = true;
    else if (a === '--all') args.all = true;
    else if (a === '--studio') args.studio = argv[++i];
    else if (a.startsWith('--studio=')) args.studio = a.slice('--studio='.length);
    else if (a === '--source') args.source = argv[++i];
    else if (a.startsWith('--source=')) args.source = a.slice('--source='.length);
    else if (a === '--only') args.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a.startsWith('--only=')) args.only = a.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '-h' || a === '--help') args.help = true;
  }
  return args;
}

function usage() {
  return `Usage:
  node .agents/skills/sync-studio-assets/scripts/sync-from-studio.mjs --all
  node .agents/skills/sync-studio-assets/scripts/sync-from-studio.mjs --dry-run
  node .agents/skills/sync-studio-assets/scripts/sync-from-studio.mjs --all --publish
  node .agents/skills/sync-studio-assets/scripts/sync-from-studio.mjs --only nailong,mako,yafo

Options:
  --studio URL       Voxel Studio URL, default ${DEFAULT_STUDIO}
  --source SOURCE    runtime | edit | original, default runtime with fallbacks
  --publish          POST /api/assets/:assetId/publish before copying
  --dry-run          Check sources without writing files
`;
}

async function findRepoRoot(start) {
  let dir = start;
  while (true) {
    try {
      await fs.access(path.join(dir, 'src', 'demos', 'chii-island'));
      return dir;
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not find agentworld-test repo root');
    dir = parent;
  }
}

async function fetchJson(url, opts = {}) {
  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`HTTP ${resp.status} ${url}${text ? `: ${text.slice(0, 160)}` : ''}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

async function tryFetchJson(url, opts = {}) {
  try {
    return await fetchJson(url, opts);
  } catch (err) {
    return null;
  }
}

async function loadStudioModel(asset, args) {
  const base = args.studio.replace(/\/$/, '');
  const assetId = encodeURIComponent(asset.assetId);
  if (args.publish) {
    await fetchJson(`${base}/api/assets/${assetId}/publish`, { method: 'POST' });
  }

  const runtimeUrl = `${base}/api/assets/${assetId}/runtime`;
  const editUrl = `${base}/api/assets/${assetId}/edit?commit=${encodeURIComponent(asset.commit)}&folder=${encodeURIComponent(asset.folder)}`;
  const legacyEditUrl = `${base}/api/load-edited/${encodeURIComponent(asset.commit)}/${encodeURIComponent(asset.folder)}`;
  const originalUrl = `${base}/api/model/${encodeURIComponent(asset.commit)}/${encodeURIComponent(asset.folder)}`;

  const order =
    args.source === 'edit' ? [['edit', editUrl], ['legacy-edit', legacyEditUrl], ['runtime', runtimeUrl], ['original', originalUrl]] :
    args.source === 'original' ? [['original', originalUrl]] :
    [['runtime', runtimeUrl], ['edit', editUrl], ['legacy-edit', legacyEditUrl], ['original', originalUrl]];

  for (const [source, url] of order) {
    const data = await tryFetchJson(url);
    const modelJson = data?.modelJson || data;
    if (modelJson && modelJson.nodes) return { modelJson, source, manifest: data?.manifest || null };
  }
  throw new Error(`No model JSON found for ${asset.id} (${asset.assetId})`);
}

async function loadStudioAnimations(asset, args) {
  if (!asset.animations?.length) return [];
  const base = args.studio.replace(/\/$/, '');
  const url = `${base}/api/animations/${encodeURIComponent(asset.commit)}/${encodeURIComponent(asset.folder)}`;
  const data = await fetchJson(url);
  return data.animations || [];
}

function matchAnimation(anims, patterns) {
  const lowerPatterns = patterns.map(p => String(p).toLowerCase());
  return anims.find(anim => {
    const text = `${anim.name || ''} ${anim.description || ''} ${anim._name || ''}`.toLowerCase();
    return lowerPatterns.some(p => text.includes(p.toLowerCase()));
  });
}

function normalizePlan(anim) {
  if (!anim) return null;
  const source = anim.plan || anim.animation || anim.motionPlan || anim;
  const plan = { ...source };
  if (plan._duration === undefined) plan._duration = Number(anim.duration) || 2;
  if (plan._loop === undefined) plan._loop = anim.loop === undefined ? true : anim.loop !== false;
  return plan;
}

async function writeJsonWithBackup(repoRoot, relPath, data, args) {
  const outPath = path.join(repoRoot, relPath);
  const json = JSON.stringify(data, null, 2);
  if (args.dryRun) return { path: relPath, wrote: false };

  try {
    const old = await fs.readFile(outPath, 'utf8');
    if (old !== json) {
      const backupPath = path.join(repoRoot, 'public', 'generated', '_sync-backup', `${Date.now()}_${relPath.replace(/[\\/]/g, '__')}`);
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.writeFile(backupPath, old, 'utf8');
    }
  } catch {}

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, json, 'utf8');
  return { path: relPath, wrote: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const repoRoot = await findRepoRoot(process.cwd());
  const selected = ASSETS.filter(asset => !args.only || args.only.includes(asset.id) || args.only.includes(asset.label));
  if (!selected.length) throw new Error('No assets selected. Use --all or --only <ids>.');

  let preservedAssets = [];
  if (args.only) {
    try {
      const previous = JSON.parse(await fs.readFile(path.join(repoRoot, 'public/generated/chii-runtime-manifest.json'), 'utf8'));
      const selectedIds = new Set(selected.map(asset => asset.id));
      preservedAssets = (previous.assets || []).filter(entry => !selectedIds.has(entry.id));
    } catch {}
  }

  const manifest = {
    syncedAt: new Date().toISOString(),
    studio: args.studio,
    source: args.source,
    publish: args.publish,
    assets: preservedAssets,
  };
  const warnings = [];
  let models = 0;
  let animations = 0;

  console.log(`[sync-studio-assets] ${args.dryRun ? 'dry-run ' : ''}syncing ${selected.length} Chii assets from ${args.studio}`);

  for (const asset of selected) {
    const entry = {
      id: asset.id,
      label: asset.label,
      assetId: asset.assetId,
      commit: asset.commit,
      folder: asset.folder,
      modelOut: asset.modelOut,
      animations: [],
    };

    try {
      const { modelJson, source, manifest: studioManifest } = await loadStudioModel(asset, args);
      entry.source = source;
      entry.runtimeVersion = studioManifest?.runtimeVersion || null;
      await writeJsonWithBackup(repoRoot, asset.modelOut, modelJson, args);
      for (const alias of asset.aliases || []) await writeJsonWithBackup(repoRoot, alias, modelJson, args);
      models++;
      console.log(`  model ${asset.id} <= ${source} -> ${asset.modelOut}`);
    } catch (err) {
      warnings.push(`${asset.id}: model sync failed: ${err.message}`);
      console.warn(`  warn ${asset.id}: ${err.message}`);
      manifest.assets.push(entry);
      continue;
    }

    if (asset.animations?.length) {
      let anims = [];
      try {
        anims = await loadStudioAnimations(asset, args);
      } catch (err) {
        warnings.push(`${asset.id}: animation list failed: ${err.message}`);
      }

      for (const [name, outPath, patterns] of asset.animations) {
        const anim = matchAnimation(anims, patterns);
        if (!anim) {
          warnings.push(`${asset.id}: missing animation ${name} (${patterns.join('|')})`);
          continue;
        }
        const plan = normalizePlan(anim);
        await writeJsonWithBackup(repoRoot, outPath, plan, args);
        entry.animations.push({ name, outPath, studioName: anim.name || anim._name || null });
        animations++;
        console.log(`  anim  ${asset.id}.${name} <= ${anim.name || '(unnamed)'} -> ${outPath}`);
      }
    }

    manifest.assets.push(entry);
  }

  await writeJsonWithBackup(repoRoot, 'public/generated/chii-runtime-manifest.json', manifest, args);

  console.log(`[sync-studio-assets] models=${models} animations=${animations} warnings=${warnings.length}`);
  if (warnings.length) {
    console.log('[sync-studio-assets] warnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main().catch(err => {
  console.error(`[sync-studio-assets] fatal: ${err.message}`);
  process.exit(1);
});
