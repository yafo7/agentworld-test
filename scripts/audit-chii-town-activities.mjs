import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTownActivityRegistrySeed } from '../src/demos/chii-island/data/townActivityRegistry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectBindings(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectBindings(item, output);
  } else if (value && typeof value === 'object') {
    if (value.kind) output.push(value);
    for (const child of Object.values(value)) collectBindings(child, output);
  }
  return output;
}

const records = createTownActivityRegistrySeed();
const rows = [];
const missing = [];

for (const record of records) {
  const bindings = collectBindings(record.assets);
  const files = [...new Set(bindings.map(binding => binding.path).filter(Boolean))];
  for (const file of files) {
    try {
      await access(path.join(root, 'public', file));
    } catch {
      missing.push({ activityId: record.id, file });
    }
  }
  rows.push({
    id: record.id,
    status: record.status,
    location: record.plan.locationId,
    participants: record.plan.participants.join(','),
    models: Object.keys(record.assets.models || {}).length,
    animations: Object.keys(record.assets.animations || {}).length,
    outfits: Object.keys(record.assets.outfits || {}).length,
    mounts: Object.keys(record.assets.mounts || {}).length,
    missing: missing.filter(item => item.activityId === record.id).length,
  });
}

console.table(rows);
if (missing.length) {
  console.error('[TownActivityAudit] Missing registered files:');
  for (const item of missing) console.error(`${item.activityId}: ${item.file}`);
  process.exitCode = 1;
} else {
  console.log(`[TownActivityAudit] ${records.length} ready activities; every registered file is available.`);
}
