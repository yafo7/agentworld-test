// Prompt-facing subset of 3d-generate material-tags-v1 at audited commit de51c7d.
// Runtime shader parameters intentionally stay in the rendering backend.
export const CHII_MATERIAL_TAG_VOCABULARY = Object.freeze({
  version: 'material-tags-v1',
  sourceCommit: 'de51c7d',
  README: {
    output_rules: [
      'Only write tags on visually important parts.',
      'enum tags use one listed value; blend tags use 0, 0.25, 0.5, 0.75, or 1.',
      'Never invent tag names, values, variants, shader layers, colors, or render parameters.',
      'emissive does not inherit; tag each glowing mesh directly.',
      'Keep the model root neutral and place fire or smoke on a child effect group.',
    ],
    budgets: {
      perPartMax: "1 enum 'base' + optional enum 'water' + at most 3 blend tags",
      blendQuantization: 0.25,
    },
  },
  tags: {
    base: {
      mode: 'enum',
      status: 'implemented',
      values: ['gold', 'silver', 'metal', 'glass', 'wood', 'stone'],
      variantEnum: ['default', 'birch', 'brick', 'marble', 'cobblestone'],
      description: '部件的基础材质。普通彩色部件不要标记；明确的木、石、金属或玻璃部件才标记。',
    },
    water: {
      mode: 'enum',
      status: 'implemented',
      values: ['pool', 'fall'],
      description: '水体路由。水平静水用pool，垂直水流或瀑布用fall。',
    },
    emissive: {
      mode: 'blend',
      status: 'implemented',
      inherits: false,
      description: '自身发光部件，必须直接标记发光网格。',
    },
    fire: {
      mode: 'blend',
      status: 'implemented',
      variantEnum: ['normal', 'blue', 'green'],
      description: '正在燃烧或明确带火焰的部件。',
    },
    smoke: {
      mode: 'blend',
      status: 'implemented',
      variantEnum: ['normal', 'steam'],
      description: '冒烟或冒蒸汽的部件，可独立于火焰使用。',
    },
  },
});

export function getChiiMaterialTagVocabulary() {
  return CHII_MATERIAL_TAG_VOCABULARY;
}
