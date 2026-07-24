import { assertWeatherPort } from '../../../ports/WeatherPort.js';
import { assertPlaceNamePort } from '../../../ports/PlaceNamePort.js';
import { assertWorldClimateVisualPort } from '../../../ports/WorldClimateVisualPort.js';
import {
  CLIMATE_MODES,
  CLIMATE_SOURCE_STATUS,
  DEFAULT_MANUAL_CLIMATE,
  WEATHER_TYPES,
  createWorldClimateState,
  getWeatherLabel,
  normalizeManualClimateState,
} from '../../../world/climate/WorldClimateState.js';

const PREFERENCES_KEY = 'chii-climate-preferences-v2';
const LEGACY_MANUAL_KEY = 'chii-manual-climate-v1';

function readJson(storage, key) {
  try {
    return JSON.parse(storage?.getItem?.(key) || 'null');
  } catch {
    return null;
  }
}

function loadPreferences(storage) {
  const stored = readJson(storage, PREFERENCES_KEY);
  const legacy = readJson(storage, LEGACY_MANUAL_KEY);
  return {
    mode: stored?.mode === CLIMATE_MODES.REALTIME ? CLIMATE_MODES.REALTIME : CLIMATE_MODES.MANUAL,
    manual: normalizeManualClimateState(stored?.manual || legacy || DEFAULT_MANUAL_CLIMATE),
  };
}

function formatClock(time) {
  const hour = Math.floor(time.hour);
  return `${String(hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function formatDate(time) {
  const parts = String(time.date || '').split('-');
  if (parts.length !== 3) return formatClock(time);
  return `${Number(parts[1])}月${Number(parts[2])}日 ${time.weekday} ${formatClock(time)}`;
}

function temperatureLabel(value) {
  return Number.isFinite(value) ? `${Math.round(value)}°C` : '';
}

function errorMessage(error) {
  if (error?.code === 'permission-denied') return '定位没有打开，岛先替你留一片晴天。';
  if (error?.code === 'timeout') return '风跑得有点慢，先沿用手边的天气。';
  if (error?.code === 'unsupported') return '这个浏览器不会定位，手动天气也很好用。';
  if (error?.code === 'unavailable') return '暂时找不到你所在的天空，稍后再试试。';
  return '天气信使迷路了，岛上先照常生活。';
}

export class WorldClimateSystem {
  constructor({
    presenter,
    clock,
    location,
    weatherPort,
    placeNamePort = null,
    cache,
    storage = globalThis.localStorage,
    documentRef = globalThis.document,
  } = {}) {
    assertWorldClimateVisualPort(presenter);
    if (!clock?.read) throw new TypeError('BrowserClockAdapter is required');
    if (!location?.getCurrentLocation) throw new TypeError('BrowserLocationAdapter is required');
    this.presenter = presenter;
    this.clock = clock;
    this.location = location;
    this.weatherPort = assertWeatherPort(weatherPort);
    this.placeNamePort = placeNamePort ? assertPlaceNamePort(placeNamePort) : null;
    this.cache = cache;
    this.storage = storage;
    this.document = documentRef;
    this.preferences = loadPreferences(storage);
    this.mode = this.preferences.mode;
    this.manual = this.preferences.manual;
    this.clockTime = this.clock.read();
    this.realtimeWeather = { type: WEATHER_TYPES.CLEAR };
    this.realtimePlace = {};
    this.sourceStatus = CLIMATE_SOURCE_STATUS.FALLBACK;
    this.sourceMessage = '设备时间已对好，所在地天气还没有同步。';
    this.updatedAt = '';
    this.clockElapsed = 0;
    this.pendingWeather = null;
    this.controls = null;
    this.uiAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;

    this._restoreCachedWeather();
    this._bindControls();
    this._composeState();
  }

  getState() {
    return structuredClone(this.state);
  }

  setMode(mode) {
    const nextMode = mode === CLIMATE_MODES.REALTIME ? CLIMATE_MODES.REALTIME : CLIMATE_MODES.MANUAL;
    if (this.mode === nextMode) return this.getState();
    this.mode = nextMode;
    this.preferences.mode = nextMode;
    if (nextMode === CLIMATE_MODES.REALTIME) {
      this.clockTime = this.clock.read();
      this._restoreCachedWeather();
    }
    this._persistPreferences();
    this._composeState();
    return this.getState();
  }

  setManualClimate(next) {
    this.manual = normalizeManualClimateState({ ...this.manual, ...next });
    this.preferences.manual = this.manual;
    this._persistPreferences();
    if (this.mode === CLIMATE_MODES.MANUAL) this._composeState();
    else this._renderControls();
    return { ...this.manual };
  }

  async syncWeather() {
    if (this.pendingWeather) return this.pendingWeather;
    if (this.mode !== CLIMATE_MODES.REALTIME) this.setMode(CLIMATE_MODES.REALTIME);
    const requestController = new AbortController();
    this.weatherRequestController = requestController;
    this.pendingWeather = (async () => {
      try {
        this.sourceStatus = CLIMATE_SOURCE_STATUS.LOCATING;
        this.sourceMessage = '正在问问你在哪片天空下…';
        this._composeState();
        const position = await this.location.getCurrentLocation();
        if (requestController.signal.aborted) return this.getState();

        this.sourceStatus = CLIMATE_SOURCE_STATUS.LOADING;
        this.sourceMessage = '风正在捎回所在地天气和城市名…';
        this._composeState();
        this.realtimePlace = {};
        const request = {
          latitude: position.latitude,
          longitude: position.longitude,
          signal: requestController.signal,
        };
        const [weatherResult, placeResult] = await Promise.allSettled([
          this.weatherPort.getCurrentWeather(request),
          this.placeNamePort?.getPlaceName(request) || Promise.resolve(null),
        ]);
        if (placeResult.status === 'fulfilled' && placeResult.value) {
          this.realtimePlace = placeResult.value;
        }
        if (weatherResult.status === 'rejected') throw weatherResult.reason;
        const weather = weatherResult.value;
        this.realtimeWeather = weather;
        this.sourceStatus = CLIMATE_SOURCE_STATUS.LIVE;
        this.sourceMessage = this.realtimePlace.label
          ? `已经和${this.realtimePlace.label}的天空对上啦。`
          : '天气对上啦，城市名暂时还没认出来。';
        this.updatedAt = new Date().toISOString();
        this.cache?.write?.(weather);
      } catch (error) {
        const cached = this.cache?.read?.({ maxAgeMs: 30 * 60 * 1000 });
        if (cached?.weather) {
          this.realtimeWeather = cached.weather;
          this.updatedAt = new Date(cached.savedAt).toISOString();
        } else {
          this.realtimeWeather = { type: WEATHER_TYPES.CLEAR };
          this.updatedAt = '';
        }
        this.sourceStatus = error?.code === 'permission-denied'
          ? CLIMATE_SOURCE_STATUS.DENIED
          : CLIMATE_SOURCE_STATUS.ERROR;
        this.sourceMessage = errorMessage(error);
      } finally {
        if (!requestController.signal.aborted) this._composeState();
      }
      return this.getState();
    })().finally(() => {
      if (this.weatherRequestController === requestController) this.weatherRequestController = null;
      this.pendingWeather = null;
    });
    return this.pendingWeather;
  }

  update(dt) {
    this.presenter.update(dt);
    if (this.mode !== CLIMATE_MODES.REALTIME) return;
    this.clockElapsed += Math.max(0, dt);
    if (this.clockElapsed < 30) return;
    this.clockElapsed = 0;
    this.clockTime = this.clock.read();
    this._composeState();
  }

  dispose() {
    this.weatherRequestController?.abort('disposed');
    this.uiAbort?.abort();
    this.presenter.dispose?.();
  }

  _restoreCachedWeather() {
    const cached = this.cache?.read?.({ maxAgeMs: 30 * 60 * 1000 });
    if (cached?.weather) {
      this.realtimeWeather = cached.weather;
      this.sourceStatus = CLIMATE_SOURCE_STATUS.CACHED;
      this.sourceMessage = cached.fresh
        ? '先用刚刚记住的天气，随时可以重新同步。'
        : '天气有点旧了，点一下就能重新问问天空。';
      this.updatedAt = new Date(cached.savedAt).toISOString();
      return;
    }
    this.realtimeWeather = { type: WEATHER_TYPES.CLEAR };
    this.sourceStatus = CLIMATE_SOURCE_STATUS.FALLBACK;
    this.sourceMessage = '设备时间已对好，点一下再同步所在地天气。';
    this.updatedAt = '';
  }

  _composeState() {
    const manualMode = this.mode === CLIMATE_MODES.MANUAL;
    this.state = createWorldClimateState({
      mode: this.mode,
      time: manualMode ? {
        hour: this.manual.hour,
        minute: 0,
        month: this.manual.month,
        timezone: '手动设置',
      } : this.clockTime,
      weather: manualMode ? { type: this.manual.weather } : this.realtimeWeather,
      place: manualMode ? {} : this.realtimePlace,
      sourceStatus: manualMode ? CLIMATE_SOURCE_STATUS.MANUAL : this.sourceStatus,
      updatedAt: this.updatedAt,
      message: manualMode ? '今天的天空，由你来安排。' : this.sourceMessage,
    });
    this.presenter.setClimateState(this.state);
    this._renderControls();
  }

  _persistPreferences() {
    try {
      this.storage?.setItem?.(PREFERENCES_KEY, JSON.stringify({
        mode: this.mode,
        manual: this.manual,
      }));
    } catch {
      // Preferences remain active for the current session.
    }
  }

  _bindControls() {
    if (!this.document?.getElementById) return;
    this.controls = {
      modeButtons: [...this.document.querySelectorAll('[data-climate-mode]')],
      manualPanel: this.document.getElementById('climate-manual-controls'),
      realtimePanel: this.document.getElementById('climate-realtime-controls'),
      weather: this.document.getElementById('climate-weather'),
      hour: this.document.getElementById('climate-hour'),
      hourValue: this.document.getElementById('climate-hour-value'),
      month: this.document.getElementById('climate-month'),
      monthValue: this.document.getElementById('climate-month-value'),
      realtimeDate: this.document.getElementById('climate-realtime-date'),
      realtimeWeather: this.document.getElementById('climate-realtime-weather'),
      realtimeLocation: this.document.getElementById('climate-realtime-location'),
      realtimeTimezone: this.document.getElementById('climate-realtime-timezone'),
      sourceBadge: this.document.getElementById('climate-source-badge'),
      status: this.document.getElementById('climate-sync-status'),
      syncButton: this.document.getElementById('climate-sync-weather'),
    };
    const eventOptions = this.uiAbort ? { signal: this.uiAbort.signal } : undefined;
    for (const button of this.controls.modeButtons) {
      button.addEventListener('click', () => this.setMode(button.dataset.climateMode), eventOptions);
    }
    this.controls.weather?.addEventListener('change', event => {
      this.setManualClimate({ weather: event.currentTarget.value });
    }, eventOptions);
    this.controls.hour?.addEventListener('input', event => {
      this.setManualClimate({ hour: event.currentTarget.value });
    }, eventOptions);
    this.controls.month?.addEventListener('input', event => {
      this.setManualClimate({ month: event.currentTarget.value });
    }, eventOptions);
    this.controls.syncButton?.addEventListener('click', () => this.syncWeather(), eventOptions);
    this.document.addEventListener?.('visibilitychange', () => {
      if (this.document.visibilityState === 'visible' && this.mode === CLIMATE_MODES.REALTIME) {
        this.clockTime = this.clock.read();
        this._composeState();
      }
    }, eventOptions);
  }

  _renderControls() {
    if (!this.controls || !this.state) return;
    const realtime = this.mode === CLIMATE_MODES.REALTIME;
    for (const button of this.controls.modeButtons) {
      const active = button.dataset.climateMode === this.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    if (this.controls.manualPanel) this.controls.manualPanel.hidden = realtime;
    if (this.controls.realtimePanel) this.controls.realtimePanel.hidden = !realtime;
    if (this.controls.weather) this.controls.weather.value = this.manual.weather;
    if (this.controls.hour) this.controls.hour.value = String(this.manual.hour);
    if (this.controls.hourValue) this.controls.hourValue.textContent = `${String(this.manual.hour).padStart(2, '0')}:00`;
    if (this.controls.month) this.controls.month.value = String(this.manual.month);
    if (this.controls.monthValue) this.controls.monthValue.textContent = `${this.manual.month}月`;

    if (!realtime) return;
    const weatherLabel = getWeatherLabel(this.state.weather.type);
    const temperature = temperatureLabel(this.state.weather.temperature);
    if (this.controls.realtimeDate) this.controls.realtimeDate.textContent = formatDate(this.state.time);
    if (this.controls.realtimeWeather) {
      this.controls.realtimeWeather.textContent = temperature ? `${weatherLabel} · ${temperature}` : weatherLabel;
    }
    if (this.controls.realtimeLocation) {
      this.controls.realtimeLocation.textContent = this.state.place.label
        ? `所在地 ${this.state.place.label}`
        : '所在地 点击同步后显示城市';
    }
    if (this.controls.realtimeTimezone) this.controls.realtimeTimezone.textContent = `时区 ${this.state.time.timezone}`;
    if (this.controls.sourceBadge) {
      const sourceLabels = {
        [CLIMATE_SOURCE_STATUS.LIVE]: '实时天气',
        [CLIMATE_SOURCE_STATUS.CACHED]: '缓存天气',
        [CLIMATE_SOURCE_STATUS.LOCATING]: '正在定位',
        [CLIMATE_SOURCE_STATUS.LOADING]: '正在取天气',
        [CLIMATE_SOURCE_STATUS.DENIED]: '定位未开启',
        [CLIMATE_SOURCE_STATUS.ERROR]: '天气离线',
        [CLIMATE_SOURCE_STATUS.FALLBACK]: '默认晴天',
      };
      this.controls.sourceBadge.textContent = sourceLabels[this.state.sourceStatus] || '设备时间';
      this.controls.sourceBadge.dataset.status = this.state.sourceStatus;
    }
    if (this.controls.status) {
      this.controls.status.textContent = this.state.message;
      this.controls.status.dataset.status = this.state.sourceStatus;
    }
    if (this.controls.syncButton) {
      const busy = [CLIMATE_SOURCE_STATUS.LOCATING, CLIMATE_SOURCE_STATUS.LOADING].includes(this.state.sourceStatus);
      this.controls.syncButton.disabled = busy;
      this.controls.syncButton.textContent = busy
        ? '正在同步…'
        : (this.updatedAt ? '重新同步天气' : '同步所在地天气');
    }
  }
}
