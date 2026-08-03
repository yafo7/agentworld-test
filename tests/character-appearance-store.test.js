import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CharacterAppearanceStore,
  CHII_CHARACTER_APPEARANCE_STORAGE_KEY,
} from '../src/storage/CharacterAppearanceStore.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test('character showcase appearance survives a return to the island', () => {
  const storage = memoryStorage();
  const showcaseStore = new CharacterAppearanceStore({ storage });
  showcaseStore.set('mako', {
    variantId: 'default',
    outfitId: 'birthday',
    loadout: {
      hat: 'mako-birthday-hat',
      top: 'mako-birthday-top',
      pants: 'mako-birthday-pants',
      shoes: 'mako-birthday-shoes',
    },
  });

  const islandStore = new CharacterAppearanceStore({ storage });
  assert.equal(islandStore.get('mako').outfitId, 'birthday');
  assert.equal(islandStore.get('mako').loadout.shoes, 'mako-birthday-shoes');
  assert.match(storage.getItem(CHII_CHARACTER_APPEARANCE_STORAGE_KEY), /mako-birthday-hat/);
});

test('stored appearance values are returned as copies', () => {
  const storage = memoryStorage();
  const store = new CharacterAppearanceStore({ storage });
  store.set('fangk', {
    outfitId: 'new-year',
    loadout: { hat: 'fangk-new-year-hat' },
  });
  const first = store.get('fangk');
  first.loadout.hat = null;
  assert.equal(store.get('fangk').loadout.hat, 'fangk-new-year-hat');
});

test('character appearances are isolated between scene styles', () => {
  const storage = memoryStorage();
  const voxel = new CharacterAppearanceStore({ storage, scope: 'voxel' });
  const pro = new CharacterAppearanceStore({ storage, scope: 'pro' });
  voxel.set('mako', {
    outfitId: 'birthday',
    loadout: { hat: 'mako-birthday-hat' },
  });

  assert.equal(pro.get('mako'), null);
  assert.equal(voxel.get('mako').outfitId, 'birthday');
});

test('a frozen appearance map can replace the current scene style', () => {
  const storage = memoryStorage();
  const store = new CharacterAppearanceStore({ storage, scope: 'original' });
  store.set('fangk', { outfitId: 'new-year', loadout: { top: 'red-coat' } });
  const frozen = store.getAll();
  store.set('fangk', { outfitId: null, loadout: {} });

  store.replaceAll(frozen);

  assert.equal(store.get('fangk').outfitId, 'new-year');
  assert.equal(store.get('fangk').loadout.top, 'red-coat');
});
