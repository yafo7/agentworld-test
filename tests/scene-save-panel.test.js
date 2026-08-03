import assert from 'node:assert/strict';
import test from 'node:test';
import { SceneSavePanel } from '../src/demos/chii-island/presentation/SceneSavePanel.js';

function classList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    toggle(value, enabled) {
      if (enabled) values.add(value);
      else values.delete(value);
    },
    contains(value) { return values.has(value); },
  };
}

function button(slot = null) {
  const listeners = new Map();
  const time = { textContent: '' };
  return {
    dataset: slot == null ? {} : { sceneSaveSlot: String(slot) },
    classList: classList(),
    textContent: '',
    disabled: false,
    attributes: new Map(),
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    setAttribute(name, value) { this.attributes.set(name, value); },
    querySelector(selector) { return selector === '[data-scene-save-time]' ? time : null; },
    click() { listeners.get('click')?.({ currentTarget: this }); },
    time,
  };
}

function rootElements() {
  const slots = [button(0), button(1), button(2)];
  const record = button();
  const reset = button();
  const status = { textContent: '', dataset: {} };
  const byId = new Map([
    ['btn-scene-record', record],
    ['btn-scene-reset', reset],
    ['scene-save-status', status],
  ]);
  return {
    slots,
    record,
    reset,
    status,
    root: {
      querySelectorAll(selector) {
        return selector === '[data-scene-save-slot]' ? slots : [];
      },
      getElementById(id) { return byId.get(id) || null; },
      querySelector(selector) { return byId.get(selector.replace('#', '')) || null; },
    },
  };
}

test('scene save panel records three selectable slots and confirms reset', () => {
  const ui = rootElements();
  const records = [null, null, null];
  let selected = 0;
  let resetSlot = null;
  let reloadCopy = null;
  const persistence = {
    getSelectedSlot: () => selected,
    setSelectedSlot(slot) { selected = slot; return slot; },
    getRecords: () => records,
    record(slot) { records[slot] = { savedAt: 1000 + slot }; },
    resetToRecord(slot) { resetSlot = slot; return records[slot]; },
    onStatus: () => () => {},
  };
  const panel = new SceneSavePanel({
    persistence,
    root: ui.root,
    confirmWindowMs: 10000,
    pageLoading: { reload(copy) { reloadCopy = copy; } },
  });

  ui.slots[2].click();
  ui.record.click();
  assert.equal(selected, 2);
  assert.equal(records[2].savedAt, 1002);
  assert.equal(ui.slots[2].classList.contains('active'), true);
  assert.equal(ui.reset.disabled, false);

  ui.reset.click();
  assert.equal(resetSlot, null);
  assert.match(ui.reset.textContent, /确认恢复/);
  ui.reset.click();
  assert.equal(resetSlot, 2);
  assert.match(reloadCopy.title, /记录 3/);

  panel.dispose();
});
