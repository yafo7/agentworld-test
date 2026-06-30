#!/usr/bin/env node
/**
 * One-shot sync: push all existing models from agentworld's public/generated/
 * into the local 3d-generate studio (localhost:8000).
 *
 * Usage:
 *   node scripts/sync-to-studio.mjs
 *
 * Prerequisite: 3d-generate server.py must be running on port 8000.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_URL = 'http://localhost:8000';

const MODEL_DIRS = [
  path.resolve(__dirname, '../public/generated/models'),
  path.resolve(__dirname, '../public/generated/pets/models'),
];

async function postSave(name, modelJson, description) {
  const resp = await fetch(`${STUDIO_URL}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: description || name,
      modelJson,
      timestamp: Date.now(),
    }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

async function syncDir(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`[Skip] ${dir} does not exist`);
    return 0;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  let ok = 0;
  let fail = 0;

  for (const file of files) {
    const filepath = path.join(dir, file);
    const name = file.replace(/\.json$/, '');
    try {
      const raw = fs.readFileSync(filepath, 'utf-8');
      const modelJson = JSON.parse(raw);
      await postSave(name, modelJson, name);
      console.log(`  ✅ ${name}`);
      ok++;
    } catch (err) {
      console.error(`  ❌ ${name}: ${err.message}`);
      fail++;
    }
  }

  console.log(`[Done] ${path.basename(dir)} — ${ok} synced, ${fail} failed`);
  return ok;
}

async function main() {
  console.log(`[StudioSync] Target: ${STUDIO_URL}`);
  let total = 0;
  for (const dir of MODEL_DIRS) {
    total += await syncDir(dir);
  }
  console.log(`[StudioSync] Total synced: ${total}`);
}

main().catch(err => {
  console.error('[StudioSync] Fatal error:', err.message);
  process.exit(1);
});
