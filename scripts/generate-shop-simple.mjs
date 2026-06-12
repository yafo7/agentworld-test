#!/usr/bin/env node
import { writeFileSync } from 'fs';

const API = 'https://voxel-studio-backend.zeabur.app';

async function generate() {
  console.log('[Gen] Generating shop with simple prompt...');
  const resp = await fetch(`${API}/api/generate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      descriptions: ['a lowpoly wooden rural shop building, simple cozy store'],
      provider: 'glm',
    }),
  });

  if (!resp.ok) {
    console.error('[Gen] HTTP Failed:', resp.status);
    process.exit(1);
  }

  const result = await resp.json();
  console.log(`[Gen] Results: ${result.succeeded}/${result.total}`);

  const item = result.results[0];
  if (item.success) {
    writeFileSync('public/generated/models/country_shop.json', JSON.stringify(item.modelJson, null, 2));
    console.log(`[Gen] ✓ Saved country_shop.json (${item.meshCount} meshes)`);
  } else {
    console.error('[Gen] Failed:', item.error);
    process.exit(1);
  }
}

generate().catch((err) => { console.error('[Gen] Fatal:', err); process.exit(1); });
