import assert from 'node:assert/strict';
import test from 'node:test';
import { SceneManagementPanel } from '../src/demos/chii-island/presentation/SceneManagementPanel.js';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const active = force === undefined ? !this.values.has(name) : Boolean(force);
    if (active) this.values.add(name);
    else this.values.delete(name);
    return active;
  }

  remove(...names) {
    for (const name of names) this.values.delete(name);
  }
}

class FakeElement extends EventTarget {
  constructor(dataset = {}) {
    super();
    this.dataset = dataset;
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.checked = false;
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

function createElements() {
  return {
    root: new FakeElement(),
    closeButton: new FakeElement(),
    collisionCheckbox: new FakeElement(),
    performanceCheckbox: new FakeElement(),
    colliderButtons: [
      new FakeElement({ colliderStrategy: 'important-parts' }),
      new FakeElement({ colliderStrategy: 'whole-bounds' }),
    ],
    sceneStyleButtons: [
      new FakeElement({ sceneStyle: 'original' }),
      new FakeElement({ sceneStyle: 'pro' }),
    ],
    renderStyleButtons: [
      new FakeElement({ renderStyle: 'current' }),
      new FakeElement({ renderStyle: 'cel' }),
    ],
    renderQualityButtons: [
      new FakeElement({ renderQuality: 'high' }),
      new FakeElement({ renderQuality: 'low' }),
    ],
    postProcessingCheckbox: new FakeElement(),
    auditButton: new FakeElement(),
    auditStatus: new FakeElement(),
    replayButton: new FakeElement(),
  };
}

test('scene management panel projects owner state and releases all listeners', () => {
  const elements = createElements();
  let colliderStrategy = 'important-parts';
  const renderSettings = { style: 'current', quality: 'high', postProcessing: false };
  let pointerLockExits = 0;
  let collisionVisible = false;
  let replayCount = 0;
  const panel = new SceneManagementPanel({
    documentRef: { exitPointerLock() { pointerLockExits += 1; } },
    elements,
    sceneStyle: 'original',
    beforeOpen: () => true,
    onCollisionVisibleChange: value => { collisionVisible = value; },
    getColliderStrategy: () => colliderStrategy,
    onColliderStrategySelected: value => { colliderStrategy = value; },
    getRenderSettings: () => renderSettings,
    onRenderStyleSelected: value => { renderSettings.style = value; },
    onRenderQualitySelected: value => { renderSettings.quality = value; },
    onPostProcessingChange: value => { renderSettings.postProcessing = value; },
    onAudit: () => ({
      counts: { out_of_profile: 0 },
      placement: { softOverlaps: [] },
      warnings: [],
      objects: [{}, {}],
    }),
    onReplay: () => { replayCount += 1; },
  });

  assert.equal(elements.sceneStyleButtons[0].classList.contains('active'), true);
  assert.equal(elements.colliderButtons[0].classList.contains('active'), true);
  assert.equal(elements.renderStyleButtons[0].classList.contains('active'), true);

  panel.setOpen(true);
  assert.equal(panel.isOpen(), true);
  assert.equal(pointerLockExits, 1);
  assert.equal(elements.root.attributes.get('aria-hidden'), 'false');

  elements.collisionCheckbox.checked = true;
  elements.collisionCheckbox.dispatchEvent(new Event('change'));
  assert.equal(collisionVisible, true);

  elements.colliderButtons[1].dispatchEvent(new Event('click'));
  assert.equal(colliderStrategy, 'whole-bounds');
  assert.equal(elements.colliderButtons[1].classList.contains('active'), true);

  elements.renderStyleButtons[1].dispatchEvent(new Event('click'));
  elements.renderQualityButtons[1].dispatchEvent(new Event('click'));
  elements.postProcessingCheckbox.checked = true;
  elements.postProcessingCheckbox.dispatchEvent(new Event('change'));
  assert.deepEqual(renderSettings, { style: 'cel', quality: 'low', postProcessing: true });

  elements.auditButton.dispatchEvent(new Event('click'));
  assert.equal(elements.auditStatus.textContent, '比例正常，共 2 个场景物件');

  elements.replayButton.dispatchEvent(new Event('click'));
  assert.equal(replayCount, 1);
  assert.equal(panel.isOpen(), false);

  panel.dispose();
  elements.replayButton.dispatchEvent(new Event('click'));
  assert.equal(replayCount, 1);
  assert.equal(elements.root.attributes.get('aria-hidden'), 'true');
});
