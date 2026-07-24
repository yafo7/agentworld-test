import { normalizeClimateWeather } from '../world/climate/WorldClimateState.js';

const STORAGE_KEY = 'chii-climate-weather-cache-v1';
export const DEFAULT_CLIMATE_CACHE_AGE_MS = 30 * 60 * 1000;

export class ClimateCache {
  constructor({ storage = globalThis.localStorage, now = () => Date.now() } = {}) {
    this.storage = storage;
    this.now = now;
  }

  read({ maxAgeMs = DEFAULT_CLIMATE_CACHE_AGE_MS } = {}) {
    if (!this.storage) return null;
    try {
      const parsed = JSON.parse(this.storage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || !Number.isFinite(parsed.savedAt) || !parsed.weather) return null;
      const ageMs = Math.max(0, this.now() - parsed.savedAt);
      return {
        weather: normalizeClimateWeather(parsed.weather),
        savedAt: parsed.savedAt,
        ageMs,
        fresh: ageMs <= maxAgeMs,
      };
    } catch {
      return null;
    }
  }

  write(weather) {
    const entry = {
      savedAt: this.now(),
      weather: normalizeClimateWeather(weather),
    };
    try {
      this.storage?.setItem?.(STORAGE_KEY, JSON.stringify(entry));
    } catch {
      // Weather caching is optional; live climate remains usable for this session.
    }
    return entry;
  }
}
