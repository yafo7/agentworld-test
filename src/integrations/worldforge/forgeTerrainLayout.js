import { isPointInsideWaterBody } from 'worldforge-studio/map-core';

export function createTerrainLayoutFromForge(map, gridSize = 50) {
  const [width, , depth] = map.box.size;
  return Array.from({ length: gridSize }, (_, z) => Array.from({ length: gridSize }, (_, x) => {
    const worldX = -width / 2 + (x + 0.5) * width / gridSize;
    const worldZ = -depth / 2 + (z + 0.5) * depth / gridSize;
    return map.waterBodies.some(water => isPointInsideWaterBody(water, worldX, worldZ))
      ? 'water'
      : 'grass';
  }));
}
