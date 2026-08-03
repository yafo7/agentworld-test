import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CHII_CHARACTER_OUTFITS,
  CHII_CLOTHING_ITEMS,
  CHII_EQUIPMENT_ITEMS,
  CHII_EQUIPMENT_SLOTS,
  createEmptyEquipmentLoadout,
  getEquipmentLoadoutPreset,
  getEquipmentPlacement,
  getEquipmentShowcaseAnimation,
} from '../src/demos/chii-island/data/equipmentCatalog.js';

const publicRoot = new URL('../public/', import.meta.url);
const manifest = JSON.parse(readFileSync(
  new URL('generated/equipment/manifest.json', publicRoot),
  'utf8',
));

test('Chii equipment catalog defines all requested items and wardrobe slots', () => {
  assert.deepEqual(
    CHII_EQUIPMENT_ITEMS.map(item => item.name),
    ['罐装可乐', '苹果', 'NS', '锄头', '指挥棒', '丁字尺'],
  );
  assert.deepEqual(
    CHII_EQUIPMENT_SLOTS.map(slot => slot.id),
    ['hat', 'top', 'pants', 'shoes', 'leftHand', 'rightHand'],
  );
  assert.deepEqual(createEmptyEquipmentLoadout(), {
    hat: null,
    top: null,
    pants: null,
    shoes: null,
    leftHand: null,
    rightHand: null,
  });
});

test('equipment prompts follow the short concrete Voxel profile', () => {
  for (const item of CHII_EQUIPMENT_ITEMS) {
    const prompt = item.promptPacket.prompt;
    assert.equal(item.promptPacket.operation, 'model_generate');
    assert.equal(item.promptPacket.request_hints.quality, 'voxel');
    assert.ok([...prompt].length >= 15 && [...prompt].length <= 20, `${item.id}: ${prompt}`);
    assert.match(getEquipmentPlacement(item, 'leftHand'), /左手/);
    assert.match(getEquipmentPlacement(item, 'rightHand'), /右手/);
  }
});

test('curated outfits fill all clothing slots with refine prompts', () => {
  assert.equal(CHII_CHARACTER_OUTFITS.length, 5);
  assert.equal(CHII_CLOTHING_ITEMS.length, 20);
  for (const outfit of CHII_CHARACTER_OUTFITS) {
    assert.deepEqual(Object.keys(outfit.loadout), ['hat', 'top', 'pants', 'shoes']);
    assert.ok(getEquipmentLoadoutPreset(outfit.characterId, outfit.loadout));
    assert.ok(getEquipmentLoadoutPreset(outfit.characterId, outfit.loadout, 'original'));
    assert.equal(getEquipmentLoadoutPreset(outfit.characterId, outfit.loadout, 'pro'), null);
    for (const [slotId, itemId] of Object.entries(outfit.loadout)) {
      const item = CHII_CLOTHING_ITEMS.find(entry => entry.id === itemId);
      assert.equal(item.promptPacket.operation, 'model_refine');
      assert.equal(item.promptPacket.endpoint, '/api/refine/model');
      assert.match(getEquipmentPlacement(item, slotId), /固定|戴在|贴合/);
    }
  }
});

test('generated equipment bundle keeps AI metadata and player mount presets', () => {
  assert.equal(manifest.items.length, CHII_EQUIPMENT_ITEMS.length);
  for (const item of CHII_EQUIPMENT_ITEMS) {
    assert.ok(existsSync(new URL(item.model, publicRoot)), `${item.id} model missing`);
    const modelJson = JSON.parse(readFileSync(new URL(item.model, publicRoot), 'utf8'));
    assert.ok(modelJson._meta?.ai, `${item.id} lost _meta.ai`);

    const presetPath = item.presets.nailong.rightHand;
    assert.ok(existsSync(new URL(presetPath, publicRoot)), `${item.id} Nailong preset missing`);
    const mounted = JSON.parse(readFileSync(new URL(presetPath, publicRoot), 'utf8'));
    assert.equal(mounted._meta?.chiiEquipmentLoadout?.rightHand, item.id);

    const phrolovaPreset = item.presets.phrolova.rightHand;
    assert.ok(existsSync(new URL(phrolovaPreset, publicRoot)), `${item.id} Phrolova preset missing`);
    const phrolovaMounted = JSON.parse(readFileSync(new URL(phrolovaPreset, publicRoot), 'utf8'));
    assert.equal(phrolovaMounted._meta?.chiiCharacterId, 'phrolova');
    assert.equal(phrolovaMounted._meta?.chiiEquipmentLoadout?.rightHand, item.id);
    assert.ok(getEquipmentShowcaseAnimation(item, 'phrolova', 'rightHand'));
  }
});

test('birthday and new-year Original outfits are local runtime assets', () => {
  for (const outfit of CHII_CHARACTER_OUTFITS) {
    for (const preset of outfit.presets) {
      assert.equal(preset.baseVariantId, 'original');
      assert.ok(existsSync(new URL(preset.model, publicRoot)), `${preset.model} missing`);
      const modelJson = JSON.parse(readFileSync(new URL(preset.model, publicRoot), 'utf8'));
      assert.equal(modelJson._meta?.chiiCharacterId, outfit.characterId);
      assert.equal(modelJson._meta?.chiiOutfitId, outfit.id);
      assert.equal(modelJson._meta?.chiiBaseVariantId, 'original');
      assert.deepEqual(modelJson._meta?.chiiEquipmentLoadout, preset.loadout);
    }
  }
});
