export const CLIMATE_MODES = Object.freeze({
  MANUAL: 'manual',
  REALTIME: 'realtime',
});

export const CLIMATE_SOURCE_STATUS = Object.freeze({
  MANUAL: 'manual',
  IDLE: 'idle',
  LOCATING: 'locating',
  LOADING: 'loading',
  LIVE: 'live',
  CACHED: 'cached',
  FALLBACK: 'fallback',
  DENIED: 'denied',
  ERROR: 'error',
});

export const WEATHER_TYPES = Object.freeze({
  CLEAR: 'clear',
  CLOUDY: 'cloudy',
  RAIN: 'rain',
  SNOW: 'snow',
  FOG: 'fog',
});

export const WEATHER_OPTIONS = Object.freeze([
  { value: WEATHER_TYPES.CLEAR, label: '晴天' },
  { value: WEATHER_TYPES.CLOUDY, label: '多云' },
  { value: WEATHER_TYPES.RAIN, label: '下雨' },
  { value: WEATHER_TYPES.SNOW, label: '下雪' },
  { value: WEATHER_TYPES.FOG, label: '雾天' },
]);

export const DEFAULT_MANUAL_CLIMATE = Object.freeze({
  weather: WEATHER_TYPES.CLEAR,
  hour: 12,
  month: 7,
});

const VALID_WEATHER = new Set(Object.values(WEATHER_TYPES));
const VALID_MODES = new Set(Object.values(CLIMATE_MODES));
const VALID_STATUS = new Set(Object.values(CLIMATE_SOURCE_STATUS));

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max, fallback) {
  const parsed = numberOrNull(value);
  if (parsed === null) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function normalizeManualClimateState(value = {}) {
  return {
    weather: VALID_WEATHER.has(value.weather) ? value.weather : DEFAULT_MANUAL_CLIMATE.weather,
    hour: Math.round(clamp(value.hour, 0, 23, DEFAULT_MANUAL_CLIMATE.hour)),
    month: Math.round(clamp(value.month, 1, 12, DEFAULT_MANUAL_CLIMATE.month)),
  };
}

export function normalizeClimateTime(value = {}) {
  return {
    hour: clamp(value.hour, 0, 23.9999, DEFAULT_MANUAL_CLIMATE.hour),
    minute: Math.round(clamp(value.minute, 0, 59, 0)),
    month: Math.round(clamp(value.month, 1, 12, DEFAULT_MANUAL_CLIMATE.month)),
    date: typeof value.date === 'string' ? value.date : '',
    weekday: typeof value.weekday === 'string' ? value.weekday : '',
    timezone: typeof value.timezone === 'string' && value.timezone ? value.timezone : 'local',
  };
}

export function normalizeClimateWeather(value = {}) {
  return {
    type: VALID_WEATHER.has(value.type) ? value.type : WEATHER_TYPES.CLEAR,
    temperature: numberOrNull(value.temperature),
    apparentTemperature: numberOrNull(value.apparentTemperature),
    cloudCover: numberOrNull(value.cloudCover),
    precipitation: numberOrNull(value.precipitation),
    windSpeed: numberOrNull(value.windSpeed),
    isDay: value.isDay === true || value.isDay === 1,
    observedAt: typeof value.observedAt === 'string' ? value.observedAt : '',
  };
}

export function normalizeClimatePlace(value = {}) {
  const city = typeof value.city === 'string' ? value.city.trim() : '';
  const region = typeof value.region === 'string' ? value.region.trim() : '';
  const country = typeof value.country === 'string' ? value.country.trim() : '';
  const label = typeof value.label === 'string' && value.label.trim()
    ? value.label.trim()
    : (city || region || country);
  return { city, region, country, label };
}

export function createWorldClimateState(value = {}) {
  const mode = VALID_MODES.has(value.mode) ? value.mode : CLIMATE_MODES.MANUAL;
  return {
    mode,
    time: normalizeClimateTime(value.time),
    weather: normalizeClimateWeather(value.weather),
    place: normalizeClimatePlace(value.place),
    sourceStatus: VALID_STATUS.has(value.sourceStatus)
      ? value.sourceStatus
      : (mode === CLIMATE_MODES.MANUAL ? CLIMATE_SOURCE_STATUS.MANUAL : CLIMATE_SOURCE_STATUS.IDLE),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    message: typeof value.message === 'string' ? value.message : '',
  };
}

export function toClimatePresentationState(state) {
  const normalized = createWorldClimateState(state);
  return {
    weather: normalized.weather.type,
    hour: normalized.time.hour,
    month: normalized.time.month,
  };
}

export function getWeatherLabel(type) {
  return WEATHER_OPTIONS.find(option => option.value === type)?.label || '晴天';
}
