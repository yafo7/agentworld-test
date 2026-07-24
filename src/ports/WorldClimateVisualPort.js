export class WorldClimateVisualPort {
  setClimateState(_state) {
    throw new Error('setClimateState() is not implemented');
  }

  update(_dt) {}

  getCapabilities() {
    return {};
  }

  dispose() {}
}

export function assertWorldClimateVisualPort(value) {
  if (!value?.setClimateState || !value?.update) {
    throw new TypeError('WorldClimateVisualPort requires setClimateState() and update()');
  }
  return value;
}
