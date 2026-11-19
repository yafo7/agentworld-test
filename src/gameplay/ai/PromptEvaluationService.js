const WEIGHTS = Object.freeze({ completeness: 30, specificity: 25, atomicity: 20, contract: 25 });

function promptText(packet) {
  return String(packet?.payload?.description || packet?.payload?.part || packet?.payload?.messages?.[1]?.content || '');
}

export class PromptEvaluationService {
  evaluate(packet) {
    const validation = packet.validation || { valid: true, errors: [], warnings: [] };
    const prompt = promptText(packet);
    const completeness = validation.errors.length === 0 ? WEIGHTS.completeness : 0;
    const specificity = /原木|石|砖|金属|玻璃|红|蓝|绿|黄|黑|白|头|手|屋顶|树枝|奔跑|跳|挥|地形|河流/.test(prompt)
      ? WEIGHTS.specificity
      : Math.round(WEIGHTS.specificity * 0.55);
    const atomicity = prompt.length <= 80 && !/(以及|同时还要|并且还要).*(以及|同时还要|并且还要)/.test(prompt)
      ? WEIGHTS.atomicity
      : Math.round(WEIGHTS.atomicity * 0.45);
    const contract = validation.valid
      ? Math.max(0, WEIGHTS.contract - validation.warnings.length * 4)
      : 0;
    const score = completeness + specificity + atomicity + contract;
    return Object.freeze({
      accepted: validation.valid && score >= 65,
      score,
      dimensions: Object.freeze({ completeness, specificity, atomicity, contract }),
      errors: validation.errors,
      warnings: validation.warnings,
      suggestions: Object.freeze(this.suggest(packet, { score, validation })),
    });
  }

  suggest(packet, report = {}) {
    const suggestions = [];
    const warnings = report.validation?.warnings || packet.validation?.warnings || [];
    if (warnings.includes('abstract_language')) suggestions.push('把抽象词改成颜色、材质、结构或动作');
    if (warnings.includes('prompt_too_long')) suggestions.push('拆成多个单目标生成任务');
    if (warnings.includes('identity_preservation_not_explicit')) suggestions.push('明确保留模型身份、结构和比例');
    if (packet.operation === 'model.mount' && !packet.payload.placement) suggestions.push('补充具体挂载锚点和方向');
    return suggestions;
  }

  boundedStrategy(packet, report = this.evaluate(packet)) {
    if (report.accepted) return Object.freeze({ action: 'use', reason: 'validated' });
    if (report.errors.length > 0) return Object.freeze({ action: 'clarify', reason: report.errors[0] });
    if (report.warnings.includes('prompt_too_long')) return Object.freeze({ action: 'split', reason: 'multi_semantic' });
    return Object.freeze({ action: 'rewrite', reason: report.warnings[0] || 'low_specificity' });
  }

  evaluateResult(packet, result) {
    const errors = [];
    const warnings = [];
    if (packet.capability.startsWith('content.model') && !result?.modelJson) errors.push('missing_model_result');
    if (packet.capability === 'content.animation.generate' && !result?.plan) errors.push('missing_animation_plan');
    if (packet.capability === 'worldforge.map.author' && !Array.isArray(result?.operations)) {
      errors.push('missing_world_operations');
    }
    if (result?.modelJson && !Array.isArray(result.modelJson.nodes) && !Array.isArray(result.modelJson.parts)) {
      warnings.push('model_has_no_explicit_nodes_or_parts');
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings) });
  }

  feedbackStrategy(feedback = {}) {
    const reasons = new Set(feedback.reasons || []);
    if (reasons.has('位置错误')) return Object.freeze({ action: 'adjust_placement', regenerate: false });
    if (reasons.has('比例错误')) return Object.freeze({ action: 'adjust_size_profile', regenerate: false });
    if (reasons.has('动作错误')) return Object.freeze({ action: 'recompile_animation', regenerate: true });
    if (reasons.has('结构错误')) return Object.freeze({ action: 'semantic_rewrite', regenerate: true });
    if (reasons.has('风格错误')) return Object.freeze({ action: 'rewrite_visible_materials', regenerate: true });
    return Object.freeze({ action: feedback.accepted === false ? 'clarify' : 'keep', regenerate: false });
  }
}
