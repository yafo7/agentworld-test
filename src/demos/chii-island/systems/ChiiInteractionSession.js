export class ChiiInteractionSession {
  constructor({
    player,
    thirdPersonCamera,
    dialogueSystem,
    dialogueCamera,
    pastoralSlice,
    forestTempleSystem,
    regionGameplay,
    forestTrophy,
    forestTent,
    documentTarget = globalThis.document,
    logger = console,
  } = {}) {
    if (
      !player
      || !thirdPersonCamera
      || !dialogueSystem
      || !dialogueCamera
      || !pastoralSlice
      || !forestTempleSystem
      || !regionGameplay
    ) {
      throw new TypeError('ChiiInteractionSession requires interaction and presentation owners');
    }
    this.player = player;
    this.thirdPersonCamera = thirdPersonCamera;
    this.dialogueSystem = dialogueSystem;
    this.dialogueCamera = dialogueCamera;
    this.pastoralSlice = pastoralSlice;
    this.forestTempleSystem = forestTempleSystem;
    this.regionGameplay = regionGameplay;
    this.forestTrophy = forestTrophy;
    this.forestTent = forestTent;
    this.documentTarget = documentTarget;
    this.logger = logger;
    this.routeActive = false;
    this.disposed = false;
    this.operationVersion = 0;
    this.current = null;

    this.dialogueSystem.setOnDialogueEnd(() => this._handleDialogueEnd());
  }

  isActive() {
    return !this.disposed && this.routeActive;
  }

  beginPastoralPetDialogue(pet) {
    return this._run({
      label: 'Pastoral',
      routeActive: false,
      setup: () => {
        this.dialogueSystem.setPetSpeakerName(pet?._petName || 'pet');
        this.dialogueCamera.focusDialogue(pet);
      },
      task: () => this.pastoralSlice.interact(pet),
      cleanup: () => this.dialogueCamera.release(pet),
    });
  }

  beginTownPetDialogue(pet) {
    return this._run({
      label: 'ChurchTown',
      setup: () => {
        this.dialogueSystem.setPetSpeakerName(pet?._petName || 'pet');
        this.dialogueCamera.setDialogueLock(true, pet);
      },
      task: () => (pet?._hasIntroduced === false
        ? this.forestTempleSystem.introducePet(pet)
        : this.regionGameplay.interactTownPet(pet, this.dialogueSystem)),
      cleanup: () => this.dialogueCamera.setDialogueLock(false, pet),
    });
  }

  beginForestInteraction(hit) {
    const target = hit?.type === 'trophy' ? this.forestTrophy : this.forestTent;
    return this._run({
      label: 'ForestTemple',
      setup: () => {
        this.documentTarget?.exitPointerLock?.();
        if (target?.mesh?.position) {
          this.player.lockTo(target.mesh.position.x, target.mesh.position.z);
          hit?.pet?.lockFacing?.(target.mesh.position.x, target.mesh.position.z);
        }
      },
      task: () => this.forestTempleSystem.interact(hit),
      cleanup: () => {
        this.player.unlock();
        hit?.pet?.unlockFacing?.();
      },
    });
  }

  beginGeneratedPetIntroduction(pet) {
    return this._run({
      label: 'ForestTemple',
      setup: () => this.dialogueCamera.setDialogueLock(true, pet),
      task: () => this.forestTempleSystem.introducePet(pet),
      cleanup: () => this.dialogueCamera.setDialogueLock(false, pet),
    });
  }

  _run({ label, routeActive = true, setup, task, cleanup }) {
    if (this.disposed || this.current) return Promise.resolve(false);
    const version = ++this.operationVersion;
    this.routeActive = routeActive;
    try {
      setup?.();
    } catch (error) {
      this.routeActive = false;
      this._cleanup(cleanup);
      this._warn(label, error);
      return Promise.resolve(false);
    }

    const current = { version, cleanup, promise: null };
    this.current = current;
    current.promise = Promise.resolve()
      .then(task)
      .catch(error => {
        if (!this.disposed && this.current?.version === version) this._warn(label, error);
        return false;
      })
      .finally(() => this._finish(version));
    return current.promise;
  }

  _finish(version) {
    if (this.current?.version !== version) return;
    const { cleanup } = this.current;
    this.current = null;
    this.routeActive = false;
    this._cleanup(cleanup);
  }

  _handleDialogueEnd() {
    if (this.disposed) return;
    this.routeActive = false;
    this.thirdPersonCamera.unlock(60);
    this.player.unlock();
  }

  _cleanup(cleanup) {
    try {
      cleanup?.();
    } catch (error) {
      this._warn('cleanup', error);
    }
  }

  _warn(label, error) {
    this.logger.warn?.(`[${label}] interaction failed:`, error?.message || error);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.operationVersion += 1;
    this.dialogueSystem.setOnDialogueEnd(null);
    this.dialogueSystem.hide?.();
    const cleanup = this.current?.cleanup;
    this.current = null;
    this.routeActive = false;
    this._cleanup(cleanup);
  }
}
