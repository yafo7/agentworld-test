/**
 * Scene layout generator — pure logic, no Three.js dependency.
 * Analyzes terrain river and places buildings, trees, grass, and a road.
 */

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

const TREE_CAP = 200;
const GRASS_CAP = 80;

export function placeVegetation(layout, riverData, buildingCells, roadCells, gridSize, seed) {
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
      treeChance = 0.80;
    } else if (c.side === 'left') {
      treeChance = 0.45;
    } else {
      treeChance = 0.15;
    }

    if (trees.length < TREE_CAP && !occupied.has(cellKey) && rand() < treeChance) {
      const r = rand();
      trees.push({
        gridX: c.x,
        gridZ: c.z,
        type: r < 0.60 ? 'oak' : r < 0.85 ? 'normal' : 'apple',
      });
      occupied.add(cellKey);
    }

    // Grass placement (only if cell is still free)
    const grassChance = c.isEdge ? 0.14 : 0.08;
    if (grasses.length < GRASS_CAP && !occupied.has(cellKey) && rand() < grassChance) {
      grasses.push({ gridX: c.x, gridZ: c.z });
      occupied.add(cellKey);
    }
  }

  return { trees, grasses };
}

// ---- master orchestrator ----

export function generateSceneLayout(layout, gridSize, seed = 42) {
  const riverData = analyzeRiver(layout);

  if (riverData.byRow.size === 0) {
    console.warn('[SceneLayout] No river found in terrain layout, using defaults');
  }

  const { buildings, buildingCells } = placeBuildings(layout, riverData, gridSize);
  const roadCells = generateRoad(layout, riverData, gridSize, buildingCells);
  const { trees, grasses } = placeVegetation(layout, riverData, buildingCells, roadCells, gridSize, seed + 1);

  // Modified layout: dirt under road, irregular rock scatter under buildings
  const modifiedLayout = layout.map(row => [...row]);
  const rockRand = mulberry32(seed + 5);
  for (const key of roadCells) {
    const [gx, gz] = key.split(',').map(Number);
    if (modifiedLayout[gz][gx] !== 'water') modifiedLayout[gz][gx] = 'dirt';
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

  return { buildings, trees, grasses, roadCells, modifiedLayout };
}
