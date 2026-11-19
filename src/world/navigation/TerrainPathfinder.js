const DEFAULT_TILE_SIZE = 4;

// Deterministic cardinal neighbours, favouring the direction of the goal on ties.
const neighborOrders = Array.from({length:9}, (_,i) => {
  const x = i%3-1, z = Math.floor(i/3)-1;
  return [[1,0],[-1,0],[0,1],[0,-1]].sort(([ax,az],[bx,bz]) =>
    Math.abs(ax-x)+Math.abs(az-z)-Math.abs(bx-x)-Math.abs(bz-z));
});

function keyOf(x, z) {
  return `${x},${z}`;
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
    const terrain = this.terrainLayout[cell.z]?.[cell.x];
    return (terrain !== 'water' && terrain !== 'blocked') || (this.traversalCells.size > 0 && this.traversalCells.has(keyOf(cell.x, cell.z)));
  }

  isWalkableWorld(position) {
    return this.isWalkableCell(this.worldToCell(position));
  }

  isSegmentWalkable(from, to) {
    const cell = this.worldToCell(from), end = this.worldToCell(to);
    if (!this.isWalkableCell(cell) || !this.isWalkableCell(end)) return false;
    const dx = to.x - from.x, dz = to.z - from.z;
    const sx = Math.sign(dx), sz = Math.sign(dz), size = this.tileSize;
    const center = this.cellToWorld(cell);
    let tx = dx ? (center.x + sx*size/2 - from.x) / dx : Infinity;
    let tz = dz ? (center.z + sz*size/2 - from.z) / dz : Infinity;
    // Visit every crossed cell. A diagonal crossing a grid corner also needs
    // both adjacent cells: touching a bank or railing is not a valid shortcut.
    while (cell.x !== end.x || cell.z !== end.z) {
      const nextX = cell.x === end.x ? Infinity : tx;
      const nextZ = cell.z === end.z ? Infinity : tz;
      if (Math.abs(nextX - nextZ) < 1e-9) {
        if (!this.isWalkableCell({x:cell.x+sx,z:cell.z}) || !this.isWalkableCell({x:cell.x,z:cell.z+sz})) return false;
        cell.x += sx; cell.z += sz;
        tx += size/Math.abs(dx); tz += size/Math.abs(dz);
      } else if (nextX < nextZ) { cell.x += sx; tx += size/Math.abs(dx); }
      else { cell.z += sz; tz += size/Math.abs(dz); }
      if (!this.isWalkableCell(cell)) return false;
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

    // Search with integer indices. An island-wide route can visit thousands of
    // cells; reuse the work buffers instead of allocating objects for each edge.
    const n = this.gridSize;
    const queue = this.queue ??= new Int32Array(n*n);
    const parent = this.parent ??= new Int32Array(n*n);
    parent.fill(-1);
    const first = start.z*n+start.x, last = target.z*n+target.x;
    parent[first] = first;
    queue[0] = first;
    let read = 0, write = 1;
    while (read < write && parent[last] < 0) {
      const current = queue[read++];
      const x = current % n, z = Math.floor(current/n);
      const order = neighborOrders[(Math.sign(target.z-z)+1)*3 + Math.sign(target.x-x)+1];
      for (const [dx,dz] of order) {
        const nx = x+dx, nz = z+dz;
        if (nx < 0 || nx >= n || nz < 0 || nz >= n) continue;
        const next = nz*n+nx;
        if (parent[next] !== -1 || !this.isWalkableCell({x:nx,z:nz})) continue;
        parent[next] = current;
        queue[write++] = next;
      }
    }
    if (parent[last] === -1) return [];
    const cells = [];
    for (let i=last;;i=parent[i]) {
      cells.push({x:i%n,z:Math.floor(i/n)});
      if (i===first) break;
    }
    cells.reverse();

    // Only skip corners when the actual segment between world positions is clear.
    // In particular an off-centre destination cannot replace a grid corner blindly.
    const points = [...cells.map(cell => this.cellToWorld(cell)), { x:to.x, y:to.y || 0, z:to.z }];
    const path = [];
    let anchor = from;
    for (let i=0; i<points.length; i++) {
      if (i+1 < points.length && this.isSegmentWalkable(anchor,points[i+1])) continue;
      if (!this.isSegmentWalkable(anchor,points[i])) return [];
      path.push(points[i]);
      anchor=points[i];
    }
    return path;
  }
}
