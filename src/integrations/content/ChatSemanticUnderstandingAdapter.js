import { SemanticUnderstandingPort } from '../../ports/SemanticUnderstandingPort.js';

function parseJsonObject(content) {
  const source = String(content || '').trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : source;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('semantic_understanding_invalid_json');
  const parsed = JSON.parse(candidate.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('semantic_understanding_invalid_shape');
  }
  return parsed;
}

function text(value, max = 48) {
  return String(value || '').trim().slice(0, max);
}

function normalizeSemantic(value) {
  return Object.freeze({
    subject: text(value.subject, 24) || null,
    classifier: text(value.classifier, 4) || null,
    mainColor: text(value.mainColor, 12) || null,
    material: text(value.material, 20) || null,
    bodyShape: text(value.bodyShape, 20) || null,
    structure: text(value.structure, 28) || null,
    features: Object.freeze((Array.isArray(value.features) ? value.features : []).map(item => text(item, 24)).filter(Boolean).slice(0, 3)),
    identity: text(value.identity, 24) || null,
    targetPart: text(value.targetPart, 20) || null,
    change: text(value.change, 48) || null,
    part: text(value.part, 32) || null,
    placement: text(value.placement, 40) || null,
    action: text(value.action, 24) || null,
    missing: Object.freeze((Array.isArray(value.missing) ? value.missing : []).map(item => text(item, 24)).filter(Boolean).slice(0, 6)),
  });
}

export class ChatSemanticUnderstandingAdapter extends SemanticUnderstandingPort {
  constructor({ contentPort } = {}) {
    super();
    if (!contentPort?.chat) throw new TypeError('ChatSemanticUnderstandingAdapter requires contentPort.chat');
    this.contentPort = contentPort;
  }

  async understand(intent) {
    const content = await this.contentPort.chat({
      profile: 'pro',
      temperature: 0.2,
      maxTokens: 320,
      messages: [
        {
          role: 'system',
          content: [
            '你是奇异岛生成意图解析器。只输出JSON，不解释。',
            '把抽象词转换为可见的颜色、材质、结构、部件或动作；不要编写故事。',
            '不确定且不可安全补全的必要字段放入missing，不要猜测。',
            '格式:{"subject":"主体","classifier":"量词","mainColor":"主色","material":"材质","bodyShape":"身体形态","structure":"结构","features":["可见特征"],"identity":"保留身份","targetPart":"修改部位","change":"具体修改","part":"装配部件","placement":"锚点方向避让","action":"单一动作","missing":[]}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            operation: intent.operation,
            text: intent.source.text,
            target: intent.target,
            context: intent.context,
            constraints: intent.constraints,
          }),
        },
      ],
    });
    return normalizeSemantic(parseJsonObject(content));
  }
}

export { parseJsonObject as parseSemanticUnderstandingJson };
