export class PromptHistoryPort {
  append(_record) {
    throw new Error('append() is not implemented');
  }

  list(_options) {
    throw new Error('list() is not implemented');
  }

  addFeedback(_receiptId, _feedback) {
    throw new Error('addFeedback() is not implemented');
  }
}

export function assertPromptHistoryPort(port) {
  if (!port || typeof port.append !== 'function' || typeof port.list !== 'function'
    || typeof port.addFeedback !== 'function') {
    throw new TypeError('PromptHistoryPort requires append(), list(), and addFeedback()');
  }
  return port;
}
