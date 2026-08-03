import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ChiiCharacterRuntimeService } from '../src/demos/chii-island/systems/ChiiCharacterRuntimeService.js';

function createCharacter() {
  return {
    _targetHeight: 2,
    _originalModelJson: { name: 'base' },
    loadedAnimations: [],
    loadModelFromJson(modelJson, options) {
      this.loadedModel = { modelJson, options };
      this._modelGroup = new THREE.Group();
      this._modelGroup.scale.setScalar(1.5);
      this._modelGroup.position.y = 0.25;
    },
    loadAnimation(name, plan) {
      this.loadedAnimations.push([name, plan]);
    },
    replaceModelFromJson(modelJson, options) {
      this.replacement = { modelJson, options };
      return true;
    },
  };
}

function createService(overrides = {}) {
  return new ChiiCharacterRuntimeService({
    assetRepository: {
      async getModel() { return { name: 'resident' }; },
      async getAnimations() { return { idle: { duration: 2 } }; },
    },
    assetAudit: { recordAnimations() {} },
    equipmentService: {
      async loadJson(path) { return { path }; },
      async resolveLoadout() {
        return { modelJson: { name: 'dressed' }, loadout: { rightHand: 'apple' }, assetId: 'look-1' };
      },
    },
    appearanceStore: { get() { return null; } },
    petHeights: { resident: 1.8, generated: 1.4 },
    getVariant: () => null,
    logger: { log() {}, warn() {} },
    ...overrides,
  });
}

test('character runtime service loads audited resident assets and base transform metadata', async () => {
  const audit = [];
  const service = createService({
    assetAudit: { recordAnimations: (...args) => audit.push(args) },
  });
  const character = createCharacter();

  assert.equal(await service.loadCharacterAsset(character, 'resident'), true);
  assert.equal(character.loadedModel.options.targetHeight, 1.8);
  assert.equal(character._modelGroup.userData._baseScale, 1.5);
  assert.equal(character._modelGroup.userData._baseY, 0.25);
  assert.deepEqual(character.loadedAnimations, [['idle', { duration: 2 }]]);
  assert.equal(audit[0][0], 'resident');
});

test('character runtime service restores a variant from the approved base before one loadout request', async () => {
  const requests = [];
  const appearance = {
    variantId: 'winter',
    outfitId: 'festival',
    loadout: { rightHand: 'apple' },
  };
  const service = createService({
    appearanceStore: { get: id => (id === 'mako' ? appearance : null) },
    getVariant: () => ({
      id: 'winter',
      assetId: 'resident',
      model: '/variant.json',
      animations: { idle: '/idle.json' },
    }),
    equipmentService: {
      async loadJson(path) { return { path }; },
      async resolveLoadout(request) {
        requests.push(request);
        return { modelJson: { name: 'dressed' }, loadout: request.loadout, assetId: 'look-1' };
      },
    },
  });
  const character = createCharacter();

  assert.equal(await service.applySavedAppearance(character, 'mako'), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].baseModelJson.path, '/variant.json');
  assert.equal(requests[0].variantId, 'winter');
  assert.equal(character._appearanceAssetId, 'look-1');
  assert.equal(character._appearanceOutfitId, 'festival');
  assert.deepEqual(character.loadedAnimations, [['idle', { path: '/idle.json' }]]);
});

test('builder crab appearance accepts the canonical saved identity alias', async () => {
  const service = createService({
    appearanceStore: {
      get: id => (id === 'builder_crab' ? { loadout: {} } : null),
    },
  });
  assert.equal(await service.applySavedAppearance(createCharacter(), 'crab'), true);
});

test('missing saved variant falls back to the approved base without aborting startup', async () => {
  const warnings = [];
  const baseModelJson = { name: 'approved-base' };
  const character = {
    _originalModelJson: baseModelJson,
    replaceModelFromJson() {
      throw new Error('a missing variant must not replace the current base');
    },
  };
  const service = new ChiiCharacterRuntimeService({
    assetRepository: {},
    assetAudit: { recordAnimations() {} },
    equipmentService: {
      async loadJson() { throw new Error('missing saved variant'); },
      async resolveLoadout() { throw new Error('loadout must be skipped'); },
    },
    appearanceStore: {
      get() { return { variantId: 'retired', loadout: { hat: 'old-hat' } }; },
    },
    getVariant() {
      return { id: 'retired', model: '/missing.json', animations: {} };
    },
    logger: { warn(...args) { warnings.push(args.join(' ')); } },
  });

  assert.equal(await service.applySavedAppearance(character, 'mako'), false);
  assert.strictEqual(character._baseModelJson, baseModelJson);
  assert.match(warnings.join('\n'), /missing saved variant/);
});
