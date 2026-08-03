import * as THREE from 'three';
import { ParticleSystem } from '../../../engine/animation/particles.js';

const STORAGE_KEY = 'chii-manual-climate-v1';

export const MANUAL_WEATHER_OPTIONS = Object.freeze([
  { value: 'clear', label: '晴天' },
  { value: 'cloudy', label: '多云' },
  { value: 'rain', label: '下雨' },
  { value: 'snow', label: '下雪' },
  { value: 'fog', label: '雾天' },
]);

export const DEFAULT_MANUAL_CLIMATE = Object.freeze({
  weather: 'clear',
  hour: 12,
  month: 7,
});

const TIME_KEYFRAMES = Object.freeze([
  { hour: 0, sky: 0x09162f, fog: 0x14233d, sun: 0x7894c4, sunIntensity: 0.05, hemiSky: 0x263d66, hemiGround: 0x101827, hemiIntensity: 0.24 },
  { hour: 5, sky: 0x66748f, fog: 0x827780, sun: 0xff9966, sunIntensity: 0.28, hemiSky: 0x8795aa, hemiGround: 0x3a3541, hemiIntensity: 0.36 },
  { hour: 8, sky: 0x8bcde8, fog: 0x91c8dc, sun: 0xffe2bd, sunIntensity: 0.82, hemiSky: 0x9adcf0, hemiGround: 0x52664d, hemiIntensity: 0.5 },
  { hour: 17, sky: 0x87ceeb, fog: 0x87ceeb, sun: 0xffffff, sunIntensity: 1, hemiSky: 0x87ceeb, hemiGround: 0x445566, hemiIntensity: 0.5 },
  { hour: 19, sky: 0xd7836c, fog: 0xb77a74, sun: 0xff8a4c, sunIntensity: 0.48, hemiSky: 0xb28b94, hemiGround: 0x55414a, hemiIntensity: 0.4 },
  { hour: 21, sky: 0x253454, fog: 0x303b55, sun: 0x91a8d2, sunIntensity: 0.12, hemiSky: 0x405274, hemiGround: 0x18202f, hemiIntensity: 0.28 },
  { hour: 24, sky: 0x09162f, fog: 0x14233d, sun: 0x7894c4, sunIntensity: 0.05, hemiSky: 0x263d66, hemiGround: 0x101827, hemiIntensity: 0.24 },
]);

const SEASON_TINTS = Object.freeze({
  spring: { color: 0xdff5df, amount: 0.05 },
  summer: { color: 0xfff1c2, amount: 0.04 },
  autumn: { color: 0xf4c18b, amount: 0.08 },
  winter: { color: 0xdcecf7, amount: 0.11 },
});

const WEATHER_PARTICLE_PLANS = Object.freeze({
  rain: {
    'weather-emitter': {
      emit: {
        emitMode: 'volume',
        mesh: 'box',
        meshSize: 0.09,
        rate: 150,
        lifetime: [0.8, 1.2],
        velocity: { dir: [0.08, -1, 0.03], speed: [20, 26], spread: 0.05 },
        acceleration: [0, -4, 0],
        colorStart: [0.55, 0.72, 0.88],
        colorEnd: [0.32, 0.48, 0.67],
        scaleStart: 1,
        scaleEnd: 0.45,
      },
    },
  },
  snow: {
    'weather-emitter': {
      emit: {
        emitMode: 'volume',
        meshSize: 0.18,
        rate: 48,
        lifetime: [3.5, 5],
        velocity: { dir: [0.12, -1, 0.08], speed: [2.8, 4.2], spread: 0.32 },
        acceleration: [0, -0.15, 0],
        colorStart: [1, 1, 1],
        colorEnd: [0.72, 0.86, 1],
        scaleStart: 1,
        scaleEnd: 0.55,
      },
    },
  },
});

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return THREE.MathUtils.clamp(Math.round(parsed), min, max);
}

function mixHex(from, to, amount) {
  return new THREE.Color(from).lerp(new THREE.Color(to), amount).getHex();
}

function scaleHex(color, amount) {
  return new THREE.Color(color).multiplyScalar(amount).getHex();
}

function getSeason(month) {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

export function normalizeManualClimateState(value = {}) {
  const validWeather = MANUAL_WEATHER_OPTIONS.some(option => option.value === value.weather);
  return {
    weather: validWeather ? value.weather : DEFAULT_MANUAL_CLIMATE.weather,
    hour: clampInteger(value.hour, 0, 23, DEFAULT_MANUAL_CLIMATE.hour),
    month: clampInteger(value.month, 1, 12, DEFAULT_MANUAL_CLIMATE.month),
  };
}

export function resolveClimateAppearance(value) {
  const state = normalizeManualClimateState(value);
  const lower = TIME_KEYFRAMES.findLast(frame => frame.hour <= state.hour) || TIME_KEYFRAMES[0];
  const upper = TIME_KEYFRAMES.find(frame => frame.hour > state.hour) || TIME_KEYFRAMES.at(-1);
  const span = Math.max(1, upper.hour - lower.hour);
  const t = (state.hour - lower.hour) / span;
  const interpolate = key => THREE.MathUtils.lerp(lower[key], upper[key], t);
  const interpolateColor = key => mixHex(lower[key], upper[key], t);

  const season = getSeason(state.month);
  const tint = SEASON_TINTS[season];
  const appearance = {
    season,
    sky: mixHex(interpolateColor('sky'), tint.color, tint.amount),
    fog: mixHex(interpolateColor('fog'), tint.color, tint.amount),
    sun: mixHex(interpolateColor('sun'), tint.color, tint.amount * 0.5),
    sunIntensity: interpolate('sunIntensity'),
    hemiSky: mixHex(interpolateColor('hemiSky'), tint.color, tint.amount),
    hemiGround: interpolateColor('hemiGround'),
    hemiIntensity: interpolate('hemiIntensity'),
    fogNear: 40,
    fogFar: 180,
  };

  const daylight = THREE.MathUtils.clamp(appearance.sunIntensity, 0.12, 1);
  const weatherTarget = hex => scaleHex(hex, 0.28 + daylight * 0.72);
  if (state.weather === 'cloudy') {
    appearance.sky = mixHex(appearance.sky, weatherTarget(0x83949d), 0.62);
    appearance.fog = mixHex(appearance.fog, weatherTarget(0x939da3), 0.58);
    appearance.sunIntensity *= 0.58;
    appearance.hemiIntensity *= 0.88;
    appearance.fogNear = 32;
    appearance.fogFar = 150;
  } else if (state.weather === 'rain') {
    appearance.sky = mixHex(appearance.sky, weatherTarget(0x526979), 0.72);
    appearance.fog = mixHex(appearance.fog, weatherTarget(0x687b87), 0.68);
    appearance.sunIntensity *= 0.35;
    appearance.hemiIntensity *= 0.7;
    appearance.fogNear = 25;
    appearance.fogFar = 120;
  } else if (state.weather === 'snow') {
    appearance.sky = mixHex(appearance.sky, weatherTarget(0xc5d2db), 0.62);
    appearance.fog = mixHex(appearance.fog, weatherTarget(0xd9e2e7), 0.7);
    appearance.sunIntensity *= 0.68;
    appearance.hemiIntensity *= 0.94;
    appearance.fogNear = 24;
    appearance.fogFar = 132;
  } else if (state.weather === 'fog') {
    appearance.sky = mixHex(appearance.sky, weatherTarget(0xaab2b1), 0.78);
    appearance.fog = mixHex(appearance.fog, weatherTarget(0xb7bfbc), 0.84);
    appearance.sunIntensity *= 0.24;
    appearance.hemiIntensity *= 0.72;
    appearance.fogNear = 10;
    appearance.fogFar = 72;
  }

  const sunAngle = ((state.hour - 6) / 24) * Math.PI * 2;
  appearance.sunPosition = [
    Math.cos(sunAngle) * 70,
    Math.max(-18, Math.sin(sunAngle) * 76),
    35,
  ];
  return appearance;
}

export class ManualClimateController {
  constructor({
    scene,
    lightRig,
    followTarget = null,
    skyVisual = null,
    storage = globalThis.localStorage,
    bindControls = true,
  } = {}) {
    this.scene = scene;
    this.lightRig = lightRig;
    this.followTarget = followTarget;
    this.skyVisual = skyVisual;
    this.storage = storage;
    this.state = this._loadState();
    this.target = resolveClimateAppearance(this.state);
    this.weatherRoot = this._createWeatherRoot();
    this.weatherParticles = null;
    this.weatherEffectsVisible = true;
    this._targetColor = new THREE.Color();
    this._targetPosition = new THREE.Vector3();
    if (bindControls) this._bindControls();
    this._syncControls();
    this._setWeatherParticles();
    this._applyAppearance(1);
  }

  getState() {
    return { ...this.state };
  }

  setState(next) {
    const previousWeather = this.state.weather;
    this.state = normalizeManualClimateState({ ...this.state, ...next });
    this.target = resolveClimateAppearance(this.state);
    this._saveState();
    this._syncControls();
    if (previousWeather !== this.state.weather) this._setWeatherParticles();
    return this.getState();
  }

  update(dt) {
    const blend = 1 - Math.exp(-Math.max(0, dt) * 2.8);
    this._applyAppearance(blend);
    if (this.followTarget) {
      const position = this.followTarget.position;
      this.weatherRoot.position.set(position.x, position.y + 18, position.z);
    }
    this.skyVisual?.update?.(dt);
    if (this.weatherEffectsVisible) {
      this.weatherParticles?.update(dt, this.weatherRoot);
    }
  }

  setWeatherEffectsVisible(visible) {
    this.weatherEffectsVisible = Boolean(visible);
    for (const emitter of this.weatherParticles?.emitters || []) {
      emitter.instancedMesh.visible = this.weatherEffectsVisible;
      if (!this.weatherEffectsVisible) emitter.instancedMesh.count = 0;
    }
  }

  dispose() {
    this.weatherParticles?.dispose();
    this.weatherParticles = null;
    if (this.weatherRoot) {
      this.scene?.remove(this.weatherRoot);
      this.weatherRoot.traverse(child => {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
    }
    this.skyVisual?.dispose?.();
  }

  _loadState() {
    try {
      const saved = this.storage?.getItem?.(STORAGE_KEY);
      return normalizeManualClimateState(saved ? JSON.parse(saved) : DEFAULT_MANUAL_CLIMATE);
    } catch {
      return { ...DEFAULT_MANUAL_CLIMATE };
    }
  }

  _saveState() {
    try {
      this.storage?.setItem?.(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage is optional; the active session still keeps the selected climate.
    }
  }

  _bindControls() {
    if (typeof document === 'undefined') return;
    this.controls = {
      weather: document.getElementById('climate-weather'),
      hour: document.getElementById('climate-hour'),
      hourValue: document.getElementById('climate-hour-value'),
      month: document.getElementById('climate-month'),
      monthValue: document.getElementById('climate-month-value'),
    };
    this.controls.weather?.addEventListener('change', event => {
      this.setState({ weather: event.currentTarget.value });
    });
    this.controls.hour?.addEventListener('input', event => {
      this.setState({ hour: event.currentTarget.value });
    });
    this.controls.month?.addEventListener('input', event => {
      this.setState({ month: event.currentTarget.value });
    });
  }

  _syncControls() {
    if (!this.controls) return;
    if (this.controls.weather) this.controls.weather.value = this.state.weather;
    if (this.controls.hour) this.controls.hour.value = String(this.state.hour);
    if (this.controls.hourValue) this.controls.hourValue.textContent = `${String(this.state.hour).padStart(2, '0')}:00`;
    if (this.controls.month) this.controls.month.value = String(this.state.month);
    if (this.controls.monthValue) this.controls.monthValue.textContent = `${this.state.month}月`;
  }

  _createWeatherRoot() {
    const root = new THREE.Group();
    root.name = 'manual-weather-root';
    const emitter = new THREE.Mesh(
      new THREE.BoxGeometry(44, 1, 44),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    emitter.name = 'weather-emitter';
    root.add(emitter);
    this.scene.add(root);
    return root;
  }

  _setWeatherParticles() {
    this.weatherParticles?.dispose();
    this.weatherParticles = null;
    const plan = WEATHER_PARTICLE_PLANS[this.state.weather];
    if (!plan) return;
    this.weatherParticles = new ParticleSystem(this.scene);
    this.weatherParticles.setup(plan, this.weatherRoot);
    this.setWeatherEffectsVisible(this.weatherEffectsVisible);
  }

  _applyAppearance(alpha) {
    if (!this.scene || !this.lightRig) return;
    if (this.skyVisual?.setAppearance) {
      this.skyVisual.setAppearance(this.target, alpha);
      this.scene.background = null;
    } else {
      if (!this.scene.background?.isColor) this.scene.background = new THREE.Color(this.target.sky);
      this.scene.background.lerp(this._targetColor.setHex(this.target.sky), alpha);
    }

    if (!this.scene.fog?.isFog) {
      this.scene.fog = new THREE.Fog(this.target.fog, this.target.fogNear, this.target.fogFar);
    }
    this.scene.fog.color.lerp(this._targetColor.setHex(this.target.fog), alpha);
    this.scene.fog.near = THREE.MathUtils.lerp(this.scene.fog.near, this.target.fogNear, alpha);
    this.scene.fog.far = THREE.MathUtils.lerp(this.scene.fog.far, this.target.fogFar, alpha);

    const { hemiLight, sunLight } = this.lightRig;
    hemiLight.color.lerp(this._targetColor.setHex(this.target.hemiSky), alpha);
    hemiLight.groundColor.lerp(this._targetColor.setHex(this.target.hemiGround), alpha);
    hemiLight.intensity = THREE.MathUtils.lerp(hemiLight.intensity, this.target.hemiIntensity, alpha);
    sunLight.color.lerp(this._targetColor.setHex(this.target.sun), alpha);
    sunLight.intensity = THREE.MathUtils.lerp(sunLight.intensity, this.target.sunIntensity, alpha);
    sunLight.position.lerp(this._targetPosition.fromArray(this.target.sunPosition), alpha);
  }
}
