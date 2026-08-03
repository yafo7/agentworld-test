export const CHII_EQUIPMENT_SLOTS = Object.freeze([
  Object.freeze({ id: 'hat', label: '帽子', kind: 'clothing' }),
  Object.freeze({ id: 'top', label: '上衣', kind: 'clothing' }),
  Object.freeze({ id: 'pants', label: '裤子', kind: 'clothing' }),
  Object.freeze({ id: 'shoes', label: '鞋子', kind: 'clothing' }),
  Object.freeze({ id: 'leftHand', label: '左手', kind: 'prop' }),
  Object.freeze({ id: 'rightHand', label: '右手', kind: 'prop' }),
]);

const equipmentModel = id => `generated/equipment/models/${id}.json`;
const nailongRightHand = id => `generated/equipment/mounts/nailong/right-hand/${id}.json`;
const phrolovaRightHand = id => `generated/equipment/mounts/phrolova/classic-conductor/right-hand/${id}.json`;
const phrolovaRightHandShow = id => `generated/equipment/animations/phrolova/classic-conductor/right-hand/${id}.json`;
const outfitPreset = (characterId, outfitId, variantId = 'original') => (
  `generated/equipment/outfits/${characterId}/${outfitId}/${variantId}/full.json`
);

function prop({
  id,
  name,
  shortName,
  category,
  prompt,
  placement,
  accent,
}) {
  return Object.freeze({
    id,
    name,
    shortName,
    category,
    kind: 'prop',
    accent,
    allowedSlots: Object.freeze(['leftHand', 'rightHand']),
    promptPacket: Object.freeze({
      operation: 'model_generate',
      prompt_profile: 'chii-v1',
      endpoint: '/api/generate/model',
      prompt,
      request_hints: Object.freeze({
        quality: 'voxel',
        emitParticles: false,
      }),
    }),
    placement,
    model: equipmentModel(id),
    presets: Object.freeze({
      nailong: Object.freeze({
        rightHand: nailongRightHand(id),
      }),
      phrolova: Object.freeze({
        rightHand: phrolovaRightHand(id),
      }),
    }),
    presetVariantIds: Object.freeze({
      nailong: Object.freeze({
        rightHand: Object.freeze(['base', 'default']),
      }),
      phrolova: Object.freeze({
        rightHand: 'a',
      }),
    }),
    showcaseAnimations: Object.freeze({
      phrolova: Object.freeze({
        rightHand: phrolovaRightHandShow(id),
      }),
    }),
  });
}

function clothing({
  id,
  name,
  shortName,
  slot,
  secondary,
  placement,
  accent,
  characterId,
  outfitId,
}) {
  return Object.freeze({
    id,
    name,
    shortName,
    category: 'clothing',
    kind: 'clothing',
    accent,
    allowedSlots: Object.freeze([slot]),
    secondary,
    placement,
    characterId,
    outfitId,
    promptPacket: Object.freeze({
      operation: 'model_refine',
      prompt_profile: 'chii-v1',
      endpoint: '/api/refine/model',
      secondary,
      placement,
      request_hints: Object.freeze({
        quality: 'pro',
        emitParticles: false,
      }),
    }),
    presets: Object.freeze({}),
    presetVariantIds: Object.freeze({}),
  });
}

export const CHII_EQUIPMENT_ITEMS = Object.freeze([
  prop({
    id: 'canned-cola',
    name: '罐装可乐',
    shortName: '可乐',
    category: 'snack',
    prompt: '红色易拉罐可乐，银色拉环，白色波浪标签',
    placement: '将它固定在{hand}掌心，罐身竖直，标签朝前，避开手臂和身体',
    accent: '#e75d55',
  }),
  prop({
    id: 'apple',
    name: '苹果',
    shortName: '苹果',
    category: 'snack',
    prompt: '圆润红苹果，短棕果梗，一片绿色叶子',
    placement: '将它固定在{hand}掌心，果梗朝上，叶片朝外，避开手臂和身体',
    accent: '#d94d4d',
  }),
  prop({
    id: 'ns-handheld',
    name: 'NS',
    shortName: 'NS',
    category: 'toy',
    prompt: '红蓝手柄便携游戏机，黑色横屏，扁平机身',
    placement: '将它固定在{hand}掌心，屏幕朝前，机身保持水平，避开手臂和身体',
    accent: '#4f9cbd',
  }),
  prop({
    id: 'hoe',
    name: '锄头',
    shortName: '锄头',
    category: 'tool',
    prompt: '长木柄铁锄头，深灰横刃，握柄笔直',
    placement: '将木柄固定在{hand}掌心，锄刃朝前下方，避开手臂和身体',
    accent: '#8a765d',
  }),
  prop({
    id: 'conductor-baton',
    name: '指挥棒',
    shortName: '指挥棒',
    category: 'tool',
    prompt: '细长黑色指挥棒，白色握柄，尖细棒身',
    placement: '将白色握柄固定在{hand}掌心，棒尖朝前上方，避开手臂和身体',
    accent: '#66596f',
  }),
  prop({
    id: 't-square',
    name: '丁字尺',
    shortName: '丁字尺',
    category: 'tool',
    prompt: '浅黄木质丁字尺，长直尺身，横向短尺头',
    placement: '将长尺中段固定在{hand}掌心，横尺朝外，避开手臂和身体',
    accent: '#d0a34f',
  }),
]);

const CLOTHING_SLOT_PLACEMENT = Object.freeze({
  hat: '固定在头顶中央，不遮挡眼睛、耳朵、角或羽冠',
  top: '贴合身体上半部，保留四肢和关节轮廓，不与身体重叠',
  pants: '贴合腰部与腿部上端，不改变原有腿长和关节位置',
  shoes: '分别贴合脚部或蹄部，保持脚底着地，不改变肢体长度',
});

function outfitItems(characterId, outfitId, accent, definitions) {
  return Object.entries(definitions).map(([slot, definition]) => clothing({
    id: `${characterId}-${outfitId}-${slot}`,
    name: definition.name,
    shortName: definition.shortName,
    slot,
    secondary: definition.secondary,
    placement: CLOTHING_SLOT_PLACEMENT[slot],
    accent,
    characterId,
    outfitId,
  }));
}

const OUTFIT_ITEM_GROUPS = Object.freeze({
  makoBirthday: outfitItems('mako', 'birthday', '#f0b84d', {
    hat: { name: '生日星星礼帽', shortName: '礼帽', secondary: '彩色锥形生日礼帽，金色星星帽尖' },
    top: { name: '生日星星披风', shortName: '披风', secondary: '蓝色短披风，彩色星星滚边，金色领结' },
    pants: { name: '生日星点腿饰', shortName: '腿饰', secondary: '深蓝星点腿带，四条腿分别佩戴' },
    shoes: { name: '生日派对蹄套', shortName: '蹄套', secondary: '四只金色短蹄套，红色鞋带和星星扣' },
  }),
  makoNewYear: outfitItems('mako', 'new-year', '#cf4638', {
    hat: { name: '骏马新春帽', shortName: '红帽', secondary: '红色圆顶新春帽，金色帽结，两耳露出' },
    top: { name: '骏马新春披挂', shortName: '披挂', secondary: '红色金边短披挂，背部有金色祥云纹' },
    pants: { name: '骏马新春腿带', shortName: '腿带', secondary: '四条红色金边腿带，分别贴合腿部上端' },
    shoes: { name: '骏马新春蹄套', shortName: '蹄套', secondary: '四只红色短蹄套，金色云纹鞋面' },
  }),
  fangkNewYear: outfitItems('fangk', 'new-year', '#d84c3f', {
    hat: { name: '新春红帽', shortName: '红帽', secondary: '红色圆顶新春帽，金色帽结和短流苏' },
    top: { name: '新春小棉袄', shortName: '棉袄', secondary: '红色小棉袄，金色盘扣和白色绒领' },
    pants: { name: '新春长裤', shortName: '长裤', secondary: '深红长裤，裤腿带金色祥云侧纹' },
    shoes: { name: '新春布鞋', shortName: '布鞋', secondary: '黑底红面布鞋，鞋面有金色云纹' },
  }),
  lingqNewYear: outfitItems('lingq', 'new-year', '#df4f55', {
    hat: { name: '孔雀新春花冠', shortName: '花冠', secondary: '红色梅花小花冠，金色珠串绕过羽冠' },
    top: { name: '孔雀新春披肩', shortName: '披肩', secondary: '红色金边短披肩，胸前系金色蝴蝶结' },
    pants: { name: '孔雀新春腰饰', shortName: '腰饰', secondary: '红色金边腰饰，避开尾羽和双腿关节' },
    shoes: { name: '孔雀新春脚环', shortName: '脚环', secondary: '两只红色金边脚环，带小金铃' },
  }),
  crabNewYear: outfitItems('crab', 'new-year', '#e25743', {
    hat: { name: '螃蟹新春帽', shortName: '红帽', secondary: '红色圆顶小帽，金色帽结，双眼完整露出' },
    top: { name: '螃蟹新春背心', shortName: '背心', secondary: '红色金边短背心，贴合甲壳并露出双钳' },
    pants: { name: '螃蟹新春围摆', shortName: '围摆', secondary: '红色金边短围摆，绕在甲壳下缘并露出蟹腿' },
    shoes: { name: '螃蟹新春脚套', shortName: '脚套', secondary: '八只小红脚套，金边贴合每只蟹足' },
  }),
});

export const CHII_CLOTHING_ITEMS = Object.freeze(Object.values(OUTFIT_ITEM_GROUPS).flat());

function loadoutFor(characterId, outfitId) {
  return Object.freeze(Object.fromEntries(
    CHII_EQUIPMENT_SLOTS
      .filter(slot => slot.kind === 'clothing')
      .map(slot => [slot.id, `${characterId}-${outfitId}-${slot.id}`]),
  ));
}

function outfit({
  id,
  characterId,
  name,
  description,
  accent,
  loadout,
  presetVariantId = 'original',
}) {
  return Object.freeze({
    id,
    characterId,
    name,
    description,
    accent,
    loadout,
    supportedVariantIds: Object.freeze([presetVariantId]),
    presets: Object.freeze([Object.freeze({
      loadout,
      model: outfitPreset(characterId, id, presetVariantId),
      baseVariantId: presetVariantId,
    })]),
  });
}

export const CHII_CHARACTER_OUTFITS = Object.freeze([
  outfit({
    id: 'birthday',
    characterId: 'mako',
    name: '生日套装',
    description: '星星礼帽、短披风、星点短裤和派对短靴。',
    accent: '#f0b84d',
    loadout: loadoutFor('mako', 'birthday'),
  }),
  outfit({
    id: 'new-year',
    characterId: 'mako',
    name: '新春套装',
    description: '红帽、祥云披挂、四条腿带和红色蹄套。',
    accent: '#cf4638',
    loadout: loadoutFor('mako', 'new-year'),
  }),
  outfit({
    id: 'new-year',
    characterId: 'fangk',
    name: '新春套装',
    description: '红帽、小棉袄、长裤和云纹布鞋。',
    accent: '#d84c3f',
    loadout: loadoutFor('fangk', 'new-year'),
  }),
  outfit({
    id: 'new-year',
    characterId: 'lingq',
    name: '新春套装',
    description: '梅花冠、金边披肩、腰饰和铃铛脚环。',
    accent: '#df4f55',
    loadout: loadoutFor('lingq', 'new-year'),
  }),
  outfit({
    id: 'new-year',
    characterId: 'crab',
    name: '新春套装',
    description: '圆顶红帽、金边背心、短围摆和小脚套。',
    accent: '#e25743',
    loadout: loadoutFor('crab', 'new-year'),
  }),
]);

export const CHII_ALL_EQUIPMENT_ITEMS = Object.freeze([
  ...CHII_EQUIPMENT_ITEMS,
  ...CHII_CLOTHING_ITEMS,
]);

const ITEMS_BY_ID = new Map(CHII_ALL_EQUIPMENT_ITEMS.map(item => [item.id, item]));
const SLOTS_BY_ID = new Map(CHII_EQUIPMENT_SLOTS.map(slot => [slot.id, slot]));
const CHARACTER_EQUIPMENT_ALIASES = Object.freeze({ builder_crab: 'crab', fangke: 'fangk' });

function equipmentCharacterId(characterId) {
  return CHARACTER_EQUIPMENT_ALIASES[characterId] || characterId;
}

export function getChiiEquipmentItem(itemId) {
  return ITEMS_BY_ID.get(itemId) || null;
}

export function getChiiEquipmentSlot(slotId) {
  return SLOTS_BY_ID.get(slotId) || null;
}

export function createEmptyEquipmentLoadout() {
  return Object.fromEntries(CHII_EQUIPMENT_SLOTS.map(slot => [slot.id, null]));
}

export function getEquipmentPlacement(itemOrId, slotId) {
  const item = typeof itemOrId === 'string'
    ? getChiiEquipmentItem(itemOrId)
    : itemOrId;
  const slot = getChiiEquipmentSlot(slotId);
  if (!item || !slot || !item.allowedSlots.includes(slotId)) {
    throw new TypeError(`Equipment ${item?.id || itemOrId} cannot use slot ${slotId}`);
  }
  return item.placement.replace('{hand}', slot.label);
}

export function getEquipmentPreset(itemOrId, characterId, slotId, variantId = null) {
  const item = typeof itemOrId === 'string'
    ? getChiiEquipmentItem(itemOrId)
    : itemOrId;
  const preset = item?.presets?.[characterId]?.[slotId] || null;
  const presetVariantId = item?.presetVariantIds?.[characterId]?.[slotId] || null;
  const acceptsVariant = Array.isArray(presetVariantId)
    ? presetVariantId.includes(variantId)
    : presetVariantId === variantId;
  if (variantId && presetVariantId && !acceptsVariant) return null;
  return preset;
}

export function getEquipmentShowcaseAnimation(itemOrId, characterId, slotId) {
  const item = typeof itemOrId === 'string'
    ? getChiiEquipmentItem(itemOrId)
    : itemOrId;
  return item?.showcaseAnimations?.[characterId]?.[slotId] || null;
}

function loadoutSignature(loadout = {}) {
  return CHII_EQUIPMENT_SLOTS
    .filter(slot => loadout[slot.id])
    .map(slot => `${slot.id}:${loadout[slot.id]}`)
    .join('+');
}

function clothingSignature(loadout = {}) {
  return CHII_EQUIPMENT_SLOTS
    .filter(slot => slot.kind === 'clothing' && loadout[slot.id])
    .map(slot => `${slot.id}:${loadout[slot.id]}`)
    .join('+');
}

export function getCharacterOutfits(characterId) {
  const normalized = equipmentCharacterId(characterId);
  return CHII_CHARACTER_OUTFITS.filter(outfitEntry => outfitEntry.characterId === normalized);
}

export function getMatchingCharacterOutfit(characterId, loadout = {}) {
  const signature = clothingSignature(loadout);
  return getCharacterOutfits(characterId)
    .find(outfitEntry => clothingSignature(outfitEntry.loadout) === signature)
    || null;
}

export function getEquipmentLoadoutPreset(characterId, loadout = {}, variantId = null) {
  const signature = clothingSignature(loadout);
  for (const outfitEntry of getCharacterOutfits(characterId)) {
    const preset = outfitEntry.presets.find(entry => clothingSignature(entry.loadout) === signature);
    if (preset && (!variantId || preset.baseVariantId === variantId)) return preset.model;
  }
  return null;
}

export const CHII_EQUIPMENT_CATALOG = Object.freeze({
  slots: CHII_EQUIPMENT_SLOTS,
  createEmptyLoadout: createEmptyEquipmentLoadout,
  getCharacterOutfits,
  getItem: getChiiEquipmentItem,
  getLoadoutPreset: getEquipmentLoadoutPreset,
  getPlacement: getEquipmentPlacement,
  getPreset: getEquipmentPreset,
  getSlot: getChiiEquipmentSlot,
});
