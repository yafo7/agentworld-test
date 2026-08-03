import * as THREE from 'three';

import { resolveEffectiveMaterialTags } from '../../engine/model/MaterialTagPresentation.js';

function findMesh(root, partId) {
  const object = root?.getObjectByName?.(partId) || null;
  if (object?.isMesh && !object.isInstancedMesh) return object;
  let mesh = null;
  object?.traverse?.(child => {
    if (!mesh && child.isMesh && !child.isInstancedMesh) mesh = child;
  });
  return mesh;
}

export function createWaterMaterial(kind) {
  const isFall = kind === 'fall';
  const isRiver = kind === 'river';
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uTopColor: { value: new THREE.Color(isFall ? 0x9de8ff : isRiver ? 0x72cfd7 : 0x76d5e8) },
      uBottomColor: { value: new THREE.Color(isFall ? 0x3d91c5 : isRiver ? 0x286f83 : 0x328bad) },
      uFoamColor: { value: new THREE.Color(0xe9fcff) },
      uOpacity: { value: isFall ? 0.68 : isRiver ? 0.82 : 0.74 },
    },
  ]);
  const material = new THREE.ShaderMaterial({
    name: `ChiiModelWater:${kind}`,
    uniforms,
    transparent: true,
    opacity: isFall ? 0.68 : isRiver ? 0.82 : 0.74,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    vertexShader: `
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec3 vWaterPosition;
      varying float vWaterWave;
      varying vec2 vWaterUv;
      void main() {
        vec3 transformed = position;
        ${isFall
    ? 'float wave = sin(position.y * 5.0 - uTime * 4.2) * 0.025; transformed.x += wave;'
    : 'float wave = sin((position.x + position.z) * 3.8 + uTime * 1.7) * 0.025 + cos(position.x * 6.0 - uTime * 1.2) * 0.012; transformed.y += wave;'}
        vWaterPosition = position;
        vWaterWave = wave;
        vWaterUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform vec3 uFoamColor;
      uniform float uOpacity;
      varying vec3 vWaterPosition;
      varying float vWaterWave;
      varying vec2 vWaterUv;
      void main() {
        ${isFall
    ? 'float flow = fract(vWaterPosition.y * 1.8 - uTime * 0.7); float foam = smoothstep(0.72, 0.96, flow); float band = 0.5 + 0.5 * sin(vWaterPosition.x * 8.0 + uTime * 1.8);'
    : isRiver
      ? 'float flow = 0.5 + 0.5 * sin(vWaterPosition.z * 0.42 - uTime * 1.45 + sin(vWaterPosition.x * 0.35)); float shore = 1.0 - smoothstep(0.0, 0.14, min(vWaterUv.x, 1.0 - vWaterUv.x)); float broken = 0.55 + 0.45 * sin(vWaterPosition.z * 1.7 + uTime * 1.1); float foam = shore * broken; float band = flow;'
      : 'float flow = 0.5 + 0.5 * sin((vWaterPosition.x - vWaterPosition.z) * 4.0 + uTime * 1.3); float foam = smoothstep(0.82, 1.0, flow + abs(vWaterWave) * 3.0); float band = flow;'}
        vec3 color = mix(uBottomColor, uTopColor, 0.35 + band * 0.4);
        color = mix(color, uFoamColor, foam * ${isFall ? '0.55' : isRiver ? '0.68' : '0.32'});
        gl_FragColor = vec4(color, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  material.userData = {
    chiiModelWater: true,
    waterKind: kind,
    waterUniforms: uniforms,
  };
  return material;
}

export class ModelWaterTagPresenter {
  constructor() {
    this.bindings = new Map();
  }

  attachModel(root, parts = []) {
    this.detachModel(root);
    const effective = resolveEffectiveMaterialTags(parts);
    const entries = [];
    for (const part of parts) {
      const water = effective.get(part.id)?.find(tag => tag.tag === 'water');
      if (!water || !['pool', 'fall'].includes(water.value)) continue;
      const object = findMesh(root, part.id);
      if (!object?.material) continue;
      const original = object.material;
      const sourceMaterials = Array.isArray(original) ? original : [original];
      const replacements = sourceMaterials.map(() => createWaterMaterial(water.value));
      object.material = Array.isArray(original) ? replacements : replacements[0];
      object.userData.chiiModelWater = water.value;
      entries.push({ object, original, replacements, kind: water.value });
    }
    if (entries.length) this.bindings.set(root, entries);
    return entries.length;
  }

  detachModel(root) {
    const entries = this.bindings.get(root);
    if (!entries) return 0;
    for (const entry of entries) {
      entry.object.material = entry.original;
      delete entry.object.userData.chiiModelWater;
      for (const material of entry.replacements) material.dispose();
    }
    this.bindings.delete(root);
    return entries.length;
  }

  update(time) {
    for (const entries of this.bindings.values()) {
      for (const entry of entries) {
        for (const material of entry.replacements) {
          material.userData.waterUniforms.uTime.value = time;
        }
      }
    }
  }

  dispose() {
    for (const root of [...this.bindings.keys()]) this.detachModel(root);
  }
}
