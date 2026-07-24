import assert from 'node:assert/strict';
import test from 'node:test';
import { TownActivityAssetCache } from '../src/storage/TownActivityAssetCache.js';

function makeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('town activity assets remain reusable after the cache is recreated', async () => {
  const storage = makeStorage();
  const repository = {
    async get(assetId) {
      return assetId === 'asset_hat' ? { modelJson: { name: 'hat' } } : null;
    },
  };
  let modelGenerations = 0;
  let animationGenerations = 0;

  const first = new TownActivityAssetCache({ assetRepository: repository, storage });
  await first.getOrCreateModel('birthday-hat', async () => {
    modelGenerations += 1;
    return { assetId: 'asset_hat', modelJson: { name: 'hat' } };
  });
  await first.getOrCreateAnimation('birthday-dance', async () => {
    animationGenerations += 1;
    return { plan: { _duration: 3, _loop: true } };
  });

  const reloaded = new TownActivityAssetCache({ assetRepository: repository, storage });
  const model = await reloaded.getOrCreateModel('birthday-hat', async () => {
    modelGenerations += 1;
    return null;
  });
  const animation = await reloaded.getOrCreateAnimation('birthday-dance', async () => {
    animationGenerations += 1;
    return null;
  });

  assert.equal(modelGenerations, 1);
  assert.equal(animationGenerations, 1);
  assert.equal(model.assetId, 'asset_hat');
  assert.deepEqual(animation.plan, { _duration: 3, _loop: true });
});
