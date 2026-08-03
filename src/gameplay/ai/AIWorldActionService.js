import { generatedAssets } from '../../assets/repositories/GeneratedAssetRepository.js';
import { defaultContentGeneration } from '../../integrations/content/VoxelContentAdapter.js';

export class AIWorldActionService {
  constructor({
    contentPort = defaultContentGeneration,
    assetRepository = generatedAssets,
  } = {}) {
    this.contentPort = contentPort;
    this.assetRepository = assetRepository;
  }

  async createObject({ description, name = description, quality = 'voxel', tags = [] }) {
    const result = await this.contentPort.generateModel({ description, quality });
    const saved = await this.assetRepository.saveModel({
      name,
      description,
      modelJson: result.modelJson,
      tags,
    });
    return { ...result, assetId: saved.assetId };
  }

  async refineObject({ modelJson, description, name = description, tags = [] }) {
    const result = await this.contentPort.refineModel({ modelJson, description });
    const saved = await this.assetRepository.saveModel({
      name,
      description,
      modelJson: result.modelJson,
      tags,
    });
    return { ...result, assetId: saved.assetId };
  }

  async mountPart({ modelJson, part, placement, name = part, tags = [] }) {
    const result = await this.contentPort.mountPart({
      primaryModelJson: modelJson,
      part,
      placement,
    });
    const partLabel = typeof part === 'string' ? part : (name || '配件');
    const description = typeof part === 'string'
      ? `把${partLabel}加在${placement}`
      : `${partLabel}：${placement}`;
    const saved = await this.assetRepository.saveModel({
      name,
      description,
      modelJson: result.modelJson,
      tags,
    });
    return { ...result, assetId: saved.assetId, description };
  }
}
