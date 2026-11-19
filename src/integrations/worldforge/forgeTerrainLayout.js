import { isPointInsideWaterBody } from 'worldforge-studio/map-core';

export function createTerrainLayoutFromForge(map, gridSize = 50) {
  const [width, , depth] = map.box.size;
  return Array.from({ length: gridSize }, (_, z) => Array.from({ length: gridSize }, (_, x) => {
    const worldX = -width / 2 + (x + 0.5) * width / gridSize;
    const worldZ = -depth / 2 + (z + 0.5) * depth / gridSize;
    return map.waterBodies.some(water => isPointInsideWaterBody(water, worldX, worldZ))
      ? 'water'
      : 'grass';
  }));
}

function pointInsideBoxXZ(x, z, box, margin = 0) {
  return x >= box.min[0] - margin
    && x <= box.max[0] + margin
    && z >= box.min[2] - margin
    && z <= box.max[2] + margin;
}

function terrainHeightAtCell(map, x, z) {
  const width = map.terrain.resolutionX;
  const heights = map.terrain.heights;
  const a = Number(heights[z * width + x] || 0);
  const b = Number(heights[z * width + x + 1] || 0);
  const c = Number(heights[(z + 1) * width + x] || 0);
  const d = Number(heights[(z + 1) * width + x + 1] || 0);
  return (a + b + c + d) / 4;
}

function resolveSafeSpawn(map, terrainLayout, tileSize, cellsX, cellsZ) {
  const requested = map.spawnPoints?.[0] || [0, 3, 0];
  const startX = Math.max(0, Math.min(cellsX - 1, Math.floor((requested[0] + map.box.size[0] / 2) / tileSize)));
  const startZ = Math.max(0, Math.min(cellsZ - 1, Math.floor((requested[2] + map.box.size[2] / 2) / tileSize)));
  for (let radius = 0; radius < Math.max(cellsX, cellsZ); radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const x = startX + dx;
        const z = startZ + dz;
        if (x < 0 || z < 0 || x >= cellsX || z >= cellsZ || terrainLayout[z][x] !== 'grass') continue;
        let hasClearance = true;
        const cameraClearanceCells = Math.max(3, Math.ceil(10 / tileSize));
        for (let cz = Math.max(0, z - cameraClearanceCells); cz <= Math.min(cellsZ - 1, z + cameraClearanceCells) && hasClearance; cz += 1) {
          for (let cx = Math.max(0, x - cameraClearanceCells); cx <= Math.min(cellsX - 1, x + cameraClearanceCells); cx += 1) {
            if (terrainLayout[cz][cx] !== 'grass') {
              hasClearance = false;
              break;
            }
          }
        }
        if (!hasClearance) continue;
        return [
          -map.box.size[0] / 2 + (x + 0.5) * tileSize,
          terrainHeightAtCell(map, x, z),
          -map.box.size[2] / 2 + (z + 0.5) * tileSize,
        ];
      }
    }
  }
  return [...requested];
}

export function createForgeWorldSpatialDescriptor(map) {
  const [width, , depth] = map.box.size;
  const cellsX = map.terrain.resolutionX - 1;
  const cellsZ = map.terrain.resolutionZ - 1;
  if (cellsX !== cellsZ || Math.abs(width - depth) > 0.001) {
    throw new Error('Chii exploration worlds currently require a square WorldForge terrain');
  }
  const tileSize = width / cellsX;
  const collisionBoxes = map.collisionBake?.boxes || [];
  const terrainLayout = Array.from({ length: cellsZ }, (_, z) => Array.from({ length: cellsX }, (_, x) => {
    const worldX = -width / 2 + (x + 0.5) * tileSize;
    const worldZ = -depth / 2 + (z + 0.5) * tileSize;
    if (map.waterBodies.some(water => isPointInsideWaterBody(water, worldX, worldZ))) return 'water';
    if (collisionBoxes.some(box => pointInsideBoxXZ(worldX, worldZ, box, tileSize * 0.4))) return 'blocked';
    return 'grass';
  }));
  const playerSpawn = resolveSafeSpawn(map, terrainLayout, tileSize, cellsX, cellsZ);
  return Object.freeze({
    center: Object.freeze([0, 0]),
    gridSize: cellsX,
    tileSize,
    terrainLayout,
    bounds: Object.freeze({ minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2 }),
    playerSpawn: Object.freeze(playerSpawn),
  });
}
