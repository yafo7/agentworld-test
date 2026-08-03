/**
 * Scene layout generator — pure logic, no Three.js dependency.
 * Analyzes terrain river and places buildings, trees, grass, and a road.
 */
import { CHII_SCENE_DENSITY } from '../data/worldTuningProfile.js';

// ---- seeded random (mulberry32) ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- river analysis ----

export function analyzeRiver(layout) {
  const size = layout.length;
  const byRow = new Map();
  let minX = Infinity, maxX = -Infinity;

  for (let z = 0; z < size; z++) {
    let ws = -1, we = -1;
    for (let x = 0; x < size; x++) {
      if (layout[z][x] === 'water') {
        if (ws === -1) ws = x;
        we = x;
      }
    }
    if (ws >= 0) {
      byRow.set(z, { waterStart: ws, waterEnd: we, centerX: (ws + we) / 2 });
      if (ws < minX) minX = ws;
      if (we > maxX) maxX = we;
    }
  }
  return { byRow, minX, maxX };
}

export function getRiverSide(gridX, gridZ, riverData) {
  const row = riverData.byRow.get(gridZ);
  if (!row || row.waterStart === -1) return 'unknown';
  if (gridX >= row.waterStart && gridX <= row.waterEnd) return 'water';
  return gridX < row.waterStart ? 'left' : 'right';
}

// ---- building placement ----

function isFootprintClear(gridX, gridZ, w, d, layout, avoidSet, riverData, gridSize) {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const gx = gridX + dx;
      const gz = gridZ + dz;
      if (gx < 2 || gx >= gridSize - 2 || gz < 2 || gz >= gridSize - 2) return false;
      if (layout[gz][gx] === 'water') return false;
      if (avoidSet.has(`${gx},${gz}`)) return false;
    }
  }
  return true;
}

function spiralSearch(anchorX, anchorZ, w, d, layout, avoidSet, riverData, gridSize, sideFilter) {
  const maxR = Math.floor(gridSize / 2);
  for (let r = 0; r < maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dy) !== r && Math.abs(dx) !== r) continue;
        const gx = anchorX + dx;
        const gz = anchorZ + dy;
        if (gx < 2 || gx + w >= gridSize - 1 || gz < 2 || gz + d >= gridSize - 1) continue;
        if (sideFilter) {
          const side = getRiverSide(Math.floor(gx + w / 2), Math.floor(gz + d / 2), riverData);
          if (side !== sideFilter && side !== 'unknown') continue;
        }
        if (isFootprintClear(gx, gz, w, d, layout, avoidSet, riverData, gridSize)) {
          return { gridX: gx, gridZ: gz };
        }
      }
    }
  }
  // fallback: return anchor clamped
  return {
    gridX: Math.max(2, Math.min(gridSize - 2 - w, anchorX)),
    gridZ: Math.max(2, Math.min(gridSize - 2 - d, anchorZ)),
  };
}

function addFootprint(set, gx, gz, w, d) {
  for (let dz = 0; dz < d; dz++)
    for (let dx = 0; dx < w; dx++)
      set.add(`${gx + dx},${gz + dz}`);
}

export function placeBuildings(layout, riverData, gridSize) {
  const avoidSet = new Set();
  const half = Math.floor(gridSize / 2);

  // Building footprints scaled for 3x building models.
  // Footprint sizes are integer multiples of UNIT_SIZE grid cells.
  // Windmill: 4×4, left side, middle Z
  const windmill = spiralSearch(7, half, 4, 4, layout, avoidSet, riverData, gridSize, 'left');
  addFootprint(avoidSet, windmill.gridX, windmill.gridZ, 4, 4);

  // Church: 8×11, right side, top half (Z < half)
  const church = spiralSearch(34, 6, 8, 11, layout, avoidSet, riverData, gridSize, 'right');
  addFootprint(avoidSet, church.gridX, church.gridZ, 8, 11);

  // Temple: 11×8, right side, bottom half (Z >= half)
  const temple = spiralSearch(33, 35, 11, 8, layout, avoidSet, riverData, gridSize, 'right');

  return {
    buildings: [
      { type: 'windmill', gridX: windmill.gridX, gridZ: windmill.gridZ, width: 4, depth: 4 },
      { type: 'church', gridX: church.gridX, gridZ: church.gridZ, width: 8, depth: 11 },
      { type: 'temple', gridX: temple.gridX, gridZ: temple.gridZ, width: 11, depth: 8 },
    ],
    buildingCells: avoidSet,
  };
}

// ---- road generation ----

export function generateRoad(layout, riverData, gridSize, buildingCells) {
  const roadCells = new Set();
  const roadWidth = 2;

  for (let z = 3; z < gridSize - 3; z++) {
    const wave = Math.sin(z * 0.10) * 3 + Math.sin(z * 0.22 + 1.2) * 1.5;
    const centerX = Math.round(7 + wave);
    for (let dx = 0; dx < roadWidth; dx++) {
      const gx = centerX + dx;
      if (gx < 2 || gx >= gridSize - 2) continue;
      if (layout[z][gx] === 'water') continue;
      const key = `${gx},${z}`;
      if (buildingCells.has(key)) continue;
      roadCells.add(key);
    }
  }
  return roadCells;
}

// ---- windmill pastoral layout ----

function addRect(set, x0, z0, w, d, gridSize) {
  for (let z = z0; z < z0 + d; z++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x >= 1 && x < gridSize - 1 && z >= 1 && z < gridSize - 1) {
        set.add(`${x},${z}`);
      }
    }
  }
}

function addSoftRoad(set, from, to, gridSize, width = 2) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const z = Math.round(from.z + (to.z - from.z) * t);
    for (let dz = 0; dz < width; dz++) {
      for (let dx = 0; dx < width; dx++) {
        const gx = x + dx;
        const gz = z + dz;
        if (gx >= 1 && gx < gridSize - 1 && gz >= 1 && gz < gridSize - 1) {
          set.add(`${gx},${gz}`);
        }
      }
    }
  }
}

function makeWindmillPastoral(buildings, layout, gridSize) {
  const windmill = buildings.find(b => b.type === 'windmill');
  const farmlandCells = new Set();
  const wheatCells = new Set();
  const gardenCells = new Set();
  const roadCells = new Set();
  const reserveCells = new Set();
  const avoidCells = new Set();

  if (!windmill) {
    return { farmlandCells, wheatCells, gardenCells, roadCells, reserveCells, avoidCells, petSpawns: {} };
  }

  const wx = windmill.gridX;
  const wz = windmill.gridZ;
  const windmillCenter = {
    x: Math.round(wx + windmill.width / 2),
    z: Math.round(wz + windmill.depth / 2),
  };

  // Small farm plots near the windmill.
  const smallFarm = { x: Math.max(2, wx + 5), z: Math.max(2, wz - 2), w: 4, d: 5 };
  addRect(farmlandCells, smallFarm.x, smallFarm.z, smallFarm.w, smallFarm.d, gridSize);

  // Larger rice/farmland visual core.
  const riceField = { x: Math.max(2, wx + 5), z: Math.min(gridSize - 11, wz + 5), w: 8, d: 7 };
  addRect(farmlandCells, riceField.x, riceField.z, riceField.w, riceField.d, gridSize);

  // Golden wheat patch: close to the farm path, visually distinct from crop land.
  const wheatField = { x: Math.max(2, wx + 11), z: Math.max(2, wz - 4), w: 6, d: 7 };
  addRect(wheatCells, wheatField.x, wheatField.z, wheatField.w, wheatField.d, gridSize);

  // Small flower garden for momo / yafo.
  const garden = { x: Math.max(2, wx - 4), z: Math.max(2, wz + 6), w: 5, d: 5 };
  addRect(gardenCells, garden.x, garden.z, garden.w, garden.d, gridSize);

  // 3-4 future building pads, each roughly 5x8. Keep as grass/dirt reserve, no buildings.
  const reserves = [
    { x: Math.max(2, wx + 13), z: Math.max(2, wz - 6), w: 5, d: 8 },
    { x: Math.max(2, wx + 14), z: Math.min(gridSize - 10, wz + 4), w: 5, d: 8 },
    { x: Math.max(2, wx - 6), z: Math.min(gridSize - 10, wz + 12), w: 5, d: 8 },
  ];
  for (const r of reserves) addRect(reserveCells, r.x, r.z, r.w, r.d, gridSize);

  const farmCenter = { x: smallFarm.x + 2, z: smallFarm.z + 2 };
  const riceCenter = { x: riceField.x + 4, z: riceField.z + 3 };
  const wheatCenter = { x: wheatField.x + 3, z: wheatField.z + 3 };
  const gardenCenter = { x: garden.x + 2, z: garden.z + 2 };
  addSoftRoad(roadCells, windmillCenter, farmCenter, gridSize);
  addSoftRoad(roadCells, farmCenter, riceCenter, gridSize);
  addSoftRoad(roadCells, farmCenter, wheatCenter, gridSize);
  addSoftRoad(roadCells, windmillCenter, gardenCenter, gridSize);
  addSoftRoad(roadCells, gardenCenter, riceCenter, gridSize);

  for (const set of [farmlandCells, wheatCells, gardenCells, roadCells]) {
    for (const key of set) avoidCells.add(key);
  }

  return {
    farmlandCells,
    wheatCells,
    gardenCells,
    roadCells,
    reserveCells,
    avoidCells,
    anchors: { windmillCenter, farmCenter, riceCenter, wheatCenter, gardenCenter },
    petSpawns: {
      momo: { gridX: gardenCenter.x, gridZ: gardenCenter.z + 2 },
      yafo: { gridX: gardenCenter.x - 2, gridZ: gardenCenter.z },
      mok: { gridX: wheatCenter.x + 1, gridZ: wheatCenter.z },
    },
  };
}

function addOrthogonalRoad(set, from, to, gridSize, width = 2) {
  const stepX = from.x <= to.x ? 1 : -1;
  const stepZ = from.z <= to.z ? 1 : -1;
  for (let x = from.x; x !== to.x + stepX; x += stepX) {
    for (let w = 0; w < width; w++) {
      if (x >= 1 && x < gridSize - 1 && from.z + w >= 1 && from.z + w < gridSize - 1) {
        set.add(`${x},${from.z + w}`);
      }
    }
  }
  for (let z = from.z; z !== to.z + stepZ; z += stepZ) {
    for (let w = 0; w < width; w++) {
      if (to.x + w >= 1 && to.x + w < gridSize - 1 && z >= 1 && z < gridSize - 1) {
        set.add(`${to.x + w},${z}`);
      }
    }
  }
}

function makeChurchTown(buildings, layout, riverData, gridSize) {
  const church = buildings.find(b => b.type === 'church');
  const temple = buildings.find(b => b.type === 'temple');
  const squareCells = new Set();
  const roadCells = new Set();
  const avoidCells = new Set();
  const trees = [];
  const decorations = [];

  if (!church) {
    return { squareCells, roadCells, avoidCells, trees, decorations, petSpawns: {} };
  }

  const square = {
    x: Math.min(gridSize - 11, Math.max(2, church.gridX - 1)),
    z: Math.min(gridSize - 12, Math.max(16, church.gridZ + church.depth + 6)),
    w: 9,
    d: 9,
  };
  addRect(squareCells, square.x, square.z, square.w, square.d, gridSize);

  const center = {
    x: square.x + Math.floor(square.w / 2),
    z: square.z + Math.floor(square.d / 2),
  };
  const fountain = {
    gridX: Math.min(gridSize - 3, center.x + 3),
    gridZ: Math.max(2, square.z - 2),
    width: 2,
    depth: 2,
  };
  const churchDoor = {
    x: Math.round(church.gridX + church.width / 2),
    z: church.gridZ + church.depth,
  };
  const templeDoor = temple
    ? { x: Math.round(temple.gridX + temple.width / 2), z: temple.gridZ - 1 }
    : { x: center.x, z: Math.min(gridSize - 2, center.z + 12) };

  addOrthogonalRoad(roadCells, churchDoor, { x: center.x, z: square.z }, gridSize);
  addOrthogonalRoad(roadCells, { x: center.x, z: square.z + square.d - 1 }, templeDoor, gridSize);
  addOrthogonalRoad(roadCells, { x: center.x, z: center.z }, { x: square.x - 2, z: center.z }, gridSize);

  // The town bridge sits in the clear band between the church and square.
  // Its exact span is derived from all three river rows that it crosses.
  const bridgeDepth = 3;
  const bridgeCenterZ = Math.round((churchDoor.z + square.z) / 2);
  const bridgeGridZ = bridgeCenterZ - Math.floor(bridgeDepth / 2);
  const bridgeRows = Array.from({ length: bridgeDepth }, (_, index) => riverData.byRow.get(bridgeGridZ + index))
    .filter(Boolean);
  const bridgeWaterStart = Math.min(...bridgeRows.map(row => row.waterStart));
  const bridgeWaterEnd = Math.max(...bridgeRows.map(row => row.waterEnd));
  const bridgeGridX = bridgeWaterStart - 2;
  const bridgeWidth = bridgeWaterEnd - bridgeWaterStart + 5;
  const bridge = {
    id: 'town_stone_bridge',
    gridX: bridgeGridX,
    gridZ: bridgeGridZ,
    width: bridgeWidth,
    depth: bridgeDepth,
    center: {
      gridX: bridgeGridX + Math.floor(bridgeWidth / 2),
      gridZ: bridgeCenterZ,
    },
    traversalCells: new Set(),
    footprintCells: new Set(),
  };

  for (let z = bridge.gridZ; z < bridge.gridZ + bridge.depth; z += 1) {
    for (let x = bridge.gridX; x < bridge.gridX + bridge.width; x += 1) {
      const key = `${x},${z}`;
      bridge.footprintCells.add(key);
      avoidCells.add(key);
      if (layout[z]?.[x] === 'water') bridge.traversalCells.add(key);
    }
  }
  for (let z = bridge.gridZ - 1; z <= bridge.gridZ + bridge.depth; z += 1) {
    for (let x = bridge.gridX - 1; x <= bridge.gridX + bridge.width; x += 1) {
      if (x >= 0 && z >= 0 && x < gridSize && z < gridSize) avoidCells.add(`${x},${z}`);
    }
  }

  const bridgeLeft = { x: bridge.gridX, z: bridge.center.gridZ };
  const bridgeRight = { x: bridge.gridX + bridge.width - 1, z: bridge.center.gridZ };
  addOrthogonalRoad(roadCells, { x: bridgeLeft.x - 2, z: bridgeLeft.z }, bridgeLeft, gridSize, 1);
  addOrthogonalRoad(roadCells, bridgeRight, { x: center.x, z: bridgeRight.z }, gridSize, 1);
  for (const key of squareCells) roadCells.delete(key);

  for (const set of [squareCells, roadCells]) {
    for (const key of set) avoidCells.add(key);
  }
  addRect(avoidCells, fountain.gridX, fountain.gridZ, fountain.width, fountain.depth, gridSize);

  const treePoints = [
    [square.x - 1, square.z - 1],
    [square.x + square.w, square.z - 1],
    [square.x - 1, square.z + square.d],
    [square.x + square.w, square.z + square.d],
  ];
  for (let i = 0; i < treePoints.length; i++) {
    const [gridX, gridZ] = treePoints[i];
    if (avoidCells.has(`${gridX},${gridZ}`)) continue;
    trees.push({ gridX, gridZ, type: i % 2 === 0 ? 'normal' : 'apple' });
    avoidCells.add(`${gridX},${gridZ}`);
  }

  const flowerPoints = [
    [square.x - 1, center.z - 2],
    [square.x - 1, center.z + 2],
    [square.x + square.w, center.z - 2],
    [square.x + square.w, center.z + 2],
  ];
  for (let i = 0; i < flowerPoints.length; i++) {
    const [gridX, gridZ] = flowerPoints[i];
    decorations.push({
      type: i % 2 === 0 ? 'pinkFlower' : 'grassClump',
      gridX,
      gridZ,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      scale: 0.9,
      rotation: i * Math.PI * 0.5,
    });
    avoidCells.add(`${gridX},${gridZ}`);
  }

  return {
    squareCells,
    roadCells,
    avoidCells,
    trees,
    decorations,
    center,
    campfire: { gridX: center.x, gridZ: center.z },
    fountain,
    bridge,
    roamBounds: {
      minX: square.x + 1,
      maxX: square.x + square.w - 2,
      minZ: square.z + 1,
      maxZ: square.z + square.d - 2,
    },
    petSpawns: {
      fangk: { gridX: center.x - 3, gridZ: center.z - 2 },
      lingq: { gridX: center.x + 3, gridZ: center.z - 2 },
      mako: { gridX: center.x, gridZ: center.z + 3 },
      crab: { gridX: center.x - 3, gridZ: center.z + 2 },
    },
  };
}

function makeForestBeach(buildings, layout, riverData, gridSize, seed) {
  const temple = buildings.find(building => building.type === 'temple');
  const rand = mulberry32(seed);
  const width = Math.min(17, gridSize - 4);
  const templeCenterX = temple
    ? Math.round(temple.gridX + temple.width / 2)
    : Math.round(gridSize * 0.72);
  const startX = Math.max(2, Math.min(gridSize - width - 2, templeCenterX - Math.floor(width / 2)));
  const endX = startX + width - 1;
  const transitionStartZ = gridSize - 9;
  const sandStartZ = gridSize - 6;
  const shoreZ = gridSize - 2;
  const sandCells = new Set();
  const rockCells = new Set();
  const transitionCells = new Set();
  const avoidCells = new Set();

  for (let z = transitionStartZ; z <= shoreZ; z += 1) {
    for (let x = startX; x <= endX; x += 1) {
      if (layout[z]?.[x] === 'water') continue;
      const edge = Math.min(x - startX, endX - x);
      const core = z >= sandStartZ;
      const sandChance = core ? 1 : 0.32 + (z - transitionStartZ) * 0.24;
      if (edge === 0 && !core && rand() < 0.55) continue;
      if (rand() > sandChance) continue;
      const key = `${x},${z}`;
      sandCells.add(key);
      avoidCells.add(key);
      if (!core) transitionCells.add(key);
    }
  }

  const spawn = {
    gridX: Math.round((startX + endX) / 2),
    gridZ: shoreZ - 1,
    facing: { x: 0, z: -1 },
  };
  for (let offset = 0; offset < width; offset += 1) {
    const direction = offset % 2 === 0 ? 1 : -1;
    const distance = Math.ceil(offset / 2);
    const x = spawn.gridX + direction * distance;
    if (sandCells.has(`${x},${spawn.gridZ}`)) {
      spawn.gridX = x;
      break;
    }
  }

  const rockCandidates = [
    [startX + 1, sandStartZ + 1],
    [endX - 1, sandStartZ + 2],
    [startX + 3, shoreZ],
    [endX - 4, shoreZ - 1],
    [startX + 6, sandStartZ],
  ];
  for (const [x, z] of rockCandidates) {
    if (Math.abs(x - spawn.gridX) <= 1 && Math.abs(z - spawn.gridZ) <= 1) continue;
    const key = `${x},${z}`;
    if (!sandCells.has(key)) continue;
    rockCells.add(key);
  }

  const waterfallZ = transitionStartZ;
  const riverRow = riverData.byRow.get(waterfallZ);
  const waterfallX = riverRow
    ? Math.min(gridSize - 4, riverRow.waterEnd + 2)
    : startX + 2;
  const waterfall = {
    gridX: waterfallX,
    gridZ: waterfallZ,
    width: 3,
    depth: 2,
    rotation: Math.PI,
  };
  addRect(avoidCells, waterfall.gridX, waterfall.gridZ, waterfall.width, waterfall.depth, gridSize);

  const forestEdgeTrees = [
    { gridX: startX + 1, gridZ: transitionStartZ - 1, type: 'oak' },
    { gridX: startX + 5, gridZ: transitionStartZ - 2, type: 'normal' },
    { gridX: endX - 5, gridZ: transitionStartZ - 1, type: 'oak' },
    { gridX: endX - 1, gridZ: transitionStartZ - 2, type: 'normal' },
  ];

  return {
    startX,
    endX,
    transitionStartZ,
    shoreZ,
    sandCells,
    rockCells,
    transitionCells,
    avoidCells,
    spawn,
    waterfall,
    forestEdgeTrees,
  };
}

function makeEmptyForestBeach() {
  return {
    startX: null,
    endX: null,
    transitionStartZ: null,
    shoreZ: null,
    sandCells: new Set(),
    rockCells: new Set(),
    transitionCells: new Set(),
    avoidCells: new Set(),
    spawn: null,
    waterfall: null,
    forestEdgeTrees: [],
  };
}

function makeForestTemple(buildings, gridSize) {
  const temple = buildings.find(b => b.type === 'temple');
  const avoidCells = new Set();
  const deviceCells = new Set();
  if (!temple) return { avoidCells, deviceCells };

  const trophy = {
    gridX: Math.round(temple.gridX + temple.width / 2),
    gridZ: Math.min(gridSize - 2, temple.gridZ + temple.depth + 1),
  };
  const tent = {
    gridX: Math.min(gridSize - 2, temple.gridX + temple.width + 1),
    gridZ: Math.round(temple.gridZ + temple.depth / 2),
  };

  for (const point of [trophy, tent]) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${point.gridX + dx},${point.gridZ + dz}`;
        avoidCells.add(key);
        deviceCells.add(key);
      }
    }
  }

  return {
    trophy,
    tent,
    avoidCells,
    deviceCells,
  };
}

// ---- clearance expansion ----

function expandClearance(footprintCells, expandBy, gridSize) {
  const result = new Set(footprintCells);
  for (const key of footprintCells) {
    const [cx, cz] = key.split(',').map(Number);
    for (let dz = -expandBy; dz <= expandBy; dz++) {
      for (let dx = -expandBy; dx <= expandBy; dx++) {
        const gx = cx + dx;
        const gz = cz + dz;
        if (gx >= 0 && gx < gridSize && gz >= 0 && gz < gridSize) {
          result.add(`${gx},${gz}`);
        }
      }
    }
  }
  return result;
}

// ---- vegetation placement ----

export function placeVegetation(layout, riverData, buildingCells, roadCells, gridSize, seed, extraAvoidCells = new Set()) {
  const rand = mulberry32(seed);
  const clearanceSet = expandClearance(buildingCells, 8, gridSize);
  const trees = [];
  const grasses = [];

  // Collect candidate cells with zone info
  const candidates = [];
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      if (layout[z][x] === 'water') continue;
      const key = `${x},${z}`;
      if (clearanceSet.has(key)) continue;
      if (roadCells.has(key)) continue;
      if (extraAvoidCells.has(key)) continue;

      const side = getRiverSide(x, z, riverData);
      const edgeDist = Math.min(x, z, gridSize - 1 - x, gridSize - 1 - z);
      const isEdge = edgeDist <= 5;

      candidates.push({ x, z, side, isEdge });
    }
  }

  // Shuffle for random discard when over cap
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // Track occupied cells — one entity per grid cell
  const occupied = new Set();

  for (const c of candidates) {
    const cellKey = `${c.x},${c.z}`;

    // Tree placement
    let treeChance = 0;
    if (c.isEdge) {
      treeChance = CHII_SCENE_DENSITY.treeChance.edge;
    } else if (c.side === 'left') {
      treeChance = CHII_SCENE_DENSITY.treeChance.pastoral;
    } else {
      treeChance = CHII_SCENE_DENSITY.treeChance.other;
    }

    if (trees.length < CHII_SCENE_DENSITY.treeCap && !occupied.has(cellKey) && rand() < treeChance) {
      const r = rand();
      trees.push({
        gridX: c.x,
        gridZ: c.z,
        type: r < 0.60 ? 'oak' : r < 0.85 ? 'normal' : 'apple',
      });
      occupied.add(cellKey);
    }

    // Grass placement (only if cell is still free)
    const grassChance = c.isEdge
      ? CHII_SCENE_DENSITY.grassChance.edge
      : CHII_SCENE_DENSITY.grassChance.other;
    if (grasses.length < CHII_SCENE_DENSITY.grassCap && !occupied.has(cellKey) && rand() < grassChance) {
      grasses.push({ gridX: c.x, gridZ: c.z });
      occupied.add(cellKey);
    }
  }

  return { trees, grasses };
}

function makePastoralDecorations(pastoral, gridSize, seed) {
  const rand = mulberry32(seed);
  const decorations = [];
  const occupied = new Set();

  function has(set, x, z) {
    return set?.has(`${x},${z}`);
  }

  function add(type, x, z, options = {}) {
    const {
      chance = 1,
      ordered = false,
      offsetY = 0,
    } = options;
    const key = `${x},${z}`;
    if (occupied.has(key) || rand() > chance) return;
    if (x < 1 || x >= gridSize - 1 || z < 1 || z >= gridSize - 1) return;
    decorations.push({
      type,
      gridX: x,
      gridZ: z,
      offsetX: ordered ? 0 : (rand() - 0.5) * 1.2,
      offsetY,
      offsetZ: ordered ? 0 : (rand() - 0.5) * 1.2,
      scale: ordered ? 1 : 0.78 + rand() * 0.48,
      rotation: ordered ? 0 : rand() * Math.PI * 2,
    });
    occupied.add(key);
  }

  // Garden rows alternate between blue tulips and trumpet flowers.
  for (const key of pastoral.gardenCells || []) {
    const [x, z] = key.split(',').map(Number);
    const type = (x + z) % 2 === 0 ? 'blueTulips' : 'trumpetFlower';
    add(type, x, z, { ordered: true });
  }

  // Wheat is planted in a regular grid. Sink it slightly so its built-in
  // ground plate sits below the farmland tile surface.
  for (const key of pastoral.wheatCells || []) {
    const [x, z] = key.split(',').map(Number);
    add('wheatField', x, z, { ordered: true, offsetY: -0.12 });
  }

  // Vegetable plots alternate carrot and grass rows.
  for (const key of pastoral.farmlandCells || []) {
    const [x, z] = key.split(',').map(Number);
    const type = (x + z) % 2 === 0 ? 'giantCarrot' : 'grassClump';
    add(type, x, z, { ordered: true });
  }

  // Outside the three cultivated areas, only scatter the established
  // ambient grass and pink flower assets.
  const anchors = pastoral.anchors || {};
  for (const anchor of [anchors.windmillCenter, anchors.farmCenter, anchors.riceCenter, anchors.wheatCenter, anchors.gardenCenter]) {
    if (!anchor) continue;
    for (let i = 0; i < 8; i++) {
      const x = anchor.x + Math.round((rand() - 0.5) * 10);
      const z = anchor.z + Math.round((rand() - 0.5) * 10);
      if (has(pastoral.roadCells, x, z) || has(pastoral.reserveCells, x, z)) continue;
      if (has(pastoral.farmlandCells, x, z) || has(pastoral.wheatCells, x, z) || has(pastoral.gardenCells, x, z)) continue;
      const type = rand() < 0.62 ? 'grassClump' : 'pinkFlower';
      add(type, x, z, { chance: 0.45 });
    }
  }

  return decorations;
}

// ---- master orchestrator ----

export function generateSceneLayout(layout, gridSize, seed = 42, {
  features = {},
} = {}) {
  const riverData = analyzeRiver(layout);

  if (riverData.byRow.size === 0) {
    console.warn('[SceneLayout] No river found in terrain layout, using defaults');
  }

  const { buildings, buildingCells } = placeBuildings(layout, riverData, gridSize);
  const roadCells = generateRoad(layout, riverData, gridSize, buildingCells);
  const pastoral = makeWindmillPastoral(buildings, layout, gridSize);
  const town = makeChurchTown(buildings, layout, riverData, gridSize);
  const forestTemple = makeForestTemple(buildings, gridSize);
  const beach = features.forestBeach === false
    ? makeEmptyForestBeach()
    : makeForestBeach(buildings, layout, riverData, gridSize, seed + 17);
  if (features.waterLandmarks === false) {
    town.fountain = null;
    forestTemple.waterfall = null;
  } else {
    forestTemple.waterfall = beach.waterfall;
  }
  for (const key of beach.avoidCells) forestTemple.avoidCells.add(key);
  for (const key of pastoral.roadCells) roadCells.add(key);
  const vegetationAvoid = new Set([
    ...pastoral.avoidCells,
    ...town.avoidCells,
    ...forestTemple.avoidCells,
    ...beach.avoidCells,
  ]);
  const { trees, grasses } = placeVegetation(layout, riverData, buildingCells, roadCells, gridSize, seed + 1, vegetationAvoid);
  trees.push(...town.trees);
  for (const tree of beach.forestEdgeTrees) {
    if (!buildingCells.has(`${tree.gridX},${tree.gridZ}`)) trees.push(tree);
  }
  const decorations = [...makePastoralDecorations(pastoral, gridSize, seed + 9), ...town.decorations];

  // Modified layout: dirt under road, irregular rock scatter under buildings
  const modifiedLayout = layout.map(row => [...row]);
  const rockRand = mulberry32(seed + 5);
  for (const key of roadCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz][gx] !== 'water') modifiedLayout[gz][gx] = 'dirt';
  }
  for (const key of pastoral.farmlandCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz][gx] !== 'water') modifiedLayout[gz][gx] = 'farmland';
  }
  for (const key of pastoral.wheatCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz][gx] !== 'water') modifiedLayout[gz][gx] = 'farmland';
  }
  for (const key of pastoral.gardenCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz][gx] !== 'water') modifiedLayout[gz][gx] = 'grass';
  }
  for (const key of town.roadCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz][gx] !== 'water') modifiedLayout[gz][gx] = 'rock';
  }
  for (const key of town.squareCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz][gx] !== 'water') modifiedLayout[gz][gx] = 'brick';
  }
  for (const key of forestTemple.deviceCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz]?.[gx] && modifiedLayout[gz][gx] !== 'water') {
      modifiedLayout[gz][gx] = 'rock';
    }
  }
  for (const key of beach.sandCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz]?.[gx] !== 'water') modifiedLayout[gz][gx] = 'sand';
  }
  for (const key of beach.rockCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz]?.[gx] !== 'water') modifiedLayout[gz][gx] = 'rock';
  }
  for (const key of pastoral.reserveCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz][gx] !== 'water' && modifiedLayout[gz][gx] !== 'farmland') {
      modifiedLayout[gz][gx] = rockRand() < 0.18 ? 'dirt' : 'grass';
    }
  }
  // Rock placement under buildings: footprint + 1-ring = 100% rock (solid base),
  // outer rings = random scatter for organic transition to surrounding terrain.
  for (const key of buildingCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz][gx] === 'water') continue;
    // Distance to nearest footprint cell
    let edgeDist = Infinity;
    for (const bk of buildingCells) {
      const [bx, bz] = bk.split(',').map(Number);
      const d = Math.max(Math.abs(gx - bx), Math.abs(gz - bz));
      if (d < edgeDist) edgeDist = d;
      if (edgeDist === 0) break;
    }
    // 0 = interior footprint, 1 = first ring → mandatory rock
    // 2+ = outer rings → probabilistic scatter
    if (edgeDist <= 1) {
      modifiedLayout[gz][gx] = 'rock';
    } else {
      const rockChance = edgeDist <= 2 ? 0.50 : edgeDist <= 3 ? 0.25 : 0.10;
      modifiedLayout[gz][gx] = rockRand() < rockChance ? 'rock' : 'dirt';
    }
  }

  return {
    buildings,
    trees,
    grasses,
    decorations,
    roadCells,
    modifiedLayout,
    riverData,
    pastoral,
    town,
    forestTemple,
    beach,
  };
}
