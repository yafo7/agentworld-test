export const CHII_MAIN_WORLD_ID = 'chii-main';

export const WORLD_FORGE_WORLD_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'wf-open-plain',
    mapNumber: 'WF-001',
    sourceMapId: 'map-7bb9ef04-6e49-4f39',
    name: '开阔平原',
    description: '阳光充足的开阔草地，适合漫步和后续布置。',
    gameplayPreset: 'exploration',
    order: 10,
  }),
  Object.freeze({
    id: 'wf-fresh-forest',
    mapNumber: 'WF-002',
    sourceMapId: 'map-39a2f074-ec20-4fdf',
    name: '清新树林',
    description: '层次分明的林地，用于验证植被与林间空间。',
    gameplayPreset: 'exploration',
    order: 20,
  }),
  Object.freeze({
    id: 'wf-sakura-bamboo',
    mapNumber: 'WF-003',
    sourceMapId: 'map-535216ce-49a2-45b2',
    name: '樱花竹林',
    description: '樱花与竹林组合的观赏型地图。',
    gameplayPreset: 'exploration',
    order: 30,
  }),
  Object.freeze({
    id: 'wf-sunset-grassland',
    mapNumber: 'WF-004',
    sourceMapId: 'map-ae8c8e55-bfa2-4217',
    name: '夕阳草原',
    description: '以黄昏光照为主的草原地图。',
    gameplayPreset: 'exploration',
    order: 40,
  }),
  Object.freeze({
    id: 'wf-chii-island',
    mapNumber: 'WF-005',
    sourceMapId: 'map-6ea55ad2-0d07-4161',
    name: '奇异岛',
    description: '森林、田园、小镇、高山、樱花林和瀑布连成一体的完整岛屿。',
    gameplayPreset: 'exploration',
    order: 50,
  }),
]);

export function findWorldForgeWorldDefinition(worldId) {
  return WORLD_FORGE_WORLD_DEFINITIONS.find(entry => entry.id === worldId) || null;
}
