const QUALITY = Object.freeze({ low: 0.5, medium: 0.68, high: 0.86, ultra: 1 });

export class WorldForgeRenderPresentationAdapter {
  constructor({ host }) {
    this.host = host;
    this.models = new Set();
    this.settings = { style: 'forge', quality: 'high', postProcessing: true };
  }

  registerModel(root) {
    if (!root || this.models.has(root)) return false;
    this.models.add(root);
    if (root.parent && root.parent !== this.host.gameplayRoot) this.host.gameplayRoot.attach(root);
    else if (!root.parent) this.host.gameplayRoot.add(root);
    root.traverse(object => {
      if (object.isMesh && !object.isInstancedMesh) this.host.runtime.meshRegistry.set(object.uuid, object);
    });
    return true;
  }

  unregisterModel(root) {
    if (!this.models.delete(root)) return false;
    root.traverse(object => {
      if (object.isMesh) this.host.runtime.meshRegistry.delete(object.uuid);
    });
    return true;
  }

  render(dt) { this.host.tick(dt); }
  resize(width, height) { this.host.setSize(width, height); }

  setStyle() {
    this.host.setRenderScheme(this.host.scheme);
    return 'forge';
  }

  setQuality(value) {
    const quality = Object.hasOwn(QUALITY, value) ? value : 'high';
    this.settings.quality = quality;
    this.host.runtime.setAdaptiveQuality(QUALITY[quality]);
    return quality;
  }

  setPostProcessing(enabled) {
    this.settings.postProcessing = enabled !== false;
    return this.settings.postProcessing;
  }

  getSettings() { return { ...this.settings }; }
  getCapabilities() {
    return {
      source: 'worldforge-studio',
      renderPipeline: true,
      styles: ['forge'],
      qualityTiers: Object.keys(QUALITY),
      postProcessing: ['worldforge-render-scheme'],
      fallback: 'direct-renderer',
    };
  }

  dispose() {
    for (const root of [...this.models]) this.unregisterModel(root);
    this.host.dispose();
  }
}
