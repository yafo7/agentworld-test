/**
 * Stable gameplay-facing contract for AI content operations.
 * Concrete provider names, URLs and backend response envelopes belong in adapters.
 */
export class ContentGenerationPort {
  async generateModel(_request) { throw new Error('generateModel() is not implemented'); }
  async refineModel(_request) { throw new Error('refineModel() is not implemented'); }
  async mountPart(_request) { throw new Error('mountPart() is not implemented'); }
  async generateAnimation(_request) { throw new Error('generateAnimation() is not implemented'); }
  async chat(_request) { throw new Error('chat() is not implemented'); }
}

const REQUIRED_METHODS = [
  'generateModel',
  'refineModel',
  'mountPart',
  'generateAnimation',
  'chat',
];

export function assertContentGenerationPort(port) {
  if (!port) throw new TypeError('ContentGenerationPort is required');
  for (const method of REQUIRED_METHODS) {
    if (typeof port[method] !== 'function') {
      throw new TypeError(`ContentGenerationPort.${method}() is required`);
    }
  }
  return port;
}

