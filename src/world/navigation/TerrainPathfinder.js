const DEFAULT_TILE_SIZE = 4;

function keyOf(x, z) {
  return `${x},${z}`;
}

function horizontalDistance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0));
}

export class TerrainPathfinder {
  constructor({
    terrainLayout,
    center = [0, 0],
    tileSize = DEFAULT_TILE_SIZE,
    traversalCells = [],
  } = {}) {
    this.terrainLayout = terrainLayout || [];
    this.gridSize = this.terrainLayout.length;
    this.centerX = Number(center[0]) || 0;
    this.centerZ = Number(center[1]) || 0;
    this.tileSize = Number(tileSize) || DEFAULT_TILE_SIZE;
    this.traversalCells = new Set(traversalCells);
    this.offset = ((this.gridSize - 1) * this.tileSize) / 2;
  }

  worldToCell(position) {
    return {
      x: Math.round(((position?.x || 0) - this.centerX + this.offset) / this.tileSize),
      z: Math.round(((position?.z || 0) - this.centerZ + this.offset) / this.tileSize),
    };
  }

  cellToWorld(cell) {
    return {
      x: this.centerX + cell.x * this.tileSize - this.offset,
      y: 0,
      z: this.centerZ + cell.z * this.tileSize - this.offset,
    };
  }

  cellKeyForWorld(position) {
    const cell = this.worldToCell(position);
    return keyOf(cell.x, cell.z);
  }

  isWalkableCell(cell) {
    if (
      cell.x < 0
      || cell.z < 0
      || cell.x >= this.gridSize
      || cell.z >= this.gridSize
    ) return false;
    const key = keyOf(cell.x, cell.z);
    return this.terrainLayout[cell.z]?.[cell.x] !== 'water' || this.traversalCells.has(key);
  }

  isWalkableWorld(position) {
    return this.isWalkableCell(this.worldToCell(position));
  }

  isSegmentWalkable(from, to) {
    const distance = horizontalDistance(from, to);
    const steps = Math.max(1, Math.ceil(distance / (this.tileSize * 0.1)));
    for (let index = 0; index <= steps; index += 1) {
      const alpha = index / steps;
      if (!this.isWalkableWorld({
        x: from.x + (to.x - from.x) * alpha,
        z: from.z + (to.z - from.z) * alpha,
      })) return false;
    }
    return true;
  }

  findPath(from, to) {
    const start = this.worldToCell(from);
    const target = this.worldToCell(to);
    if (!this.isWalkableCell(start) || !this.isWalkableCell(target)) return [];
    if (this.isSegmentWalkable(from, to)) {
      return [{ x: to.x, y: to.y || 0, z: to.z }];
    }

    const startKey = keyOf(start.x, start.z);
    const targetKey = keyOf(target.x, target.z);
    const queue = [start];
    const visited = new Set([startKey]);
    const previous = new Map();
    let cursor = 0;

    while (cursor < queue.length && !visited.has(targetKey)) {
      const current = queue[cursor++];
      const neighbors = [
        { x: current.x + 1, z: current.z },
        { x: current.x - 1, z: current.z },
        { x: current.x, z: current.z + 1 },
        { x: current.x, z: current.z - 1 },
      ].sort((a, b) => (
        Math.abs(a.x - target.x) + Math.abs(a.z - target.z)
        - Math.abs(b.x - target.x) - Math.abs(b.z - target.z)
      ));

      for (const neighbor of neighbors) {
        const key = keyOf(neighbor.x, neighbor.z);
        if (visited.has(key) || !this.isWalkableCell(neighbor)) continue;
        visited.add(key);
        previous.set(key, current);
        queue.push(neighbor);
      }
    }

    if (!visited.has(targetKey)) return [];

    const cells = [target];
    let current = target;
    while (keyOf(current.x, current.z) !== startKey) {
      current = previous.get(keyOf(current.x, current.z));
      if (!current) return [];
      cells.push(current);
    }
    cells.reverse();

    const simplified = [cells[0]];
    for (let index = 1; index < cells.length - 1; index += 1) {
      const previousCell = cells[index - 1];
      const cell = cells[index];
      const nextCell = cells[index + 1];
      const incoming = { x: cell.x - previousCell.x, z: cell.z - previousCell.z };
      const outgoing = { x: nextCell.x - cell.x, z: nextCell.z - cell.z };
      if (incoming.x !== outgoing.x || incoming.z !== outgoing.z) simplified.push(cell);
    }
    simplified.push(cells[cells.length - 1]);

    const path = simplified.slice(1).map(cell => this.cellToWorld(cell));
    if (path.length) path[path.length - 1] = { x: to.x, y: to.y || 0, z: to.z };
    return path;
  }
}
