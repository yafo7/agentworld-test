import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.CHII_VERIFY_URL || 'http://127.0.0.1:5173/src/demos/chii-island/?church-town';
const output = '.tmp-refactor';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__chiiInventory && window.__petManager?.pets?.every(p => p._modelGroup), null, { timeout: 90000 });
    await page.locator('#chii-page-loader').waitFor({ state: 'hidden', timeout: 30000 });
    const size = viewport.width;
    await page.screenshot({ path: `${output}/after-world-${size}.png` });
    await page.keyboard.press('Escape');
    await page.locator('#mgmt-panel.visible').waitFor();
    await page.screenshot({ path: `${output}/after-settings-${size}.png` });
    const settings = await page.evaluate(() => {
      const root = document.querySelector('#mgmt-panel');
      const card = root.querySelector('.mgmt-card').getBoundingClientRect();
      return {
        focused: document.activeElement.id,
        fits: card.left >= 0 && card.top >= 0 && card.right <= innerWidth && card.bottom <= innerHeight,
        sections: root.querySelectorAll('.mgmt-section').length,
        scrolls: root.querySelector('.mgmt-content').scrollHeight > root.querySelector('.mgmt-content').clientHeight,
      };
    });
    assert.equal(settings.focused, 'btn-close-mgmt');
    assert.equal(settings.fits, true);
    // Tab wraps within the dialog; Escape remains owned by the game's input router.
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.colliderStrategy), 'legacy-bounds');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-close-mgmt');
    await page.locator('#btn-open-world-portal').click();
    await page.locator('.world-portal-entry').first().waitFor();
    await page.screenshot({ path: `${output}/after-worlds-${size}.png` });
    await page.keyboard.press('Escape');
    await page.locator('#world-portal-panel').waitFor({ state: 'hidden' });
    await page.keyboard.press('KeyB');
    await page.locator('#chii-inventory').waitFor({ state: 'visible' });
    const inventory = await page.evaluate(() => {
      const panel = window.__chiiInventory.panel;
      const slots = [...panel.grid.querySelectorAll('[data-item-id]')];
      const thumbnail = slots[0].querySelector('img');
      const previousSource = thumbnail.src;
      const previousHidden = thumbnail.hidden;
      slots[1].focus();
      slots[1].click();
      return {
        sameNode: slots[0] === panel.grid.querySelector('[data-item-id]'),
        sameThumbnail: thumbnail === slots[0].querySelector('img') && thumbnail.src === previousSource && thumbnail.hidden === previousHidden,
        focused: document.activeElement === slots[1],
        selected: panel.selectedId === slots[1].dataset.itemId,
      };
    });
    assert.deepEqual(inventory, { sameNode: true, sameThumbnail: true, focused: true, selected: true });
    const before = await page.evaluate(() => window.__player.mesh.position.toArray());
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(250);
    await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => window.__player.mesh.position.toArray());
    assert.deepEqual(after, before, 'inventory must retain its movement lock');
    await page.screenshot({ path: `${output}/after-inventory-${size}.png` });
    await page.keyboard.press('Escape');
    await page.locator('#chii-inventory').waitFor({ state: 'hidden' });
    const hud = await page.evaluate(async () => {
      const { RuntimeHUD } = await import('/src/demos/chii-island/systems/RuntimeHUD.js');
      const view = new RuntimeHUD({ renderer: window.__renderer, physics: {} });
      view.setWorldStatus('测试区域', 'momo');
      const observer = new MutationObserver(() => {});
      observer.observe(view.regionEl, { childList: true, characterData: true, subtree: true });
      for (let i = 0; i < 300; i++) view.setWorldStatus('测试区域', 'momo');
      const writes = observer.takeRecords().length;
      observer.disconnect();
      view.dispose();
      return { repeatedWrites: writes };
    });
    assert.equal(hud.repeatedWrites, 0);
    const portal = await page.evaluate(async () => {
      const { WorldPortalPanel } = await import('/src/demos/chii-island/presentation/WorldPortalPanel.js');
      const root = document.createElement('div');
      const list = document.createElement('div');
      const close = document.createElement('button');
      const back = document.createElement('button');
      root.append(close, list, back);
      document.body.append(root);
      const requests = [];
      const panel = new WorldPortalPanel({ root, list, closeButton: close, returnButton: back,
        session: { currentWorldId: 'main', listWorlds: () => new Promise(resolve => requests.push(resolve)) } });
      const old = panel.setOpen(true);
      await panel.setOpen(false);
      const fresh = panel.setOpen(true);
      requests[1]([{ id: 'new', name: '<img src=x onerror=alert(1)>', mapNumber: 'WF', sourceMapVersion: 1 }]);
      await fresh;
      requests[0]([{ id: 'old', name: 'stale' }]);
      await old;
      const latestWins = list.querySelector('button')?.dataset.worldId === 'new';
      const literalText = list.querySelector('strong')?.textContent === '<img src=x onerror=alert(1)>' && !list.querySelector('img');
      const pending = panel.setOpen(true);
      panel.dispose();
      const before = list.textContent;
      requests[2]([{ id: 'late', name: 'late' }]);
      await pending;
      const disposedStable = before === list.textContent && !panel.isOpen();
      root.remove();
      return { latestWins, literalText, disposedStable };
    });
    assert.deepEqual(portal, { latestWins: true, literalText: true, disposedStable: true });
    const dialogue = await page.evaluate(async () => {
      const { createDialogueSystem } = await import('/src/demos/chii-island/systems/DialogueSystem.js');
      const dialogue = createDialogueSystem();
      let settled = false;
      const result = dialogue.askInput({ speakerName: 'momo', text: '今天想做些什么？' }).then(value => { settled = true; return value; });
      const input = document.querySelector('.dialogue-input');
      const focused = document.activeElement === input;
      input.value = '花园';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
      await Promise.resolve();
      const composingPreserved = !settled && dialogue.isActive();
      dialogue.dispose();
      const cancelled = await result === null;
      await new Promise(resolve => setTimeout(resolve, 150));
      return { focused, composingPreserved, cancelled };
    });
    assert.deepEqual(dialogue, { focused: true, composingPreserved: true, cancelled: true });
    results.push({ viewport, settings, inventory, hud, portal, dialogue });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/ui-verification.json`, JSON.stringify({ passed: true, results, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, results, errors }, null, 2));
} finally {
  await browser.close();
}
