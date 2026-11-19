import { CHII_MAIN_WORLD_ID } from '../data/worldForgeWorlds.js';
import { setActiveWorldId } from '../data/worldSelection.js';

export class WorldSessionController {
  constructor({ currentWorldId, repository, persistence = null, pageLoading = null, selectWorld = setActiveWorldId } = {}) {
    this.currentWorldId = currentWorldId || CHII_MAIN_WORLD_ID;
    this.repository = repository;
    this.persistence = persistence;
    this.pageLoading = pageLoading;
    this.transitioning = false;
    this.pending = null;
    this.disposed = false;
    this.selectWorld = selectWorld;
  }

  async listWorlds() {
    return this.repository.list();
  }

  isTransitioning() {
    return this.transitioning || this.pending !== null;
  }

  async enter(worldId) {
    if (this.disposed || this.isTransitioning() || worldId === this.currentWorldId) return false;
    const operation = {};
    this.pending = operation;
    try {
      await this.repository.load(worldId);
      if (this.disposed || this.pending !== operation) return false;
      return this._transition(worldId);
    } finally {
      if (this.pending === operation) this.pending = null;
    }
  }

  async returnToIsland() {
    if (this.disposed || this.isTransitioning() || this.currentWorldId === CHII_MAIN_WORLD_ID) return false;
    return this._transition(CHII_MAIN_WORLD_ID);
  }

  _transition(worldId) {
    this.persistence?.flush?.();
    this.selectWorld(worldId);
    this.transitioning = true;
    if (this.pageLoading?.reload) {
      this.pageLoading.reload({ title: '正在前往新世界', detail: '小岛正在收拾行李和风景。' });
    } else {
      globalThis.location?.reload?.();
    }
    return true;
  }

  cancelPendingTransition() {
    this.pending = null;
  }

  dispose() {
    this.disposed = true;
    this.cancelPendingTransition();
  }
}
