#!/usr/bin/env node
import { writeFileSync } from 'fs';

const API = 'https://voxel-studio-backend.zeabur.app';

async function generate() {
  console.log('[Gen] Generating countryside shop model...');
  const resp = await fetch(`${API}/api/generate/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'a charming lowpoly countryside wooden shop, rustic rural architecture with timber beams, a sloped shingle roof, flower boxes under the windows, a small wooden porch with steps, warm and cozy village store aesthetic, natural wood tones',
      provider: 'fireworks',
    }),
  });

  if (!resp.ok) {
    console.error('[Gen] HTTP Failed:', resp.status, resp.statusText);
    process.exit(1);
  }

  const text = await resp.text();
  console.log('[Gen] Raw response length:', text.length);

  let modelJson = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    let e;
    try { e = JSON.parse(payload); } catch { continue; }
    console.log('[Gen] SSE event:', e.stage || e.event || 'unknown');
    if (e.stage === 'error') {
      console.error('[Gen] Server error:', e.error);
      process.exit(1);
    }
    if (e.done || e.stage === 'result') {
      modelJson = e.modelJson;
      break;
    }
  }

  if (!modelJson) {
    console.error('[Gen] No modelJson in response');
    process.exit(1);
  }

  writeFileSync('public/generated/models/country_shop.json', JSON.stringify(modelJson, null, 2));
  console.log('[Gen] ✓ Saved country_shop.json');
}

generate().catch((err) => { console.error('[Gen] Fatal:', err); process.exit(1); });
