/**
 * Unified keyboard + mouse input state.
 *
 * Mirrors voxel-game/src/core/Input.ts:
 * - Tracks keys via e.code (KeyW/KeyS/KeyA/KeyD/Space/ShiftLeft...).
 * - Accumulates mouse delta while pointer-locked.
 * - Clicking the canvas requests pointer lock; Esc releases it.
 * - UI can temporarily disable pointer lock via setPointerLockEnabled(false).
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justDown = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.pointerLocked = false;
    this.pointerLockEnabled = true;

    this._isTypingTarget = (target) => {
      if (!target) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    };

    this._onKeyDown = (e) => {
      if (this._isTypingTarget(e.target)) return;
      if (!this.keys.has(e.code)) this.justDown.add(e.code);
      this.keys.add(e.code);
    };

    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };

    this._onMouseDown = (e) => {
      if (e.button === 0) this.mouseDown = true;
    };

    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };

    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    };

    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    };

    this._onCanvasClick = () => {
      if (this.pointerLockEnabled && !this.pointerLocked) {
        this.canvas.requestPointerLock?.();
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('mousemove', this._onMouseMove);
    if (canvas) canvas.addEventListener('click', this._onCanvasClick);
  }

  /** Prevent the canvas click from requesting pointer lock (e.g. while a UI panel is open). */
  setPointerLockEnabled(enabled) {
    this.pointerLockEnabled = enabled;
    if (!enabled && this.pointerLocked) {
      document.exitPointerLock?.();
    }
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** True only on the frame the key transitioned from up to down. */
  justPressed(code) {
    return this.justDown.has(code);
  }

  /** Clear the just-pressed set. Call once per frame after logic consumption. */
  endFrame() {
    this.justDown.clear();
  }

  /** Read and reset accumulated mouse delta since last call. */
  consumeMouseDelta() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('mousemove', this._onMouseMove);
    if (this.canvas) this.canvas.removeEventListener('click', this._onCanvasClick);
  }
}
