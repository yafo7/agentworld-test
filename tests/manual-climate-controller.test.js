import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { createLights } from '../src/engine/core/lights.js';
import { ChiiSkyVisualAdapter } from '../src/integrations/rendering/ChiiSkyVisualAdapter.js';
import { assertWorldClimateVisualPort } from '../src/ports/WorldClimateVisualPort.js';
import {
  DEFAULT_MANUAL_CLIMATE,
  ManualClimateController,
  normalizeManualClimateState,
  resolveClimateAppearance,
} from '../src/demos/chii-island/presentation/ManualClimateController.js';
import { WorldClimatePresenter } from '../src/demos/chii-island/presentation/WorldClimatePresenter.js';

test('manual climate state normalizes weather, hour, and month', () => {
  assert.deepEqual(normalizeManualClimateState({ weather: 'snow', hour: 23, month: 12 }), {
    weather: 'snow',
    hour: 23,
    month: 12,
  });
  assert.deepEqual(normalizeManualClimateState({ weather: 'storm', hour: 99, month: 0 }), {
    weather: DEFAULT_MANUAL_CLIMATE.weather,
    hour: 23,
    month: 1,
  });
});

test('hour changes the light level and sun position', () => {
  const midnight = resolveClimateAppearance({ weather: 'clear', hour: 0, month: 7 });
  const noon = resolveClimateAppearance({ weather: 'clear', hour: 12, month: 7 });

  assert.ok(noon.sunIntensity > midnight.sunIntensity);
  assert.ok(noon.sunPosition[1] > midnight.sunPosition[1]);
});

test('weather changes visibility while month resolves a season', () => {
  const clear = resolveClimateAppearance({ weather: 'clear', hour: 12, month: 4 });
  const fog = resolveClimateAppearance({ weather: 'fog', hour: 12, month: 4 });
  const winter = resolveClimateAppearance({ weather: 'snow', hour: 12, month: 1 });

  assert.equal(clear.season, 'spring');
  assert.equal(winter.season, 'winter');
  assert.ok(fog.fogFar < clear.fogFar);
  assert.ok(fog.sunIntensity < clear.sunIntensity);
});

test('controller applies climate to a Three scene and owns weather particles', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 40, 180);
  const lightRig = createLights(scene);
  const followTarget = new THREE.Group();
  followTarget.position.set(8, 2, -5);
  const controller = new ManualClimateController({ scene, lightRig, followTarget, storage });

  controller.setState({ weather: 'rain', hour: 0, month: 1 });
  controller.update(0.1);

  assert.equal(controller.weatherParticles.emitters.length, 1);
  assert.deepEqual(controller.weatherRoot.position.toArray(), [8, 20, -5]);
  assert.ok(scene.fog.far < 180);
  assert.ok(lightRig.sunLight.intensity < 1);
  assert.match(values.get('chii-manual-climate-v1'), /"weather":"rain"/);

  const rainMesh = controller.weatherParticles.emitters[0].instancedMesh;
  controller.setWeatherEffectsVisible(false);
  assert.equal(rainMesh.visible, false);
  assert.equal(rainMesh.count, 0);
  controller.setWeatherEffectsVisible(true);
  assert.equal(rainMesh.visible, true);

  controller.setState({ weather: 'clear' });
  assert.equal(controller.weatherParticles, null);
  controller.dispose();
  assert.equal(scene.getObjectByName('manual-weather-root'), undefined);
});

test('climate presenter drives a replaceable sky adapter', () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 40, 180);
  const lightRig = createLights(scene);
  const followTarget = new THREE.Group();
  followTarget.position.set(12, 3, -8);
  const skyVisual = new ChiiSkyVisualAdapter({ scene, followTarget });
  const presenter = new WorldClimatePresenter({ scene, lightRig, followTarget, skyVisual });

  assert.equal(assertWorldClimateVisualPort(presenter), presenter);
  presenter.setClimateState({
    mode: 'manual',
    time: { hour: 20, month: 11 },
    weather: { type: 'cloudy' },
  });
  presenter.update(1);

  assert.equal(scene.background, null);
  assert.deepEqual(skyVisual.sky.mesh.position.toArray(), [12, 3, -8]);
  assert.equal(presenter.getCapabilities().sky.replaceable, true);
  assert.ok(skyVisual.sky.material.uniforms.uSunIntensity.value < 1.2);

  presenter.dispose();
  assert.equal(scene.getObjectByName('ChiiClimateSky'), undefined);
  assert.ok(scene.background.isColor);
});

test('ESC panel exposes weather, 24-hour, and 12-month controls', () => {
  const html = readFileSync(new URL('../src/demos/chii-island/index.html', import.meta.url), 'utf8');

  assert.match(html, /id="climate-weather"/);
  assert.match(html, /id="climate-hour"[^>]+min="0"[^>]+max="23"/);
  assert.match(html, /id="climate-month"[^>]+min="1"[^>]+max="12"/);
  for (const weather of ['clear', 'cloudy', 'rain', 'snow', 'fog']) {
    assert.match(html, new RegExp(`value="${weather}"`));
  }
});
