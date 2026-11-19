export class PromptCompilerPort {
  compile(_intent) {
    throw new Error('compile() is not implemented');
  }

  validate(_packet) {
    throw new Error('validate() is not implemented');
  }
}

export function assertPromptCompilerPort(port) {
  if (!port || typeof port.compile !== 'function' || typeof port.validate !== 'function') {
    throw new TypeError('PromptCompilerPort requires compile() and validate()');
  }
  return port;
}
