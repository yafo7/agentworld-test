import { normalizeMap } from 'worldforge-studio/map-core';

const args = new Map(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
const api = String(args.get('api') || 'http://127.0.0.1:8797').replace(/\/$/, '');
const mapId = String(args.get('map-id') || '');
const renderSchemeId = String(args.get('render-scheme') || 'render-runtime-cel-day');
if (!mapId) throw new Error('Usage: npm run create:forge-base -- --map-id=<worldforge-map-id>');

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

const { map: source } = await request(`${api}/api/maps/${encodeURIComponent(mapId)}`);
const resolutionX = source.terrain.resolutionX;
const resolutionZ = source.terrain.resolutionZ;
const [width, , depth] = source.box.size;
const heights = [];
const grass = [];

for (let zIndex = 0; zIndex < resolutionZ; zIndex += 1) {
  const z = -depth / 2 + zIndex * depth / (resolutionZ - 1);
  for (let xIndex = 0; xIndex < resolutionX; xIndex += 1) {
    const x = -width / 2 + xIndex * width / (resolutionX - 1);
    const riverCenter = Math.sin(z * 0.035) * 5 + Math.sin(z * 0.083) * 1.8;
    const riverDistance = Math.abs(x - riverCenter);
    const edge = Math.min(width / 2 - Math.abs(x), depth / 2 - Math.abs(z));
    const rolling = Math.sin(x * 0.045) * 0.34 + Math.cos(z * 0.052) * 0.28;
    const shore = riverDistance < 7 ? -0.65 + riverDistance * 0.08 : rolling;
    heights.push(Math.max(-0.8, shore + Math.min(0, edge - 5) * 0.06));
    const edgeForest = edge < 20 ? 0.95 : 0.58;
    grass.push(riverDistance < 8 ? 0 : edgeForest);
  }
}

const map = normalizeMap({
  ...source,
  name: 'Chii Island Forge v1',
  terrain: { ...source.terrain, heights },
  grassLayers: [{
    id: 'chii-meadow',
    name: '奇异岛草地',
    visible: true,
    seed: source.seed,
    resolutionX,
    resolutionZ,
    densities: grass,
    mix: { short: 0.72, tall: 0.22, flowers: 0.06 },
  }],
  waterBodies: [{
    id: 'chii-river',
    name: '奇异岛河流',
    type: 'river',
    level: 0.08,
    depth: 0.85,
    width: 11,
    points: [
      [-2, -96], [-6, -64], [2, -32], [-4, 0], [4, 32], [-1, 64], [3, 96]
    ],
  }],
  spawnPoints: [[-36, 1.5, -38]],
  spawnYaw: Math.PI / 2,
  renderSchemeId,
  confirmedAt: Date.now(),
  renderPromptSuggestions: ['温暖卡通小岛', '自然日光', '柔和草地'],
  objects: [],
  assets: [],
  collisionBake: undefined,
});

const result = await request(`${api}/api/editor/maps/${encodeURIComponent(mapId)}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ map }),
});
console.log(JSON.stringify({
  ok: true,
  mapId: result.map.id,
  version: result.map.version,
  terrainSamples: result.map.terrain.heights.length,
  waterBodies: result.map.waterBodies.length,
  grassLayers: result.map.grassLayers.length,
  renderSchemeId: result.map.renderSchemeId,
}, null, 2));
