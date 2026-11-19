export class AgentReasoningPort {
  async selectAction(_context) { throw new Error('selectAction() is not implemented'); }
  async reflect(_context) { throw new Error('reflect() is not implemented'); }
  async composeDialogue(_context) { throw new Error('composeDialogue() is not implemented'); }
}

export function assertAgentReasoningPort(port) {
  if (!port || typeof port.selectAction !== 'function' || typeof port.reflect !== 'function') {
    throw new TypeError('AgentReasoningPort requires selectAction() and reflect()');
  }
  return port;
}
