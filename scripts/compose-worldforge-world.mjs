import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const args = new Map(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
const definitionPath = args.get('definition')
  ? path.resolve(projectRoot, String(args.get('definition')))
  : null;
if (!definitionPath) {
  throw new Error('Usage: npm run compose:worldforge-world -- --definition=<composition.json>');
}

const sourceRoot = path.resolve(projectRoot, 'public/generated/worlds/worldforge');
const outputRoot = path.resolve(projectRoot, String(args.get('output') || 'public/generated/worlds/worldforge-compositions'));

function bytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function translatePoint(point, dx, dz) {
  return [Number(point?.[0] || 0) + dx, Number(point?.[1] || 0), Number(point?.[2] || 0) + dz];
}

function namespace(id, value) {
  return value ? `${id}:${value}` : null;
}

function assertDefinition(definition) {
  if (!/^[a-z0-9][a-z0-9_-]+$/i.test(definition?.id || '')) throw new Error('Composition id is invalid');
  if (!Array.isArray(definition.regions) || definition.regions.length < 2) throw new Error('Composition needs at least two regions');
  const slots = new Set();
  for (const region of definition.regions) {
    if (!region.worldId || !Array.isArray(region.slot) || region.slot.length !== 2) {
      throw new Error('Each region requires worldId and slot [x,z]');
    }
    if (!region.slot.every(Number.isInteger) || region.slot.some(value => value < 0)) {
      throw new Error('Composition slots must be non-negative integers');
    }
    const key = region.slot.join(',');
    if (slots.has(key)) throw new Error(`Duplicate composition slot: ${key}`);
    slots.add(key);
  }
}

async function loadSource(catalog, worldId) {
  const entry = catalog.worlds.find(world => world.id === worldId);
  if (!entry) throw new Error(`Published WorldForge world not found: ${worldId}`);
  const root = path.join(sourceRoot, entry.packageRoot);
  return {
    entry,
    map: JSON.parse(await readFile(path.join(root, 'map.json'), 'utf8')),
    renderScheme: JSON.parse(await readFile(path.join(root, 'render-scheme.json'), 'utf8')),
  };
}

function mergeGrid(sources, definition, property, fallback = 0) {
  const first = sources[0].map[property];
  const sourceWidth = first.resolutionX;
  const sourceDepth = first.resolutionZ;
  const cellsX = sourceWidth - 1;
  const cellsZ = sourceDepth - 1;
  const columns = Math.max(...definition.regions.map(region => region.slot[0])) + 1;
  const rows = Math.max(...definition.regions.map(region => region.slot[1])) + 1;
  const resolutionX = columns * cellsX + 1;
  const resolutionZ = rows * cellsZ + 1;
  const values = Array(resolutionX * resolutionZ).fill(fallback);
  const counts = Array(resolutionX * resolutionZ).fill(0);
  sources.forEach((source, index) => {
    const grid = source.map[property];
    if (grid.resolutionX !== sourceWidth || grid.resolutionZ !== sourceDepth) {
      throw new Error(`${property} resolution mismatch in ${source.entry.id}`);
    }
    const [slotX, slotZ] = definition.regions[index].slot;
    const sourceValues = property === 'terrain' ? grid.heights : grid.densities;
    for (let z = 0; z < sourceDepth; z += 1) {
      for (let x = 0; x < sourceWidth; x += 1) {
        const targetX = slotX * cellsX + x;
        const targetZ = slotZ * cellsZ + z;
        const targetIndex = targetZ * resolutionX + targetX;
        values[targetIndex] += Number(sourceValues[z * sourceWidth + x] || 0);
        counts[targetIndex] += 1;
      }
    }
  });
  values.forEach((_, index) => {
    if (counts[index] > 0) values[index] /= counts[index];
  });
  return { resolutionX, resolutionZ, values };
}

function transformSource(source, region, totalWidth, totalDepth) {
  const [width, , depth] = source.map.box.size;
  const dx = -totalWidth / 2 + (region.slot[0] + 0.5) * width;
  const dz = -totalDepth / 2 + (region.slot[1] + 0.5) * depth;
  const prefix = region.worldId;
  const assets = (source.map.assets || []).map(asset => ({ ...asset, id: namespace(prefix, asset.id) }));
  const objects = (source.map.objects || []).map(object => ({
    ...object,
    id: namespace(prefix, object.id),
    parentId: namespace(prefix, object.parentId),
    assetId: namespace(prefix, object.assetId),
    transform: { ...object.transform, position: translatePoint(object.transform?.position, dx, dz) },
  }));
  const waterBodies = (source.map.waterBodies || []).map(water => ({
    ...water,
    id: namespace(prefix, water.id),
    points: (water.points || []).map(point => translatePoint(point, dx, dz)),
  }));
  const boxes = (source.map.collisionBake?.boxes || []).map(box => ({
    ...box,
    objectId: namespace(prefix, box.objectId),
    min: translatePoint(box.min, dx, dz),
    max: translatePoint(box.max, dx, dz),
  }));
  return { dx, dz, assets, objects, waterBodies, boxes };
}

const definition = JSON.parse(await readFile(definitionPath, 'utf8'));
assertDefinition(definition);
const catalog = JSON.parse(await readFile(path.join(sourceRoot, 'catalog.json'), 'utf8'));
const sources = await Promise.all(definition.regions.map(region => loadSource(catalog, region.worldId)));
const sourceSize = sources[0].map.box.size;
for (const source of sources) {
  if (source.map.box.size[0] !== sourceSize[0] || source.map.box.size[2] !== sourceSize[2]) {
    throw new Error('Composition v1 requires every source map to have the same width and depth');
  }
}
const columns = Math.max(...definition.regions.map(region => region.slot[0])) + 1;
const rows = Math.max(...definition.regions.map(region => region.slot[1])) + 1;
if (definition.regions.length !== columns * rows) throw new Error('Composition v1 requires a filled rectangular slot grid');
const totalWidth = columns * sourceSize[0];
const totalDepth = rows * sourceSize[2];
const transformed = sources.map((source, index) => transformSource(source, definition.regions[index], totalWidth, totalDepth));
const terrainGrid = mergeGrid(sources, definition, 'terrain');
const primaryIndex = Math.max(0, definition.regions.findIndex(region => region.worldId === definition.primaryWorldId));
const primary = sources[primaryIndex];
const primaryTransform = transformed[primaryIndex];
const map = {
  ...primary.map,
  id: definition.id,
  name: definition.name || definition.id,
  version: 1,
  confirmedAt: null,
  box: { ...primary.map.box, size: [totalWidth, sourceSize[1], totalDepth] },
  terrain: { resolutionX: terrainGrid.resolutionX, resolutionZ: terrainGrid.resolutionZ, heights: terrainGrid.values },
  grassLayers: [],
  waterBodies: transformed.flatMap(entry => entry.waterBodies),
  paintStrokes: [],
  objects: transformed.flatMap(entry => entry.objects),
  assets: transformed.flatMap(entry => entry.assets),
  spawnPoints: (primary.map.spawnPoints || [[0, 0, 0]]).map(point => translatePoint(point, primaryTransform.dx, primaryTransform.dz)),
  collisionBake: {
    ...(primary.map.collisionBake || {}),
    boxes: transformed.flatMap(entry => entry.boxes),
    cells: {},
  },
  composition: {
    schemaVersion: 1,
    regions: definition.regions.map((region, index) => ({
      ...region,
      sourceMapId: sources[index].entry.sourceMapId,
      sourceMapVersion: sources[index].entry.sourceMapVersion,
    })),
  },
};
const output = path.join(outputRoot, definition.id);
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'map.json'), bytes(map));
await writeFile(path.join(output, 'render-scheme.json'), bytes(primary.renderScheme));
await writeFile(path.join(output, 'composition.json'), bytes(definition));
await writeFile(path.join(output, 'manifest.json'), bytes({
  schemaVersion: 1,
  kind: 'chii-worldforge-composition-draft',
  id: definition.id,
  generatedAt: new Date().toISOString(),
  sourceWorlds: definition.regions.map(region => region.worldId),
  hashes: { map: hash(bytes(map)), renderScheme: hash(bytes(primary.renderScheme)) },
}));
console.log(JSON.stringify({ ok: true, output, size: map.box.size, objects: map.objects.length, assets: map.assets.length }, null, 2));
