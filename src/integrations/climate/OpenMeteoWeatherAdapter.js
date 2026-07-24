import { WeatherPort } from '../../ports/WeatherPort.js';
import { WEATHER_TYPES, normalizeClimateWeather } from '../../world/climate/WorldClimateState.js';

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
].join(',');

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const FOG_CODES = new Set([45, 48]);

export class WeatherAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WeatherAdapterError';
    this.code = code;
    this.details = details;
  }
}

export function roundWeatherCoordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError('A finite weather coordinate is required');
  return Math.round(number * 100) / 100;
}

export function mapOpenMeteoWeatherType(current = {}) {
  const code = Number(current.weather_code);
  if (SNOW_CODES.has(code) || Number(current.snowfall) > 0) return WEATHER_TYPES.SNOW;
  if (FOG_CODES.has(code)) return WEATHER_TYPES.FOG;
  if (RAIN_CODES.has(code) || Number(current.precipitation) > 0.05 || Number(current.rain) > 0 || Number(current.showers) > 0) {
    return WEATHER_TYPES.RAIN;
  }
  if ([1, 2, 3].includes(code) || Number(current.cloud_cover) >= 55) return WEATHER_TYPES.CLOUDY;
  return WEATHER_TYPES.CLEAR;
}

export class OpenMeteoWeatherAdapter extends WeatherPort {
  constructor({ fetchImpl = globalThis.fetch, endpoint = 'https://api.open-meteo.com/v1/forecast', timeoutMs = 8000 } = {}) {
    super();
    this.fetch = fetchImpl;
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }

  async getCurrentWeather({ latitude, longitude, signal = null } = {}) {
    if (typeof this.fetch !== 'function') throw new WeatherAdapterError('unsupported', 'Fetch is unavailable');
    const lat = roundWeatherCoordinate(latitude);
    const lon = roundWeatherCoordinate(longitude);
    const url = new URL(this.endpoint);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', CURRENT_FIELDS);
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '1');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), this.timeoutMs);
    const abort = () => controller.abort(signal?.reason || 'cancelled');
    signal?.addEventListener?.('abort', abort, { once: true });
    try {
      const response = await this.fetch.call(globalThis, url, { signal: controller.signal });
      if (!response.ok) {
        let reason = `Weather request failed with HTTP ${response.status}`;
        try {
          const payload = await response.json();
          if (payload?.reason) reason = payload.reason;
        } catch {
          // Keep the HTTP status when the provider did not return JSON.
        }
        throw new WeatherAdapterError('http', reason, { status: response.status });
      }
      const payload = await response.json();
      if (!payload?.current) throw new WeatherAdapterError('invalid-response', 'Weather response has no current conditions');
      const current = payload.current;
      return {
        ...normalizeClimateWeather({
          type: mapOpenMeteoWeatherType(current),
          temperature: current.temperature_2m,
          apparentTemperature: current.apparent_temperature,
          cloudCover: current.cloud_cover,
          precipitation: current.precipitation,
          windSpeed: current.wind_speed_10m,
          isDay: current.is_day,
          observedAt: current.time,
        }),
        timezone: typeof payload.timezone === 'string' ? payload.timezone : '',
      };
    } catch (error) {
      if (error instanceof WeatherAdapterError) throw error;
      if (controller.signal.aborted) {
        const code = signal?.aborted ? 'cancelled' : 'timeout';
        throw new WeatherAdapterError(code, code === 'timeout' ? 'Weather request timed out' : 'Weather request was cancelled');
      }
      throw new WeatherAdapterError('network', error?.message || 'Weather request failed');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', abort);
    }
  }
}
