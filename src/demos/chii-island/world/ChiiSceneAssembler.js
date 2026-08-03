import * as THREE from 'three';
import { StaticEntity } from '../../../engine/entity/StaticEntity.js';
import { ParticleSystem } from '../../../engine/animation/particles.js';
import { getGridWorldPosition } from '../../../engine/world/terrain.js';
import { WorldObjectRegistry } from '../../../world/WorldObjectRegistry.js';
import { ObjectScalePolicy } from '../../../world/placement/ObjectScalePolicy.js';
import {
  CHII_ASSET_SIZE_PROFILES,
  CHII_SIZE_PROFILES,
  CHII_WORLD_METRICS,
  resolveChiiSizeProfile,
} from '../data/worldTuningProfile.js';

const SPACING = 4;

const DECOR_META = Object.freeze({
  pinkFlower: { name: 'pink flower', scale: 0.58, tags: ['plant', 'flower', 'garden'], footprint: { width: 2, depth: 2 } },
  grassClump: { name: 'grass clump', scale: 0.42, tags: ['plant', 'grass'], footprint: { width: 2, depth: 2 } },
  trumpetFlower: { name: 'trumpet flower', scale: 0.48, tags: ['plant', 'flower', 'garden'], footprint: { width: 2, depth: 2 } },
  blueTulips: { name: 'blue tulips', scale: 0.55, tags: ['plant', 'flower', 'garden'], footprint: { width: 2, depth: 2 } },
  wheatField: { name: 'wheat field', scale: 0.38, tags: ['plant', 'wheat', 'farm'], footprint: { width: 2, depth: 2 } },
  flowerPot: { name: 'flower pot', scale: 0.52, tags: ['decor', 'garden'], footprint: { width: 1, depth: 1 } },
  giantCarrot: { name: 'giant carrot', scale: 0.34, tags: ['crop', 'farm'], footprint: { width: 2, depth: 2 } },
});

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function disableShadows(entity) {
  entity.mesh.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = false;
  });
}

function makeBridgeBoxCollider(mesh, root) {
  const geometry = mesh?.geometry;
  if (!geometry || !root) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return null;

  root.updateWorldMatrix(true, true);
  mesh.updateWorldMatrix(true, false);
  const relativeMatrix = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const relativeScale = new THREE.Vector3();
  const relativeRotation = new THREE.Quaternion();
  relativeMatrix.decompose(new THREE.Vector3(), relativeRotation, relativeScale);

  const center = geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(relativeMatrix);
  const halfExtents = geometry.boundingBox.getSize(new THREE.Vector3())
    .multiply(new THREE.Vector3(
      Math.abs(relativeScale.x),
      Math.abs(relativeScale.y),
      Math.abs(relativeScale.z),
    ))
    .multiplyScalar(0.5);
  if (Math.min(halfExtents.x, halfExtents.y, halfExtents.z) <= 0.001) return null;

  return {
    center: center.toArray(),
    halfExtents: halfExtents.toArray(),
    rotation: relativeRotation.toArray(),
  };
}

function collectBridgeMeshes(root) {
  const meshes = [];
  root?.traverse?.((child) => {
    if (child.isMesh) meshes.push(child);
  });
  return meshes;
}

function measureBridgePieces(meshes) {
  return meshes.map((mesh) => {
    const bounds = new THREE.Box3().setFromObject(mesh);
    return {
      mesh,
      bounds,
      size: bounds.getSize(new THREE.Vector3()),
      center: bounds.getCenter(new THREE.Vector3()),
    };
  }).filter(piece => !piece.bounds.isEmpty());
}

function selectBridgePavingPieces(pieces, bounds, size, longAxis, crossAxis) {
  const broadPieces = pieces.filter(
    piece => piece.size[crossAxis] >= size[crossAxis] * 0.45,
  );
  const upperHalfY = bounds.min.y + size.y * 0.5;
  const spanningPieces = broadPieces.filter(piece => (
    piece.size[longAxis] >= size[longAxis] * 0.6
    && piece.bounds.max.y >= upperHalfY
  ));
  if (spanningPieces.length > 0) return spanningPieces;

  const thinPieces = broadPieces.filter(piece => piece.size.y <= size.y * 0.08);
  if (thinPieces.length > 0) return thinPieces;

  const upperPieces = broadPieces.filter(piece => piece.bounds.max.y >= upperHalfY);
  return upperPieces.length > 0 ? upperPieces : broadPieces;
}

export function fitBridgeToWorld(entity, {
  targetLength,
  deckSurfaceRatio = 0.84,
  deckWorldY = 0.12,
  deckNodeName = 'bridgeDeck',
} = {}) {
  if (!entity?._modelGroup || !Number.isFinite(targetLength)) return null;
  entity.mesh.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(entity._modelGroup);
  if (bounds.isEmpty()) return null;

  const deckNode = entity._modelGroup.getObjectByName(deckNodeName);
  const deckBounds = deckNode ? new THREE.Box3().setFromObject(deckNode) : null;
  const size = bounds.getSize(new THREE.Vector3());
  const longAxis = size.x >= size.z ? 'x' : 'z';
  const crossAxis = longAxis === 'x' ? 'z' : 'x';
  const bridgeMeshes = deckNode
    ? deckNode.children.filter(child => child.isMesh)
    : collectBridgeMeshes(entity._modelGroup);
  const rawPieces = measureBridgePieces(bridgeMeshes);
  const rawPavingPieces = selectBridgePavingPieces(
    rawPieces,
    bounds,
    size,
    longAxis,
    crossAxis,
  );
  const axisMin = bounds.min[longAxis];
  const axisMax = bounds.max[longAxis];
  const endpointInset = (axisMax - axisMin) * 0.06;
  const endpointDeckSurfaces = [];

  // Measure the paving at either entrance. A single long slab is also valid,
  // so generated Voxel models do not need a specific group or node name.
  for (const piece of rawPavingPieces) {
    const spansBridge = piece.size[longAxis] >= size[longAxis] * 0.6;
    const centerAtStart = piece.center[longAxis] <= axisMin + endpointInset;
    const centerAtEnd = piece.center[longAxis] >= axisMax - endpointInset;
    if (spansBridge || centerAtStart || centerAtEnd) {
      endpointDeckSurfaces.push(piece.bounds.max.y);
    }
  }

  const measuredDeckSurface = endpointDeckSurfaces.length > 0
    ? Math.max(...endpointDeckSurfaces)
    : bounds.min.y + size.y * deckSurfaceRatio;
  const alignmentSource = endpointDeckSurfaces.length > 0
    ? 'entrance-deck-pieces'
    : 'bounds-ratio-fallback';
  const deckSurfaceLocal = entity._content.worldToLocal(
    new THREE.Vector3(0, measuredDeckSurface, 0),
  ).y;
  const targetSurfaceLocal = entity.mesh.worldToLocal(
    new THREE.Vector3(0, deckWorldY, 0),
  ).y;

  const rawLength = Math.max(size.x, size.z);
  const scale = targetLength / Math.max(rawLength, 0.001);
  if (longAxis === 'z') entity.mesh.rotation.y += Math.PI * 0.5;
  entity._content.scale.setScalar(scale);
  entity._content.position.y = targetSurfaceLocal - deckSurfaceLocal * scale;
  entity.mesh.updateWorldMatrix(true, true);

  const fittedBounds = new THREE.Box3().setFromObject(entity._modelGroup);
  const fittedSize = fittedBounds.getSize(new THREE.Vector3());
  const fittedLongAxis = fittedSize.x >= fittedSize.z ? 'x' : 'z';
  const fittedCrossAxis = fittedLongAxis === 'x' ? 'z' : 'x';
  const measuredPieces = measureBridgePieces(bridgeMeshes);
  const pavingPieces = selectBridgePavingPieces(
    measuredPieces,
    fittedBounds,
    fittedSize,
    fittedLongAxis,
    fittedCrossAxis,
  );
  const fittedCenter = fittedBounds.getCenter(new THREE.Vector3());
  const pavingMeshes = new Set(pavingPieces.map(piece => piece.mesh));
  const railPieces = measuredPieces.filter(piece => (
    !pavingMeshes.has(piece.mesh)
    && piece.size[fittedCrossAxis] <= fittedSize[fittedCrossAxis] * 0.2
    && Math.abs(piece.center[fittedCrossAxis] - fittedCenter[fittedCrossAxis])
      >= fittedSize[fittedCrossAxis] * 0.35
  ));
  const deckSegments = pavingPieces
    .map(piece => makeBridgeBoxCollider(piece.mesh, entity.mesh))
    .filter(Boolean);
  const railSegments = railPieces
    .map(piece => makeBridgeBoxCollider(piece.mesh, entity.mesh))
    .filter(Boolean);
  if (entity.mesh.userData.collider) {
    entity.mesh.userData.collider.deckSegments = deckSegments;
    entity.mesh.userData.collider.railSegments = railSegments;
  }

  entity.mesh.userData.bridgeVisual = {
    rawSize: { width: size.x, height: size.y, depth: size.z },
    scale,
    deckSurfaceRatio,
    deckWorldY,
    deckNodeName: deckNode?.name || null,
    measuredDeckSurface,
    alignmentSource,
    endpointDeckPieceCount: endpointDeckSurfaces.length,
    deckColliderSegmentCount: deckSegments.length,
    railColliderSegmentCount: railSegments.length,
  };
  return entity.mesh.userData.bridgeVisual;
}

export async function assembleChiiScene({
  scene,
  scenePlan,
  modelJsons,
  assetRepository,
  center,
  gridSize = 50,
  seed = 42,
  registry = new WorldObjectRegistry(),
}) {
  const random = seededRandom(seed);
  const scalePolicy = new ObjectScalePolicy({
    profiles: CHII_SIZE_PROFILES,
    resolveProfile: resolveChiiSizeProfile,
    cellSize: CHII_WORLD_METRICS.placementCell,
  });

  function placeEntity(gridX, gridZ, modelJson, name, tags, category, scale = 1, extra = {}) {
    const position = getGridWorldPosition(gridX, gridZ, center[0], center[1], gridSize);
    const entity = new StaticEntity({
      id: extra.id || `${category}_${gridX}_${gridZ}`,
      name,
      tags,
      category,
      position: [
        position.x + (extra.offsetX || 0),
        extra.offsetY || 0,
        position.z + (extra.offsetZ || 0),
      ],
      scale,
      modelJson,
      mergeGeometry: extra.mergeGeometry !== false,
    });
    if (extra.randomRotate) entity.mesh.rotation.y = random() * Math.PI * 2;
    if (extra.rotation !== undefined) entity.mesh.rotation.y = extra.rotation;
    if (extra.noCollider) entity.mesh.userData.noCollider = true;
    if (extra.collider) entity.mesh.userData.collider = extra.collider;
    entity.mesh.userData.placementEditable = extra.editable !== false;
    extra.configureEntity?.(entity);
    const sizeOptions = {
      profileId: extra.sizeProfile || CHII_ASSET_SIZE_PROFILES[extra.assetId],
      assetId: extra.assetId,
      name,
      category,
      footprint: extra.footprint || { width: 2, depth: 2 },
      variation: extra.sizeVariation || 1,
    };
    const sizeIdentity = extra.preserveAuthoredScale
      ? scalePolicy.captureAuthored(entity, sizeOptions)
      : scalePolicy.normalize(entity, sizeOptions);
    registry.add(entity, {
      modelJson,
      operation: 'original',
      assetId: extra.assetId || entity.id,
      placement: {
        editable: extra.editable !== false,
        footprint: extra.footprint || null,
        source: 'curated',
        sizeProfile: sizeIdentity?.profileId || null,
        sizeIdentity,
        clearanceCells: sizeIdentity?.clearanceCells || 0,
        allowWater: extra.allowWater === true,
        normalizationScale: sizeIdentity?.semanticScale || entity._content.scale.x,
        userScale: 1,
      },
    });
    scene.add(entity.mesh);
    return entity;
  }

  for (const building of scenePlan.buildings) {
    const modelJson = modelJsons[building.type];
    if (!modelJson) continue;
    const names = { windmill: '风车', church: '哥特教堂', temple: '古老神殿' };
    placeEntity(building.gridX, building.gridZ, modelJson, names[building.type], ['建筑', building.type], 'house', 3, {
      offsetX: ((building.width - 1) / 2) * SPACING,
      offsetZ: ((building.depth - 1) / 2) * SPACING,
      collider: {
        type: 'building',
        width: building.width * SPACING * 0.88,
        depth: building.depth * SPACING * 0.88,
      },
      footprint: { width: building.width * 2, depth: building.depth * 2 },
      assetId: building.type,
      preserveAuthoredScale: true,
    });
  }

  let townBridge = null;
  const bridgePlan = scenePlan.town?.bridge;
  if (bridgePlan && modelJsons.townBridge) {
    const bridgeLength = bridgePlan.width * SPACING;
    const bridgeWidth = bridgePlan.depth * SPACING;
    townBridge = placeEntity(
      bridgePlan.gridX,
      bridgePlan.gridZ,
      modelJsons.townBridge,
      '古石桥',
      ['building', 'bridge', 'town'],
      'building',
      1,
      {
        id: bridgePlan.id,
        offsetX: ((bridgePlan.width - 1) / 2) * SPACING,
        offsetZ: ((bridgePlan.depth - 1) / 2) * SPACING,
        mergeGeometry: false,
        editable: false,
        allowWater: true,
        collider: {
          type: 'bridge',
          length: bridgeLength,
          width: bridgeWidth,
          deckY: 0.12,
          deckThickness: 0.2,
          railHeight: 1.45,
          railThickness: 0.45,
        },
        footprint: { width: bridgePlan.width * 2, depth: bridgePlan.depth * 2 },
        assetId: 'townBridge',
        sizeProfile: 'landmark',
        preserveAuthoredScale: true,
        configureEntity: entity => fitBridgeToWorld(entity, {
          targetLength: bridgeLength,
          deckSurfaceRatio: 0.84,
        }),
      },
    );
  }

  const buildingClearance = new Set();
  const decorationCells = new Set(
    (scenePlan.decorations || []).map(decoration => `${decoration.gridX},${decoration.gridZ}`),
  );
  for (const building of scenePlan.buildings) {
    for (let dz = -3; dz < building.depth + 3; dz += 1) {
      for (let dx = -3; dx < building.width + 3; dx += 1) {
        buildingClearance.add(`${building.gridX + dx},${building.gridZ + dz}`);
      }
    }
  }
  for (const key of bridgePlan?.footprintCells || []) buildingClearance.add(key);

  for (const tree of scenePlan.trees) {
    if (buildingClearance.has(`${tree.gridX},${tree.gridZ}`)) continue;
    if (decorationCells.has(`${tree.gridX},${tree.gridZ}`)) continue;
    const modelJson = modelJsons[tree.type];
    if (!modelJson) continue;
    placeEntity(tree.gridX, tree.gridZ, modelJson, '树', ['树木', '自然', tree.type], 'tree', 0.7 + random() * 0.6, {
      randomRotate: true,
      collider: { type: 'tree' },
      editable: false,
      footprint: { width: 2, depth: 2 },
      assetId: tree.type,
      preserveAuthoredScale: true,
    });
  }

  for (const grass of scenePlan.grasses) {
    if (buildingClearance.has(`${grass.gridX},${grass.gridZ}`)) continue;
    if (decorationCells.has(`${grass.gridX},${grass.gridZ}`)) continue;
    const roll = random();
    const modelKey = roll < 0.58 ? 'glowgrass' : roll < 0.82 ? 'grassClump' : 'pinkFlower';
    const modelJson = modelJsons[modelKey] || modelJsons.glowgrass;
    if (!modelJson) continue;
    const scale = (modelKey === 'glowgrass' ? 0.5 : 0.35) + random() * 0.35;
    const entity = placeEntity(grass.gridX, grass.gridZ, modelJson, '荧光草', ['植物', '发光'], 'decor', scale, {
      randomRotate: true,
      noCollider: true,
      editable: false,
      footprint: { width: 1, depth: 1 },
      assetId: modelKey,
      preserveAuthoredScale: true,
    });
    disableShadows(entity);
  }

  for (const decoration of scenePlan.decorations || []) {
    if (buildingClearance.has(`${decoration.gridX},${decoration.gridZ}`)) continue;
    const meta = DECOR_META[decoration.type];
    const modelJson = modelJsons[decoration.type];
    if (!meta || !modelJson) continue;
    const entity = placeEntity(
      decoration.gridX,
      decoration.gridZ,
      modelJson,
      meta.name,
      meta.tags,
      'decor',
      meta.scale * (decoration.scale || 1),
      {
        offsetX: decoration.offsetX || 0,
        offsetY: decoration.offsetY || 0,
        offsetZ: decoration.offsetZ || 0,
        rotation: decoration.rotation,
        noCollider: true,
        editable: meta.tags.includes('decor') && !meta.tags.some(tag => ['plant', 'grass', 'flower', 'crop'].includes(tag)),
        footprint: meta.footprint,
        assetId: decoration.type,
        preserveAuthoredScale: ['plant', 'crop'].includes(CHII_ASSET_SIZE_PROFILES[decoration.type]),
      }
    );
    disableShadows(entity);
  }

  let campfireParticles = null;
  const campfireCell = scenePlan.town?.campfire;
  if (campfireCell && modelJsons.campfire) {
    const campfire = placeEntity(
      campfireCell.gridX,
      campfireCell.gridZ,
      modelJsons.campfire,
      '篝火',
      ['城镇', '篝火', '聚会'],
      'decor',
      1.6,
      {
        mergeGeometry: false,
        editable: false,
        footprint: { width: 4, depth: 4 },
        assetId: 'campfire',
        preserveAuthoredScale: true,
      }
    );
    const rawPlan = await assetRepository.getAnimation('campfire', 'burn').catch(() => null);
    if (rawPlan) {
      const burnPlan = rawPlan.motionPlan
        ? { ...rawPlan.motionPlan, _duration: rawPlan.duration || 2.5, _loop: true }
        : rawPlan;
      campfire.playIdleAnimation(burnPlan, burnPlan._duration || 2.5);
      if (campfire._modelGroup) {
        campfireParticles = new ParticleSystem(scene);
        campfireParticles.setup(burnPlan, campfire._modelGroup);
      }
    }
  }

  let townFountain = null;
  const fountainPlan = scenePlan.town?.fountain;
  if (fountainPlan && modelJsons.townFountain) {
    townFountain = placeEntity(
      fountainPlan.gridX,
      fountainPlan.gridZ,
      modelJsons.townFountain,
      '小镇喷泉',
      ['town', 'fountain', 'water', 'interactive_prop'],
      'decor',
      1,
      {
        id: 'town_fountain',
        offsetX: ((fountainPlan.width - 1) / 2) * SPACING,
        offsetZ: ((fountainPlan.depth - 1) / 2) * SPACING,
        mergeGeometry: false,
        editable: true,
        collider: {
          type: 'building',
          width: fountainPlan.width * SPACING * 0.82,
          depth: fountainPlan.depth * SPACING * 0.82,
        },
        footprint: { width: fountainPlan.width * 2, depth: fountainPlan.depth * 2 },
        assetId: 'townFountain',
        sizeProfile: 'festival_prop',
      },
    );
  }

  let forestTrophy = null;
  let forestTent = null;
  let forestTrophyWaitPlan = null;
  const forestPlan = scenePlan.forestTemple;
  if (forestPlan?.trophy && modelJsons.forestTrophy) {
    forestTrophy = placeEntity(
      forestPlan.trophy.gridX,
      forestPlan.trophy.gridZ,
      modelJsons.forestTrophy,
      '森林神殿奖杯',
      ['森林神殿', '召唤装置'],
      'decor',
      0.4,
      {
        id: 'forest_temple_trophy',
        mergeGeometry: false,
        editable: false,
        footprint: { width: 2, depth: 2 },
        assetId: 'forestTrophy',
        preserveAuthoredScale: true,
      }
    );
    forestTrophy.mesh.userData.interactionType = 'summon_pet_device';
    forestTrophyWaitPlan = await assetRepository.getAnimation('forestTrophy', 'wait').catch(() => null);
  }
  if (forestPlan?.tent && modelJsons.forestTent) {
    forestTent = placeEntity(
      forestPlan.tent.gridX,
      forestPlan.tent.gridZ,
      modelJsons.forestTent,
      '森林神殿帐篷',
      ['森林神殿', '露营'],
      'decor',
      0.9,
      {
        id: 'forest_temple_tent',
        mergeGeometry: false,
        editable: false,
        footprint: { width: 4, depth: 3 },
        assetId: 'forestTent',
        preserveAuthoredScale: true,
      }
    );
    forestTent.mesh.userData.interactionType = 'camping_tent';
  }

  let islandWaterfall = null;
  const waterfallPlan = forestPlan?.waterfall;
  if (waterfallPlan && modelJsons.islandWaterfall) {
    islandWaterfall = placeEntity(
      waterfallPlan.gridX,
      waterfallPlan.gridZ,
      modelJsons.islandWaterfall,
      '森林瀑布',
      ['forest', 'waterfall', 'water', 'landmark'],
      'decor',
      1,
      {
        id: 'island_waterfall',
        offsetX: ((waterfallPlan.width - 1) / 2) * SPACING,
        offsetZ: ((waterfallPlan.depth - 1) / 2) * SPACING,
        rotation: waterfallPlan.rotation || 0,
        mergeGeometry: false,
        editable: false,
        collider: {
          type: 'building',
          width: waterfallPlan.width * SPACING * 0.88,
          depth: waterfallPlan.depth * SPACING * 0.78,
        },
        footprint: { width: waterfallPlan.width * 2, depth: waterfallPlan.depth * 2 },
        assetId: 'islandWaterfall',
        sizeProfile: 'building',
      },
    );
  }

  return {
    registry,
    staticEntities: registry.items,
    campfireParticles,
    forestTrophy,
    forestTent,
    townBridge,
    townFountain,
    islandWaterfall,
    forestTrophyWaitPlan,
    pastoralWorkScaffoldModel: modelJsons.pastoralWorkScaffold || null,
    pastoralWorkScaffoldPlan: await assetRepository.getAnimation('pastoralWorkScaffold', 'dust').catch(() => null),
  };
}
