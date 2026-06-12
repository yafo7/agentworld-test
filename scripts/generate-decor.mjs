#!/usr/bin/env node
/**
 * Generate 3D models for decorations and trees via Voxel Studio batch API.
 * Saves results to public/generated/models/
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = `${__dirname}/../public/generated/models`;
mkdirSync(OUT_DIR, { recursive: true });

const API = 'https://voxel-studio-backend.zeabur.app';

const ASSETS = [
  // Decorations
  { id: 'ps5_console',   name: 'ps5游戏机',   desc: 'a lowpoly PlayStation 5 game console, white and black sleek body, futuristic design, standing vertically' },
  { id: 'ns2_console',   name: 'ns2游戏机',   desc: 'a lowpoly Nintendo Switch 2 handheld game console with attached controllers, colorful screen, portable' },
  { id: 'thunder_snow',  name: '雷霆大雪绒',  desc: 'a lowpoly cute round fluffy snow plushie toy with thunderbolt lightning patterns, soft and chubby' },
  // Named trees
  { id: 'tree_marko',    name: '玛扣',        desc: 'a lowpoly stylized ancient fantasy tree with thick gnarled trunk and round dense canopy, wise looking' },
  { id: 'tree_witch',    name: '魔女',        desc: 'a lowpoly witchy magical tree with twisted spooky branches and purple violet leaves, enchanting aura' },
  { id: 'tree_yafo',     name: 'yafo',        desc: 'a lowpoly tropical palm tree with long curved green fronds and a slender trunk, beach style' },
  { id: 'tree_goldfish', name: '金鱼',        desc: 'a lowpoly ornamental golden fish-shaped topiary tree, elegant garden sculpture style' },
  // Random extra trees
  { id: 'tree_rand_1',   name: '摇光松',      desc: 'a lowpoly pine tree with swaying needle branches and a tall straight trunk, starlight themed' },
  { id: 'tree_rand_2',   name: '幻影柳',      desc: 'a lowpoly weeping willow tree with long hanging branches touching the ground, ghostly ethereal' },
  { id: 'tree_rand_3',   name: '雷鸣柏',      desc: 'a lowpy cypress tree with sharp dark green needles and a narrow spire shape, thunder themed' },
  { id: 'tree_rand_4',   name: '晨露榕',      desc: 'a lowpoly banyan tree with wide spreading aerial roots and broad leaves, morning dew themed' },
  { id: 'tree_rand_5',   name: '星尘槐',      desc: 'a lowpoly locust tree with delicate star-shaped leaves and a graceful branching structure' },
  { id: 'tree_rand_6',   name: '霜火杨',      desc: 'a lowpoly poplar tree with half icy blue and half fiery red leaves, contrasting seasons' },
];

async function generateBatch() {
  console.log(`[Gen] Sending batch request for ${ASSETS.length} models...`);

  const resp = await fetch(`${API}/api/generate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      descriptions: ASSETS.map(a => a.desc),
      provider: 'fireworks',
    }),
  });

  if (!resp.ok) {
    console.error('[Gen] Batch request failed:', resp.status, resp.statusText);
    const text = await resp.text();
    console.error(text);
    process.exit(1);
  }

  const result = await resp.json();
  console.log(`[Gen] Results: ${result.succeeded}/${result.total} succeeded`);

  for (let i = 0; i < result.results.length; i++) {
    const item = result.results[i];
    const asset = ASSETS[i];

    if (item.success) {
      const path = `${OUT_DIR}/${asset.id}.json`;
      writeFileSync(path, JSON.stringify(item.modelJson, null, 2));
      console.log(`[Gen] ✓ ${asset.name} -> ${asset.id}.json (${item.meshCount} meshes)`);
    } else {
      console.error(`[Gen] ✗ ${asset.name} failed: ${item.error}`);
    }
  }
}

generateBatch().catch((err) => {
  console.error('[Gen] Fatal error:', err);
  process.exit(1);
});
