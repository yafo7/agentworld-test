import * as THREE from 'three';

/**
 * Click-to-inspect on any game object.
 * Distinguishes clicks from camera drags (5px threshold).
 *
 * @param {THREE.Camera} camera
 * @param {Array<{mesh: THREE.Mesh, getInfo?: Function, name?: string}>} targets
 */
export function setupRaycast(camera, targets) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let mouseDownPos = null;

  window.addEventListener('mousedown', (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', (e) => {
    if (!mouseDownPos) return;

    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    mouseDownPos = null;

    if (dist > 5) return; // camera drag, not click

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const meshes = targets.map((t) => t.mesh).filter(Boolean);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const target = targets.find((t) => t.mesh === hitMesh);
      if (!target) return;

      // Visual feedback
      if (target.mesh.material && target.mesh.material.color) {
        const originalColor = target.mesh.material.color.getHex();
        target.mesh.material.color.set(0xffffff);
        setTimeout(() => {
          target.mesh.material.color.set(originalColor);
        }, 150);
      }

      // Log info
      if (target.getInfo) {
        console.log(`[Clicked] ${target.name || target.mesh.name}`, target.getInfo());
      } else {
        console.log(`[Clicked] ${target.name || target.mesh.name}`, {
          tags: target.tags,
          position: target.mesh.position.toArray(),
        });
      }
    }
  });
}
