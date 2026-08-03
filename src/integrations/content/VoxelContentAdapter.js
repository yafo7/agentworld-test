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

const AUDITED_CONTENT_POLICY = Object.freeze({
  model: Object.freeze({
    standard: Object.freeze({ provider: 'fireworks', mode: 'standard', timeoutMs: CONTENT_TIMEOUT_MS }),
    pro: Object.freeze({ provider: 'gpt', model: GPT_VOXEL_MODEL, mode: 'standard', timeoutMs: CONTENT_TIMEOUT_MS, materialTags: true }),
    voxel: Object.freeze({ provider: 'gpt', model: GPT_VOXEL_MODEL, mode: 'voxel', timeoutMs: CONTENT_TIMEOUT_MS, materialTags: true }),
    'voxel-pro': Object.freeze({ provider: 'gpt', model: GPT_VOXEL_MODEL, mode: 'voxel-pro', timeoutMs: CONTENT_TIMEOUT_MS, materialTags: true }),
  }),
  refine: Object.freeze({ provider: 'gpt', timeoutMs: CONTENT_TIMEOUT_MS, materialTags: true }),
  mount: Object.freeze({ provider: 'gpt', timeoutMs: CONTENT_TIMEOUT_MS }),
  animation: Object.freeze({ provider: 'gpt', timeoutMs: CONTENT_TIMEOUT_MS, vfxTags: true }),
  chat: Object.freeze({
    standard: Object.freeze({ provider: 'fireworks' }),
    pro: Object.freeze({ provider: 'gpt' }),
    planner: Object.freeze({ provider: 'deepseek' }),
  }),
});

class ContentPolicyError extends TypeError {
  constructor(message, { field = null, value = null } = {}) {
    super(message);
    this.name = 'ContentPolicyError';
    this.code = 'UNSUPPORTED_CONTENT_POLICY';
    this.field = field;
    this.value = value;
  }
}

function policyError(field, value, expected = null) {
  const expectedText = expected == null ? '' : `; expected ${JSON.stringify(expected)}`;
  return new ContentPolicyError(
    `Unsupported content policy ${field}: ${JSON.stringify(value)}${expectedText}`,
    { field, value },
  );
}

function selectProfile(profiles, profile, field) {
  if (!Object.hasOwn(profiles, profile)) {
    throw policyError(field, profile, Object.keys(profiles));
  }
  return profiles[profile];
}

function assertNoTransportOverrides(request, operation) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return;
  for (const field of ['provider', 'model', 'mode']) {
    if (Object.hasOwn(request, field)) {
      throw policyError(`${operation}.${field}`, request[field], 'selected by audited profile');
    }
  }
}

export class VoxelContentAdapter extends ContentGenerationPort {
  constructor({
    api = {},
    chat = callBackendChat,
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
    this.policy = AUDITED_CONTENT_POLICY;
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

  async generateModel(request = {}) {
    assertNoTransportOverrides(request, 'generateModel');
    const { description, quality = 'standard' } = request;
    if (!description?.trim()) throw new TypeError('Model description is required');
    const selection = selectProfile(this.policy.model, quality, 'generateModel.quality');
    const materialTags = await this._materialTags(selection.materialTags);
    return this.api.generateModel(description.trim(), selection.provider, selection.mode, {
      model: selection.model || null,
      timeoutMs: selection.timeoutMs,
      ...(materialTags ? { materialTags } : {}),
    });
  }

  async refineModel(request = {}) {
    assertNoTransportOverrides(request, 'refineModel');
    const { modelJson, description } = request;
    if (!modelJson) throw new TypeError('Refine modelJson is required');
    if (!description?.trim()) throw new TypeError('Refine description is required');
    const materialTags = await this._materialTags(this.policy.refine.materialTags);
    return this.api.refineModel(modelJson, description.trim(), this.policy.refine.provider, {
      timeoutMs: this.policy.refine.timeoutMs,
      ...(materialTags ? { materialTags } : {}),
    });
  }

  async mountPart(request = {}) {
    assertNoTransportOverrides(request, 'mountPart');
    const { primaryModelJson, part, placement } = request;
    if (!primaryModelJson) throw new TypeError('Mount primaryModelJson is required');
    if (!part) throw new TypeError('Mount part is required');
    const instruction = typeof part === 'string'
      ? (placement ? `把${part}加在${placement}` : '')
      : String(placement || '').trim();
    return this.api.mountModel(primaryModelJson, part, instruction, this.policy.mount.provider, {
      timeoutMs: this.policy.mount.timeoutMs,
    });
  }

  async generateAnimation(request = {}) {
    assertNoTransportOverrides(request, 'generateAnimation');
    const { modelJson, description, duration = 2, emitParticles = false } = request;
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

  async chat(request = {}) {
    assertNoTransportOverrides(request, 'chat');
    const { messages, profile = 'standard', temperature = 0.7, maxTokens = 1024 } = request;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new TypeError('Chat messages are required');
    }
    const selection = selectProfile(this.policy.chat, profile, 'chat.profile');
    return this.chatClient(messages, selection.provider, temperature, maxTokens);
  }
}

export const defaultContentGeneration = new VoxelContentAdapter();
