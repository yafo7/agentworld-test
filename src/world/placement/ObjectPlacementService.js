import * as THREE from 'three';

function contentScale(entity) {
  return entity?._content?.scale?.x ?? 1;
}

function modelJsonFor(entity, metadata = {}) {
  return metadata.modelJson || entity?._originalModelJson || entity?.mesh?.userData?.modelJson || null;
}

function footprintCenter(anchor, footprint) {
  return {
    x: anchor.x + footprint.width / 2,
    z: anchor.z + footprint.depth / 2,
  };
}

export class ObjectPlacementService {
  constructor({ grid, worldObjects, scene, colliderRegistry, scalePolicy = null }) {
    this.grid = grid;
    this.worldObjects = worldObjects;
    this.scene = scene;
    this.colliderRegistry = colliderRegistry;
    this.scalePolicy = scalePolicy;
    this.active = null;
    this.lastRemoved = null;

    for (const entity of worldObjects.items) {
      this.grid.register(entity, worldObjects.getMetadata(entity));
    }
    this._unbind = worldObjects.onChange(event => {
      if (event.type === 'added') this.grid.register(event.entity, event.metadata);
      if (event.type === 'removed') this.grid.unregister(event.entity);
    });
  }

  audit() {
    return this.grid.audit();
  }

  isEditable(entity) {
    const record = this.grid.get(entity);
    return !!record?.editable
      && entity?.mesh?.visible !== false
      && !entity?.mesh?.userData?.interactionType
      && !(entity?._constructionRefCount > 0);
  }

  findNearestEditable(position, range = 6) {
    let best = null;
    let bestDistance = range;
    for (const record of this.grid.records.values()) {
      const entity = record.entity;
      if (!this.isEditable(entity)) continue;
      const box = entity.getWorldBBox?.();
      const point = box && !box.isEmpty()
        ? new THREE.Vector3(
          THREE.MathUtils.clamp(position.x, box.min.x, box.max.x),
          position.y,
          THREE.MathUtils.clamp(position.z, box.min.z, box.max.z),
        )
        : entity.mesh.position.clone();
      const distance = Math.hypot(point.x - position.x, point.z - position.z);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = { entity, position: point, distance };
      }
    }
    return best;
  }

  begin(entity) {
    if (!this.isEditable(entity)) return null;
    if (this.active) this.cancel();
    const record = this.grid.get(entity);
    this.active = {
      entity,
      mode: 'selected',
      anchor: { ...record.anchor },
      footprint: { ...record.footprint },
      baseFootprint: { ...record.footprint },
      normalizationScale: record.normalizationScale,
      userScale: record.userScale,
      sizeProfile: record.sizeProfile,
      sizeIdentity: record.sizeIdentity,
      clearanceCells: record.clearanceCells,
      allowWater: record.allowWater,
      quarterTurns: 0,
      centerCells: footprintCenter(record.anchor, record.footprint),
      valid: true,
      validation: null,
      original: {
        position: entity.mesh.position.clone(),
        rotationY: entity.mesh.rotation.y,
        scale: entity._content.scale.clone(),
        anchor: { ...record.anchor },
        footprint: { ...record.footprint },
        normalizationScale: record.normalizationScale,
        userScale: record.userScale,
        sizeProfile: record.sizeProfile,
        sizeIdentity: record.sizeIdentity,
        clearanceCells: record.clearanceCells,
        allowWater: record.allowWater,
      },
    };
    this._validate();
    return this.active;
  }

  setMode(mode) {
    if (this.active) this.active.mode = mode;
    return this.active;
  }

  moveToWorld(position) {
    if (!this.active) return null;
    const state = this.active;
    state.anchor = this.grid.anchorForPosition(position, state.footprint);
    const snapped = this.grid.positionFor(state.anchor, state.footprint);
    state.centerCells = footprintCenter(state.anchor, state.footprint);
    this._placeVisualCenter(state.entity, snapped);
    this._validate();
    return state;
  }

  moveByCells(dx, dz) {
    if (!this.active) return null;
    const state = this.active;
    state.anchor = {
      x: THREE.MathUtils.clamp(state.anchor.x + dx, 0, this.grid.width - state.footprint.width),
      z: THREE.MathUtils.clamp(state.anchor.z + dz, 0, this.grid.depth - state.footprint.depth),
    };
    const position = this.grid.positionFor(state.anchor, state.footprint);
    state.centerCells = footprintCenter(state.anchor, state.footprint);
    this._placeVisualCenter(state.entity, position);
    this._validate();
    return state;
  }

  rotateQuarter() {
    if (!this.active) return null;
    const state = this.active;
    state.quarterTurns = (state.quarterTurns + 1) % 4;
    state.entity.mesh.rotation.y += Math.PI / 2;
    state.footprint = {
      width: state.footprint.depth,
      depth: state.footprint.width,
    };
    state.anchor = this._anchorAroundCenter(state.centerCells, state.footprint);
    const position = this.grid.positionFor(state.anchor, state.footprint);
    this._placeVisualCenter(state.entity, position);
    this._validate();
    return state;
  }

  setUserScale(userScale) {
    if (!this.active) return null;
    const state = this.active;
    const next = THREE.MathUtils.clamp(Number(userScale) || 1, 0.5, 2);
    const ratio = next / Math.max(state.original.userScale, 0.001);
    const scaled = {
      width: Math.max(1, Math.ceil(state.original.footprint.width * ratio)),
      depth: Math.max(1, Math.ceil(state.original.footprint.depth * ratio)),
    };
    state.userScale = next;
    state.footprint = state.quarterTurns % 2
      ? { width: scaled.depth, depth: scaled.width }
      : scaled;
    state.entity._content.scale.setScalar(state.normalizationScale * next);
    state.anchor = this._anchorAroundCenter(state.centerCells, state.footprint);
    const position = this.grid.positionFor(state.anchor, state.footprint);
    this._placeVisualCenter(state.entity, position);
    this._validate();
    return state;
  }

  confirm() {
    const state = this.active;
    if (!state || !state.valid) return false;
    const record = this.grid.commit(state.entity, {
      anchor: state.anchor,
      footprint: state.footprint,
      normalizationScale: state.normalizationScale,
      userScale: state.userScale,
      sizeProfile: state.sizeProfile,
      sizeIdentity: state.sizeIdentity,
      clearanceCells: state.clearanceCells,
      allowWater: state.allowWater,
    });
    const oldMetadata = this.worldObjects.getMetadata(state.entity);
    this.worldObjects.updateMetadata(state.entity, {
      placement: {
        ...(oldMetadata.placement || {}),
        anchor: { ...record.anchor },
        footprint: { ...record.footprint },
        normalizationScale: record.normalizationScale,
        userScale: record.userScale,
        sizeProfile: record.sizeProfile,
        sizeIdentity: record.sizeIdentity,
        clearanceCells: record.clearanceCells,
        allowWater: record.allowWater,
      },
    });
    this._refreshCollider(state.entity);
    this.active = null;
    return true;
  }

  cancel() {
    const state = this.active;
    if (!state) return false;
    state.entity.mesh.position.copy(state.original.position);
    state.entity.mesh.rotation.y = state.original.rotationY;
    state.entity._content.scale.copy(state.original.scale);
    this.active = null;
    return true;
  }

  remove(entity) {
    if (!this.isEditable(entity)) return null;
    if (this.active?.entity === entity) this.cancel();
    const record = this.grid.get(entity);
    if (!record) return null;
    const metadata = this.worldObjects.getMetadata(entity);
    this.lastRemoved = {
      entity,
      metadata,
      position: entity.mesh.position.clone(),
      rotationY: entity.mesh.rotation.y,
      scale: entity._content.scale.clone(),
      placement: {
        anchor: { ...record.anchor },
        footprint: { ...record.footprint },
      },
    };
    this.worldObjects.remove(entity);
    this.scene.remove(entity.mesh);
    return this.lastRemoved;
  }

  undoRemove() {
    const snapshot = this.lastRemoved;
    if (!snapshot) return null;
    const footprint = snapshot.placement.footprint;
    let anchor = snapshot.placement.anchor;
    if (!this.grid.canPlace(anchor, footprint).valid) {
      const free = this.grid.findNearestAvailable(snapshot.position, footprint);
      if (!free) return null;
      anchor = free.anchor;
      snapshot.position.copy(free.position);
    }
    snapshot.entity.mesh.position.copy(snapshot.position);
    snapshot.entity.mesh.rotation.y = snapshot.rotationY;
    snapshot.entity._content.scale.copy(snapshot.scale);
    snapshot.metadata = {
      ...snapshot.metadata,
      placement: {
        ...(snapshot.metadata.placement || {}),
        anchor,
        footprint,
      },
    };
    this.scene.add(snapshot.entity.mesh);
    this.worldObjects.add(snapshot.entity, snapshot.metadata);
    this.lastRemoved = null;
    return snapshot.entity;
  }

  prepareGeneratedEntity(entity, desiredPosition, {
    footprint = { width: 2, depth: 2 },
    semantic = null,
  } = {}) {
    let fp = { width: footprint.width, depth: footprint.depth };
    const sizeIdentity = this.scalePolicy?.normalize(entity, {
      ...semantic,
      footprint: fp,
      enlarge: true,
    }) || null;
    const normalizationScale = sizeIdentity?.semanticScale
      || this._fitScale(entity, fp, { enlarge: true });
    if (sizeIdentity?.naturalFootprint) {
      fp = this.grid.inferFootprint(entity);
    }
    const clearanceCells = sizeIdentity?.clearanceCells || 0;
    const free = this.grid.findNearestAvailable(desiredPosition, fp, {
      clearanceCells,
      respectClearance: true,
    }) || this.grid.findNearestAvailable(desiredPosition, fp);
    if (!free) throw new Error('附近没有可放置新物件的空地');
    const placement = free;
    entity.mesh.position.x = placement.position.x;
    entity.mesh.position.z = placement.position.z;
    return {
      editable: true,
      source: 'generated',
      footprint: fp,
      anchor: placement.anchor,
      normalizationScale,
      userScale: 1,
      sizeProfile: sizeIdentity?.profileId || semantic?.profileId || null,
      sizeIdentity,
      clearanceCells,
    };
  }

  reconcileModel(entity, { operation = 'refine' } = {}) {
    const record = this.grid.get(entity);
    if (!record) return null;
    const sizeIdentity = operation === 'mount'
      ? record.sizeIdentity
      : this.scalePolicy?.normalize(entity, {
        profileId: record.sizeProfile,
        footprint: record.footprint,
        userScale: record.userScale,
        variation: record.sizeIdentity?.variation || 1,
        enlarge: true,
      });
    const nextScale = sizeIdentity
      ? entity._content.scale.x
      : this._fitScale(entity, record.footprint, { enlarge: false });
    record.sizeIdentity = sizeIdentity || record.sizeIdentity;
    record.normalizationScale = sizeIdentity?.semanticScale
      || nextScale / Math.max(record.userScale, 0.001);
    const metadata = this.worldObjects.getMetadata(entity);
    this.worldObjects.updateMetadata(entity, {
      placement: {
        ...(metadata.placement || {}),
        normalizationScale: record.normalizationScale,
        userScale: record.userScale,
        sizeProfile: record.sizeProfile,
        sizeIdentity: record.sizeIdentity,
        clearanceCells: record.clearanceCells,
      },
    });
    this._refreshCollider(entity);
    return record;
  }

  _fitScale(entity, footprint, { enlarge }) {
    const current = contentScale(entity);
    const box = entity.getWorldBBox?.();
    if (!box || box.isEmpty()) return current;
    const size = box.getSize(new THREE.Vector3());
    const maxWidth = footprint.width * this.grid.cellSize * 0.82;
    const maxDepth = footprint.depth * this.grid.cellSize * 0.82;
    const maxHeight = Math.max(3.2, Math.max(footprint.width, footprint.depth) * this.grid.cellSize * 1.2);
    let factor = Math.min(
      maxWidth / Math.max(size.x, 0.001),
      maxDepth / Math.max(size.z, 0.001),
      maxHeight / Math.max(size.y, 0.001),
    );
    if (!enlarge) factor = Math.min(1, factor);
    factor = THREE.MathUtils.clamp(factor, 0.02, 8);
    const next = current * factor;
    entity._content.scale.setScalar(next);
    return next;
  }

  _refreshCollider(entity) {
    const metadata = this.worldObjects.getMetadata(entity);
    const modelJson = modelJsonFor(entity, metadata);
    if (!modelJson) return;
    this.colliderRegistry?.replaceEntity(entity, {
      modelJson,
      operation: 'transform',
      assetId: metadata.assetId || entity._generatedAssetId || entity.id,
    });
  }

  _anchorAroundCenter(center, footprint) {
    return {
      x: THREE.MathUtils.clamp(
        Math.round(center.x - footprint.width / 2),
        0,
        this.grid.width - footprint.width,
      ),
      z: THREE.MathUtils.clamp(
        Math.round(center.z - footprint.depth / 2),
        0,
        this.grid.depth - footprint.depth,
      ),
    };
  }

  _placeVisualCenter(entity, position) {
    const box = entity.getWorldBBox?.();
    if (!box || box.isEmpty()) {
      entity.mesh.position.x = position.x;
      entity.mesh.position.z = position.z;
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    entity.mesh.position.x += position.x - center.x;
    entity.mesh.position.z += position.z - center.z;
  }

  _validate() {
    const state = this.active;
    if (!state) return;
    state.validation = this.grid.canPlace(state.anchor, state.footprint, {
      ignoreEntity: state.entity,
      allowWater: state.allowWater,
    });
    state.valid = state.validation.valid;
  }

  dispose() {
    this._unbind?.();
    this.active = null;
  }
}
