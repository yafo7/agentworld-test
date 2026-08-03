// Prompt-facing subset of 3d-generate vfx-tags-v1 at audited commit 1203a1e.
// Runtime particle implementation remains owned by the replaceable rendering adapter.
export const CHII_VFX_TAG_VOCABULARY = Object.freeze({
  version: 'vfx-tags-v1',
  sourceCommit: '1203a1e',
  README: {
    output_rules: [
      'Quick mode may use only continuous presets on a concrete model group.',
      'Use only listed preset names and parameters.',
      'Use one readable effect unless the action clearly needs more.',
      'Do not duplicate persistent fire or smoke already expressed by model material tags.',
    ],
    budgets: {
      continuousMaxPerModel: 4,
      eventTypesMaxPerModel: 8,
      anchorPrecisionDigits: 1,
    },
  },
  presets: {
    flame: { description: '持续火焰', trigger: 'continuous', params: { scale: { type: 'number', min: 0.3, max: 2 } } },
    flame_jet: { description: '定向柱状喷火', trigger: 'continuous', params: { scale: { type: 'number', min: 0.3, max: 2 } } },
    smoke: { description: '持续上升烟雾', trigger: 'continuous', params: { scale: { type: 'number', min: 0.3, max: 2 } } },
    embers: { description: '持续漂浮火星', trigger: 'continuous', params: { scale: { type: 'number', min: 0.3, max: 2 } } },
    charge_motes: { description: '持续汇聚光点', trigger: 'continuous', params: { scale: { type: 'number', min: 0.3, max: 2 } } },
    sparkle: { description: '持续闪烁星点', trigger: 'continuous', params: { scale: { type: 'number', min: 0.3, max: 2 } } },
    hit_spark: { description: '碰撞瞬间火花', trigger: 'event', params: { power: { type: 'number', min: 0.3, max: 1.5 } } },
    hit_debris: { description: '落地碎屑飞溅', trigger: 'event', params: { power: { type: 'number', min: 0.3, max: 1.5 } } },
    slash_trail: { description: '挥动轨迹拖尾', trigger: 'event', params: { power: { type: 'number', min: 0.3, max: 1.5 } } },
  },
  events: {
    footstep: { description: '脚步落地', default_preset: 'hit_debris' },
    land: { description: '整体落地', default_preset: 'hit_debris' },
    attack_peak: { description: '动作到达峰值', default_preset: 'slash_trail' },
    impact: { description: '物体发生碰撞', default_preset: 'hit_spark' },
    cast: { description: '技能释放瞬间', default_preset: 'charge_motes' },
  },
});

export function getChiiVfxTagVocabulary() {
  return CHII_VFX_TAG_VOCABULARY;
}
