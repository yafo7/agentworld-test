import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = new Map(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
const api = String(args.get('api') || 'http://127.0.0.1:8797').replace(/\/$/, '');
const mapId = String(args.get('map-id') || '');
const sceneId = String(args.get('scene-id') || 'chii-island-forge-v1');
const output = path.resolve(root, String(args.get('output') || 'public/generated/scenes/forge/worldforge'));
const bindingsPath = path.resolve(root, String(args.get('bindings') || 'src/demos/chii-island/data/forgeGameplayBindings.json'));

if (!mapId) throw new Error('Usage: npm run publish:forge-scene -- --map-id=<worldforge-map-id>');

async function getJson(url) {
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

const { map } = await getJson(`${api}/api/maps/${encodeURIComponent(mapId)}`);
if (!map?.confirmedAt) throw new Error('WorldForge map must be confirmed before publication');
if (!map.renderSchemeId) throw new Error('WorldForge map has no render scheme');
const { renderScheme } = await getJson(`${api}/api/editor/render-schemes/${encodeURIComponent(map.renderSchemeId)}`);
const bindings = JSON.parse(await readFile(bindingsPath, 'utf8'));

const files = {
  map: 'map.json',
  renderScheme: 'render-scheme.json',
  bindings: 'chii-bindings.json',
};
const payloads = {
  map: jsonBytes(map),
  renderScheme: jsonBytes(renderScheme),
  bindings: jsonBytes(bindings),
};

const hdriModule = renderScheme.renderPlan?.modules?.find(module => module.id === 'environment.hdri');
const hdriFile = String(hdriModule?.params?.texture || '').replaceAll('\\', '/').split('/').pop();
if (hdriFile) {
  const response = await fetch(`${api}/api/editor/hdri/${encodeURIComponent(hdriFile)}`);
  if (!response.ok) throw new Error(`Unable to publish HDRI: ${response.status}`);
  files.hdri = `hdri/${hdriFile}`;
  payloads.hdri = Buffer.from(await response.arrayBuffer());
}

await mkdir(output, { recursive: true });
for (const [key, file] of Object.entries(files)) {
  const target = path.join(output, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, payloads[key]);
}

const manifest = {
  schemaVersion: 1,
  kind: 'chii-forge-scene',
  sceneId,
  sourceMapId: map.id,
  sourceMapRevision: map.revision,
  publishedAt: new Date().toISOString(),
  worldForge: { commit: 'b7187ea', packageVersion: '0.1.0' },
  runtime: { renderRuntimeCommit: '1805dfc', threeRevision: '160' },
  files,
  hashes: Object.fromEntries(Object.keys(payloads).map(key => [key, hash(payloads[key])])),
};
await writeFile(path.join(output, 'manifest.json'), jsonBytes(manifest));
console.log(JSON.stringify({ ok: true, output, sceneId, mapId, files }, null, 2));
