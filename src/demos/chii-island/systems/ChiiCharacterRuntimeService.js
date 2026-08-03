import { getChiiCharacterVariant } from '../data/characterVariants.js';
import { CHII_PET_HEIGHTS } from '../data/worldTuningProfile.js';

export class ChiiCharacterRuntimeService {
  constructor({
    assetRepository,
    assetAudit,
    equipmentService,
    appearanceStore,
    getVariant = getChiiCharacterVariant,
    petHeights = CHII_PET_HEIGHTS,
    logger = console,
  } = {}) {
    if (!assetRepository || !assetAudit || !equipmentService || !appearanceStore) {
      throw new TypeError('ChiiCharacterRuntimeService requires asset, audit, equipment, and appearance dependencies');
    }
    this.assetRepository = assetRepository;
    this.assetAudit = assetAudit;
    this.equipmentService = equipmentService;
    this.appearanceStore = appearanceStore;
    this.getVariant = getVariant;
    this.petHeights = petHeights;
    this.logger = logger;
  }

  async loadCharacterAsset(character, assetId) {
    if (!character || !assetId) return false;
    try {
      const [modelJson, animations] = await Promise.all([
        this.assetRepository.getModel(assetId),
        this.assetRepository.getAnimations(assetId),
      ]);
      this.assetAudit.recordAnimations(assetId, animations);
      character.loadModelFromJson(modelJson, {
        targetHeight: this.petHeights[assetId] || this.petHeights.generated,
      });
      if (character._modelGroup) {
        character._modelGroup.userData._baseScale = character._modelGroup.scale.x;
        character._modelGroup.userData._baseY = character._modelGroup.position.y;
      }
      for (const [name, plan] of Object.entries(animations)) character.loadAnimation(name, plan);
      this.logger.log?.(`[Init] ${assetId} ready from runtime assets`);
      return true;
    } catch (error) {
      this.logger.warn?.(`[Init] ${assetId} runtime load failed, using placeholder:`, error.message);
      return false;
    }
  }

  async applySavedAppearance(character, characterId, {
    baseModelJson = character?._originalModelJson,
    variantId = 'default',
  } = {}) {
    const appearance = this.appearanceStore.get(characterId)
      || (characterId === 'crab' ? this.appearanceStore.get('builder_crab') : null);
    if (!character || !baseModelJson || !appearance) return false;

    const approvedBaseModelJson = baseModelJson;
    let variant = null;
    try {
      variant = this.getVariant(characterId, appearance.variantId);
    } catch (error) {
      this.logger.warn?.(`[Appearance] ${characterId} variant lookup skipped:`, error.message);
      character._baseModelJson = approvedBaseModelJson;
      return false;
    }
    const appearanceVariantId = variant?.id || variantId;
    if (variant) {
      try {
        baseModelJson = await this.equipmentService.loadJson(variant.model);
        const animations = await Promise.all(Object.entries(variant.animations || {}).map(async ([name, path]) => (
          [name, await this.equipmentService.loadJson(path)]
        )));
        character.replaceModelFromJson?.(baseModelJson, {
          targetHeight: character._targetHeight
            || this.petHeights[variant.assetId]
            || this.petHeights.generated,
          preserveCurrentTransform: true,
          preserveCurrentScale: true,
        });
        const animationPlans = Object.fromEntries(animations);
        this.assetAudit.recordAnimations(variant.assetId || variant.id, animationPlans);
        for (const [name, plan] of animations) character.loadAnimation?.(name, plan);
      } catch (error) {
        this.logger.warn?.(`[Appearance] ${characterId} saved variant skipped:`, error.message);
        character._baseModelJson = approvedBaseModelJson;
        return false;
      }
    }

    character._baseModelJson = baseModelJson;
    const hasEquipment = Object.values(appearance.loadout || {}).some(Boolean);
    if (!hasEquipment) return true;

    try {
      const result = await this.equipmentService.resolveLoadout({
        characterId,
        variantId: appearanceVariantId,
        baseModelJson,
        loadout: appearance.loadout,
      });
      character.replaceModelFromJson?.(result.modelJson, {
        targetHeight: character._targetHeight,
        preserveCurrentScale: true,
      });
      character._appearanceLoadout = result.loadout;
      character._appearanceOutfitId = appearance.outfitId || null;
      character._appearanceAssetId = result.assetId || null;
      return true;
    } catch (error) {
      this.logger.warn?.(`[Appearance] ${characterId} outfit skipped:`, error.message);
      return false;
    }
  }
}
