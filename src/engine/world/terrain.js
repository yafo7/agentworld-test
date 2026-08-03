import * as THREE from 'three';

const UNIT_SIZE = 4;
const GAP = 0;
const SPACING = UNIT_SIZE + GAP;

const BLOCK_COLORS = {
  grass: 0x6b8e4a,
  dirt:  0x9b7b3c,
  rock:  0x7a7a7a,
  water: 0x315d68,
  sand: 0xd8bd79,
  farmland: 0x8f5f2f,
  brick: 0xa4513f,
};

// Cached merged geometry per block type
const _blockGeos = {};
let _blocksReady = false;

/**
 * Build all merged geometries from voxel models.
 * Each block type's model is built once, then all its meshes are merged into
 * a single BufferGeometry. This preserves the voxel studio look while using
 * InstancedMesh for the terrain (4 draw calls total).
 */
function _buildBlockGeos() {
  if (_blocksReady) return;

  const H = UNIT_SIZE * 0.85;
  const geo = new THREE.BoxGeometry(UNIT_SIZE, H, UNIT_SIZE);
  geo.translate(0, -H / 2, 0); // top face at Y=0, block extends downward

  for (const type of ['grass', 'dirt', 'rock', 'water', 'sand', 'farmland', 'brick']) {
    _blockGeos[type] = { geo, plainColor: BLOCK_COLORS[type] };
  }

  _blocksReady = true;
}

export function preloadBlocks(jsons) {
  // Kept for API compatibility; terrain now uses plain colored boxes
}

export function getBlockModel(blockType) {
  return null; // simplified — no voxel block models loaded
}

export function paintUnitArea(unitEnv, gridX, gridZ, areaType = 'default') {
  if (!unitEnv?.userData?.layout) return;
  const typeMap = {
    default: 'grass',
    tree: 'grass',
    decor: 'dirt',
    house: 'rock',
    farmland: 'farmland',
    crop: 'farmland',
    water: 'water',
  };
  const blockType = BLOCK_COLORS[areaType] ? areaType : (typeMap[areaType] || 'grass');
  if (unitEnv.userData.layout[gridZ]) {
    unitEnv.userData.layout[gridZ][gridX] = blockType;
  }
}

export function getGridWorldPosition(gridX, gridZ, centerX = 0, centerZ = 0, size = 10) {
  const offset = ((size - 1) * SPACING) / 2;
  return { x: centerX + gridX * SPACING - offset, z: centerZ + gridZ * SPACING - offset };
}

export function worldToGridCoordinates(worldX, worldZ, centerX = 0, centerZ = 0, size = 10) {
  const offset = ((size - 1) * SPACING) / 2;
  const gridX = Math.round((worldX - centerX + offset) / SPACING);
  const gridZ = Math.round((worldZ - centerZ + offset) / SPACING);
  return {
    gridX: Math.max(0, Math.min(size - 1, gridX)),
    gridZ: Math.max(0, Math.min(size - 1, gridZ)),
  };
}

// ── Procedural terrain generation ──

function _seededRandom(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function generateTerrainLayout(size, seed = 42) {
  const rand = _seededRandom(seed);
  const layout = Array.from({ length: size }, () => Array(size).fill('grass'));

  function noise(x, z) {
    return (
      Math.sin(x * 0.05 + z * 0.03) * 0.5 +
      Math.sin(x * 0.12 - z * 0.07 + 1.3) * 0.3 +
      Math.sin(x * 0.03 + z * 0.11 + 2.7) * 0.4 +
      Math.sin(x * 0.08 - z * 0.05 + 0.5) * 0.2 +
      1.4
    ) / 2.8;
  }

  const half = size / 2;
  const riverCenter = half - 5 + rand() * 10;
  const riverAmp = 5 + rand() * 8;
  const riverFreq = 0.06 + rand() * 0.04;
  const riverWidth = 2 + rand() * 2;

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const n = noise(x, z);
      const riverX = riverCenter + Math.sin(z * riverFreq) * riverAmp + Math.sin(z * 0.15 + 1.5) * 3;
      const d = Math.abs(x - riverX);
      // River
      if (d < riverWidth) { layout[z][x] = 'water'; continue; }
      // Riverbank dirt paths
      if (d < riverWidth + 2 && rand() < 0.5) { layout[z][x] = 'dirt'; continue; }
      // Branching dirt trails
      if (d < 15 && n > 0.5 && n < 0.65 && rand() < 0.2) { layout[z][x] = 'dirt'; continue; }
      // Forest clearings (dirt patches)
      if (n > 0.68 && n < 0.72 && rand() < 0.12) { layout[z][x] = 'dirt'; continue; }
      // Rock scatter
      if (rand() < 0.04) { layout[z][x] = 'rock'; continue; }
    }
  }
  return layout;
}

// ── InstancedMesh terrain ──

export function createUnitEnvironment(centerX = 0, centerZ = 0, size = 10, layout = null) {
  _buildBlockGeos();

  if (!layout) layout = generateTerrainLayout(size);

  const offset = ((size - 1) * SPACING) / 2;
  const groups = {}; // blockType → [{wx, wz, rotY}]
  const Y_ROTS = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const type = layout[z]?.[x] || 'grass';
      if (!groups[type]) groups[type] = [];
      groups[type].push({
        wx: centerX + x * SPACING - offset,
        wz: centerZ + z * SPACING - offset,
        rotY: type === 'water' ? 0 : Y_ROTS[Math.floor(Math.random() * 4)],
      });
    }
  }

  const root = new THREE.Group();
  root.name = 'UnitEnvironment';
  root.userData = { type: 'unitEnvironment', size, layout };

  const dummy = new THREE.Object3D();

  for (const [type, positions] of Object.entries(groups)) {
    const blockData = _blockGeos[type];
    if (!blockData || positions.length === 0) continue;
    const { geo, plainColor } = blockData;

    const mat = new THREE.MeshStandardMaterial({ color: plainColor, flatShading: true });
    const im = new THREE.InstancedMesh(geo, mat, positions.length);
    im.castShadow = true;
    im.receiveShadow = true;

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      dummy.position.set(p.wx, type === 'water' ? -0.55 : 0, p.wz);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.userData.terrainType = type;
    root.add(im);
  }

  // Grid outlines — just the top square, merged per block type
  const hs = UNIT_SIZE / 2;
  const sqVerts = new Float32Array([
    -hs, 0, -hs,  hs, 0, -hs,
     hs, 0, -hs,  hs, 0,  hs,
     hs, 0,  hs, -hs, 0,  hs,
    -hs, 0,  hs, -hs, 0, -hs,
  ]);
  const sqGeo = new THREE.BufferGeometry();
  sqGeo.setAttribute('position', new THREE.BufferAttribute(sqVerts, 3));
  const outlineMat = new THREE.LineBasicMaterial({ color: 0x3a2a1a, transparent: true, opacity: 0.15 });

  for (const [type, positions] of Object.entries(groups)) {
    if (type === 'water') continue;
    if (positions.length === 0) continue;
    const verts = [];
    for (const p of positions) {
      for (let j = 0; j < sqVerts.length; j += 3) {
        verts.push(sqVerts[j] + p.wx, sqVerts[j + 1], sqVerts[j + 2] + p.wz);
      }
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    root.add(new THREE.LineSegments(mg, outlineMat.clone()));
  }

  return root;
}
