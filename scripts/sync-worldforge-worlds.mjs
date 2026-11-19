import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WORLD_FORGE_WORLD_DEFINITIONS } from '../src/demos/chii-island/data/worldForgeWorlds.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const args = new Map(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
const api = String(args.get('api') || 'http://127.0.0.1:8797').replace(/\/$/, '');
const outputRoot = path.resolve(projectRoot, String(args.get('output') || 'public/generated/worlds/worldforge'));
const dryRun = args.has('dry-run');
const force = args.has('force');
const selectedIds = String(args.get('only') || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const definitions = selectedIds.length
  ? WORLD_FORGE_WORLD_DEFINITIONS.filter(entry => selectedIds.includes(entry.id))
  : WORLD_FORGE_WORLD_DEFINITIONS;

if (selectedIds.length && definitions.length !== selectedIds.length) {
  const known = new Set(definitions.map(entry => entry.id));
  throw new Error(`Unknown world ids: ${selectedIds.filter(id => !known.has(id)).join(', ')}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readCatalog() {
  try {
    return JSON.parse(await readFile(path.join(outputRoot, 'catalog.json'), 'utf8'));
  } catch {
    return { schemaVersion: 1, kind: 'chii-world-catalog', worlds: [] };
  }
}

async function atomicWrite(target, bytes) {
  const temp = `${target}.tmp-${process.pid}`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temp, bytes);
  await rename(temp, target);
}

async function createPackage(definition) {
  const { map } = await fetchJson(`${api}/api/maps/${encodeURIComponent(definition.sourceMapId)}`);
  if (!map?.confirmedAt) throw new Error(`${definition.id}: WorldForge map is not confirmed`);
  if (!Number.isInteger(map.version)) throw new Error(`${definition.id}: source map version is missing`);
  if (!map.renderSchemeId) throw new Error(`${definition.id}: source map has no render scheme`);
  const { renderScheme } = await fetchJson(`${api}/api/editor/render-schemes/${encodeURIComponent(map.renderSchemeId)}`);

  const bindings = {
    schemaVersion: 2,
    worldId: definition.id,
    gameplayPreset: definition.gameplayPreset,
    spawns: { player: map.spawnPoints?.[0] || [0, 3, 0] },
    zones: {},
    objects: {},
    portals: [],
  };
  const files = { map: 'map.json', renderScheme: 'render-scheme.json', bindings: 'chii-bindings.json' };
  const payloads = { map: jsonBytes(map), renderScheme: jsonBytes(renderScheme), bindings: jsonBytes(bindings) };

  const hdriModule = renderScheme.renderPlan?.modules?.find(module => module.id === 'environment.hdri');
  const hdriFile = String(hdriModule?.params?.texture || '').replaceAll('\\', '/').split('/').pop();
  if (hdriFile) {
    const response = await fetch(`${api}/api/editor/hdri/${encodeURIComponent(hdriFile)}`);
    if (!response.ok) throw new Error(`${definition.id}: HDRI is unavailable (${response.status})`);
    files.hdri = `hdri/${hdriFile}`;
    payloads.hdri = Buffer.from(await response.arrayBuffer());
  }

  const revision = `v${map.version}`;
  const packageRoot = `${definition.id}/revisions/${revision}`;
  const manifest = {
    schemaVersion: 2,
    kind: 'chii-worldforge-world',
    worldId: definition.id,
    mapNumber: definition.mapNumber,
    sourceMapId: map.id,
    sourceMapVersion: map.version,
    sourceMapUpdatedAt: map.updatedAt,
    publishedAt: new Date().toISOString(),
    gameplayPreset: definition.gameplayPreset,
    worldForge: { packageVersion: '0.1.0' },
    runtime: { renderRuntimeCommit: '1805dfc', threeRevision: '160' },
    files,
    hashes: Object.fromEntries(Object.keys(payloads).map(key => [key, hash(payloads[key])])),
  };
  return { map, manifest, payloads, packageRoot, revision };
}

const previousCatalog = await readCatalog();
const worlds = new Map((previousCatalog.worlds || []).map(entry => [entry.id, entry]));
const report = [];

for (const definition of definitions) {
  try {
    const result = await createPackage(definition);
    const previous = worlds.get(definition.id);
    const status = force
      ? (previous ? 'updated' : 'added')
      : previous?.sourceMapVersion === result.map.version ? 'same' : previous ? 'updated' : 'added';
    const entry = {
      id: definition.id,
      mapNumber: definition.mapNumber,
      name: definition.name,
      description: definition.description,
      order: definition.order,
      gameplayPreset: definition.gameplayPreset,
      sourceMapId: result.map.id,
      sourceMapVersion: result.map.version,
      sourceMapUpdatedAt: result.map.updatedAt,
      packageRoot: result.packageRoot,
      manifestHash: hash(jsonBytes(result.manifest)),
    };
    worlds.set(definition.id, entry);

    if (!dryRun && status !== 'same') {
      const packagePath = path.join(outputRoot, result.packageRoot);
      for (const [key, file] of Object.entries(result.manifest.files)) {
        const target = path.join(packagePath, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, result.payloads[key]);
      }
      await writeFile(path.join(packagePath, 'manifest.json'), jsonBytes(result.manifest));
    }
    report.push({ id: definition.id, status, sourceMapVersion: result.map.version });
  } catch (error) {
    report.push({ id: definition.id, status: 'failed', error: error.message });
  }
}

const catalog = {
  schemaVersion: 1,
  kind: 'chii-world-catalog',
  generatedAt: new Date().toISOString(),
  worlds: [...worlds.values()].sort((a, b) => (a.order || 0) - (b.order || 0)),
};

if (
  !dryRun
  && !report.some(entry => entry.status === 'failed')
  && report.some(entry => entry.status === 'added' || entry.status === 'updated')
) {
  const catalogPath = path.join(outputRoot, 'catalog.json');
  try {
    await copyFile(catalogPath, path.join(outputRoot, 'catalog.previous.json'));
  } catch {
    // First publication has no previous catalog.
  }
  await atomicWrite(catalogPath, jsonBytes(catalog));
}

console.log(JSON.stringify({ ok: !report.some(entry => entry.status === 'failed'), dryRun, outputRoot, report }, null, 2));
if (report.some(entry => entry.status === 'failed')) process.exitCode = 1;
