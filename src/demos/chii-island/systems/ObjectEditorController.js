import * as THREE from 'three';
import { ObjectPlacementOverlay } from '../presentation/ObjectPlacementOverlay.js';

export function getObjectMoveCameraFrame(entity) {
  const box = entity?.getWorldBBox?.();
  const validBox = box && !box.isEmpty();
  const center = validBox
    ? box.getCenter(new THREE.Vector3())
    : entity?.mesh?.position?.clone?.() || new THREE.Vector3();
  const size = validBox ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(4, 4, 4);
  const span = Math.max(size.x, size.z, 4);
  const lookAt = center.clone();
  // Start the camera ray above the edited collider so collision avoidance does
  // not collapse the overhead shot against the building itself.
  lookAt.y = Math.max(0.5, validBox ? box.max.y + 0.5 : center.y);
  // Fixed map frame: -Z is screen-up and +X is screen-right.
  const position = lookAt.clone();
  position.z += Math.max(8, span * 0.9);
  position.y += Math.max(18, span * 1.8);
  return { position, lookAt, fov: 55 };
}

export class ObjectEditorController {
  constructor({ placement, scene, camera, cameraController = null, canvas, input }) {
    this.placement = placement;
    this.camera = camera;
    this.cameraController = cameraController;
    this.canvas = canvas;
    this.input = input;
    this.overlay = new ObjectPlacementOverlay({ scene, grid: placement.grid });
    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pointer = new THREE.Vector2();
    this.hit = new THREE.Vector3();
    this.dragging = false;
    this.moveCameraActive = false;
    this.undoTimer = null;
    this.session = null;

    this.root = document.getElementById('object-editor');
    this.title = document.getElementById('object-editor-title');
    this.footprint = document.getElementById('object-editor-footprint');
    this.status = document.getElementById('object-editor-status');
    this.scaleRow = document.getElementById('object-scale-row');
    this.scaleInput = document.getElementById('object-scale');
    this.scaleValue = document.getElementById('object-scale-value');
    this.deleteConfirm = document.getElementById('object-delete-confirm');
    this.undoToast = document.getElementById('object-undo');
    this.undoLabel = document.getElementById('object-undo-label');

    this._onAction = event => this._handleAction(event.currentTarget.dataset.objectAction);
    this._onScale = () => {
      this.placement.setUserScale(Number(this.scaleInput.value) / 100);
      this._sync();
    };
    this._onPointerDown = event => {
      if (!this.isActive() || this.placement.active.mode !== 'move' || event.button !== 0) return;
      this.dragging = true;
      this.canvas.setPointerCapture?.(event.pointerId);
      this._moveFromPointer(event);
    };
    this._onPointerMove = event => {
      if (this.dragging) this._moveFromPointer(event);
    };
    this._onPointerUp = event => {
      if (event.button !== 0) return;
      this.dragging = false;
      this.canvas.releasePointerCapture?.(event.pointerId);
    };
    this._onKeyDown = event => {
      if (!this.isActive() || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
      const moves = {
        ArrowUp: [0, -1], KeyW: [0, -1],
        ArrowDown: [0, 1], KeyS: [0, 1],
        ArrowLeft: [-1, 0], KeyA: [-1, 0],
        ArrowRight: [1, 0], KeyD: [1, 0],
      };
      if (moves[event.code] && this.placement.active.mode === 'move') {
        event.preventDefault();
        this.placement.moveByCells(...moves[event.code]);
        this._sync();
      } else if (event.code === 'KeyR') {
        event.preventDefault();
        this.placement.rotateQuarter();
        this._sync();
      } else if (event.code === 'Enter') {
        event.preventDefault();
        this.confirm();
      }
    };

    for (const button of document.querySelectorAll('[data-object-action]')) {
      button.addEventListener('click', this._onAction);
    }
    this.scaleInput?.addEventListener('input', this._onScale);
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
  }

  isActive() {
    return !!this.placement.active;
  }

  open(entity, {
    mode = 'selected',
    title = null,
    allowedActions = null,
    onConfirm = null,
    onCancel = null,
  } = {}) {
    const state = this.placement.begin(entity);
    if (!state) return false;
    this.session = { onConfirm, onCancel, allowedActions };
    this.placement.setMode(mode);
    this.input.setPointerLockEnabled(false);
    document.exitPointerLock?.();
    this.root?.classList.add('visible');
    this.deleteConfirm?.classList.remove('visible');
    this.title.textContent = title || entity.name || '物件';
    this.scaleInput.value = String(Math.round(state.userScale * 100));
    this._syncAllowedActions();
    this._syncCamera();
    this._sync();
    return true;
  }

  openGenerated(entity) {
    return this.open(entity, { mode: 'scale' });
  }

  openPlacementDraft(entity) {
    return new Promise(resolve => {
      const opened = this.open(entity, {
        mode: 'move',
        title: '确定建筑占地',
        allowedActions: new Set(['move', 'rotate', 'confirm', 'cancel']),
        onConfirm: result => resolve(result),
        onCancel: () => resolve(null),
      });
      if (!opened) resolve(null);
    });
  }

  confirm() {
    const state = this.placement.active;
    if (!state || !this.placement.confirm()) {
      this._sync();
      return false;
    }
    const result = {
      entity: state.entity,
      anchor: { ...state.anchor },
      footprint: { ...state.footprint },
      position: state.entity.mesh.position.clone(),
    };
    const callback = this.session?.onConfirm;
    this.session = null;
    this._closeUi();
    callback?.(result);
    return true;
  }

  cancel() {
    if (!this.isActive()) return false;
    this.placement.cancel();
    const callback = this.session?.onCancel;
    this.session = null;
    this._closeUi();
    callback?.();
    return true;
  }

  dispose() {
    for (const button of document.querySelectorAll('[data-object-action]')) {
      button.removeEventListener('click', this._onAction);
    }
    this.scaleInput?.removeEventListener('input', this._onScale);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    this._releaseMoveCamera();
    this.overlay.dispose();
  }

  _handleAction(action) {
    if (action === 'move' || action === 'scale') {
      this.placement.setMode(action);
      this.deleteConfirm?.classList.remove('visible');
      this._syncCamera();
      this._sync();
      return;
    }
    if (action === 'rotate') {
      this.placement.rotateQuarter();
      this._sync();
      return;
    }
    if (action === 'delete') {
      this.deleteConfirm?.classList.add('visible');
      return;
    }
    if (action === 'delete-confirm') {
      const entity = this.placement.active?.entity;
      if (!entity) return;
      const name = entity.name || '物件';
      this.placement.remove(entity);
      this._closeUi();
      this._showUndo(name);
      return;
    }
    if (action === 'delete-cancel') {
      this.deleteConfirm?.classList.remove('visible');
      return;
    }
    if (action === 'confirm') this.confirm();
    if (action === 'cancel') this.cancel();
    if (action === 'undo') {
      const restored = this.placement.undoRemove();
      if (restored) this._hideUndo();
    }
  }

  _moveFromPointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.ground, this.hit)) return;
    this.placement.moveToWorld(this.hit);
    this._sync();
  }

  _sync() {
    const state = this.placement.active;
    if (!state) return;
    this.overlay.update(state);
    const subdivision = Math.max(1, this.placement.grid.subdivision || 1);
    const formatSize = value => Number.isInteger(value / subdivision)
      ? String(value / subdivision)
      : (value / subdivision).toFixed(1);
    this.footprint.textContent = `${formatSize(state.footprint.width)} × ${formatSize(state.footprint.depth)} 地块`;
    this.scaleValue.textContent = `${Math.round(state.userScale * 100)}%`;
    this.scaleRow?.classList.toggle('visible', state.mode === 'scale');
    this.root?.setAttribute('data-mode', state.mode);
    for (const button of this.root?.querySelectorAll('[data-object-action]') || []) {
      const active = button.dataset.objectAction === state.mode;
      button.classList.toggle('active', active);
      if (['move', 'scale'].includes(button.dataset.objectAction)) {
        button.setAttribute('aria-pressed', String(active));
      }
    }
    if (state.valid) {
      this.status.textContent = state.mode === 'move' ? '拖动物件并吸附到地块' : '当前位置可以放置';
      this.status.dataset.valid = 'true';
    } else {
      const water = state.validation?.blockedTerrain?.length > 0;
      this.status.textContent = water ? '不能放在河流上' : '地块已被其他物件占用';
      this.status.dataset.valid = 'false';
    }
    const confirm = this.root?.querySelector('[data-object-action="confirm"]');
    if (confirm) confirm.disabled = !state.valid;
    this._syncCamera();
  }

  _closeUi() {
    this.dragging = false;
    this.root?.classList.remove('visible');
    this.deleteConfirm?.classList.remove('visible');
    this.overlay.hide();
    this._releaseMoveCamera();
    this.input.setPointerLockEnabled(true);
  }

  _syncCamera() {
    const state = this.placement.active;
    if (!state || state.mode !== 'move' || !this.cameraController) {
      this._releaseMoveCamera();
      return;
    }
    const frame = getObjectMoveCameraFrame(state.entity);
    this.cameraController.lockTo(frame.position, frame.lookAt, frame.fov);
    this.moveCameraActive = true;
  }

  _syncAllowedActions() {
    const allowed = this.session?.allowedActions;
    for (const button of this.root?.querySelectorAll('[data-object-action]') || []) {
      const action = button.dataset.objectAction;
      button.hidden = !!allowed && !allowed.has(action);
    }
  }

  _releaseMoveCamera() {
    if (!this.moveCameraActive) return;
    this.cameraController?.unlock(60);
    this.moveCameraActive = false;
  }

  _showUndo(name) {
    clearTimeout(this.undoTimer);
    this.undoLabel.textContent = `已移除“${name}”`;
    this.undoToast?.classList.add('visible');
    this.undoTimer = setTimeout(() => this._hideUndo(), 6000);
  }

  _hideUndo() {
    clearTimeout(this.undoTimer);
    this.undoToast?.classList.remove('visible');
  }
}
