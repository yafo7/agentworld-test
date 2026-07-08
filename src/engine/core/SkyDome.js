import * as THREE from 'three';

/**
 * Procedural sky dome for Chii Island.
 *
 * A large inverted sphere follows the camera so the horizon is always visible.
 * Shader renders a zenith → horizon → ground gradient plus a soft sun glow.
 * No textures, no external assets.
 */
export class SkyDome {
  constructor() {
    this.horizonColor = new THREE.Color(0xffcc88);
    this.zenithColor = new THREE.Color(0x2a3a6a);
    this.groundColor = new THREE.Color(0x1a1512);
    this.sunColor = new THREE.Color(0xfff5c0);

    const geometry = new THREE.SphereGeometry(900, 32, 24);

    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: {
        uZenithColor: { value: this.zenithColor },
        uHorizonColor: { value: this.horizonColor },
        uGroundColor: { value: this.groundColor },
        uSunColor: { value: this.sunColor },
        uSunDir: { value: new THREE.Vector3(0.3, 0.5, 1).normalize() },
        uSunIntensity: { value: 1.2 },
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(worldPos.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uGroundColor;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        uniform float uSunIntensity;
        varying vec3 vWorldDir;

        void main() {
          vec3 dir = normalize(vWorldDir);
          float y = dir.y;
          float ay = abs(y);

          vec3 sky;
          if (y >= 0.0) {
            sky = mix(uHorizonColor, uZenithColor, sqrt(y));
          } else {
            sky = mix(uHorizonColor, uGroundColor, min(ay * 2.0, 1.0));
          }

          float s = max(dot(dir, uSunDir), 0.0);
          float s3 = s * s * s;
          sky += uSunColor * s3 * s3 * uSunIntensity;

          float horizonBand = max(0.0, 1.0 - ay * 5.0) * 0.25;
          sky += uHorizonColor * horizonBand;

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  /**
   * Call every frame with the camera position so the dome stays centered
   * around the viewer.
   */
  update(cameraPosition) {
    this.mesh.position.copy(cameraPosition);
  }

  /**
   * Update sun direction used by the shader (and optionally sync a directional
   * light). sunDir is expected to be normalized.
   */
  setSunDir(sunDir) {
    this.material.uniforms.uSunDir.value.copy(sunDir).normalize();
  }
}
