// Local generated model library for the Chii Island editor.
// ⚠️ 2026-07-01: All old preset models have been archived to public/generated/_archive/.
// New models should be created via the Voxel Studio (3d-generate) and will appear
// under the "体素工作室" section in the model library panel.
//
// Only essential runtime models remain active:
//   - placeholder.json  (G key placeholder)
//   - player-nezha.json (player character)

/** @typedef {{ id: string, name: string, path: string, category: 'environment'|'tree'|'decor'|'pet', tags: string[], hasIdleAnimation?: boolean }} LocalModel */

/** @type {LocalModel[]} */
export const LOCAL_MODEL_LIBRARY = [
  // ---- player (essential) ----
  { id: 'player-nezha', name: '玩家·哪吒', path: 'generated/models/player-nezha.json', category: 'pet', tags: ['玩家', '哪吒', '神话'], hasIdleAnimation: true },

  // ═══════════════════════════════════════════════════════════════
  // 已归档模型（仅供参考，运行时不再加载）
  // 所有旧模型文件位于: public/generated/_archive/
  //
  // 环境: forest / pond / grassland / sun_stone / trainer
  // 树木: tree_marko / tree_witch / tree_yafo / tree_goldfish / tree_rand_1~6
  // 装饰: country_shop / moss_lamp / wind_chime / ps5_console / ns2_console / thunder_snow / pet_house
  // 宠物: 马扣(mako) / 扶摇(fuyao) / momo / 小石芽 / 皮卡丘 / 雨灯绒 / 风铃草
  //
  // 后续通过体素工作室生成新模型后，模型库的"体素工作室"分区会自动显示。
  // ═══════════════════════════════════════════════════════════════
];

/** Animation assets that pair with models by id. */
export const LOCAL_ANIMATION_LIBRARY = {
  'player-nezha': 'generated/animations/player-nezha-idle.json',
  // 已归档动画位于: public/generated/_archive/animations/
};

/**
 * Find a local model by id.
 * @param {string} id
 * @returns {LocalModel|undefined}
 */
export function getLocalModelById(id) {
  return LOCAL_MODEL_LIBRARY.find((m) => m.id === id);
}

/**
 * Get idle animation path for a local model id, if any.
 * @param {string} id
 * @returns {string|undefined}
 */
export function getLocalAnimationPath(id) {
  return LOCAL_ANIMATION_LIBRARY[id];
}
