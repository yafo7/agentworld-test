import * as THREE from 'three';

function positionOf(value) {
  const position = value?.mesh?.position || value?.position || value;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  return new THREE.Vector3(position.x, Number(position.y) || 0, position.z);
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class ObjectiveGuidanceSystem {
  constructor({
    projectionStore,
    player,
    worldObjects,
    resolvePet,
    navigation = null,
    miniMap,
    worldMarker,
    runtimeStatus = null,
  }) {
    this.projectionStore = projectionStore;
    this.player = player;
    this.worldObjects = worldObjects;
    this.resolvePet = resolvePet;
    this.navigation = navigation;
    this.miniMap = miniMap;
    this.worldMarker = worldMarker;
    this.runtimeStatus = runtimeStatus;
    this.current = null;
    this.routeTimer = 0;
    this.guidancePosition = null;
    this.lastHudSignature = '';
    this.disposed = false;
    this.unsubscribe = projectionStore.subscribe(projection => {
      this.current = projection;
      this.guidancePosition = null;
      this.lastHudSignature = '';
      this.routeTimer = 0;
      if (!projection) this._clearPresentation();
    });
    this.miniMap?.setPlayer(player);
  }

  _resolveTarget(projection) {
    const target = projection?.target;
    if (!target) return null;
    if (target.type === 'pet') return positionOf(this.resolvePet?.(target.id)) || positionOf(target.position);
    if (target.type === 'object') {
      return positionOf(this.worldObjects?.findById?.(target.id))
        || positionOf(this.worldObjects?.findByName?.(target.id))
        || positionOf(target.position);
    }
    return positionOf(target.position);
  }

  _refreshRoute(playerPosition, targetPosition) {
    this.routeTimer = 0;
    const path = this.navigation?.findPath?.(playerPosition, targetPosition) || [];
    this.guidancePosition = positionOf(path[0]) || targetPosition.clone();
  }

  update(dt) {
    if (this.disposed) return;
    this.miniMap?.update(dt);
    if (!this.current) return;
    const playerPosition = positionOf(this.player);
    const targetPosition = this._resolveTarget(this.current);
    if (!playerPosition || !targetPosition) {
      this._clearPresentation();
      return;
    }

    this.routeTimer += dt;
    if (!this.guidancePosition || this.routeTimer >= 0.8) {
      this._refreshRoute(playerPosition, targetPosition);
    }
    const distance = horizontalDistance(playerPosition, targetPosition);
    this.miniMap?.setObjective({
      position: this.guidancePosition || targetPosition,
      finalPosition: targetPosition,
      label: this.current.label,
    });
    this.worldMarker?.show({
      position: targetPosition,
      guidancePosition: this.guidancePosition,
      playerPosition,
      label: this.current.label,
    });
    this.worldMarker?.update(dt);
    const roundedDistance = Math.round(distance);
    const hudSignature = `${this.current.id}:${roundedDistance}:${this.current.progress?.current || 0}`;
    if (hudSignature !== this.lastHudSignature) {
      this.lastHudSignature = hudSignature;
      this.runtimeStatus?.setObjectiveNavigation({
        label: this.current.label,
        distance,
        progress: this.current.progress,
        trigger: this.current.trigger,
        radius: this.current.radius,
      });
    }
  }

  _clearPresentation() {
    this.miniMap?.setObjective(null);
    this.worldMarker?.hide();
    this.runtimeStatus?.setObjectiveNavigation(null);
    this.lastHudSignature = '';
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this._clearPresentation();
    this.worldMarker?.dispose();
    this.miniMap?.dispose();
  }
}
