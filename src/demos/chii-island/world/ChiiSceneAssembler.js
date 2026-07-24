import * as THREE from 'three';
import { StaticEntity } from '../../../engine/entity/StaticEntity.js';
import { ParticleSystem } from '../../../engine/animation/particles.js';
import { getGridWorldPosition } from '../../../engine/world/terrain.js';
import { WorldObjectRegistry } from '../../../world/WorldObjectRegistry.js';

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
    registry.add(entity, {
      modelJson,
      operation: 'original',
      assetId: extra.assetId || entity.id,
      placement: {
        editable: extra.editable !== false,
        footprint: extra.footprint || null,
        source: 'curated',
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
    });
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
      { mergeGeometry: false, editable: false, footprint: { width: 4, depth: 4 } }
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
      { id: 'forest_temple_trophy', mergeGeometry: false, editable: false, footprint: { width: 2, depth: 2 } }
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
      { id: 'forest_temple_tent', mergeGeometry: false, editable: false, footprint: { width: 4, depth: 3 } }
    );
    forestTent.mesh.userData.interactionType = 'camping_tent';
  }

  return {
    registry,
    staticEntities: registry.items,
    campfireParticles,
    forestTrophy,
    forestTent,
    forestTrophyWaitPlan,
    pastoralWorkScaffoldModel: modelJsons.pastoralWorkScaffold || null,
    pastoralWorkScaffoldPlan: await assetRepository.getAnimation('pastoralWorkScaffold', 'dust').catch(() => null),
  };
}
