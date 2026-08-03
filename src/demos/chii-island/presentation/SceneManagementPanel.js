function elementsFromDocument(documentRef) {
  return {
    root: documentRef?.getElementById('mgmt-panel'),
    closeButton: documentRef?.getElementById('btn-close-mgmt'),
    collisionCheckbox: documentRef?.getElementById('chk-collision'),
    performanceCheckbox: documentRef?.getElementById('chk-performance'),
    colliderButtons: [...(documentRef?.querySelectorAll('[data-collider-strategy]') || [])],
    sceneStyleButtons: [...(documentRef?.querySelectorAll('[data-scene-style]') || [])],
    renderStyleButtons: [...(documentRef?.querySelectorAll('[data-render-style]') || [])],
    renderQualityButtons: [...(documentRef?.querySelectorAll('[data-render-quality]') || [])],
    postProcessingCheckbox: documentRef?.getElementById('chk-post-processing'),
    auditButton: documentRef?.getElementById('btn-world-tuning-audit'),
    auditStatus: documentRef?.getElementById('world-tuning-audit-status'),
    replayButton: documentRef?.getElementById('btn-replay-act-zero'),
  };
}

export class SceneManagementPanel {
  constructor({
    documentRef = globalThis.document,
    elements = elementsFromDocument(documentRef),
    sceneStyle,
    beforeOpen = null,
    onCollisionVisibleChange = null,
    onPerformanceVisibleChange = null,
    getColliderStrategy,
    onColliderStrategySelected,
    onSceneStyleSelected,
    getRenderSettings,
    onRenderStyleSelected,
    onRenderQualitySelected,
    onPostProcessingChange,
    onAudit,
    onReplay,
  } = {}) {
    if (!elements.root) throw new Error('Scene management panel root is required');
    this.document = documentRef;
    this.elements = elements;
    this.sceneStyle = sceneStyle;
    this.beforeOpen = beforeOpen;
    this.callbacks = {
      onCollisionVisibleChange,
      onPerformanceVisibleChange,
      getColliderStrategy,
      onColliderStrategySelected,
      onSceneStyleSelected,
      getRenderSettings,
      onRenderStyleSelected,
      onRenderQualitySelected,
      onPostProcessingChange,
      onAudit,
      onReplay,
    };
    this.abortController = new AbortController();
    this.open = elements.root.classList.contains('visible');
    this.disposed = false;
    this._bind();
    this._syncSceneStyle();
    this.syncColliderStrategy();
    this.syncRenderSettings();
    this.setOpen(this.open);
  }

  _listen(target, type, listener) {
    target?.addEventListener(type, listener, { signal: this.abortController.signal });
  }

  _bind() {
    const elements = this.elements;
    this._listen(elements.root, 'click', event => {
      if (event.target === elements.root) this.setOpen(false);
    });
    this._listen(elements.closeButton, 'click', () => this.setOpen(false));
    this._listen(elements.collisionCheckbox, 'change', event => {
      this.callbacks.onCollisionVisibleChange?.(event.currentTarget.checked);
    });
    this._listen(elements.performanceCheckbox, 'change', event => {
      this.callbacks.onPerformanceVisibleChange?.(event.currentTarget.checked);
    });
    for (const button of elements.colliderButtons) {
      this._listen(button, 'click', () => {
        const strategy = button.dataset.colliderStrategy;
        this.callbacks.onColliderStrategySelected?.(strategy);
        this.syncColliderStrategy();
      });
    }
    for (const button of elements.sceneStyleButtons) {
      this._listen(button, 'click', () => this.callbacks.onSceneStyleSelected?.(button.dataset.sceneStyle));
    }
    for (const button of elements.renderStyleButtons) {
      this._listen(button, 'click', () => {
        this.callbacks.onRenderStyleSelected?.(button.dataset.renderStyle);
        this.syncRenderSettings();
      });
    }
    for (const button of elements.renderQualityButtons) {
      this._listen(button, 'click', () => {
        this.callbacks.onRenderQualitySelected?.(button.dataset.renderQuality);
        this.syncRenderSettings();
      });
    }
    this._listen(elements.postProcessingCheckbox, 'change', event => {
      this.callbacks.onPostProcessingChange?.(event.currentTarget.checked);
      this.syncRenderSettings();
    });
    this._listen(elements.auditButton, 'click', () => this._runAudit());
    this._listen(elements.replayButton, 'click', () => {
      this.setOpen(false);
      this.callbacks.onReplay?.();
    });
  }

  setOpen(open) {
    if (this.disposed) return false;
    const next = Boolean(open);
    if (next && this.beforeOpen?.() === false) return false;
    this.open = next;
    this.elements.root.classList.toggle('visible', next);
    this.elements.root.setAttribute('aria-hidden', String(!next));
    if (next) this.document?.exitPointerLock?.();
    return true;
  }

  toggle() {
    return this.setOpen(!this.open);
  }

  isOpen() {
    return this.open;
  }

  syncColliderStrategy() {
    const current = this.callbacks.getColliderStrategy?.();
    for (const button of this.elements.colliderButtons) {
      const active = button.dataset.colliderStrategy === current;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  syncRenderSettings() {
    const settings = this.callbacks.getRenderSettings?.();
    if (!settings) return;
    for (const button of this.elements.renderStyleButtons) {
      const active = button.dataset.renderStyle === settings.style;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const button of this.elements.renderQualityButtons) {
      const active = button.dataset.renderQuality === settings.quality;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    if (this.elements.postProcessingCheckbox) {
      this.elements.postProcessingCheckbox.checked = settings.postProcessing;
    }
  }

  _syncSceneStyle() {
    for (const button of this.elements.sceneStyleButtons) {
      const active = button.dataset.sceneStyle === this.sceneStyle;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  _runAudit() {
    const snapshot = this.callbacks.onAudit?.();
    if (!snapshot || !this.elements.auditStatus) return;
    const abnormal = snapshot.counts?.out_of_profile || 0;
    const soft = snapshot.placement?.softOverlaps?.length || 0;
    this.elements.auditStatus.textContent = abnormal || snapshot.warnings?.length
      ? `需留意 ${abnormal} 个比例，${soft} 组活动间距`
      : `比例正常，共 ${snapshot.objects?.length || 0} 个场景物件`;
  }

  dispose() {
    if (this.disposed) return;
    this.setOpen(false);
    this.disposed = true;
    this.abortController.abort();
  }
}
