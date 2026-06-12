#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = `${__dirname}/../public/generated/models`;
mkdirSync(OUT_DIR, { recursive: true });

const API = 'https://voxel-studio-backend.zeabur.app';

async function generate() {
  console.log('[Gen] Generating pet house model...');
  const resp = await fetch(`${API}/api/generate/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'a lowpoly cute pet house, small cozy cabin with a round door and a heart-shaped window, warm orange and cream colors',
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

  const path = `${OUT_DIR}/pet_house.json`;
  writeFileSync(path, JSON.stringify(modelJson, null, 2));
  console.log(`[Gen] ✓ Saved pet_house.json`);
}

generate().catch((err) => { console.error('[Gen] Fatal:', err); process.exit(1); });
