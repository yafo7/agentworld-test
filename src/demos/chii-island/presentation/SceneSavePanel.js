const RESET_CONFIRM_WINDOW_MS = 5000;

function formatSavedAt(savedAt) {
  if (!savedAt) return '空记录';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(savedAt));
}

export class SceneSavePanel {
  constructor({
    persistence,
    pageLoading,
    root = document,
    confirmWindowMs = RESET_CONFIRM_WINDOW_MS,
  }) {
    if (!persistence) throw new TypeError('SceneSavePanel requires scene persistence');
    this.persistence = persistence;
    this.pageLoading = pageLoading;
    this.confirmWindowMs = confirmWindowMs;
    this.slotButtons = [...root.querySelectorAll('[data-scene-save-slot]')];
    this.recordButton = root.getElementById?.('btn-scene-record')
      || root.querySelector?.('#btn-scene-record');
    this.resetButton = root.getElementById?.('btn-scene-reset')
      || root.querySelector?.('#btn-scene-reset');
    this.status = root.getElementById?.('scene-save-status')
      || root.querySelector?.('#scene-save-status');
    this.selectedSlot = persistence.getSelectedSlot();
    this.confirmUntil = 0;
    this.confirmTimer = null;
    this.busy = false;
    this.unbindStatus = persistence.onStatus(status => this._showStatus(status));
    this._onSlotClick = event => this.selectSlot(Number(event.currentTarget.dataset.sceneSaveSlot));
    this._onRecord = () => this.record();
    this._onReset = () => this.reset();

    for (const button of this.slotButtons) button.addEventListener('click', this._onSlotClick);
    this.recordButton?.addEventListener('click', this._onRecord);
    this.resetButton?.addEventListener('click', this._onReset);
    this.render();
  }

  selectSlot(slot) {
    if (this.busy || !Number.isInteger(slot)) return;
    this.selectedSlot = this.persistence.setSelectedSlot(slot);
    this._clearResetConfirmation();
    this.render();
  }

  record() {
    if (this.busy) return;
    this.busy = true;
    try {
      this.persistence.record(this.selectedSlot);
      this._setStatus(`记录 ${this.selectedSlot + 1} 已经收好，可以继续折腾。`, 'saved');
    } catch (error) {
      this._setStatus(`这次没有记住：${error.message}`, 'error');
    } finally {
      this.busy = false;
      this.render();
    }
  }

  reset() {
    if (this.busy) return;
    const record = this.persistence.getRecords()[this.selectedSlot];
    if (!record) {
      this._setStatus(`记录 ${this.selectedSlot + 1} 还是空的。`, 'empty');
      return;
    }
    const now = Date.now();
    if (now > this.confirmUntil) {
      this.confirmUntil = now + this.confirmWindowMs;
      this.resetButton.textContent = '再按一次确认恢复';
      this.resetButton.classList.add('is-confirming');
      this._setStatus('会丢弃记录之后的改动，再按一次才会恢复。', 'warning');
      clearTimeout(this.confirmTimer);
      this.confirmTimer = setTimeout(() => {
        this._clearResetConfirmation();
        this.render();
      }, this.confirmWindowMs);
      return;
    }

    this.busy = true;
    try {
      this.persistence.resetToRecord(this.selectedSlot);
      this.pageLoading?.reload({
        title: `正在翻回记录 ${this.selectedSlot + 1}`,
        detail: '小岛把后来的改动先收起来，很快就回到那一版。',
      });
    } catch (error) {
      this.busy = false;
      this._clearResetConfirmation();
      this._setStatus(`恢复失败：${error.message}`, 'error');
      this.render();
    }
  }

  render() {
    const records = this.persistence.getRecords();
    for (const button of this.slotButtons) {
      const slot = Number(button.dataset.sceneSaveSlot);
      const active = slot === this.selectedSlot;
      const record = records[slot];
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      const time = button.querySelector('[data-scene-save-time]');
      if (time) time.textContent = formatSavedAt(record?.savedAt);
      button.dataset.state = record ? 'saved' : 'empty';
    }
    if (this.recordButton) this.recordButton.disabled = this.busy;
    if (this.resetButton) {
      this.resetButton.disabled = this.busy || !records[this.selectedSlot];
      if (Date.now() > this.confirmUntil) {
        this.resetButton.textContent = 'Reset 恢复';
        this.resetButton.classList.remove('is-confirming');
      }
    }
    if (!this.status?.textContent) {
      this._setStatus('场景会自动记忆；Record 用来冻结一个满意版本。', 'ready');
    }
  }

  dispose() {
    clearTimeout(this.confirmTimer);
    this.unbindStatus?.();
    for (const button of this.slotButtons) button.removeEventListener('click', this._onSlotClick);
    this.recordButton?.removeEventListener('click', this._onRecord);
    this.resetButton?.removeEventListener('click', this._onReset);
  }

  _showStatus(status) {
    if (!status?.message) return;
    this._setStatus(status.message, status.state);
  }

  _setStatus(message, state = 'ready') {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.dataset.state = state;
  }

  _clearResetConfirmation() {
    this.confirmUntil = 0;
    clearTimeout(this.confirmTimer);
    this.confirmTimer = null;
    this.resetButton?.classList.remove('is-confirming');
  }
}

export { RESET_CONFIRM_WINDOW_MS as SCENE_SAVE_RESET_CONFIRM_WINDOW_MS };
