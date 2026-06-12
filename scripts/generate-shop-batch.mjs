#!/usr/bin/env node
import { writeFileSync } from 'fs';

const API = 'https://voxel-studio-backend.zeabur.app';

async function generate() {
  console.log('[Gen] Generating countryside shop via batch API...');
  const resp = await fetch(`${API}/api/generate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      descriptions: [
        'a charming lowpoly countryside wooden shop, rustic rural architecture with timber beams, a sloped shingle roof, flower boxes under the windows, a small wooden porch with steps, warm and cozy village store aesthetic, natural wood tones'
      ],
      provider: 'fireworks',
    }),
  });

  if (!resp.ok) {
    console.error('[Gen] HTTP Failed:', resp.status, resp.statusText);
    process.exit(1);
  }

  const result = await resp.json();
  console.log('[Gen] Results:', result.succeeded, '/', result.total);

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
