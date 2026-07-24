export class BrowserLocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BrowserLocationError';
    this.code = code;
  }
}

function normalizeLocationError(error) {
  if (error?.code === 1) return new BrowserLocationError('permission-denied', 'Location permission was denied');
  if (error?.code === 2) return new BrowserLocationError('unavailable', 'Location is unavailable');
  if (error?.code === 3) return new BrowserLocationError('timeout', 'Location request timed out');
  return new BrowserLocationError('unknown', error?.message || 'Location request failed');
}

export class BrowserLocationAdapter {
  constructor({ navigatorRef = globalThis.navigator } = {}) {
    this.navigator = navigatorRef;
  }

  isSupported() {
    return typeof this.navigator?.geolocation?.getCurrentPosition === 'function';
  }

  getCurrentLocation({ timeout = 10000, maximumAge = 15 * 60 * 1000 } = {}) {
    if (!this.isSupported()) {
      return Promise.reject(new BrowserLocationError('unsupported', 'Geolocation is not supported'));
    }
    return new Promise((resolve, reject) => {
      this.navigator.geolocation.getCurrentPosition(
        position => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
        error => reject(normalizeLocationError(error)),
        { enableHighAccuracy: false, timeout, maximumAge },
      );
    });
  }
}
