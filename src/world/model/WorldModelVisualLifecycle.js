import {
  detachMaterialTagPresentation,
  reattachMaterialTagPresentation,
} from '../../engine/model/MaterialTagPresentation.js';

function getModelRoot(entity) {
  return entity?._modelGroup || null;
}

export class WorldModelVisualLifecycle {
  constructor({ worldObjects } = {}) {
    if (!worldObjects?.onChange) {
      throw new TypeError('WorldModelVisualLifecycle worldObjects registry is required');
    }
    this.worldObjects = worldObjects;
    this._unbind = worldObjects.onChange(event => this._handleChange(event));
  }

  _handleChange(event) {
    const root = getModelRoot(event.entity);
    if (!root) return;
    if (event.type === 'removed') {
      detachMaterialTagPresentation(root);
      return;
    }
    if (event.type === 'added' && !root.userData?.materialTagPresentationReady) {
      reattachMaterialTagPresentation(root);
    }
  }

  dispose() {
    this._unbind?.();
    this._unbind = null;
  }
}
