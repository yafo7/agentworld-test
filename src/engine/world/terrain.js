import * as THREE from 'three';

const UNIT_SIZE = 2;
const UNIT_HEIGHT = 0.1;
const GAP = 0.05;
const SPACING = UNIT_SIZE + GAP;

const AREA_COLORS = {
  default: 0x808080,
  pet: 0xffaaaa,
  house: 0xffffcc,
  decor: 0xffffcc,
  tree: 0xccffcc,
};

/**
 * Create a single unit area — a coloured cube whose top sits at y=0 and extends downward.
 * @param {number} x - world X position
 * @param {number} z - world Z position
 * @param {number} gridX - grid column index inside the unit environment
 * @param {number} gridZ - grid row index inside the unit environment
 * @param {string} areaType - 'default' | 'pet' | 'house' | 'decor' | 'tree'
 */
export function createUnitArea(x, z, gridX, gridZ, areaType = 'default') {
  const geometry = new THREE.BoxGeometry(UNIT_SIZE, UNIT_HEIGHT, UNIT_SIZE);
  const color = AREA_COLORS[areaType] || AREA_COLORS.default;
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, -UNIT_HEIGHT / 2, z);
  mesh.userData = { type: 'unitArea', gridX, gridZ, areaType };
  return mesh;
}

/**
 * Convert grid coordinates to world position within a unit environment.
 * @param {number} gridX - column index (0..size-1)
 * @param {number} gridZ - row index (0..size-1)
 * @param {number} centerX - world X center of the environment
 * @param {number} centerZ - world Z center of the environment
 * @param {number} size - grid dimension
 */
export function getGridWorldPosition(gridX, gridZ, centerX = 0, centerZ = 0, size = 10) {
  const offset = ((size - 1) * SPACING) / 2;
  const x = centerX + gridX * SPACING - offset;
  const z = centerZ + gridZ * SPACING - offset;
  return { x, z };
}

/**
 * Convert world position to nearest grid coordinates within a unit environment.
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} centerX - world X center of the environment
 * @param {number} centerZ - world Z center of the environment
 * @param {number} size - grid dimension
 * @returns {{gridX: number, gridZ: number}} clamped to [0, size-1]
 */
export function worldToGridCoordinates(worldX, worldZ, centerX = 0, centerZ = 0, size = 10) {
  const offset = ((size - 1) * SPACING) / 2;
  const gridX = Math.round((worldX - centerX + offset) / SPACING);
  const gridZ = Math.round((worldZ - centerZ + offset) / SPACING);
  return {
    gridX: Math.max(0, Math.min(size - 1, gridX)),
    gridZ: Math.max(0, Math.min(size - 1, gridZ)),
  };
}

/**
 * Paint a unit area within an existing unit environment group.
 * @param {THREE.Group} unitEnvGroup - the group returned by createUnitEnvironment
 * @param {number} gridX - column index
 * @param {number} gridZ - row index
 * @param {string} areaType - 'default' | 'pet' | 'house' | 'decor' | 'tree'
 */
export function paintUnitArea(unitEnvGroup, gridX, gridZ, areaType) {
  for (const child of unitEnvGroup.children) {
    if (
      child.userData?.type === 'unitArea' &&
      child.userData.gridX === gridX &&
      child.userData.gridZ === gridZ
    ) {
      const color = AREA_COLORS[areaType] || AREA_COLORS.default;
      child.material.color.setHex(color);
      child.userData.areaType = areaType;
      return true;
    }
  }
  return false;
}

/**
 * Create a unit environment — a size×size grid of unit areas with small gaps.
 * @param {number} centerX - world X center
 * @param {number} centerZ - world Z center
 * @param {number} size - grid dimension (default 10)
 */
export function createUnitEnvironment(centerX = 0, centerZ = 0, size = 10) {
  const group = new THREE.Group();
  group.name = 'UnitEnvironment';
  group.userData = { type: 'unitEnvironment', size };

  const offset = ((size - 1) * SPACING) / 2;

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const x = centerX + i * SPACING - offset;
      const z = centerZ + j * SPACING - offset;
      const unit = createUnitArea(x, z, i, j, 'default');
      group.add(unit);
    }
  }

  return group;
}
