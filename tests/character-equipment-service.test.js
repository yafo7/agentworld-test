import assert from 'node:assert/strict';
import test from 'node:test';
import { CharacterEquipmentService } from '../src/gameplay/equipment/CharacterEquipmentService.js';
import { EquipmentMountCache } from '../src/storage/EquipmentMountCache.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

const MAKO_BIRTHDAY_LOADOUT = Object.freeze({
  hat: 'mako-birthday-hat',
  top: 'mako-birthday-top',
  pants: 'mako-birthday-pants',
  shoes: 'mako-birthday-shoes',
});

test('Nailong single right-hand item resolves its prebuilt local preset', async () => {
  const requests = [];
  const service = new CharacterEquipmentService({
    contentPort: {
      async mountPart() { throw new Error('backend should not be called'); },
    },
    assetRepository: {},
    fetchImpl: async url => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({ name: '奶龙手持苹果', source: url }),
      };
    },
  });

  const result = await service.resolveLoadout({
    characterId: 'nailong',
    baseModelJson: { name: '奶龙' },
    loadout: { rightHand: 'apple' },
  });

  assert.equal(result.source, 'preset');
  assert.equal(result.modelJson.name, '奶龙手持苹果');
  assert.deepEqual(requests, ['/generated/equipment/mounts/nailong/right-hand/apple.json']);
});

test('character equipment mounts multiple slots in stable order and reuses cache', async () => {
  const calls = [];
  const saved = new Map();
  let nextId = 0;
  const assetRepository = {
    async saveModel({ modelJson }) {
      const assetId = `asset-${++nextId}`;
      saved.set(assetId, modelJson);
      return { assetId };
    },
    async get(assetId) {
      return { modelJson: saved.get(assetId) || null };
    },
  };
  const cache = new EquipmentMountCache({
    assetRepository,
    storage: memoryStorage(),
  });
  const service = new CharacterEquipmentService({
    contentPort: {
      async mountPart({ primaryModelJson, part, placement }) {
        calls.push({ primaryModelJson, part, placement });
        return {
          modelJson: {
            ...primaryModelJson,
            mounted: [...(primaryModelJson.mounted || []), part.name],
          },
        };
      },
    },
    assetRepository,
    cache,
    fetchImpl: async url => ({
      ok: true,
      json: async () => ({ name: url.split('/').at(-1).replace('.json', '') }),
    }),
  });

  const request = {
    characterId: 'momo',
    variantId: 'default',
    baseModelJson: { name: 'momo', _meta: { ai: { v: 1 } } },
    loadout: { leftHand: 'apple', rightHand: 'hoe' },
  };
  const first = await service.resolveLoadout(request);
  const second = await service.resolveLoadout(request);

  assert.deepEqual(first.modelJson.mounted, ['apple', 'hoe']);
  assert.deepEqual(second.modelJson.mounted, ['apple', 'hoe']);
  assert.equal(calls.length, 2);
  assert.match(calls[0].placement, /左手/);
  assert.match(calls[1].placement, /右手/);
});

test('a clothing slot uses one identity-preserving refine instead of mount', async () => {
  const calls = [];
  const service = new CharacterEquipmentService({
    contentPort: {
      async refineModel(request) {
        calls.push(request);
        return { modelJson: { ...request.modelJson, refinedWith: request.description } };
      },
      async mountPart() { throw new Error('clothing must not use mount'); },
    },
    assetRepository: {
      async saveModel({ modelJson }) {
        return { assetId: 'clothing-asset', modelJson };
      },
      async get() {
        return null;
      },
    },
    cache: new EquipmentMountCache({ storage: memoryStorage() }),
  });

  const result = await service.resolveLoadout({
    characterId: 'mako',
    variantId: 'original',
    baseModelJson: { name: 'mako', _meta: { ai: { v: 1 } } },
    loadout: { top: 'mako-birthday-top' },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].description, /蓝色短披风/);
  assert.match(calls[0].description, /双手空置/);
  assert.equal(result.modelJson.refinedWith, calls[0].description);
});

test('a curated Original outfit preset is reused only for its matching model variant', async () => {
  const requests = [];
  const service = new CharacterEquipmentService({
    contentPort: {
      async refineModel() { throw new Error('matching Original preset should not call backend'); },
    },
    assetRepository: {},
    fetchImpl: async url => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({ name: 'mako-original-birthday', source: url }),
      };
    },
  });

  const result = await service.resolveLoadout({
    characterId: 'mako',
    variantId: 'original',
    baseModelJson: { name: 'mako-original' },
    loadout: MAKO_BIRTHDAY_LOADOUT,
  });

  assert.equal(result.source, 'outfit-preset');
  assert.equal(result.modelJson.name, 'mako-original-birthday');
  assert.deepEqual(requests, ['/generated/equipment/outfits/mako/birthday/original/full.json']);
});

test('curated clothing never substitutes another model variant', async () => {
  const service = new CharacterEquipmentService({
    contentPort: {
      async refineModel() { throw new Error('backend should not be called for an unsupported variant'); },
    },
    assetRepository: {
      async saveModel({ modelJson }) {
        return { assetId: 'mako-original-birthday', modelJson };
      },
      async get() {
        return null;
      },
    },
    cache: new EquipmentMountCache({ storage: memoryStorage() }),
    fetchImpl: async () => { throw new Error('an Original preset must not replace another base'); },
  });
  const originalBase = {
    name: 'mako-original',
    revision: 'original-r1',
  };

  await assert.rejects(
    service.resolveLoadout({
      characterId: 'mako',
      variantId: 'pro',
      baseModelJson: { name: 'mako-pro', revision: 'pro-r1' },
      loadout: MAKO_BIRTHDAY_LOADOUT,
    }),
    /只制作 Original 版本/,
  );
  const undressed = await service.resolveLoadout({
    characterId: 'mako',
    variantId: 'original',
    baseModelJson: originalBase,
    loadout: {},
  });

  assert.equal(undressed.source, 'base');
  assert.strictEqual(undressed.modelJson, originalBase);
});
