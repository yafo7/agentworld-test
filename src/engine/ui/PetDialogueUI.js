/**
 * Lightweight choice-based dialogue UI for pets.
 *
 * Displays a bottom-center panel with the pet's name, a line of text,
 * and action buttons. The caller receives the chosen action key:
 *   'pet' | 'follow' | 'refine' | 'close'
 */
export function createPetDialogueUI() {
  let container = null;
  let active = false;
  let currentPet = null;
  let onSelectCb = null;
  let onCloseCb = null;
  let keyHandler = null;

  function _ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'pet-dialogue-ui';
    container.style.cssText = `
      position: fixed;
      bottom: 140px;
      left: 50%;
      transform: translateX(-50%);
      min-width: 320px;
      max-width: 90vw;
      background: rgba(245, 234, 208, 0.96);
      color: #2a2330;
      border: 2px solid #2a2330;
      border-radius: 16px;
      padding: 16px 18px;
      box-shadow: 6px 6px 0 rgba(42, 35, 48, 0.35);
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      display: none;
      flex-direction: column;
      gap: 12px;
      z-index: 300;
      pointer-events: auto;
    `;

    // Backdrop to catch outside clicks
    const backdrop = document.createElement('div');
    backdrop.id = 'pet-dialogue-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.25);
      display: none;
      z-index: 299;
    `;
    backdrop.addEventListener('click', () => _close('close'));
    document.body.appendChild(backdrop);
    document.body.appendChild(container);
    return container;
  }

  function _render(pet) {
    const el = _ensureContainer();
    el.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'font-weight: bold; font-size: 16px; display: flex; align-items: center; gap: 8px;';
    const dot = document.createElement('span');
    dot.style.cssText = 'width: 10px; height: 10px; border-radius: 50%; background: #e94560;';
    header.appendChild(dot);
    header.appendChild(document.createTextNode(pet.name || '宠物'));
    el.appendChild(header);

    const line = document.createElement('div');
    line.style.cssText = 'font-size: 14px; color: #4a3f52; line-height: 1.5;';
    line.textContent = _pickGreeting(pet);
    el.appendChild(line);

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;';

    row.appendChild(_makeBtn('抚摸', 'pet', '#4a90d9'));
    row.appendChild(_makeBtn('呼喊跟随', 'follow', '#5cb85c'));
    row.appendChild(_makeBtn('一起去改造', 'refine', '#e94560'));
    row.appendChild(_makeBtn('再见', 'close', '#888'));

    el.appendChild(row);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size: 11px; color: #776b7e; margin-top: 4px;';
    hint.textContent = '按 1/2/3/4 或点击选择，Esc 关闭';
    el.appendChild(hint);
  }

  function _makeBtn(label, action, bg) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      padding: 7px 12px;
      border-radius: 8px;
      border: 2px solid #2a2330;
      background: ${bg};
      color: #fff;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
      box-shadow: 0 2px 0 #2a2330;
      transition: transform 0.05s, box-shadow 0.05s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-1px)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
    });
    btn.addEventListener('mousedown', () => {
      btn.style.transform = 'translateY(1px)';
      btn.style.boxShadow = '0 0 0 #2a2330';
    });
    btn.addEventListener('mouseup', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 2px 0 #2a2330';
    });
    btn.addEventListener('click', () => _close(action));
    return btn;
  }

  function _pickGreeting(pet) {
    const lines = [
      '今天天气不错，要一起做点什么呢？',
      '我在附近发现了一些有趣的东西～',
      '你看起来需要一点帮助？',
      '要一起去逛逛吗？',
    ];
    // Deterministic-ish based on pet name length so it feels stable per pet
    const idx = (pet.name?.length || 0) % lines.length;
    return lines[idx];
  }

  function _bindKeys() {
    if (keyHandler) return;
    keyHandler = (e) => {
      if (!active) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        _close('close');
        return;
      }
      if (e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        const actions = ['pet', 'follow', 'refine', 'close'];
        _close(actions[parseInt(e.key, 10) - 1]);
      }
    };
    window.addEventListener('keydown', keyHandler);
  }

  function _unbindKeys() {
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
  }

  function _close(action) {
    if (!active) return;
    active = false;
    if (container) container.style.display = 'none';
    const backdrop = document.getElementById('pet-dialogue-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    _unbindKeys();
    if (typeof onSelectCb === 'function') onSelectCb(action, currentPet);
    if (action === 'close' && typeof onCloseCb === 'function') onCloseCb(currentPet);
  }

  return {
    /**
     * Open the dialogue for a pet.
     * @param {Pet} pet
     * @param {(action: string, pet: Pet) => void} onSelect
     * @param {(pet: Pet) => void} [onClose]
     */
    show(pet, onSelect, onClose) {
      if (active) this.hide();
      currentPet = pet;
      onSelectCb = onSelect;
      onCloseCb = onClose;
      active = true;
      _render(pet);
      _ensureContainer().style.display = 'flex';
      const backdrop = document.getElementById('pet-dialogue-backdrop');
      if (backdrop) backdrop.style.display = 'block';
      _bindKeys();
    },

    hide() {
      _close('close');
    },

    isOpen() {
      return active;
    },

    dispose() {
      this.hide();
      const backdrop = document.getElementById('pet-dialogue-backdrop');
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (container && container.parentNode) container.parentNode.removeChild(container);
      container = null;
    },
  };
}
