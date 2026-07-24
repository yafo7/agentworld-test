import * as THREE from 'three';

export class ObjectPlacementOverlay {
  constructor({ scene, grid }) {
    this.scene = scene;
    this.grid = grid;
    this.group = new THREE.Group();
    this.group.name = 'ObjectPlacementOverlay';
    this.group.visible = false;

    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x63d58a,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.plane.rotation.x = -Math.PI / 2;
    this.plane.renderOrder = 900;
    this.group.add(this.plane);

    this.lines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xb8ffd0, depthTest: false }),
    );
    this.lines.renderOrder = 901;
    this.group.add(this.lines);
    scene.add(this.group);
  }

  update(state) {
    if (!state) {
      this.hide();
      return;
    }
    const center = this.grid.positionFor(state.anchor, state.footprint);
    const width = state.footprint.width * this.grid.cellSize;
    const depth = state.footprint.depth * this.grid.cellSize;
    const color = state.valid ? 0x63d58a : 0xe45d68;
    this.group.visible = true;
    this.plane.position.set(center.x, 0.035, center.z);
    this.plane.scale.set(width, depth, 1);
    this.plane.material.color.setHex(color);
    this.lines.material.color.setHex(state.valid ? 0xb8ffd0 : 0xffa2aa);
    this._updateLines(state.anchor, state.footprint);
  }

  hide() {
    this.group.visible = false;
  }

  dispose() {
    this.scene.remove(this.group);
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }

  _updateLines(anchor, footprint) {
    const left = this.grid.minX + anchor.x * this.grid.cellSize;
    const top = this.grid.minZ + anchor.z * this.grid.cellSize;
    const right = left + footprint.width * this.grid.cellSize;
    const bottom = top + footprint.depth * this.grid.cellSize;
    const vertices = [];
    for (let x = 0; x <= footprint.width; x += 1) {
      const wx = left + x * this.grid.cellSize;
      vertices.push(wx, 0.06, top, wx, 0.06, bottom);
    }
    for (let z = 0; z <= footprint.depth; z += 1) {
      const wz = top + z * this.grid.cellSize;
      vertices.push(left, 0.06, wz, right, 0.06, wz);
    }
    this.lines.geometry.dispose();
    this.lines.geometry = new THREE.BufferGeometry();
    this.lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  }
}
