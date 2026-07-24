import * as THREE from 'three';

export function createLights(scene) {
  // Sky-blue hemisphere fill (sky / ground)
  const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x445566, 0.5);
  scene.add(hemiLight);

  // Directional "sun" light with shadows — cooler white for blue-sky read
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
  sunLight.position.set(30, 60, 40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);

  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 180;

  // Tighter frustum for better texel density (50×50 grid × 4 spacing = 200 world units)
  const extent = 70;
  sunLight.shadow.camera.left = -extent;
  sunLight.shadow.camera.right = extent;
  sunLight.shadow.camera.top = extent;
  sunLight.shadow.camera.bottom = -extent;

  // Bias to reduce shadow acne
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;

  scene.add(sunLight);

  return { hemiLight, sunLight };
}
