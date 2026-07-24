import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserClockAdapter } from '../src/integrations/climate/BrowserClockAdapter.js';
import { BrowserLocationAdapter, BrowserLocationError } from '../src/integrations/climate/BrowserLocationAdapter.js';
import {
  OpenMeteoWeatherAdapter,
  mapOpenMeteoWeatherType,
  roundWeatherCoordinate,
} from '../src/integrations/climate/OpenMeteoWeatherAdapter.js';
import {
  BigDataCloudPlaceNameAdapter,
  normalizeBigDataCloudPlace,
} from '../src/integrations/climate/BigDataCloudPlaceNameAdapter.js';
import { ClimateCache } from '../src/storage/ClimateCache.js';

test('browser clock reports local date, fractional hour, and IANA timezone', () => {
  const clock = new BrowserClockAdapter({
    now: () => new Date(2026, 6, 23, 19, 42, 30),
    timeZoneResolver: () => 'Asia/Shanghai',
  });
  const value = clock.read();

  assert.equal(value.date, '2026-07-23');
  assert.equal(value.month, 7);
  assert.equal(value.minute, 42);
  assert.ok(value.hour > 19.7 && value.hour < 19.8);
  assert.equal(value.timezone, 'Asia/Shanghai');
});

test('browser location only resolves after the explicit adapter call', async () => {
  let calls = 0;
  const adapter = new BrowserLocationAdapter({
    navigatorRef: {
      geolocation: {
        getCurrentPosition(success) {
          calls++;
          success({ coords: { latitude: 31.2304, longitude: 121.4737, accuracy: 24 } });
        },
      },
    },
  });

  assert.equal(calls, 0);
  assert.deepEqual(await adapter.getCurrentLocation(), {
    latitude: 31.2304,
    longitude: 121.4737,
    accuracy: 24,
  });
  assert.equal(calls, 1);
});

test('unsupported geolocation returns a structured error', async () => {
  const adapter = new BrowserLocationAdapter({ navigatorRef: {} });
  await assert.rejects(
    adapter.getCurrentLocation(),
    error => error instanceof BrowserLocationError && error.code === 'unsupported',
  );
});

test('Open-Meteo adapter rounds coordinates and normalizes current weather', async () => {
  let requestedUrl;
  let fetchReceiver;
  const adapter = new OpenMeteoWeatherAdapter({
    fetchImpl: async function fetchFixture(url) {
      fetchReceiver = this;
      requestedUrl = new URL(url);
      return {
        ok: true,
        async json() {
          return {
            timezone: 'Asia/Shanghai',
            current: {
              time: '2026-07-23T19:45',
              temperature_2m: 26.4,
              apparent_temperature: 28.1,
              is_day: 0,
              precipitation: 0.4,
              rain: 0.4,
              showers: 0,
              snowfall: 0,
              weather_code: 61,
              cloud_cover: 92,
              wind_speed_10m: 8.5,
            },
          };
        },
      };
    },
  });
  const weather = await adapter.getCurrentWeather({ latitude: 31.230416, longitude: 121.473701 });

  assert.equal(requestedUrl.searchParams.get('latitude'), '31.23');
  assert.equal(requestedUrl.searchParams.get('longitude'), '121.47');
  assert.match(requestedUrl.searchParams.get('current'), /weather_code/);
  assert.equal(requestedUrl.searchParams.get('timezone'), 'auto');
  assert.equal(weather.type, 'rain');
  assert.equal(weather.temperature, 26.4);
  assert.equal(weather.timezone, 'Asia/Shanghai');
  assert.equal(roundWeatherCoordinate(12.3456), 12.35);
  assert.equal(fetchReceiver, globalThis);
});

test('WMO weather codes collapse into the five island weather types', () => {
  assert.equal(mapOpenMeteoWeatherType({ weather_code: 0, cloud_cover: 8 }), 'clear');
  assert.equal(mapOpenMeteoWeatherType({ weather_code: 3 }), 'cloudy');
  assert.equal(mapOpenMeteoWeatherType({ weather_code: 45 }), 'fog');
  assert.equal(mapOpenMeteoWeatherType({ weather_code: 80 }), 'rain');
  assert.equal(mapOpenMeteoWeatherType({ weather_code: 85 }), 'snow');
});

test('BigDataCloud adapter resolves a city-level Chinese place without returning coordinates', async () => {
  let calls = 0;
  let requestedUrl;
  const adapter = new BigDataCloudPlaceNameAdapter({
    fetchImpl: async url => {
      calls++;
      requestedUrl = new URL(url);
      return {
        ok: true,
        async json() {
          return {
            city: '深圳市',
            locality: '福田区',
            principalSubdivision: '广东省',
            countryName: '中华人民共和国',
          };
        },
      };
    },
  });

  const first = await adapter.getPlaceName({ latitude: 22.543096, longitude: 114.057865 });
  const second = await adapter.getPlaceName({ latitude: 22.543096, longitude: 114.057865 });

  assert.equal(requestedUrl.searchParams.get('latitude'), '22.54');
  assert.equal(requestedUrl.searchParams.get('longitude'), '114.06');
  assert.equal(requestedUrl.searchParams.get('localityLanguage'), 'zh');
  assert.equal(first.city, '深圳市');
  assert.equal(first.label, '深圳市');
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  assert.equal('latitude' in first, false);
  assert.equal('longitude' in first, false);
});

test('place normalization falls back from city to a stable regional label', () => {
  const place = normalizeBigDataCloudPlace({ principalSubdivision: '广东省', countryName: '中国' });
  assert.equal(place.city, '');
  assert.equal(place.label, '广东省');
});

test('climate cache reports freshness without storing location', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  let now = 1000;
  const cache = new ClimateCache({ storage, now: () => now });
  cache.write({ type: 'cloudy', temperature: 18 });
  now += 31 * 60 * 1000;
  const cached = cache.read();

  assert.equal(cached.weather.type, 'cloudy');
  assert.equal(cached.fresh, false);
  assert.doesNotMatch([...values.values()][0], /latitude|longitude/);
  assert.doesNotMatch([...values.values()][0], /city|深圳/);
});
