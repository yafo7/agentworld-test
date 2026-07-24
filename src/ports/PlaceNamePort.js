export class PlaceNamePort {
  async getPlaceName(_request) {
    throw new Error('getPlaceName() is not implemented');
  }
}

export function assertPlaceNamePort(port) {
  if (!port || typeof port.getPlaceName !== 'function') {
    throw new TypeError('PlaceNamePort.getPlaceName() is required');
  }
  return port;
}
