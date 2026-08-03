function disposerFor(resource, disposer) {
  if (typeof disposer === 'function') return () => disposer(resource);
  if (typeof resource === 'function') return resource;
  if (typeof resource?.dispose === 'function') return () => resource.dispose();
  throw new TypeError('ApplicationLifecycle requires a disposer or disposable resource');
}

export class ApplicationDisposedError extends Error {
  constructor(message = 'Application lifecycle is no longer active') {
    super(message);
    this.name = 'ApplicationDisposedError';
    this.code = 'APPLICATION_DISPOSED';
  }
}

export class ApplicationLifecycle {
  constructor() {
    this.entries = [];
    this.disposed = false;
    this.abortController = new AbortController();
    this.signal = this.abortController.signal;
  }

  assertActive() {
    if (this.disposed) throw new ApplicationDisposedError();
  }

  isActive() {
    return !this.disposed;
  }

  add(resource, disposer = null) {
    const dispose = disposerFor(resource, disposer);
    if (this.disposed) {
      dispose();
      return resource;
    }
    this.entries.push(dispose);
    return resource;
  }

  listen(target, type, listener, options) {
    if (!target?.addEventListener || !target?.removeEventListener) {
      throw new TypeError('ApplicationLifecycle.listen requires an EventTarget');
    }
    target.addEventListener(type, listener, options);
    this.add(() => target.removeEventListener(type, listener, options));
    return listener;
  }

  dispose() {
    if (this.disposed) return [];
    this.disposed = true;
    this.abortController.abort();
    const errors = [];
    for (const dispose of this.entries.reverse()) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.entries.length = 0;
    return errors;
  }
}
