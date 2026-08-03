import * as THREE from 'three';
import { getGridWorldPosition } from '../../../engine/world/terrain.js';

const TRANSITION_COPY = Object.freeze({
  church: Object.freeze({
    title: '正在推开教堂大门',
    detail: '彩窗先把光摆好，长椅们正在努力坐直。',
  }),
  empty: Object.freeze({
    title: '正在进屋看看',
    detail: '房间暂时很空，但回声已经先住进来了。',
  }),
  exit: Object.freeze({
    title: '正在回到奇异岛',
    detail: '门外的风一直替你留着位置。',
  }),
});

const CURATED_BUILDING_NAMES = Object.freeze({
  church: '哥特教堂',
  windmill: '风车',
  temple: '古老神殿',
});

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function distanceXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function buildingDoorGrid(building) {
  const gridX = Math.round(building.gridX + building.width / 2);
  if (building.type === 'temple') {
    return {
      door: { gridX, gridZ: building.gridZ - 1 },
      returnPoint: { gridX, gridZ: building.gridZ - 2.5 },
      outward: new THREE.Vector3(0, 0, -1),
    };
  }
  return {
    door: { gridX, gridZ: building.gridZ + building.depth },
    returnPoint: { gridX, gridZ: building.gridZ + building.depth + 1.5 },
    outward: new THREE.Vector3(0, 0, 1),
  };
}

function makeCuratedEntries(buildings, center, gridSize) {
  return buildings.map((building) => {
    const { door, returnPoint, outward } = buildingDoorGrid(building);
    const doorWorld = getGridWorldPosition(
      door.gridX,
      door.gridZ,
      center[0],
      center[1],
      gridSize,
    );
    const returnWorld = getGridWorldPosition(
      returnPoint.gridX,
      returnPoint.gridZ,
      center[0],
      center[1],
      gridSize,
    );
    return {
      id: `building_entry_${building.type}`,
      buildingId: building.type,
      displayName: CURATED_BUILDING_NAMES[building.type] || '建筑',
      roomType: building.type === 'church' ? 'church' : 'empty',
      position: new THREE.Vector3(doorWorld.x, 0, doorWorld.z),
      returnPosition: new THREE.Vector3(returnWorld.x, 0, returnWorld.z),
      outward,
    };
  });
}

function findCuratedBuildingEntity(worldObjects, buildingId) {
  return worldObjects.items.find((entity) => {
    const metadata = worldObjects.getMetadata(entity);
    return metadata.assetId === buildingId;
  }) || null;
}

export class BuildingInteriorSystem {
  constructor({
    player,
    cameraController,
    pageLoading,
    rooms,
    worldObjects,
    buildings,
    center,
    gridSize,
    transitionTimings = {},
    onInteriorChanged = null,
  }) {
    this.player = player;
    this.cameraController = cameraController;
    this.pageLoading = pageLoading;
    this.rooms = rooms;
    this.worldObjects = worldObjects;
    this.entries = makeCuratedEntries(buildings, center, gridSize).map(entry => ({
      ...entry,
      entity: findCuratedBuildingEntity(worldObjects, entry.buildingId),
    }));
    this.dynamicBuildings = new Set();
    this.active = null;
    this.transitioning = false;
    this.cooldownUntil = 0;
    this.savedCamera = null;
    this.onInteriorChanged = onInteriorChanged;
    this.transitionTimings = {
      reveal: transitionTimings.reveal ?? 230,
      settle: transitionTimings.settle ?? 90,
      fade: transitionTimings.fade ?? 520,
    };

    for (const entity of worldObjects.items) this._trackDynamicBuilding(entity);
    this.unsubscribe = worldObjects.onChange(event => {
      if (event.type === 'added') this._trackDynamicBuilding(event.entity);
      if (event.type === 'removed') this.dynamicBuildings.delete(event.entity);
    });
  }

  isTransitioning() {
    return this.transitioning;
  }

  isInside() {
    return Boolean(this.active);
  }

  getLocationName() {
    return this.active ? `${this.active.entry.displayName}内部` : null;
  }

  findInteraction(playerPosition, range = 5.6) {
    if (this.transitioning || performance.now() < this.cooldownUntil) return null;
    if (this.active) {
      const distance = distanceXZ(playerPosition, this.active.room.exitWorld);
      return distance <= range
        ? {
          type: 'exit',
          label: `离开${this.active.entry.displayName}`,
          position: this.active.room.exitWorld,
          distance,
          entry: this.active.entry,
        }
        : null;
    }

    const curatedEntries = this.entries.filter(entry => (
      entry.entity?.mesh?.visible !== false
      && this.worldObjects.items.includes(entry.entity)
    ));
    const candidates = [...curatedEntries, ...[...this.dynamicBuildings].map(entity => this._dynamicEntry(entity))]
      .filter(Boolean)
      .map(entry => ({
        type: 'enter',
        label: `进入${entry.displayName}`,
        position: entry.position,
        distance: distanceXZ(playerPosition, entry.position),
        entry,
      }))
      .filter(hit => hit.distance <= range)
      .sort((a, b) => a.distance - b.distance);
    return candidates[0] || null;
  }

  interact(hit) {
    if (!hit || this.transitioning) return Promise.resolve(false);
    return hit.type === 'exit' ? this.exit() : this.enter(hit.entry);
  }

  async enter(entry) {
    if (!entry || this.transitioning || this.active) return false;
    const room = this.rooms.get(entry.roomType) || this.rooms.get('empty');
    if (!room) return false;

    this.transitioning = true;
    this.savedCamera = {
      yaw: this.cameraController.yaw,
      pitch: this.cameraController.pitch,
      distance: this.cameraController.distance,
    };
    this.pageLoading?.show(TRANSITION_COPY[entry.roomType] || TRANSITION_COPY.empty);

    try {
      await wait(this.transitionTimings.reveal);
      room.root.visible = true;
      this.active = { entry, room };
      this.onInteriorChanged?.(true, this.active);
      this.player.setTerrainConstraintEnabled(false);
      this.player.setFlightAllowed(false);
      this.player.teleport(room.spawnWorld, {
        orientation: room.lookDirection,
        groundY: room.origin.y,
      });
      this.cameraController.snapTo(room.spawnWorld, room.camera);
      await wait(this.transitionTimings.settle);
      this.pageLoading?.hide();
      await wait(this.transitionTimings.fade);
      this.cooldownUntil = performance.now() + 650;
      return true;
    } finally {
      this.transitioning = false;
    }
  }

  async exit() {
    if (!this.active || this.transitioning) return false;
    this.transitioning = true;
    const { entry, room } = this.active;
    this.pageLoading?.show(TRANSITION_COPY.exit);

    try {
      await wait(this.transitionTimings.reveal);
      this.player.setTerrainConstraintEnabled(true);
      this.player.setFlightAllowed(true);
      this.player.teleport(entry.returnPosition, {
        orientation: entry.outward,
        groundY: 0,
      });
      this.cameraController.snapTo(entry.returnPosition, this.savedCamera || {});
      room.root.visible = false;
      this.active = null;
      this.onInteriorChanged?.(false, null);
      await wait(this.transitionTimings.settle);
      this.pageLoading?.hide();
      await wait(this.transitionTimings.fade);
      this.cooldownUntil = performance.now() + 800;
      return true;
    } finally {
      this.transitioning = false;
    }
  }

  dispose() {
    this.unsubscribe?.();
  }

  _trackDynamicBuilding(entity) {
    if (!entity?.mesh || !['house', 'building'].includes(entity.category)) return;
    if (entity.tags?.includes('bridge')) return;
    const metadata = this.worldObjects.getMetadata(entity);
    if (metadata.placement?.source === 'building_draft') return;
    if (['church', 'windmill', 'temple'].includes(metadata.assetId)) return;
    if (metadata.placement?.source === 'interior') return;
    this.dynamicBuildings.add(entity);
  }

  _dynamicEntry(entity) {
    if (!entity?.mesh?.visible) return null;
    const bounds = entity.getWorldBBox?.();
    if (!bounds || bounds.isEmpty()) return null;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const quaternion = entity.mesh.getWorldQuaternion(new THREE.Quaternion());
    const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    outward.y = 0;
    if (outward.lengthSq() < 0.001) outward.set(0, 0, 1);
    outward.normalize();
    const projectedHalf = Math.abs(outward.x) * size.x * 0.5
      + Math.abs(outward.z) * size.z * 0.5;
    const position = center.clone().setY(0).addScaledVector(outward, projectedHalf + 0.8);
    const returnPosition = position.clone().addScaledVector(outward, 5.8);
    return {
      id: `building_entry_${entity._instanceId || entity.id}`,
      buildingId: entity.id,
      entity,
      displayName: entity.name || '新建筑',
      roomType: 'empty',
      position,
      returnPosition,
      outward,
    };
  }
}
