export class WorldWaterVisualPort {
  attachRiver(_options) {
    throw new Error('attachRiver() is not implemented');
  }

  update(_dt) {}

  getCapabilities() {
    return {};
  }

  dispose() {}
}

export function assertWorldWaterVisualPort(value) {
  if (!value?.attachRiver || !value?.update) {
    throw new TypeError('WorldWaterVisualPort requires attachRiver() and update()');
  }
  return value;
}
