import * as THREE from 'three';

import { SkyDome } from '../../engine/core/SkyDome.js';

function deriveZenith(skyColor, sunIntensity) {
  const color = new THREE.Color(skyColor);
  const lightness = 0.55 + THREE.MathUtils.clamp(sunIntensity, 0, 1) * 0.35;
  return color.multiplyScalar(lightness);
}

function deriveGround(fogColor, sunIntensity) {
  return new THREE.Color(fogColor).multiplyScalar(
    0.28 + THREE.MathUtils.clamp(sunIntensity, 0, 1) * 0.3,
  );
}

export class ChiiSkyVisualAdapter {
  constructor({ scene, followTarget = null } = {}) {
    if (!scene) throw new TypeError('ChiiSkyVisualAdapter scene is required');
    this.scene = scene;
    this.followTarget = followTarget;
    this.sky = new SkyDome();
    this.sky.mesh.name = 'ChiiClimateSky';
    this.scene.add(this.sky.mesh);
    this.scene.background = null;
    this._targetColor = new THREE.Color();
    this._sunDirection = new THREE.Vector3();
  }

  setAppearance(appearance, alpha = 1) {
    if (!appearance) return;
    this.sky.horizonColor.lerp(this._targetColor.setHex(appearance.sky), alpha);
    this.sky.zenithColor.lerp(deriveZenith(appearance.sky, appearance.sunIntensity), alpha);
    this.sky.groundColor.lerp(deriveGround(appearance.fog, appearance.sunIntensity), alpha);
    this.sky.sunColor.lerp(this._targetColor.setHex(appearance.sun), alpha);
    this.sky.material.uniforms.uSunIntensity.value = THREE.MathUtils.lerp(
      this.sky.material.uniforms.uSunIntensity.value,
      0.18 + appearance.sunIntensity * 1.15,
      alpha,
    );
    this._sunDirection.fromArray(appearance.sunPosition).normalize();
    this.sky.material.uniforms.uSunDir.value.lerp(this._sunDirection, alpha).normalize();
  }

  update() {
    if (this.followTarget?.position) this.sky.update(this.followTarget.position);
  }

  getCapabilities() {
    return {
      source: 'chii-sky-dome',
      dynamicGradient: true,
      sunGlow: true,
      clouds: false,
      hdri: false,
      environmentReflection: false,
      replaceable: true,
    };
  }

  dispose() {
    this.scene.remove(this.sky.mesh);
    this.sky.mesh.geometry.dispose();
    this.sky.material.dispose();
    this.scene.background = new THREE.Color(this.sky.horizonColor);
  }
}
