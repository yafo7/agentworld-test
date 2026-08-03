export const INTERIOR_WORLD_ORIGINS = Object.freeze({
  church: Object.freeze({ x: 520, y: 0, z: 0 }),
  empty: Object.freeze({ x: 590, y: 0, z: 0 }),
});

export const CHURCH_INTERIOR_ASSET_SPECS = Object.freeze({
  churchPew: Object.freeze({
    assetId: 'churchPew',
    fileName: 'church_pew',
    name: '哥特教堂长椅',
    prompt: '深棕木制哥特教堂长椅，高直靠背、尖拱扶手、四条短腿',
    quality: 'voxel',
    targetSize: Object.freeze({ width: 5.6, height: 1.35, depth: 1.5 }),
  }),
  churchAltar: Object.freeze({
    assetId: 'churchAltar',
    fileName: 'church_altar',
    name: '哥特石制祭坛桌',
    prompt: '灰白石制哥特祭坛桌，厚桌面、尖拱浮雕、四根短柱',
    quality: 'voxel',
    targetSize: Object.freeze({ width: 4.2, height: 1.5, depth: 1.9 }),
  }),
  churchStatue: Object.freeze({
    assetId: 'churchStatue',
    fileName: 'church_angel_statue',
    name: '石雕天使神像',
    prompt: '灰白石雕天使神像，合拢双翼、双手祈祷、八角底座',
    quality: 'voxel',
    targetSize: Object.freeze({ width: 2.4, height: 4.6, depth: 2.2 }),
  }),
});

const pewRows = [10.5, 6, 1.5, -3, -7.5];

export const CHURCH_INTERIOR_PLAN = Object.freeze({
  id: 'church_interior',
  roomType: 'church',
  displayName: '哥特教堂',
  origin: INTERIOR_WORLD_ORIGINS.church,
  size: Object.freeze({ width: 26, depth: 38, height: 14 }),
  playerSpawn: Object.freeze({ x: 0, y: 0, z: 12.5 }),
  exitTrigger: Object.freeze({ x: 0, y: 0, z: 17.1 }),
  lookDirection: Object.freeze({ x: 0, y: 0, z: -1 }),
  camera: Object.freeze({ yaw: 0, pitch: 0.22, distance: 6 }),
  furniture: Object.freeze([
    ...pewRows.flatMap((z, row) => [
      Object.freeze({
        id: `church_pew_left_${row + 1}`,
        assetId: 'churchPew',
        position: Object.freeze({ x: -4.7, y: 0, z }),
        rotationY: 0,
      }),
      Object.freeze({
        id: `church_pew_right_${row + 1}`,
        assetId: 'churchPew',
        position: Object.freeze({ x: 4.7, y: 0, z }),
        rotationY: 0,
      }),
    ]),
    Object.freeze({
      id: 'church_main_altar',
      assetId: 'churchAltar',
      position: Object.freeze({ x: 0, y: 0.32, z: -13.6 }),
      rotationY: 0,
    }),
    Object.freeze({
      id: 'church_angel_statue',
      assetId: 'churchStatue',
      position: Object.freeze({ x: 0, y: 0.55, z: -17 }),
      rotationY: Math.PI,
    }),
  ]),
});

export const EMPTY_INTERIOR_PLAN = Object.freeze({
  id: 'empty_interior',
  roomType: 'empty',
  displayName: '空房间',
  origin: INTERIOR_WORLD_ORIGINS.empty,
  size: Object.freeze({ width: 16, depth: 16, height: 7 }),
  playerSpawn: Object.freeze({ x: 0, y: 0, z: 2 }),
  exitTrigger: Object.freeze({ x: 0, y: 0, z: 6.5 }),
  lookDirection: Object.freeze({ x: 0, y: 0, z: -1 }),
  camera: Object.freeze({ yaw: 0, pitch: 0.22, distance: 4.8 }),
  furniture: Object.freeze([]),
});

export const GOTHIC_INTERIOR_REFERENCES = Object.freeze([
  'https://www.cologne-tourism.com/arts-culture/sights/cologne-cathedral/interior',
  'https://cathedral.org/discover/art-architecture/gothic-architecture-101/',
]);

export function interiorWorldPoint(plan, localPoint) {
  return {
    x: plan.origin.x + localPoint.x,
    y: plan.origin.y + localPoint.y,
    z: plan.origin.z + localPoint.z,
  };
}
