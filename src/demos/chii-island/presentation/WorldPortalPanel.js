import { CHII_MAIN_WORLD_ID } from '../data/worldForgeWorlds.js';
import { ModalFocusController } from '../../../engine/ui/ModalFocusController.js';

export class WorldPortalPanel {
  constructor({ root, list, closeButton, returnButton, session } = {}) {
    if (!root || !list || !session) throw new Error('WorldPortalPanel requires root, list and session');
    this.root = root;
    this.list = list;
    this.closeButton = closeButton;
    this.returnButton = returnButton;
    this.session = session;
    this.abortController = new AbortController();
    this.open = false;
    this.disposed = false;
    this.requestId = 0;
    this.document = root.ownerDocument || globalThis.document;
    this.focus = new ModalFocusController(root);
    this._listen(root, 'click', event => {
      if (event.target === root) this.setOpen(false);
    });
    this._listen(closeButton, 'click', () => this.setOpen(false));
    this._listen(returnButton, 'click', () => this._chooseWorld(() => this.session.returnToIsland()));
    this._listen(list, 'click', event => {
      const button = event.target.closest?.('[data-world-id]');
      if (button && list.contains(button) && !button.disabled) this._chooseWorld(() => this.session.enter(button.dataset.worldId));
    });
    this.setOpen(false);
  }

  _listen(target, type, listener) {
    target?.addEventListener(type, listener, { signal: this.abortController.signal });
  }

  async setOpen(open) {
    if (this.disposed) return;
    const requestId = ++this.requestId;
    this.open = Boolean(open);
    this.root.classList.toggle('visible', this.open);
    this.root.setAttribute('aria-hidden', String(!this.open));
    this.root.inert = !this.open;
    this.focus.setOpen(this.open, this.closeButton);
    if (!this.open) {
      this.session.cancelPendingTransition?.();
      return;
    }
    this.document?.exitPointerLock?.();
    this._setBusy(false);
    this._showMessage('world-portal-loading', '正在整理世界地图……');
    try {
      const worlds = await this.session.listWorlds();
      if (!this.open || this.disposed || requestId !== this.requestId) return;
      this._render(worlds);
    } catch (error) {
      if (!this.open || this.disposed || requestId !== this.requestId) return;
      this._showMessage('world-portal-error', `地图目录读取失败：${error.message}`);
    }
  }

  toggle() {
    return this.setOpen(!this.open);
  }

  isOpen() {
    return this.open;
  }

  _render(worlds) {
    this.list.replaceChildren();
    for (const world of worlds) {
      const current = world.id === this.session.currentWorldId;
      const button = this.document.createElement('button');
      button.type = 'button';
      button.className = 'world-portal-entry';
      button.disabled = current;
      button.dataset.current = String(current);
      button.dataset.worldId = world.id;
      const parts = [
        ['span', 'world-portal-number', world.mapNumber || 'WF'],
        ['strong', '', world.name],
        ['small', '', world.description || '来自 WorldForge 的地图'],
        ['span', 'world-portal-version', current ? '当前世界' : `v${world.sourceMapVersion}`],
      ];
      for (const [tag, className, text] of parts) {
        const element = this.document.createElement(tag);
        element.className = className;
        element.textContent = text;
        button.appendChild(element);
      }
      this.list.appendChild(button);
    }
    this.returnButton.hidden = this.session.currentWorldId === CHII_MAIN_WORLD_ID;
  }

  _showMessage(className, message) {
    const element = this.document.createElement('div');
    element.className = className;
    element.textContent = message;
    element.setAttribute('role', 'status');
    this.list.replaceChildren(element);
  }

  async _chooseWorld(transition) {
    if (this.disposed || !this.open || this.session.isTransitioning?.()) return;
    const requestId = this.requestId;
    try {
      this._setBusy(true);
      const completed = await transition();
      if (!completed && this.open && requestId === this.requestId) this._setBusy(false);
    } catch (error) {
      if (this.disposed || !this.open || requestId !== this.requestId) return;
      this._setBusy(false);
      let status = this.root.querySelector('.world-portal-transition-error');
      if (!status) {
        status = this.document.createElement('p');
        status.className = 'world-portal-transition-error';
        status.setAttribute('role', 'alert');
        this.returnButton.before(status);
      }
      status.textContent = `暂时没能出发：${error.message}。可以再试一次。`;
    }
  }

  _setBusy(busy) {
    this.root.setAttribute('aria-busy', String(busy));
    this.root.querySelector('.world-portal-transition-error')?.remove();
    for (const button of this.list.querySelectorAll('[data-world-id]')) {
      button.disabled = busy || button.dataset.current === 'true';
    }
    this.returnButton.disabled = busy;
  }

  dispose() {
    if (this.disposed) return;
    this.setOpen(false);
    this.disposed = true;
    this.abortController.abort();
    this.focus.dispose();
  }
}
