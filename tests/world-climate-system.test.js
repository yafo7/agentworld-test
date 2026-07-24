import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WorldClimateSystem } from '../src/demos/chii-island/systems/WorldClimateSystem.js';

function storageFixture(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

function systemFixture({ locationError = null, placeNameError = null, cached = null } = {}) {
  const presenter = {
    states: [],
    setClimateState(state) { this.states.push(structuredClone(state)); },
    update() {},
    dispose() {},
  };
  const clock = {
    reads: 0,
    read() {
      this.reads++;
      return { hour: 19.5, minute: 30, month: 7, date: '2026-07-23', weekday: '周四', timezone: 'Asia/Shanghai' };
    },
  };
  const location = {
    calls: 0,
    async getCurrentLocation() {
      this.calls++;
      if (locationError) throw locationError;
      return { latitude: 22.5431, longitude: 114.0579, accuracy: 20 };
    },
  };
  const weatherPort = {
    calls: 0,
    async getCurrentWeather(request) {
      this.calls++;
      this.request = request;
      return { type: 'rain', temperature: 26, observedAt: '2026-07-23T19:30' };
    },
  };
  const placeNamePort = {
    calls: 0,
    async getPlaceName(request) {
      this.calls++;
      this.request = request;
      if (placeNameError) throw placeNameError;
      return { city: '深圳市', region: '广东省', country: '中国', label: '深圳市' };
    },
  };
  const cache = {
    value: cached,
    read() { return this.value; },
    write(weather) { this.written = weather; },
  };
  const storage = storageFixture();
  const system = new WorldClimateSystem({
    presenter,
    clock,
    location,
    weatherPort,
    placeNamePort,
    cache,
    storage,
    documentRef: null,
  });
  return { system, presenter, clock, location, weatherPort, placeNamePort, cache, storage };
}

test('realtime mode reads device time without requesting location', () => {
  const fixture = systemFixture();
  fixture.system.setMode('realtime');

  assert.equal(fixture.location.calls, 0);
  assert.equal(fixture.weatherPort.calls, 0);
  assert.equal(fixture.placeNamePort.calls, 0);
  assert.equal(fixture.system.getState().time.timezone, 'Asia/Shanghai');
  assert.equal(fixture.system.getState().sourceStatus, 'fallback');
});

test('explicit weather sync requests location and publishes live weather', async () => {
  const fixture = systemFixture();
  fixture.system.setMode('realtime');
  const state = await fixture.system.syncWeather();

  assert.equal(fixture.location.calls, 1);
  assert.equal(fixture.weatherPort.calls, 1);
  assert.equal(fixture.placeNamePort.calls, 1);
  assert.equal(fixture.weatherPort.request.latitude, 22.5431);
  assert.equal(fixture.placeNamePort.request.longitude, 114.0579);
  assert.equal(state.weather.type, 'rain');
  assert.equal(state.place.city, '深圳市');
  assert.match(state.message, /深圳市/);
  assert.equal(state.sourceStatus, 'live');
  assert.equal(fixture.cache.written.type, 'rain');
});

test('place-name failure does not prevent live weather synchronization', async () => {
  const fixture = systemFixture({ placeNameError: new Error('geocoder offline') });
  fixture.system.setMode('realtime');
  const state = await fixture.system.syncWeather();

  assert.equal(state.weather.type, 'rain');
  assert.equal(state.sourceStatus, 'live');
  assert.equal(state.place.label, '');
  assert.match(state.message, /城市名/);
});

test('weather failure keeps cached conditions and exposes permission status', async () => {
  const fixture = systemFixture({
    locationError: Object.assign(new Error('denied'), { code: 'permission-denied' }),
    cached: {
      weather: { type: 'snow', temperature: -2 },
      savedAt: Date.now() - 1000,
      fresh: true,
    },
  });
  fixture.system.setMode('realtime');
  const state = await fixture.system.syncWeather();

  assert.equal(state.weather.type, 'snow');
  assert.equal(state.sourceStatus, 'denied');
  assert.match(state.message, /定位/);
});

test('manual preferences migrate and remain separate from realtime state', () => {
  const storage = storageFixture({
    'chii-manual-climate-v1': JSON.stringify({ weather: 'fog', hour: 5, month: 11 }),
  });
  const presenter = { setClimateState() {}, update() {}, dispose() {} };
  const system = new WorldClimateSystem({
    presenter,
    clock: { read: () => ({ hour: 9, minute: 0, month: 2, timezone: 'Asia/Shanghai' }) },
    location: { getCurrentLocation: async () => ({ latitude: 0, longitude: 0 }) },
    weatherPort: { getCurrentWeather: async () => ({ type: 'clear' }) },
    cache: { read: () => null, write() {} },
    storage,
    documentRef: null,
  });

  assert.equal(system.getState().weather.type, 'fog');
  system.setMode('realtime');
  assert.equal(system.getState().time.month, 2);
  system.setMode('manual');
  assert.equal(system.getState().weather.type, 'fog');
});

test('ESC climate UI includes manual/realtime modes and bubble palette', () => {
  const html = readFileSync(new URL('../src/demos/chii-island/index.html', import.meta.url), 'utf8');

  assert.match(html, /data-climate-mode="manual"/);
  assert.match(html, /data-climate-mode="realtime"/);
  assert.match(html, /id="climate-sync-weather"/);
  assert.match(html, /id="climate-sync-status"/);
  assert.match(html, /id="climate-realtime-location"/);
  assert.match(html, /BigDataCloud/);
  assert.match(html, /#fff9df/);
  assert.match(html, /#6d4b2f/);
  assert.match(html, /#ffe36d/);
});
