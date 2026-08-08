import * as THREE from 'three';

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class WorldObjectiveMarkerPresenter {
  constructor({ scene, camera, edgeElement }) {
    this.scene = scene;
    this.camera = camera;
    this.edgeElement = edgeElement;
    this.edgeLabel = edgeElement?.querySelector?.('[data-objective-edge-label]') || null;
    this.edgeDistance = edgeElement?.querySelector?.('[data-objective-edge-distance]') || null;
    this.edgeArrow = edgeElement?.querySelector?.('.objective-edge-arrow') || null;
    this.elapsed = 0;
    this.visible = false;
    this.targetPosition = new THREE.Vector3();
    this.guidancePosition = new THREE.Vector3();
    this.playerPosition = new THREE.Vector3();
    this.label = '';
    this.root = this._createMarker();
    this.scene.add(this.root);
  }

  _createMarker() {
    const root = new THREE.Group();
    root.name = 'objective-guidance-marker';
    root.visible = false;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.48, 1.05, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb34f, depthTest: false, transparent: true, opacity: 0.95 }),
    );
    cone.rotation.z = Math.PI;
    cone.position.y = 2.5;
    cone.renderOrder = 900;
    root.add(cone);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.94, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe7a0, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.82 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    ring.renderOrder = 899;
    root.add(ring);
    this.cone = cone;
    this.ring = ring;
    return root;
  }

  show({ position, guidancePosition = position, playerPosition, label }) {
    if (!position || !playerPosition) return this.hide();
    this.visible = true;
    this.targetPosition.copy(position);
    this.guidancePosition.copy(guidancePosition || position);
    this.playerPosition.copy(playerPosition);
    this.label = label || '';
    this.root.visible = true;
    this.root.position.copy(this.targetPosition);
    if (this.edgeLabel) this.edgeLabel.textContent = this.label;
  }

  hide() {
    this.visible = false;
    this.root.visible = false;
    this.edgeElement?.classList.remove('visible');
  }

  update(dt) {
    if (!this.visible) return;
    this.elapsed += dt;
    this.cone.position.y = 2.55 + Math.sin(this.elapsed * 4.5) * 0.18;
    const pulse = 1 + Math.sin(this.elapsed * 4.5) * 0.1;
    this.ring.scale.setScalar(pulse);
    this._updateEdgeIndicator();
  }

  _updateEdgeIndicator() {
    if (!this.edgeElement || !this.camera) return;
    const projected = this.guidancePosition.clone().project(this.camera);
    const inFront = projected.z >= -1 && projected.z <= 1;
    const onScreen = inFront && Math.abs(projected.x) <= 0.82 && Math.abs(projected.y) <= 0.78;
    if (onScreen) {
      this.edgeElement.classList.remove('visible');
      return;
    }

    let x = projected.x;
    let y = projected.y;
    if (!inFront) {
      x = -x;
      y = -y;
    }
    const angle = Math.atan2(-y, x);
    const marginX = Math.min(globalThis.innerWidth * 0.36, 360);
    const marginY = Math.min(globalThis.innerHeight * 0.34, 250);
    const screenX = (globalThis.innerWidth / 2) + Math.cos(angle) * marginX;
    const screenY = (globalThis.innerHeight / 2) - Math.sin(angle) * marginY;
    this.edgeElement.style.left = `${screenX}px`;
    this.edgeElement.style.top = `${screenY}px`;
    if (this.edgeArrow) this.edgeArrow.style.transform = `rotate(${-angle}rad)`;
    if (this.edgeDistance) {
      this.edgeDistance.textContent = `${Math.round(horizontalDistance(this.playerPosition, this.targetPosition))}m`;
    }
    this.edgeElement.classList.add('visible');
  }

  dispose() {
    this.hide();
    this.scene.remove(this.root);
    this.root.traverse(object => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
  }
}
