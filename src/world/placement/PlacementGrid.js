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
  }

  keyFor(entity) {
    return entityKey(entity);
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

  canPlace(anchor, footprint, { ignoreEntity = null } = {}) {
    const fp = normalizeFootprint(footprint, this.width, this.depth);
    const ignoreId = typeof ignoreEntity === 'string' ? ignoreEntity : entityKey(ignoreEntity);
    const conflicts = new Set();
    const blockedTerrain = [];
    let inBounds = true;

    for (const cell of this.cellsFor(anchor, fp)) {
      if (cell.x < 0 || cell.z < 0 || cell.x >= this.width || cell.z >= this.depth) {
        inBounds = false;
        continue;
      }
      if (this.terrainTypeAt(cell.x, cell.z) === 'water') blockedTerrain.push(cell);
      const owners = this.occupancy.get(`${cell.x},${cell.z}`);
      if (!owners) continue;
      for (const owner of owners) {
        if (owner !== ignoreId) conflicts.add(owner);
      }
    }

    return {
      valid: inBounds && blockedTerrain.length === 0 && conflicts.size === 0,
      inBounds,
      conflicts: [...conflicts],
      blockedTerrain,
    };
  }

  findNearestAvailable(position, footprint, { ignoreEntity = null, maxRadius = 24 } = {}) {
    const start = this.anchorForPosition(position, footprint);
    for (let radius = 0; radius <= maxRadius; radius += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const anchor = { x: start.x + dx, z: start.z + dz };
          const result = this.canPlace(anchor, footprint, { ignoreEntity });
          if (result.valid) return { anchor, position: this.positionFor(anchor, footprint), result };
        }
      }
    }
    return null;
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
      metadata,
    };
    this.records.set(id, record);
    this._reserve(record);
    return record;
  }

  commit(entity, { anchor, footprint, normalizationScale, userScale } = {}) {
    const record = this.get(entity);
    if (!record) return null;
    this._release(record);
    if (anchor) record.anchor = { x: anchor.x, z: anchor.z };
    if (footprint) record.footprint = normalizeFootprint(footprint, this.width, this.depth);
    if (normalizationScale !== undefined) record.normalizationScale = normalizationScale;
    if (userScale !== undefined) record.userScale = userScale;
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
    for (const record of this.records.values()) {
      const result = this.canPlace(record.anchor, record.footprint, { ignoreEntity: record.id });
      if (!result.inBounds || result.blockedTerrain.length) {
        invalidTerrain.push({ id: record.id, inBounds: result.inBounds, blockedTerrain: result.blockedTerrain });
      }
    }
    return {
      entities: this.records.size,
      occupiedCells: this.occupancy.size,
      overlaps,
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
  }

  _release(record) {
    for (const cell of this.cellsFor(record.anchor, record.footprint)) {
      const key = `${cell.x},${cell.z}`;
      const owners = this.occupancy.get(key);
      if (!owners) continue;
      owners.delete(record.id);
      if (owners.size === 0) this.occupancy.delete(key);
    }
  }
}
