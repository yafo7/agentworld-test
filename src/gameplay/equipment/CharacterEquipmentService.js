import { AIWorldActionService } from '../ai/AIWorldActionService.js';

const PASS_THROUGH_CACHE = Object.freeze({
  getOrCreate(_key, create) {
    return Promise.resolve().then(create);
  },
});

function modelRevision(modelJson) {
  const text = JSON.stringify(modelJson || {});
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedLoadout(catalog, slotOrder, loadout = {}) {
  const normalized = catalog.createEmptyLoadout();
  for (const slotId of slotOrder) {
    const itemId = loadout[slotId] || null;
    if (!itemId) continue;
    const item = catalog.getItem(itemId);
    if (!item) throw new TypeError(`Unknown equipment item: ${itemId}`);
    if (!item.allowedSlots.includes(slotId)) {
      throw new TypeError(`Equipment ${itemId} cannot use slot ${slotId}`);
    }
    normalized[slotId] = itemId;
  }
  return normalized;
}

function activeEntries(slotOrder, loadout) {
  return slotOrder
    .filter(slotId => loadout[slotId])
    .map(slotId => ({ slotId, itemId: loadout[slotId] }));
}

function buildClothingRefinePrompt(catalog, entries = []) {
  const clothing = entries
    .map(({ slotId, itemId }) => ({
      slot: catalog.getSlot(slotId),
      item: catalog.getItem(itemId),
    }))
    .filter(({ slot, item }) => slot?.kind === 'clothing' && item);
  if (clothing.length === 0) return '';
  const worn = clothing.map(({ slot, item }) => `${slot.label}：${item.secondary}`).join('；');
  const wornSlots = new Set(clothing.map(({ slot }) => slot.id));
  const empty = catalog.slots
    .filter(slot => slot.kind === 'clothing' && !wornSlots.has(slot.id))
    .map(slot => slot.label)
    .join('、');
  return [
    '保持角色身份、体型、脸部、毛色和原有配色不变。',
    `服装改为${worn}。`,
    empty ? `${empty}保持原本外观，不叠加旧衣物。` : '',
    '双手空置，四肢关节清楚，不改变动作。',
  ].filter(Boolean).join('');
}

export class CharacterEquipmentService {
  constructor({
    catalog,
    contentPort,
    assetRepository,
    cache = null,
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (!catalog || !contentPort || !assetRepository) {
      throw new TypeError('CharacterEquipmentService requires catalog, contentPort, and assetRepository');
    }
    this.catalog = catalog;
    this.slotOrder = Object.freeze(catalog.slots.map(slot => slot.id));
    this.assetRepository = assetRepository;
    this.aiActions = new AIWorldActionService({ contentPort, assetRepository });
    this.cache = cache || PASS_THROUGH_CACHE;
    this.fetchImpl = fetchImpl;
    this.jsonCache = new Map();
  }

  async resolveLoadout({
    characterId,
    variantId = 'base',
    baseModelJson,
    loadout = {},
  }) {
    if (!characterId) throw new TypeError('Equipment characterId is required');
    if (!baseModelJson) throw new TypeError('Equipment baseModelJson is required');

    const normalized = normalizedLoadout(this.catalog, this.slotOrder, loadout);
    const entries = activeEntries(this.slotOrder, normalized);
    if (entries.length === 0) {
      return {
        modelJson: baseModelJson,
        assetId: null,
        source: 'base',
        loadout: normalized,
      };
    }

    const baseRevision = modelRevision(baseModelJson);
    const clothingEntries = entries.filter(({ slotId }) => this.catalog.getSlot(slotId)?.kind === 'clothing');
    const propEntries = entries.filter(({ slotId }) => this.catalog.getSlot(slotId)?.kind === 'prop');
    let current = {
      modelJson: baseModelJson,
      assetId: null,
      source: 'base',
    };
    const prefix = clothingEntries.map(entry => `${entry.slotId}:${entry.itemId}`);

    if (clothingEntries.length > 0) {
      const loadoutPreset = this.catalog.getLoadoutPreset(characterId, normalized, variantId);
      if (loadoutPreset) {
        current = {
          modelJson: await this.loadJson(loadoutPreset),
          assetId: loadoutPreset,
          source: 'outfit-preset',
        };
      } else {
        const curatedOutfits = this.catalog.getCharacterOutfits(characterId);
        if (curatedOutfits.length > 0 && variantId !== 'original') {
          throw new Error(`${characterId} 的服装目前只制作 Original 版本`);
        }
        const clothingKey = [
          'equipment-refine-v1',
          characterId,
          variantId,
          baseRevision,
          prefix.join('+'),
        ].join(':');
        current = await this.cache.getOrCreate(clothingKey, () => this.aiActions.refineObject({
          modelJson: baseModelJson,
          description: buildClothingRefinePrompt(this.catalog, clothingEntries),
          name: `${characterId}-${variantId}-clothing`,
          tags: ['equipment', 'clothing', characterId, variantId],
        }));
      }
    } else {
      const preset = this._resolveExactPreset(characterId, variantId, entries);
      if (preset) {
        return {
          modelJson: await this.loadJson(preset),
          assetId: preset,
          source: 'preset',
          loadout: normalized,
        };
      }
    }

    for (const entry of propEntries) {
      const item = this.catalog.getItem(entry.itemId);
      prefix.push(`${entry.slotId}:${entry.itemId}`);
      const cacheKey = [
        'equipment-v1',
        characterId,
        variantId,
        baseRevision,
        prefix.join('+'),
      ].join(':');

      current = await this.cache.getOrCreate(cacheKey, async () => {
        const part = item.secondary || await this.loadItemModel(item.id);
        return this.aiActions.mountPart({
          modelJson: current.modelJson,
          part,
          placement: this.catalog.getPlacement(item, entry.slotId),
          name: `${characterId}-${variantId}-${entry.slotId}-${item.name}`,
          tags: ['equipment', characterId, variantId, entry.slotId, item.id],
        });
      });
    }

    return {
      ...current,
      loadout: normalized,
    };
  }

  async loadItemModel(itemId) {
    const item = this.catalog.getItem(itemId);
    if (!item) throw new TypeError(`Unknown equipment item: ${itemId}`);
    if (!item.model) throw new TypeError(`Equipment ${itemId} is generated during mount`);
    return this.loadJson(item.model);
  }

  loadJson(path) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (!this.jsonCache.has(normalizedPath)) {
      const promise = this.fetchImpl.call(globalThis, normalizedPath).then(response => {
        if (!response.ok) throw new Error(`${response.status} ${normalizedPath}`);
        return response.json();
      });
      this.jsonCache.set(normalizedPath, promise);
    }
    return this.jsonCache.get(normalizedPath);
  }

  _resolveExactPreset(characterId, variantId, entries) {
    if (entries.length !== 1) return null;
    const [{ slotId, itemId }] = entries;
    return this.catalog.getPreset(itemId, characterId, slotId, variantId);
  }
}
