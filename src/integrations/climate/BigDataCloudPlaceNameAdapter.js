import { PlaceNamePort } from '../../ports/PlaceNamePort.js';
import { roundWeatherCoordinate } from './OpenMeteoWeatherAdapter.js';

const DEFAULT_ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

function cleanName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeBigDataCloudPlace(payload = {}) {
  const city = cleanName(payload.city) || cleanName(payload.locality);
  const region = cleanName(payload.principalSubdivision);
  const country = cleanName(payload.countryName);
  return {
    city,
    region,
    country,
    label: city || region || country,
  };
}

export class PlaceNameAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlaceNameAdapterError';
    this.code = code;
    this.details = details;
  }
}

export class BigDataCloudPlaceNameAdapter extends PlaceNamePort {
  constructor({
    fetchImpl = globalThis.fetch,
    endpoint = DEFAULT_ENDPOINT,
    timeoutMs = 7000,
    language = 'zh',
  } = {}) {
    super();
    this.fetch = fetchImpl;
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.language = language;
    this.memoryCache = new Map();
    this.pending = new Map();
  }

  async getPlaceName({ latitude, longitude, signal = null } = {}) {
    if (typeof this.fetch !== 'function') {
      throw new PlaceNameAdapterError('unsupported', 'Fetch is unavailable');
    }
    // City-level precision is enough for the UI and avoids sending exact coordinates.
    const lat = roundWeatherCoordinate(latitude);
    const lon = roundWeatherCoordinate(longitude);
    const cacheKey = `${lat},${lon}`;
    const cached = this.memoryCache.get(cacheKey);
    if (cached) return { ...cached };
    const existing = this.pending.get(cacheKey);
    if (existing) return existing;

    const request = this._request({ latitude: lat, longitude: lon, signal })
      .then(place => {
        this.memoryCache.set(cacheKey, place);
        return { ...place };
      })
      .finally(() => this.pending.delete(cacheKey));
    this.pending.set(cacheKey, request);
    return request;
  }

  async _request({ latitude, longitude, signal }) {
    const url = new URL(this.endpoint);
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('localityLanguage', this.language);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), this.timeoutMs);
    const abort = () => controller.abort(signal?.reason || 'cancelled');
    signal?.addEventListener?.('abort', abort, { once: true });
    try {
      const response = await this.fetch.call(globalThis, url, { signal: controller.signal });
      if (!response.ok) {
        throw new PlaceNameAdapterError('http', `Place-name request failed with HTTP ${response.status}`, {
          status: response.status,
        });
      }
      const payload = await response.json();
      const place = normalizeBigDataCloudPlace(payload);
      if (!place.label) {
        throw new PlaceNameAdapterError('invalid-response', 'Place-name response has no city or region');
      }
      return place;
    } catch (error) {
      if (error instanceof PlaceNameAdapterError) throw error;
      if (controller.signal.aborted) {
        const code = signal?.aborted ? 'cancelled' : 'timeout';
        throw new PlaceNameAdapterError(code, code === 'timeout'
          ? 'Place-name request timed out'
          : 'Place-name request was cancelled');
      }
      throw new PlaceNameAdapterError('network', error?.message || 'Place-name request failed');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', abort);
    }
  }
}
