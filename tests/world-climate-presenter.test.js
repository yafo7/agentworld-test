import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { createLights } from '../src/engine/core/lights.js';
import { ChiiSkyVisualAdapter } from '../src/integrations/rendering/ChiiSkyVisualAdapter.js';
import {
  WorldClimateVisualPort,
  assertWorldClimateVisualPort,
} from '../src/ports/WorldClimateVisualPort.js';
import {
  DEFAULT_MANUAL_CLIMATE,
  normalizeManualClimateState,
} from '../src/world/climate/WorldClimateState.js';
import {
  WorldClimatePresenter,
  resolveClimateAppearance,
} from '../src/demos/chii-island/presentation/WorldClimatePresenter.js';

function sceneFixture() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 40, 180);
  return { scene, lightRig: createLights(scene) };
}

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

test('presenter implements the climate visual port without storage or UI ownership', () => {
  const { scene, lightRig } = sceneFixture();
  const followTarget = new THREE.Group();
  followTarget.position.set(8, 2, -5);
  const presenter = new WorldClimatePresenter({ scene, lightRig, followTarget });

  assert.ok(presenter instanceof WorldClimateVisualPort);
  assert.equal(assertWorldClimateVisualPort(presenter), presenter);
  assert.equal('storage' in presenter, false);
  assert.equal('controls' in presenter, false);
  assert.equal('setState' in presenter, false);

  presenter.setClimateState({
    mode: 'manual',
    time: { hour: 0, month: 1 },
    weather: { type: 'rain' },
  });
  presenter.update(0.1);

  assert.equal(presenter.weatherParticles.emitters.length, 1);
  assert.deepEqual(presenter.weatherRoot.position.toArray(), [8, 20, -5]);
  assert.ok(scene.fog.far < 180);
  assert.ok(lightRig.sunLight.intensity < 1);

  const rainMesh = presenter.weatherParticles.emitters[0].instancedMesh;
  presenter.setWeatherEffectsVisible(false);
  assert.equal(rainMesh.visible, false);
  assert.equal(rainMesh.count, 0);
  presenter.setWeatherEffectsVisible(true);
  assert.equal(rainMesh.visible, true);

  presenter.setClimateState({
    mode: 'manual',
    time: { hour: 0, month: 1 },
    weather: { type: 'clear' },
  });
  assert.equal(presenter.weatherParticles, null);
  presenter.dispose();
  assert.equal(scene.getObjectByName('manual-weather-root'), undefined);
});

test('climate presenter drives a replaceable sky adapter', () => {
  const { scene, lightRig } = sceneFixture();
  const followTarget = new THREE.Group();
  followTarget.position.set(12, 3, -8);
  const skyVisual = new ChiiSkyVisualAdapter({ scene, followTarget });
  const presenter = new WorldClimatePresenter({ scene, lightRig, followTarget, skyVisual });

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
