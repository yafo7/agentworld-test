import assert from 'node:assert/strict';
import test from 'node:test';
import { PromptCompiler } from '../src/gameplay/ai/prompts/PromptCompiler.js';
import { PROMPT_OPERATIONS } from '../src/gameplay/ai/prompts/PromptOperations.js';
import { PromptEvaluationService } from '../src/gameplay/ai/PromptEvaluationService.js';

const compiler = new PromptCompiler();

test('model compiler translates abstract language and keeps policy outside prose', () => {
  const packet = compiler.compile({
    operation: PROMPT_OPERATIONS.MODEL_GENERATE,
    rawText: '帮我做一个很梦幻的森林小屋',
    constraints: { qualityProfile: 'voxel', sizeProfile: 'small_decor' },
  });
  assert.equal(packet.payload.quality, 'voxel');
  assert.match(packet.payload.description, /蓝绿色与发光蘑菇/);
  assert.doesNotMatch(packet.payload.description, /provider|gpt|voxel/);
  assert.equal(packet.validation.valid, true);
});

test('building compiler requires a confirmed footprint', () => {
  const missing = compiler.compile({
    operation: PROMPT_OPERATIONS.BUILDING_GENERATE,
    rawText: '3×4地块森林木屋，底部3:4，原木墙蓝绿斜顶',
  });
  assert.equal(missing.validation.valid, false);
  assert.ok(missing.validation.errors.includes('missing_building_footprint'));

  const valid = compiler.compile({
    operation: PROMPT_OPERATIONS.BUILDING_GENERATE,
    rawText: '3×4地块森林木屋，底部3:4，原木墙蓝绿斜顶',
    constraints: { footprint: { width: 3, depth: 4, unit: 'terrain_tile' } },
  });
  assert.equal(valid.validation.valid, true);
});

test('refine and mount compile identity and physical anchors', () => {
  const modelJson = { _meta: { ai: {} } };
  const refined = compiler.compile({
    operation: PROMPT_OPERATIONS.MODEL_REFINE,
    rawText: '树冠改成蓝绿色',
    target: { identity: '苹果树' },
    input: { modelJson, targetPart: '树冠' },
  });
  assert.match(refined.payload.description, /^保留苹果树/);
  assert.equal(refined.validation.valid, true);

  const mounted = compiler.compile({
    operation: PROMPT_OPERATIONS.MODEL_MOUNT,
    input: { modelJson, part: '粉色花环', placement: '头部' },
  });
  assert.match(mounted.payload.placement, /头顶两耳之间/);
  assert.equal(mounted.validation.valid, true);
});

test('terrain compiler creates ordered atomic WorldForge steps', () => {
  const packet = compiler.compile({
    operation: PROMPT_OPERATIONS.TERRAIN_GENERATE,
    target: { mapId: 'forest-map' },
    input: {
      steps: [
        { prompt: '生成丘陵森林地形，中央保留平地' },
        { prompt: '在东侧增加一条弯曲河流' },
      ],
    },
  });
  assert.deepEqual(packet.payload.steps.map(step => step.mode), ['generate', 'refine']);
  assert.equal(packet.validation.valid, true);
});

test('event compiler emits strict planner messages and evaluator scores packets', () => {
  const packet = compiler.compile({
    operation: PROMPT_OPERATIONS.EVENT_PLAN,
    rawText: '一起在篝火旁看星星',
    input: {
      scale: 'daily',
      initiatorId: 'mako',
      pets: [{ id: 'mako', personalityTags: ['沉稳'] }],
      objects: [{ id: 'campfire', tags: ['fire'] }],
    },
  });
  assert.equal(packet.payload.profile, 'planner');
  assert.match(packet.payload.messages[0].content, /只输出JSON/);
  assert.equal(new PromptEvaluationService().evaluate(packet).accepted, true);
});

test('evaluation keeps feedback adjustments bounded and never selects a provider', () => {
  const evaluator = new PromptEvaluationService();
  assert.deepEqual(evaluator.feedbackStrategy({ accepted: false, reasons: ['比例错误'] }), {
    action: 'adjust_size_profile',
    regenerate: false,
  });
  assert.deepEqual(evaluator.feedbackStrategy({ accepted: false, reasons: ['结构错误'] }), {
    action: 'semantic_rewrite',
    regenerate: true,
  });
  assert.doesNotMatch(JSON.stringify(evaluator.feedbackStrategy({ reasons: ['风格错误'] })), /provider|model/);
});
