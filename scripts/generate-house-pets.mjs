#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'fs';

const API = 'https://voxel-studio-backend.zeabur.app';
const OUT_DIR = 'public/generated/pets/models';
const ANIM_DIR = 'public/generated/pets/animations';
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(ANIM_DIR, { recursive: true });

const PETS = [
  { name: '马扣', desc: 'a lowpoly cute small pony foal, warm brown coat, fluffy mane, big gentle eyes, compact and adorable' },
  { name: '扶摇', desc: 'a lowpoly elegant small songbird, soft blue and white feathers, delicate wings, bright curious eyes, perched posture' },
  { name: 'momo', desc: 'a lowpoly round chubby pink hamster-like creature, rosy cheeks, tiny paws, sleepy expression, very round and soft' },
];

async function generateModels() {
  console.log('[Gen] Batch generating 3 pet models...');
  const resp = await fetch(`${API}/api/generate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      descriptions: PETS.map(p => p.desc),
      provider: 'fireworks',
    }),
  });

  if (!resp.ok) {
    console.error('[Gen] Batch failed:', resp.status);
    process.exit(1);
  }

  const result = await resp.json();
  console.log(`[Gen] Models: ${result.succeeded}/${result.total}`);

  const modelJsons = [];
  for (let i = 0; i < result.results.length; i++) {
    const item = result.results[i];
    const pet = PETS[i];
    if (item.success) {
      writeFileSync(`${OUT_DIR}/${pet.name}.json`, JSON.stringify(item.modelJson, null, 2));
      console.log(`[Gen] ✓ ${pet.name}.json (${item.meshCount} meshes)`);
      modelJsons.push(item.modelJson);
    } else {
      console.error(`[Gen] ✗ ${pet.name} failed: ${item.error}`);
      modelJsons.push(null);
    }
  }
  return modelJsons;
}

async function generateAnimation(modelJson, petName, type) {
  if (!modelJson) return;
  const desc = type === 'idle'
    ? 'gentle idle breathing, subtle head movements, relaxed and calm'
    : 'short walking cycle, legs moving in rhythm, slight body bounce';

  const resp = await fetch(`${API}/api/generate/animation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelJson,
      description: desc,
      duration: 2.0,
      provider: 'fireworks',
    }),
  });

  if (!resp.ok) {
    console.error(`[Gen] Animation ${petName}_${type} HTTP failed:`, resp.status);
    return;
  }

  const result = await resp.json();
  if (result.plan) {
    writeFileSync(`${ANIM_DIR}/${petName}_${type}.json`, JSON.stringify(result.plan, null, 2));
    console.log(`[Gen] ✓ ${petName}_${type}.json`);
  } else {
    console.error(`[Gen] ✗ ${petName}_${type} failed:`, result.error || 'no plan');
  }
}

async function main() {
  const modelJsons = await generateModels();
  for (let i = 0; i < PETS.length; i++) {
    await generateAnimation(modelJsons[i], PETS[i].name, 'idle');
    await generateAnimation(modelJsons[i], PETS[i].name, 'walk');
  }
  console.log('[Gen] All done.');
}

main().catch(err => { console.error('[Gen] Fatal:', err); process.exit(1); });
