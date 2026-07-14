import {
  generateAnimation as requestAnimation,
  generateModel as requestModel,
  mountModel as requestMount,
  refineModel as requestRefine,
} from '../../backend/voxelApi.js';
import { callBackendChat } from '../../backend/chatApi.js';
import { ContentGenerationPort } from '../../ports/ContentGenerationPort.js';

const DEFAULT_POLICY = Object.freeze({
  model: {
    standard: { provider: 'fireworks', mode: 'standard' },
    voxel: { provider: 'gpt', mode: 'voxel' },
  },
  refine: { provider: 'gpt' },
  mount: { provider: 'gpt' },
  animation: { provider: 'gpt' },
  chat: {
    standard: { provider: 'fireworks' },
    pro: { provider: 'gpt' },
    planner: { provider: 'deepseek' },
  },
});

export class VoxelContentAdapter extends ContentGenerationPort {
  constructor({ api = {}, chat = callBackendChat, policy = DEFAULT_POLICY } = {}) {
    super();
    this.api = {
      generateModel: api.generateModel || requestModel,
      refineModel: api.refineModel || requestRefine,
      mountModel: api.mountModel || requestMount,
      generateAnimation: api.generateAnimation || requestAnimation,
    };
    this.chatClient = chat;
    this.policy = policy;
  }

  async generateModel({ description, quality = 'standard' }) {
    if (!description?.trim()) throw new TypeError('Model description is required');
    const selection = this.policy.model[quality] || this.policy.model.standard;
    return this.api.generateModel(description.trim(), selection.provider, selection.mode);
  }

  async refineModel({ modelJson, description }) {
    if (!modelJson) throw new TypeError('Refine modelJson is required');
    if (!description?.trim()) throw new TypeError('Refine description is required');
    return this.api.refineModel(modelJson, description.trim(), this.policy.refine.provider);
  }

  async mountPart({ primaryModelJson, part, placement }) {
    if (!primaryModelJson) throw new TypeError('Mount primaryModelJson is required');
    if (!part) throw new TypeError('Mount part is required');
    const instruction = placement ? `把${part}加在${placement}` : '';
    return this.api.mountModel(primaryModelJson, part, instruction, this.policy.mount.provider);
  }

  async generateAnimation({ modelJson, description, duration = 2, emitParticles = false }) {
    if (!modelJson) throw new TypeError('Animation modelJson is required');
    if (!description?.trim()) throw new TypeError('Animation description is required');
    return this.api.generateAnimation(
      modelJson,
      description.trim(),
      duration,
      this.policy.animation.provider,
      emitParticles
    );
  }

  async chat({ messages, profile = 'standard', temperature = 0.7, maxTokens = 1024 }) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new TypeError('Chat messages are required');
    }
    const selection = this.policy.chat[profile] || this.policy.chat.standard;
    return this.chatClient(messages, selection.provider, temperature, maxTokens);
  }
}

export const defaultContentGeneration = new VoxelContentAdapter();
