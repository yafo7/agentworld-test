/**
 * Refine dialog — bottom-screen choice UI for pet-directed refinement.
 *
 * Usage:
 *   const dialog = createRefineDialog();
 *   dialog.show(
 *     '扶摇', '雷霆大雪绒',
 *     [
 *       { key: 'a', label: '用你的能力去改造它吧！', sub: '能力 - 飞翔 - 动画', type: 'ability' },
 *       { key: 'b', label: '根据本能去创作！', sub: '物种 - 鸟 - 模型', type: 'species' },
 *       { key: 'c', label: '随你的喜欢吧~', sub: '性格 - 热情 - 特效', type: 'effect' },
 *       { key: 'd', label: '希望它可以和你一样！', sub: '特征 - 毛茸茸 - 材质', type: 'material' },
 *     ],
 *     (type) => console.log('selected', type),
 *     () => console.log('cancelled')
 *   );
 */

export function createRefineDialog() {
  let container = null;
  let active = false;
  let onSelect = null;
  let onCancel = null;
  let timeoutId = null;
  let keyHandler = null;

  function _ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'refine-dialog';
    container.style.cssText = `
      position: fixed;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      z-index: 200;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      pointer-events: auto;
      min-width: 420px;
      max-width: 90vw;
    `;
    document.body.appendChild(container);
    return container;
  }

  function _render(petName, targetName, options) {
    const el = _ensureContainer();
    el.innerHTML = '';

    // Question
    const question = document.createElement('div');
    question.textContent = `${petName}：你想要怎样修改「${targetName}」？`;
    question.style.cssText = `
      background: rgba(0,0,0,0.75);
      color: #fff;
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 16px;
      text-align: center;
      backdrop-filter: blur(4px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    el.appendChild(question);

    // Options row
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
    `;

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.dataset.type = opt.type;
      btn.style.cssText = `
        background: rgba(30,30,50,0.9);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 8px;
        padding: 10px 14px;
        cursor: pointer;
        font-size: 14px;
        text-align: left;
        min-width: 180px;
        transition: background 0.15s, border-color 0.15s;
      `;
      btn.innerHTML = `
        <div style="font-weight:bold; color:#ffcc66; margin-bottom:4px;">${opt.key.toUpperCase()}. ${opt.label}</div>
        <div style="font-size:12px; color:#cccccc;">${opt.sub}</div>
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(60,60,100,0.95)';
        btn.style.borderColor = '#ffcc66';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(30,30,50,0.9)';
        btn.style.borderColor = 'rgba(255,255,255,0.2)';
      });
      btn.addEventListener('click', () => _select(opt.type));
      row.appendChild(btn);
    }

    el.appendChild(row);

    // Cancel hint
    const hint = document.createElement('div');
    hint.textContent = '按 A/B/C/D 选择，ESC 取消';
    hint.style.cssText = `
      font-size: 12px;
      color: #aaa;
      background: rgba(0,0,0,0.5);
      padding: 4px 12px;
      border-radius: 12px;
    `;
    el.appendChild(hint);
  }

  function _select(type) {
    if (!active) return;
    _cleanup();
    if (typeof onSelect === 'function') onSelect(type);
  }

  function _cancel() {
    if (!active) return;
    _cleanup();
    if (typeof onCancel === 'function') onCancel();
  }

  function _cleanup() {
    active = false;
    if (container) container.style.display = 'none';
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    onSelect = null;
    onCancel = null;
  }

  function _bindKeys(options) {
    const validKeys = new Set(options.map((o) => o.key.toLowerCase()));
    keyHandler = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        e.preventDefault();
        _cancel();
        return;
      }
      if (validKeys.has(k)) {
        e.preventDefault();
        const opt = options.find((o) => o.key.toLowerCase() === k);
        if (opt) _select(opt.type);
      }
    };
    window.addEventListener('keydown', keyHandler);
  }

  return {
    show(petName, targetName, options, onSelectCb, onCancelCb, timeoutMs = 15000) {
      if (active) this.hide();
      active = true;
      onSelect = onSelectCb;
      onCancel = onCancelCb;

      _render(petName, targetName, options);
      container.style.display = 'flex';
      _bindKeys(options);

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          console.log('[RefineDialog] Timeout, auto-cancelling');
          _cancel();
        }, timeoutMs);
      }
    },

    hide() {
      _cleanup();
    },

    isActive() {
      return active;
    },
  };
}
