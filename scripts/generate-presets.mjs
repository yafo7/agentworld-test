// ═══════════════════════════════════════════════════════════════
// Preset model & animation generator.
// Run: node scripts/generate-presets.mjs
// Calls Voxel Studio API → saves modelJson + animation plans to public/generated/
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

async function generateModel(description, provider = 'fireworks') {
  const providers = [provider, 'glm', 'gpt', 'deepseek'];
  for (const p of providers) {
    try {
      console.log(`  [${p}] ${description.slice(0, 60)}...`);
      const resp = await fetch(`${API_BASE}/api/generate/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, provider: p }),
        signal: AbortSignal.timeout(60000),
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

async function generateAnimation(modelJson, description, duration = 2.5) {
  const providers = ['fireworks', 'glm', 'gpt', 'deepseek'];
  for (const p of providers) {
    try {
      console.log(`    anim: ${description.slice(0, 50)}... [${p}]`);
      const resp = await fetch(`${API_BASE}/api/generate/animation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelJson, description, duration, provider: p }),
        signal: AbortSignal.timeout(60000),
      });
      if (resp.status === 429) { console.warn(`    429, next...`); continue; }
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
// Configs
// ===================================================================

const ENVIRONMENTS = [
  {
    name: 'forest',
    description: 'a lowpoly forest environment, green ground with small trees, mossy, peaceful woodland',
  },
  {
    name: 'grassland',
    description: 'a lowpoly grassland environment, open field with flowers, warm yellow-green, sunny meadow',
  },
  {
    name: 'pond',
    description: 'a lowpoly pond environment, blue water surface with gentle ripples, cool peaceful pool',
  },
];

const ITEMS = [
  {
    name: 'moss_lamp',
    description: 'a lowpoly small moss lamp, soft cyan bioluminescent glow, cute round shape, gentle light',
  },
  {
    name: 'sun_stone',
    description: 'a lowpoly sun stone crystal, warm glowing orange amber gem, small and radiant',
  },
  {
    name: 'wind_chime',
    description: 'a lowpoly wind chime, delicate green hanging ornament with small bells, plant-like',
  },
];

const PETS = [
  {
    name: '雨灯绒',
    description: 'a lowpoly cute magical creature like a raindrop lantern hybrid, semi-transparent cyan body, soft glowing, small round shape with tiny feet, delicate and shy',
  },
  {
    name: '小石芽',
    description: 'a lowpoly cute creature like a small stone with a sprout growing from it, warm orange-brown body, sturdy round shape, tiny leaves on top, friendly and reliable',
  },
  {
    name: '风铃草',
    description: 'a lowpoly cute creature like wind grass and bell flower combined, light green slender body, playful shape with petal-like features, musical and cheerful',
  },
];

// ===================================================================
// Main
// ===================================================================

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Voxel Studio — Preset Generator    ║');
  console.log('╚══════════════════════════════════════╝\n');

  const allModels = [...ENVIRONMENTS, ...ITEMS, ...PETS];
  let total = allModels.length;
  let done = 0;

  // ---- Step 1: Generate Models ----
  console.log('📦 Phase 1: Generating 3D models...\n');

  for (const { name, description } of allModels) {
    const modelPath = join(GENERATED, name.includes('灯') || name.includes('石') || name.includes('风铃')
      ? 'pets/models'
      : (ENVIRONMENTS.some(e => e.name === name) || ITEMS.some(i => i.name === name)
        ? 'models'
        : 'pets/models'), `${name}.json`);

    // Determine subdirectory
    let subdir = 'models';
    if (PETS.some(p => p.name === name)) subdir = 'pets/models';

    const file = join(GENERATED, subdir, `${name}.json`);

    if (existsSync(file)) {
      console.log(`  ⏭ ${name} already cached, skipping`);
      done++;
      continue;
    }

    try {
      const modelJson = await generateModel(description);
      saveJson(file, modelJson);
      done++;
      console.log(`  ✅ ${name} (${done}/${total})\n`);
      // Rate limiting pause
      await sleep(2000);
    } catch (err) {
      console.error(`  ❌ ${name} FAILED: ${err.message}\n`);
    }
  }

  // ---- Step 2: Generate Animations ----
  console.log('\n🎬 Phase 2: Generating animations...\n');

  for (const { name } of allModels) {
    let subdir = 'models';
    if (PETS.some(p => p.name === name)) subdir = 'pets/models';
    const modelFile = join(GENERATED, subdir, `${name}.json`);

    if (!existsSync(modelFile)) {
      console.log(`  ⚠ ${name} model missing, skipping animations`);
      continue;
    }

    const modelJson = JSON.parse(readFileSync(modelFile, 'utf-8'));

    // Idle animation for all
    const idleFile = join(GENERATED, PETS.some(p => p.name === name) ? 'pets/animations' : 'animations', `${name}_idle.json`);
    if (!existsSync(idleFile)) {
      try {
        const plan = await generateAnimation(modelJson, 'gentle breathing idle animation, subtle slow up and down motion, peaceful resting state, loopable');
        saveJson(idleFile, plan);
        await sleep(2000);
      } catch (err) {
        console.error(`  ❌ ${name}_idle anim FAILED: ${err.message}`);
      }
    } else {
      console.log(`  ⏭ ${name}_idle already cached`);
    }

    // Walk animation for pets only
    if (PETS.some(p => p.name === name)) {
      const walkFile = join(GENERATED, 'pets/animations', `${name}_walk.json`);
      if (!existsSync(walkFile)) {
        try {
          const plan = await generateAnimation(modelJson, 'gentle walking cycle, small bobbing motion, cute waddle steps, loopable', 1.5);
          saveJson(walkFile, plan);
          await sleep(2000);
        } catch (err) {
          console.error(`  ❌ ${name}_walk anim FAILED: ${err.message}`);
        }
      } else {
        console.log(`  ⏭ ${name}_walk already cached`);
      }
    }
  }

  console.log('\n✅ All presets processed!');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
