#!/usr/bin/env node
import { writeFileSync } from 'fs';

const API = 'https://voxel-studio-backend.zeabur.app';

async function generate() {
  console.log('[Gen] Regenerating pet house with better prompt...');
  const resp = await fetch(`${API}/api/generate/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'an exquisite lowpoly fairy-tale pet house nestled in nature, built from warm timber logs and river stones, covered with soft green moss and tiny wildflowers on the roof, a round wooden door with a paw-print carving, smoke curling from a small stone chimney, dappled sunlight, cozy and magical woodland cottage aesthetic',
      provider: 'fireworks',
    }),
  });

  if (!resp.ok) {
    console.error('[Gen] Failed:', resp.status, resp.statusText);
    process.exit(1);
  }

  const text = await resp.text();
  let modelJson = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const e = JSON.parse(line.slice(5).trim());
    if (e.stage === 'error') throw new Error(e.error);
    if (e.done || e.stage === 'result') { modelJson = e.modelJson; break; }
  }

  if (!modelJson) {
    console.error('[Gen] No modelJson in response');
    process.exit(1);
  }

  writeFileSync('public/generated/models/pet_house.json', JSON.stringify(modelJson, null, 2));
  console.log('[Gen] ✓ Overwrote pet_house.json');
}

generate().catch((err) => { console.error('[Gen] Fatal:', err); process.exit(1); });
