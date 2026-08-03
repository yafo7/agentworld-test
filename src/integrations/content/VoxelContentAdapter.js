import {
  generateAnimation as requestAnimation,
  generateModel as requestModel,
  mountModel as requestMount,
  refineModel as requestRefine,
} from '../../backend/voxelApi.js';
import { callBackendChat } from '../../backend/chatApi.js';
import { ContentGenerationPort } from '../../ports/ContentGenerationPort.js';
import { getChiiMaterialTagVocabulary } from './chiiMaterialTagVocabulary.js';
import { getChiiVfxTagVocabulary } from './chiiVfxTagVocabulary.js';

const GPT_VOXEL_MODEL = 'gpt-5.6-sol-high';
const CONTENT_TIMEOUT_MS = 300000;

const DEFAULT_POLICY = Object.freeze({
  model: {
    standard: { provider: 'fireworks', mode: 'standard', timeoutMs: CONTENT_TIMEOUT_MS },
    pro: { provider: 'gpt', model: GPT_VOXEL_MODEL, mode: 'standard', timeoutMs: CONTENT_TIMEOUT_MS, materialTags: true },
    voxel: { provider: 'gpt', model: GPT_VOXEL_MODEL, mode: 'voxel', timeoutMs: CONTENT_TIMEOUT_MS, materialTags: true },
    'voxel-pro': { provider: 'gpt', model: GPT_VOXEL_MODEL, mode: 'voxel-pro', timeoutMs: CONTENT_TIMEOUT_MS, materialTags: true },
  },
  refine: { provider: 'gpt', timeoutMs: CONTENT_TIMEOUT_MS, materialTags: true },
  mount: { provider: 'gpt', timeoutMs: CONTENT_TIMEOUT_MS },
  animation: { provider: 'gpt', timeoutMs: CONTENT_TIMEOUT_MS, vfxTags: true },
  chat: {
    standard: { provider: 'fireworks' },
    pro: { provider: 'gpt' },
    planner: { provider: 'deepseek' },
  },
});

export class VoxelContentAdapter extends ContentGenerationPort {
  constructor({
    api = {},
    chat = callBackendChat,
    policy = DEFAULT_POLICY,
    materialTagVocabulary = getChiiMaterialTagVocabulary,
    vfxTagVocabulary = getChiiVfxTagVocabulary,
  } = {}) {
    super();
    this.api = {
      generateModel: api.generateModel || requestModel,
      refineModel: api.refineModel || requestRefine,
      mountModel: api.mountModel || requestMount,
      generateAnimation: api.generateAnimation || requestAnimation,
    };
    this.chatClient = chat;
    this.policy = policy;
    this.materialTagVocabulary = materialTagVocabulary;
    this.vfxTagVocabulary = vfxTagVocabulary;
  }

  async _vfxTags(enabled) {
    if (!enabled) return null;
    try {
      return await this.vfxTagVocabulary?.();
    } catch (error) {
      console.warn('[VoxelContentAdapter] VFX Tags unavailable:', error.message);
      return null;
    }
  }

  async _materialTags(enabled) {
    if (!enabled) return null;
    try {
      return await this.materialTagVocabulary?.();
    } catch (error) {
      console.warn('[VoxelContentAdapter] Material Tags unavailable:', error.message);
      return null;
    }
  }

  async generateModel({ description, quality = 'standard' }) {
    if (!description?.trim()) throw new TypeError('Model description is required');
    const selection = this.policy.model[quality] || this.policy.model.standard;
    const materialTags = await this._materialTags(selection.materialTags);
    return this.api.generateModel(description.trim(), selection.provider, selection.mode, {
      model: selection.model || null,
      timeoutMs: selection.timeoutMs,
      ...(materialTags ? { materialTags } : {}),
    });
  }

  async refineModel({ modelJson, description }) {
    if (!modelJson) throw new TypeError('Refine modelJson is required');
    if (!description?.trim()) throw new TypeError('Refine description is required');
    const materialTags = await this._materialTags(this.policy.refine.materialTags);
    return this.api.refineModel(modelJson, description.trim(), this.policy.refine.provider, {
      timeoutMs: this.policy.refine.timeoutMs,
      ...(materialTags ? { materialTags } : {}),
    });
  }

  async mountPart({ primaryModelJson, part, placement }) {
    if (!primaryModelJson) throw new TypeError('Mount primaryModelJson is required');
    if (!part) throw new TypeError('Mount part is required');
    const instruction = typeof part === 'string'
      ? (placement ? `把${part}加在${placement}` : '')
      : String(placement || '').trim();
    return this.api.mountModel(primaryModelJson, part, instruction, this.policy.mount.provider, {
      timeoutMs: this.policy.mount.timeoutMs,
    });
  }

  async generateAnimation({ modelJson, description, duration = 2, emitParticles = false }) {
    if (!modelJson) throw new TypeError('Animation modelJson is required');
    if (!description?.trim()) throw new TypeError('Animation description is required');
    const vfxTags = await this._vfxTags(emitParticles && this.policy.animation.vfxTags);
    return this.api.generateAnimation(
      modelJson,
      description.trim(),
      duration,
      this.policy.animation.provider,
      emitParticles,
      {
        timeoutMs: this.policy.animation.timeoutMs,
        ...(vfxTags ? { vfxTags } : {}),
      }
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
