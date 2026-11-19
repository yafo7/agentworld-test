function cellKey(cell) {
  return `${cell.x},${cell.z}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function worldToCell(spatial, position) {
  const offset = ((spatial.gridSize - 1) * spatial.tileSize) / 2;
  return {
    x: Math.round((position[0] - spatial.center[0] + offset) / spatial.tileSize),
    z: Math.round((position[2] - spatial.center[1] + offset) / spatial.tileSize),
  };
}

function cellToWorld(spatial, cell) {
  const offset = ((spatial.gridSize - 1) * spatial.tileSize) / 2;
  return {
    x: spatial.center[0] + cell.x * spatial.tileSize - offset,
    z: spatial.center[1] + cell.z * spatial.tileSize - offset,
  };
}

function terrainHeightAtCell(map, cell) {
  const width = map.terrain.resolutionX;
  const heights = map.terrain.heights;
  const x = clamp(cell.x, 0, map.terrain.resolutionX - 2);
  const z = clamp(cell.z, 0, map.terrain.resolutionZ - 2);
  return (
    Number(heights[z * width + x] || 0)
    + Number(heights[z * width + x + 1] || 0)
    + Number(heights[(z + 1) * width + x] || 0)
    + Number(heights[(z + 1) * width + x + 1] || 0)
  ) / 4;
}

function isWalkable(layout, cell) {
  return cell.x >= 0 && cell.z >= 0
    && cell.z < layout.length && cell.x < (layout[cell.z]?.length || 0)
    && layout[cell.z][cell.x] === 'grass';
}

function hasClearance(layout, cell, radius = 1) {
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (!isWalkable(layout, { x: cell.x + dx, z: cell.z + dz })) return false;
    }
  }
  return true;
}

function reachableCells(layout, start) {
  if (!isWalkable(layout, start)) return [];
  const queue = [start];
  const visited = new Set([cellKey(start)]);
  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor++];
    for (const neighbor of [
      { x: current.x + 1, z: current.z }, { x: current.x - 1, z: current.z },
      { x: current.x, z: current.z + 1 }, { x: current.x, z: current.z - 1 },
    ]) {
      const key = cellKey(neighbor);
      if (visited.has(key) || !isWalkable(layout, neighbor)) continue;
      visited.add(key);
      queue.push(neighbor);
    }
  }
  return queue;
}

function squaredDistance(a, b) {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

function selectResidentCells(spatial, residentCount) {
  const layout = spatial.terrainLayout;
  const start = worldToCell(spatial, spatial.playerSpawn);
  const reachable = reachableCells(layout, start);
  const candidates = reachable.filter(cell => hasClearance(layout, cell, 2));
  if (candidates.length < residentCount) {
    throw new Error(`WorldForge map has only ${candidates.length} resident-safe cells`);
  }

  const selected = [];
  const minimumSeparation = Math.max(2, Math.ceil(2.8 / spatial.tileSize));
  const preferredRadius = Math.max(4, Math.ceil(8 / spatial.tileSize));
  for (let index = 0; index < residentCount; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / residentCount;
    const target = {
      x: start.x + Math.cos(angle) * preferredRadius,
      z: start.z + Math.sin(angle) * preferredRadius,
    };
    const available = candidates.filter(cell => (
      squaredDistance(cell, start) >= minimumSeparation ** 2
      && selected.every(other => squaredDistance(cell, other) >= minimumSeparation ** 2)
    ));
    const pool = available.length ? available : candidates.filter(cell => (
      selected.every(other => cellKey(cell) !== cellKey(other))
    ));
    pool.sort((a, b) => squaredDistance(a, target) - squaredDistance(b, target));
    selected.push(pool[0]);
  }
  return selected;
}

export function createForgeResidentHabitat(map, spatial, residentIds) {
  if (!map?.terrain || !spatial?.terrainLayout || !Array.isArray(residentIds) || residentIds.length === 0) {
    throw new TypeError('Forge resident habitat requires map, spatial descriptor, and resident IDs');
  }
  const cells = selectResidentCells(spatial, residentIds.length);
  const inset = spatial.tileSize * 2;
  const worldBounds = {
    minX: spatial.bounds.minX + inset,
    maxX: spatial.bounds.maxX - inset,
    minZ: spatial.bounds.minZ + inset,
    maxZ: spatial.bounds.maxZ - inset,
  };
  const residents = {};
  residentIds.forEach((residentId, index) => {
    const cell = cells[index];
    const world = cellToWorld(spatial, cell);
    const localRange = Math.max(8, spatial.tileSize * 7);
    residents[residentId] = Object.freeze({
      cell: Object.freeze({ ...cell }),
      spawn: Object.freeze([world.x, terrainHeightAtCell(map, cell), world.z]),
      bounds: Object.freeze({
        minX: Math.max(worldBounds.minX, world.x - localRange),
        maxX: Math.min(worldBounds.maxX, world.x + localRange),
        minZ: Math.max(worldBounds.minZ, world.z - localRange),
        maxZ: Math.min(worldBounds.maxZ, world.z + localRange),
      }),
    });
  });
  return Object.freeze({ residents: Object.freeze(residents), worldBounds: Object.freeze(worldBounds) });
}
