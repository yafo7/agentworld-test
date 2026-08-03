import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { InventorySystem } from '../src/demos/chii-island/systems/InventorySystem.js';

class FakePanel {
  constructor() {
    this.handlers = {};
    this.open = false;
    this.status = '';
    this.equippedId = null;
  }

  on(name, handler) {
    this.handlers[name] = handler;
    return this;
  }

  setOpen(open) { this.open = open; }
  setStatus(message) { this.status = message; }
  setBusy() {}
  setEquipped(itemId) { this.equippedId = itemId; }
  setThumbnails() {}
  dispose() { this.disposed = true; }
}

function fakeInput() {
  return {
    pressed: false,
    pointerLockEnabled: true,
    justPressed(code) {
      if (code !== 'KeyB' || !this.pressed) return false;
      this.pressed = false;
      return true;
    },
    setPointerLockEnabled(enabled) {
      this.pointerLockEnabled = enabled;
    },
  };
}

test('B toggles inventory and equipped model can be restored to base', async () => {
  const input = fakeInput();
  const panel = new FakePanel();
  const replacements = [];
  const player = {
    replaceModelFromJson(modelJson) {
      replacements.push(modelJson);
      return true;
    },
  };
  const baseModelJson = { name: '奶龙' };
  const showcased = [];
  const system = new InventorySystem({
    input,
    player,
    panel,
    baseModelJson,
    equipmentService: {
      async resolveLoadout() {
        return { modelJson: { name: '奶龙手持苹果' } };
      },
      async loadItemModel() {
        return {};
      },
    },
    onEquipped(payload) { showcased.push(payload); },
  });

  input.pressed = true;
  system.update({ canOpen: true });
  assert.equal(system.isOpen(), true);
  assert.equal(panel.open, true);
  assert.equal(input.pointerLockEnabled, false);

  await system.equip('apple');
  assert.equal(panel.equippedId, 'apple');
  assert.equal(system.isOpen(), false);
  assert.equal(showcased[0].animationPath, 'generated/equipment/animations/phrolova/classic-conductor/right-hand/apple.json');
  assert.equal(replacements.at(-1).name, '奶龙手持苹果');

  system.clear();
  assert.equal(panel.equippedId, null);
  assert.equal(replacements.at(-1), baseModelJson);

  input.pressed = true;
  system.update({ canOpen: true });
  assert.equal(system.isOpen(), true);

  input.pressed = true;
  system.update({ canOpen: true });
  assert.equal(system.isOpen(), false);
  assert.equal(input.pointerLockEnabled, true);
});

test('main loop freezes player and interaction while inventory is open', () => {
  const main = readFileSync(
    new URL('../src/demos/chii-island/main.js', import.meta.url),
    'utf8',
  );
  assert.match(main, /const inventoryOpen = inventorySystem\.isOpen\(\)/);
  assert.match(main, /new ControlLockCoordinator\(\)/);
  assert.match(main, /controlLocks\.set\('inventory', inventoryOpen/);
  assert.match(main, /!controlLocks\.isBlocked\('camera'\)/);
  assert.match(main, /!controlLocks\.isBlocked\('movement'\)/);
  assert.match(main, /new PlayerItemShowcaseDirector/);
});

test('island player and resident outfits use the shared appearance configuration', () => {
  const main = readFileSync(
    new URL('../src/demos/chii-island/main.js', import.meta.url),
    'utf8',
  );
  assert.match(main, /CHII_PLAYER_CHARACTER\.model/);
  assert.match(main, /characterId: CHII_PLAYER_CHARACTER\.id/);
  assert.match(main, /new CharacterAppearanceStore\(\{ scope: sceneStyle \}\)/);
  assert.match(main, /assignResidentIdentity\(architect, 'fangk'\)/);
  assert.match(main, /characterRuntime\.applySavedAppearance\(architect, architectDefinition\.profileId\)/);
  assert.match(main, /petManager\.pets\.map\(pet => characterRuntime\.applySavedAppearance/);
});

test('disposing inventory ignores a pending equipment result and releases its panel', async () => {
  const input = fakeInput();
  const panel = new FakePanel();
  const replacements = [];
  let resolveLoadout;
  const system = new InventorySystem({
    input,
    panel,
    player: {
      replaceModelFromJson(modelJson) {
        replacements.push(modelJson);
        return true;
      },
    },
    baseModelJson: { name: 'base' },
    equipmentService: {
      resolveLoadout: () => new Promise(resolve => { resolveLoadout = resolve; }),
      async loadItemModel() { return {}; },
    },
  });

  const pending = system.equip('apple');
  system.dispose();
  resolveLoadout({ modelJson: { name: 'late-result' } });

  assert.equal(await pending, false);
  assert.deepEqual(replacements, []);
  assert.equal(panel.disposed, true);
  assert.equal(input.pointerLockEnabled, true);
});
