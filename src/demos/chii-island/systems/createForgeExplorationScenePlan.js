import { analyzeRiver } from './sceneLayout.js';

export function createForgeExplorationScenePlan(terrainLayout) {
  const emptySet = () => new Set();
  return {
    buildings: [],
    trees: [],
    grasses: [],
    decorations: [],
    roadCells: emptySet(),
    modifiedLayout: terrainLayout.map(row => [...row]),
    riverData: analyzeRiver(terrainLayout),
    pastoral: {
      farmlandCells: emptySet(),
      wheatCells: emptySet(),
      gardenCells: emptySet(),
      roadCells: emptySet(),
      reserveCells: emptySet(),
      avoidCells: emptySet(),
      petSpawns: {},
    },
    town: {
      squareCells: emptySet(),
      roadCells: emptySet(),
      avoidCells: emptySet(),
      trees: [],
      decorations: [],
      petSpawns: {},
      bridge: null,
      campfire: null,
      fountain: null,
      roamBounds: null,
    },
    forestTemple: { avoidCells: emptySet(), deviceCells: emptySet() },
    beach: { avoidCells: emptySet(), sandCells: emptySet(), rockCells: emptySet(), forestEdgeTrees: [] },
  };
}
