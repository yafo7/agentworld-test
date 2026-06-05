import * as THREE from 'three';

/**
 * Third-person camera that follows a target (player).
 * Left-drag orbits around target. Scroll wheel zooms.
 */
export class ThirdPersonCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Spherical coordinates around the target
    this.distance = 8;
    this.theta = Math.PI / 4;       // vertical angle from horizontal: 0=side, PI/2=top
    this.phi = 0;                    // horizontal orbit angle

    // Look-at point (target position + vertical offset)
    this._targetPos = new THREE.Vector3();
    this._lookOffset = new THREE.Vector3(0, 1.5, 0);

    // Mouse drag state
    this._dragging = false;
    this._lastMouse = new THREE.Vector2();

    this._setupInput();
  }

  // ---- internal input handling ----
  _setupInput() {
    const canvas = document.querySelector('canvas');

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this._dragging = true;
        this._lastMouse.set(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mouseup', () => {
      this._dragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastMouse.x;
      const dy = e.clientY - this._lastMouse.y;
      this.phi -= dx * 0.005;
      this.theta -= dy * 0.005;
      // Clamp vertical angle so camera doesn't flip or go underground
      this.theta = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.theta));
      this._lastMouse.set(e.clientX, e.clientY);
    });

    canvas.addEventListener('wheel', (e) => {
      this.distance += e.deltaY * 0.01;
      this.distance = Math.max(3, Math.min(20, this.distance));
    });
  }

  // ---- public API ----

  /** Call every frame. targetPos is the player position (Vector3). */
  update(targetPos) {
    this._targetPos.copy(targetPos).add(this._lookOffset);

    const sinTheta = Math.sin(this.theta);
    const x = this._targetPos.x + this.distance * sinTheta * Math.cos(this.phi);
    const y = this._targetPos.y + this.distance * Math.cos(this.theta);
    const z = this._targetPos.z + this.distance * sinTheta * Math.sin(this.phi);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this._targetPos);
  }

  /** Returns the horizontal orbit angle (radians) for player-relative movement. */
  getHorizontalAngle() {
    return this.phi;
  }

  /** Returns true if the user was dragging (orbiting) this frame. */
  get wasDragging() {
    return this._dragging;
  }
}
