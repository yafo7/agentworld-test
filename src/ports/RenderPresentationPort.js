export class RenderPresentationPort {
  render(_dt) {
    throw new Error('render() is not implemented');
  }

  resize(_width, _height) {}

  registerModel(_root) {}

  unregisterModel(_root) {}

  setStyle(_style) {}

  setQuality(_quality) {}

  setPostProcessing(_enabled) {}

  getSettings() {
    return {};
  }

  getCapabilities() {
    return {};
  }

  dispose() {}
}

export function assertRenderPresentationPort(value) {
  if (!value?.render || !value?.resize || !value?.registerModel || !value?.unregisterModel) {
    throw new TypeError('RenderPresentationPort requires render, resize, registerModel, and unregisterModel');
  }
  return value;
}
