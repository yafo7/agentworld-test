import { assertContentGenerationPort } from '../../ports/ContentGenerationPort.js';
import { assertPromptCompilerPort } from '../../ports/PromptCompilerPort.js';
import { createGenerationIntent, createPromptRequestId, PROMPT_OPERATIONS } from './prompts/PromptOperations.js';
import { shouldUseSemanticUnderstanding } from './prompts/PromptCompiler.js';
import { GenerationContextResolver } from './GenerationContextResolver.js';
import { PromptEvaluationService } from './PromptEvaluationService.js';

export class PromptCompilationError extends Error {
  constructor(message, { code = 'PROMPT_COMPILATION_FAILED', details = null } = {}) {
    super(message);
    this.name = 'PromptCompilationError';
    this.code = code;
    this.details = details;
  }
}

function publicPayload(packet) {
  const payload = { ...packet.payload };
  for (const key of ['modelJson', 'primaryModelJson']) {
    if (payload[key]) payload[key] = '[model-json]';
  }
  if (payload.part && typeof payload.part === 'object') payload.part = '[part-model-json]';
  if (Array.isArray(payload.messages)) {
    payload.messages = payload.messages.map(message => ({
      role: message.role,
      content: String(message.content || '').slice(0, 1200),
    }));
  }
  return payload;
}

function resultSummary(result) {
  if (!result || typeof result !== 'object') return { type: typeof result };
  return {
    assetId: result.assetId || null,
    hasModel: Boolean(result.modelJson),
    hasAnimation: Boolean(result.plan),
    operationCount: Array.isArray(result.operations) ? result.operations.length : null,
  };
}

export class AIGenerationController {
  constructor({
    compiler,
    contentPort,
    actionService,
    semanticUnderstanding = null,
    contextResolver = new GenerationContextResolver(),
    evaluator = new PromptEvaluationService(),
    worldAuthoringPort = null,
    history = null,
  } = {}) {
    this.compiler = assertPromptCompilerPort(compiler);
    this.contentPort = assertContentGenerationPort(contentPort);
    if (!actionService) throw new TypeError('AIGenerationController requires actionService');
    this.actionService = actionService;
    this.semanticUnderstanding = semanticUnderstanding;
    this.contextResolver = contextResolver;
    this.evaluator = evaluator;
    this.worldAuthoringPort = worldAuthoringPort;
    this.history = history;
  }

  async prepare(input, suppliedContext = {}) {
    let intent = createGenerationIntent(input);
    const context = await this.contextResolver.resolve(intent, suppliedContext);
    intent = createGenerationIntent({ ...intent, context });

    if (this.semanticUnderstanding && shouldUseSemanticUnderstanding(intent)) {
      const semantic = await this.semanticUnderstanding.understand(intent);
      if (semantic.missing?.length) {
        throw new PromptCompilationError(`生成信息不完整：${semantic.missing.join('、')}`, {
          code: 'PROMPT_CLARIFICATION_REQUIRED',
          details: semantic.missing,
        });
      }
      intent = createGenerationIntent({ ...intent, semantic, semanticPlanning: 'disabled' });
    }

    let packet = this.compiler.compile(intent);
    let evaluation = this.evaluator.evaluate(packet);
    let strategy = this.evaluator.boundedStrategy(packet, evaluation);
    if (!evaluation.accepted && strategy.action === 'rewrite' && this.semanticUnderstanding && !intent.semantic) {
      const semantic = await this.semanticUnderstanding.understand(intent);
      if (!semantic.missing?.length) {
        intent = createGenerationIntent({ ...intent, semantic, semanticPlanning: 'disabled' });
        packet = this.compiler.compile(intent);
        evaluation = this.evaluator.evaluate(packet);
        strategy = this.evaluator.boundedStrategy(packet, evaluation);
      }
    }
    if (!packet.validation.valid) {
      throw new PromptCompilationError(`Prompt 校验失败：${packet.validation.errors.join(', ')}`, {
        details: packet.validation,
      });
    }
    const prepared = Object.freeze({
      id: createPromptRequestId('prepared'),
      intent,
      packet,
      evaluation,
      strategy,
      status: intent.approval.required && !intent.approval.confirmed ? 'awaiting_approval' : 'ready',
    });
    this._record(prepared.id, {
      status: 'prepared',
      operation: intent.operation,
      intentId: intent.id,
      rawText: intent.source.text.slice(0, 500),
      packet: { ...packet, payload: publicPayload(packet) },
      evaluation,
    });
    return prepared;
  }

  async execute(prepared, { confirmed = false, executor = null } = {}) {
    if (!prepared?.packet || !prepared?.intent) throw new TypeError('Prepared generation is required');
    if (prepared.intent.approval.required && !prepared.intent.approval.confirmed && !confirmed) {
      throw new PromptCompilationError('本次生成需要玩家确认', { code: 'PROMPT_APPROVAL_REQUIRED' });
    }
    const receiptId = createPromptRequestId('receipt');
    const startedAt = Date.now();
    try {
      const result = executor
        ? await executor(prepared.packet, prepared.intent)
        : await this._executePacket(prepared.packet, prepared.intent);
      const resultEvaluation = this.evaluator.evaluateResult(prepared.packet, result);
      const receipt = Object.freeze({
        id: receiptId,
        preparedId: prepared.id,
        intentId: prepared.intent.id,
        operation: prepared.intent.operation,
        promptProfileVersion: prepared.packet.promptProfileVersion,
        templateId: prepared.packet.templateId,
        cacheKey: prepared.packet.cacheKey,
        status: 'succeeded',
        durationMs: Date.now() - startedAt,
        result: Object.freeze(resultSummary(result)),
        resultEvaluation,
      });
      this._record(receiptId, { ...receipt, packetId: prepared.packet.id });
      return { result, receipt, packet: prepared.packet };
    } catch (error) {
      this._record(receiptId, {
        id: receiptId,
        preparedId: prepared.id,
        intentId: prepared.intent.id,
        operation: prepared.intent.operation,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: { code: error?.code || null, message: String(error?.message || error).slice(0, 300) },
      });
      throw error;
    }
  }

  async run(input, options = {}) {
    const prepared = await this.prepare(input, options.context);
    return this.execute(prepared, options);
  }

  async commitWorld(prepared, preview, { confirmed = false } = {}) {
    if (!confirmed) throw new PromptCompilationError('WorldForge 地图事务需要明确确认', { code: 'PROMPT_APPROVAL_REQUIRED' });
    if (!this.worldAuthoringPort) throw new Error('World authoring is unavailable');
    const result = await this.worldAuthoringPort.commit({
      mapId: prepared.packet.payload.mapId,
      label: prepared.packet.payload.label,
      operations: preview.operations,
    });
    this._record(createPromptRequestId('receipt'), {
      preparedId: prepared.id,
      intentId: prepared.intent.id,
      operation: prepared.intent.operation,
      status: 'committed',
      mapId: prepared.packet.payload.mapId,
      operationCount: preview.operations.length,
    });
    return result;
  }

  addFeedback(receiptId, feedback) {
    return this.history?.addFeedback?.(receiptId, feedback) || null;
  }

  recommendFromFeedback(feedback) {
    return this.evaluator.feedbackStrategy(feedback);
  }

  listHistory(options = {}) {
    return this.history?.list?.(options) || [];
  }

  _record(id, value) {
    this.history?.append?.({ id, ...value });
  }

  async _executePacket(packet, intent) {
    switch (packet.operation) {
      case PROMPT_OPERATIONS.MODEL_GENERATE:
      case PROMPT_OPERATIONS.PET_GENERATE:
      case PROMPT_OPERATIONS.BUILDING_GENERATE:
        return this.actionService.createObject({
          description: packet.payload.description,
          quality: packet.payload.quality,
          name: intent.input.name || packet.payload.description,
          tags: intent.input.tags || [],
        });
      case PROMPT_OPERATIONS.MODEL_REFINE:
        return this.actionService.refineObject({
          modelJson: packet.payload.modelJson,
          description: packet.payload.description,
          name: intent.input.name || packet.payload.description,
          tags: intent.input.tags || [],
        });
      case PROMPT_OPERATIONS.MODEL_MOUNT:
        return this.actionService.mountPart({
          modelJson: packet.payload.primaryModelJson,
          part: packet.payload.part,
          placement: packet.payload.placement,
          name: intent.input.name || (typeof packet.payload.part === 'string' ? packet.payload.part : '配件'),
          tags: intent.input.tags || [],
        });
      case PROMPT_OPERATIONS.ANIMATION_GENERATE:
        return this.contentPort.generateAnimation(packet.payload);
      case PROMPT_OPERATIONS.EVENT_PLAN:
      case PROMPT_OPERATIONS.TASK_PLAN:
      case PROMPT_OPERATIONS.AGENT_PLAN:
      case PROMPT_OPERATIONS.AGENT_REFLECT:
      case PROMPT_OPERATIONS.AGENT_DIALOGUE:
      case PROMPT_OPERATIONS.RESIDENT_BEHAVIOR:
        return this.contentPort.chat(packet.payload);
      case PROMPT_OPERATIONS.TERRAIN_GENERATE:
      case PROMPT_OPERATIONS.TERRAIN_REFINE:
        if (!this.worldAuthoringPort) throw new Error('World authoring is unavailable');
        return this.worldAuthoringPort.preview(packet.payload);
      default:
        throw new TypeError(`No generation executor for ${packet.operation}`);
    }
  }
}
