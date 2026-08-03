import {
  getGeneratedAsset,
  saveAnimationForModel,
  saveGeneratedModel,
} from '../generatedLibrary.js';

export class GeneratedAssetRepository {
  async get(assetId) {
    return getGeneratedAsset(assetId);
  }

  async saveModel(model) {
    return saveGeneratedModel(model);
  }

  async saveAnimation(animation) {
    return saveAnimationForModel(animation);
  }

  async saveBundle({ model, animations = {} }) {
    const { assetId } = await this.saveModel(model);
    for (const [name, value] of Object.entries(animations)) {
      const plan = value?.plan || value;
      const type = value?.type || (name === 'idle' ? 'idle' : name);
      await this.saveAnimation({ modelId: assetId, name, plan, type });
    }
    return { assetId };
  }
}

export const generatedAssets = new GeneratedAssetRepository();
