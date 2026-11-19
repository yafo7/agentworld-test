export class SemanticUnderstandingPort {
  async understand(_intent) {
    throw new Error('understand() is not implemented');
  }
}

export function assertSemanticUnderstandingPort(port) {
  if (!port || typeof port.understand !== 'function') {
    throw new TypeError('SemanticUnderstandingPort requires understand()');
  }
  return port;
}
