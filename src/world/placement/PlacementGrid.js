import * as THREE from 'three';

const DEFAULT_TERRAIN_UNIT = 4;
const DEFAULT_SUBDIVISION = 2;

function entityKey(entity) {
  return entity?._instanceId || entity?.id || entity?.mesh?.uuid || null;
}

function normalizeFootprint(footprint, maxWidth, maxDepth) {
  return {
    width: THREE.MathUtils.clamp(Math.ceil(Number(footprint?.width) || 1), 1, maxWidth),
    depth: THREE.MathUtils.clamp(Math.ceil(Number(footprint?.depth) || 1), 1, maxDepth),
  };
}

export class PlacementGrid {
  constructor({
    center = [0, 0],
    terrainSize = 50,
    terrainUnit = DEFAULT_TERRAIN_UNIT,
    subdivision = DEFAULT_SUBDIVISION,
    terrainLayout = null,
  } = {}) {
    this.centerX = center[0] || 0;
    this.centerZ = center[1] || 0;
    this.terrainSize = terrainSize;
    this.terrainUnit = terrainUnit;
    this.subdivision = subdivision;
    this.cellSize = terrainUnit / subdivision;
    this.width = terrainSize * subdivision;
    this.depth = terrainSize * subdivision;
    this.minX = this.centerX - (terrainSize * terrainUnit) / 2;
    this.minZ = this.centerZ - (terrainSize * terrainUnit) / 2;
    this.terrainLayout = terrainLayout;
    this.records = new Map();
    this.occupancy = new Map();
    this.clearanceOccupancy = new Map();
  }

  keyFor(entity) {
    return entityKey(entity);
  }

  terrainTilesToCells(tiles) {
    return Math.max(1, Math.ceil(Number(tiles) * this.subdivision));
  }

  cellsToTerrainTiles(cells) {
    return Number(cells) / this.subdivision;
  }

  footprintFromTerrainTiles({ width = 1, depth = 1 } = {}) {
    return normalizeFootprint({
      width: this.terrainTilesToCells(width),
      depth: this.terrainTilesToCells(depth),
    }, this.width, this.depth);
  }

  get(entity) {
    return this.records.get(entityKey(entity)) || null;
  }

  inferFootprint(entity, explicit = null) {
    if (explicit) return normalizeFootprint(explicit, this.width, this.depth);
    const box = entity?.getWorldBBox?.();
    if (!box || box.isEmpty()) return { width: 1, depth: 1 };
    const size = box.getSize(new THREE.Vector3());
    return normalizeFootprint({
      width: Math.ceil((size.x + this.cellSize * 0.12) / this.cellSize),
      depth: Math.ceil((size.z + this.cellSize * 0.12) / this.cellSize),
    }, this.width, this.depth);
  }

  anchorForPosition(position, footprint) {
    const fp = normalizeFootprint(footprint, this.width, this.depth);
    return {
      x: THREE.MathUtils.clamp(
        Math.round((position.x - this.minX) / this.cellSize - fp.width / 2),
        0,
        this.width - fp.width,
      ),
      z: THREE.MathUtils.clamp(
        Math.round((position.z - this.minZ) / this.cellSize - fp.depth / 2),
        0,
        this.depth - fp.depth,
      ),
    };
  }

  positionFor(anchor, footprint, target = new THREE.Vector3()) {
    const fp = normalizeFootprint(footprint, this.width, this.depth);
    return target.set(
      this.minX + (anchor.x + fp.width / 2) * this.cellSize,
      0,
      this.minZ + (anchor.z + fp.depth / 2) * this.cellSize,
    );
  }

  cellsFor(anchor, footprint) {
    const fp = normalizeFootprint(footprint, this.width, this.depth);
    const cells = [];
    for (let z = anchor.z; z < anchor.z + fp.depth; z += 1) {
      for (let x = anchor.x; x < anchor.x + fp.width; x += 1) cells.push({ x, z });
    }
    return cells;
  }

  terrainTypeAt(cellX, cellZ) {
    const gridX = Math.floor(cellX / this.subdivision);
    const gridZ = Math.floor(cellZ / this.subdivision);
    return this.terrainLayout?.[gridZ]?.[gridX] || 'grass';
  }

  canPlace(anchor, footprint, {
    ignoreEntity = null,
    clearanceCells = 0,
    allowWater = false,
  } = {}) {
    const fp = normalizeFootprint(footprint, this.width, this.depth);
    const ignoreId = typeof ignoreEntity === 'string' ? ignoreEntity : entityKey(ignoreEntity);
    const conflicts = new Set();
    const softConflicts = new Set();
    const blockedTerrain = [];
    let inBounds = true;

    for (const cell of this.cellsFor(anchor, fp)) {
      if (cell.x < 0 || cell.z < 0 || cell.x >= this.width || cell.z >= this.depth) {
        inBounds = false;
        continue;
      }
      if (!allowWater && this.terrainTypeAt(cell.x, cell.z) === 'water') blockedTerrain.push(cell);
      const owners = this.occupancy.get(`${cell.x},${cell.z}`);
      if (owners) {
        for (const owner of owners) {
          if (owner !== ignoreId) conflicts.add(owner);
        }
      }
      const clearanceOwners = this.clearanceOccupancy.get(`${cell.x},${cell.z}`);
      if (clearanceOwners) {
        for (const owner of clearanceOwners) {
          if (owner !== ignoreId) softConflicts.add(owner);
        }
      }
    }

    const padding = Math.max(0, Math.ceil(Number(clearanceCells) || 0));
    if (padding > 0) {
      const expandedAnchor = { x: anchor.x - padding, z: anchor.z - padding };
      const expandedFootprint = {
        width: fp.width + padding * 2,
        depth: fp.depth + padding * 2,
      };
      for (const cell of this.cellsFor(expandedAnchor, expandedFootprint)) {
        const owners = this.occupancy.get(`${cell.x},${cell.z}`);
        if (!owners) continue;
        for (const owner of owners) {
          if (owner !== ignoreId) softConflicts.add(owner);
        }
      }
    }

    for (const owner of conflicts) softConflicts.delete(owner);
    return {
      valid: inBounds && blockedTerrain.length === 0 && conflicts.size === 0,
      comfortable: inBounds
        && blockedTerrain.length === 0
        && conflicts.size === 0
        && softConflicts.size === 0,
      inBounds,
      conflicts: [...conflicts],
      softConflicts: [...softConflicts],
      blockedTerrain,
    };
  }

  findNearestAvailable(position, footprint, {
    ignoreEntity = null,
    maxRadius = 24,
    clearanceCells = 0,
    respectClearance = false,
  } = {}) {
    const start = this.anchorForPosition(position, footprint);
    for (let radius = 0; radius <= maxRadius; radius += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const anchor = { x: start.x + dx, z: start.z + dz };
          const result = this.canPlace(anchor, footprint, { ignoreEntity, clearanceCells });
          if (result.valid && (!respectClearance || result.comfortable)) {
            return { anchor, position: this.positionFor(anchor, footprint), result };
          }
        }
      }
    }
    return null;
  }

  isWorldPositionAvailable(position, { ignoreEntity = null, respectClearance = true } = {}) {
    const footprint = { width: 1, depth: 1 };
    const anchor = this.anchorForPosition(position, footprint);
    const result = this.canPlace(anchor, footprint, { ignoreEntity });
    return respectClearance ? result.comfortable : result.valid;
  }

  register(entity, metadata = {}) {
    const id = entityKey(entity);
    if (!id) throw new Error('Placement entity requires a stable id');
    if (this.records.has(id)) this.unregister(entity);

    const placement = metadata.placement || {};
    const footprint = this.inferFootprint(entity, placement.footprint);
    const anchor = placement.anchor
      ? { x: placement.anchor.x, z: placement.anchor.z }
      : this.anchorForPosition(entity.mesh?.position || entity.position, footprint);
    const record = {
      id,
      entity,
      anchor,
      footprint,
      editable: placement.editable !== false,
      source: placement.source || 'curated',
      normalizationScale: placement.normalizationScale ?? entity._content?.scale.x ?? 1,
      userScale: placement.userScale ?? 1,
      sizeProfile: placement.sizeProfile || null,
      sizeIdentity: placement.sizeIdentity || null,
      clearanceCells: Math.max(0, Math.ceil(Number(placement.clearanceCells) || 0)),
      allowWater: placement.allowWater === true,
      metadata,
    };
    this.records.set(id, record);
    this._reserve(record);
    return record;
  }

  commit(entity, {
    anchor,
    footprint,
    normalizationScale,
    userScale,
    sizeProfile,
    sizeIdentity,
    clearanceCells,
    allowWater,
  } = {}) {
    const record = this.get(entity);
    if (!record) return null;
    this._release(record);
    if (anchor) record.anchor = { x: anchor.x, z: anchor.z };
    if (footprint) record.footprint = normalizeFootprint(footprint, this.width, this.depth);
    if (normalizationScale !== undefined) record.normalizationScale = normalizationScale;
    if (userScale !== undefined) record.userScale = userScale;
    if (sizeProfile !== undefined) record.sizeProfile = sizeProfile;
    if (sizeIdentity !== undefined) record.sizeIdentity = sizeIdentity;
    if (clearanceCells !== undefined) record.clearanceCells = Math.max(0, Math.ceil(Number(clearanceCells) || 0));
    if (allowWater !== undefined) record.allowWater = allowWater === true;
    this._reserve(record);
    return record;
  }

  unregister(entity) {
    const id = entityKey(entity);
    const record = id ? this.records.get(id) : null;
    if (!record) return null;
    this._release(record);
    this.records.delete(id);
    return record;
  }

  audit() {
    const overlaps = [];
    for (const [cell, owners] of this.occupancy) {
      if (owners.size > 1) overlaps.push({ cell, entities: [...owners] });
    }
    const invalidTerrain = [];
    const softPairs = new Set();
    for (const record of this.records.values()) {
      const result = this.canPlace(record.anchor, record.footprint, {
        ignoreEntity: record.id,
        allowWater: record.allowWater,
      });
      if (!result.inBounds || result.blockedTerrain.length) {
        invalidTerrain.push({ id: record.id, inBounds: result.inBounds, blockedTerrain: result.blockedTerrain });
      }
      const clearanceResult = this.canPlace(record.anchor, record.footprint, {
        ignoreEntity: record.id,
        clearanceCells: record.clearanceCells,
        allowWater: record.allowWater,
      });
      for (const other of clearanceResult.softConflicts) {
        softPairs.add([record.id, other].sort().join('|'));
      }
    }
    return {
      entities: this.records.size,
      occupiedCells: this.occupancy.size,
      overlaps,
      softOverlaps: [...softPairs].map(pair => pair.split('|')),
      invalidTerrain,
    };
  }

  _reserve(record) {
    for (const cell of this.cellsFor(record.anchor, record.footprint)) {
      const key = `${cell.x},${cell.z}`;
      let owners = this.occupancy.get(key);
      if (!owners) {
        owners = new Set();
        this.occupancy.set(key, owners);
      }
      owners.add(record.id);
    }
    const padding = record.clearanceCells || 0;
    if (padding <= 0) return;
    const anchor = { x: record.anchor.x - padding, z: record.anchor.z - padding };
    const footprint = {
      width: record.footprint.width + padding * 2,
      depth: record.footprint.depth + padding * 2,
    };
    for (const cell of this.cellsFor(anchor, footprint)) {
      if (cell.x < 0 || cell.z < 0 || cell.x >= this.width || cell.z >= this.depth) continue;
      const key = `${cell.x},${cell.z}`;
      let owners = this.clearanceOccupancy.get(key);
      if (!owners) {
        owners = new Set();
        this.clearanceOccupancy.set(key, owners);
      }
      owners.add(record.id);
    }
  }

  _release(record) {
    for (const cell of this.cellsFor(record.anchor, record.footprint)) {
      const key = `${cell.x},${cell.z}`;
      const owners = this.occupancy.get(key);
      if (!owners) continue;
      owners.delete(record.id);
      if (owners.size === 0) this.occupancy.delete(key);
    }
    const padding = record.clearanceCells || 0;
    if (padding <= 0) return;
    const anchor = { x: record.anchor.x - padding, z: record.anchor.z - padding };
    const footprint = {
      width: record.footprint.width + padding * 2,
      depth: record.footprint.depth + padding * 2,
    };
    for (const cell of this.cellsFor(anchor, footprint)) {
      const key = `${cell.x},${cell.z}`;
      const owners = this.clearanceOccupancy.get(key);
      if (!owners) continue;
      owners.delete(record.id);
      if (owners.size === 0) this.clearanceOccupancy.delete(key);
    }
  }
}
