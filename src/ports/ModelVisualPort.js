/**
 * Stable world-facing contract for model materials and attached visual effects.
 * Upstream render-runtime APIs and provider-specific data stay behind adapters.
 */
export class ModelVisualPort {
  async attachModel(_request) { throw new Error('attachModel() is not implemented'); }
  detachModel(_root) { throw new Error('detachModel() is not implemented'); }
  update(_dt) {}
  getCapabilities() { return {}; }
  dispose() {}
}

const REQUIRED_METHODS = ['attachModel', 'detachModel', 'update', 'getCapabilities', 'dispose'];

export function assertModelVisualPort(port) {
  if (!port) throw new TypeError('ModelVisualPort is required');
  for (const method of REQUIRED_METHODS) {
    if (typeof port[method] !== 'function') {
      throw new TypeError(`ModelVisualPort.${method}() is required`);
    }
  }
  return port;
}
