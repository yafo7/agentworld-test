import { CHII_EQUIPMENT_ITEMS } from '../data/equipmentCatalog.js';

const CATEGORY_LABELS = Object.freeze({
  snack: '随身点心',
  toy: '快乐机器',
  tool: '认真工具',
});

export class InventoryPanel {
  constructor({
    root = document.getElementById('chii-inventory'),
    items = CHII_EQUIPMENT_ITEMS,
  } = {}) {
    if (!root) throw new Error('Inventory root is required');
    this.root = root;
    this.items = items;
    this.selectedId = items[0]?.id || null;
    this.equippedId = null;
    this.busy = false;
    this.handlers = {};

    this.grid = root.querySelector('[data-inventory-grid]');
    this.name = root.querySelector('[data-inventory-name]');
    this.category = root.querySelector('[data-inventory-category]');
    this.status = root.querySelector('[data-inventory-status]');
    this.equipButton = root.querySelector('[data-inventory-equip]');
    this.clearButton = root.querySelector('[data-inventory-clear]');
    this.closeButton = root.querySelector('[data-inventory-close]');

    this.renderGrid();
    this.renderSelection();

    this.equipButton?.addEventListener('click', () => {
      if (!this.busy && this.selectedId) this.handlers.equip?.(this.selectedId);
    });
    this.clearButton?.addEventListener('click', () => {
      if (!this.busy) this.handlers.clear?.();
    });
    this.closeButton?.addEventListener('click', () => this.handlers.close?.());
    root.addEventListener('click', event => {
      if (event.target === root) this.handlers.close?.();
    });
  }

  on(name, handler) {
    this.handlers[name] = handler;
    return this;
  }

  setOpen(open) {
    this.root.hidden = !open;
    this.root.classList.toggle('is-open', open);
    this.root.setAttribute('aria-hidden', String(!open));
    if (open) {
      requestAnimationFrame(() => {
        this.root.querySelector(`[data-item-id="${this.selectedId}"]`)?.focus();
      });
    }
  }

  isOpen() {
    return !this.root.hidden;
  }

  setEquipped(itemId) {
    this.equippedId = itemId || null;
    this.renderGrid();
    this.renderSelection();
  }

  setBusy(busy, message = '') {
    this.busy = Boolean(busy);
    this.root.classList.toggle('is-busy', this.busy);
    for (const button of this.root.querySelectorAll('button')) {
      if (!button.matches('[data-inventory-close]')) button.disabled = this.busy;
    }
    if (message) this.setStatus(message, this.busy ? 'working' : 'ready');
    this.renderSelection();
  }

  setStatus(message, state = 'ready') {
    this.status.textContent = message;
    this.status.dataset.state = state;
  }

  setThumbnails(thumbnails) {
    for (const [itemId, dataUrl] of thumbnails) {
      const image = this.grid.querySelector(`[data-item-id="${itemId}"] img`);
      if (image) {
        image.src = dataUrl;
        image.hidden = false;
      }
    }
  }

  renderGrid() {
    const buttons = this.items.map(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inventory-slot';
      button.dataset.itemId = item.id;
      button.style.setProperty('--item-accent', item.accent);
      button.classList.toggle('is-selected', item.id === this.selectedId);
      button.classList.toggle('is-equipped', item.id === this.equippedId);
      button.setAttribute('aria-pressed', String(item.id === this.selectedId));
      button.setAttribute('aria-label', `${item.name}${item.id === this.equippedId ? '，已拿在手里' : ''}`);

      const image = document.createElement('img');
      image.alt = '';
      image.hidden = true;
      const fallback = document.createElement('span');
      fallback.className = 'inventory-item-fallback';
      fallback.textContent = item.shortName.slice(0, 2);
      const label = document.createElement('strong');
      label.textContent = item.shortName;
      const equipped = document.createElement('span');
      equipped.className = 'inventory-equipped-mark';
      equipped.textContent = '手持';

      button.append(image, fallback, label, equipped);
      button.addEventListener('click', () => {
        if (this.busy) return;
        this.selectedId = item.id;
        this.renderGrid();
        this.renderSelection();
        this.handlers.select?.(item.id);
      });
      return button;
    });

    while (buttons.length < 12) {
      const empty = document.createElement('span');
      empty.className = 'inventory-slot is-empty';
      empty.setAttribute('aria-hidden', 'true');
      empty.innerHTML = '<i></i><i></i><i></i>';
      buttons.push(empty);
    }
    this.grid.replaceChildren(...buttons);
  }

  renderSelection() {
    const item = this.items.find(candidate => candidate.id === this.selectedId);
    if (!item) return;
    this.name.textContent = item.name;
    this.category.textContent = CATEGORY_LABELS[item.category] || '岛上物件';
    this.equipButton.textContent = item.id === this.equippedId ? '已经拿着啦' : '拿在右手';
    this.equipButton.disabled = this.busy || item.id === this.equippedId;
    this.clearButton.disabled = this.busy || !this.equippedId;
  }
}
