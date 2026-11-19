export class WorldAuthoringPort {
  async preview(_request) {
    throw new Error('preview() is not implemented');
  }

  async commit(_request) {
    throw new Error('commit() is not implemented');
  }
}

export function assertWorldAuthoringPort(port) {
  if (!port || typeof port.preview !== 'function' || typeof port.commit !== 'function') {
    throw new TypeError('WorldAuthoringPort requires preview() and commit()');
  }
  return port;
}
