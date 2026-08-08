import assert from 'node:assert/strict';
import test from 'node:test';
import { RuntimeHUD } from '../src/demos/chii-island/systems/RuntimeHUD.js';

function makeElement() {
  const classes = new Set();
  return {
    textContent: '',
    dataset: {},
    style: {},
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      toggle(value, force) {
        if (force === undefined ? !classes.has(value) : force) classes.add(value);
        else classes.delete(value);
      },
      contains(value) { return classes.has(value); },
    },
  };
}

test('activity HUD projects phase progress and optional preparation task', () => {
  const ids = [
    'runtime-job',
    'runtime-job-title',
    'runtime-job-stage',
    'runtime-region',
    'runtime-follower',
    'runtime-activity',
    'runtime-activity-title',
    'runtime-activity-stage',
    'runtime-activity-phase',
    'runtime-activity-progress-value',
    'runtime-activity-task',
    'runtime-activity-task-text',
    'runtime-activity-task-meta',
    'runtime-activity-helper',
    'runtime-perf',
  ];
  const elements = new Map(ids.map(id => [id, makeElement()]));
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById: id => elements.get(id) || null };

  try {
    const hud = new RuntimeHUD({ renderer: { info: { render: {} } }, physics: {} });
    hud.setActivityStatus('篝火晚会', '准备活动素材，顺手帮个小忙吧', {
      phase: 'preparing',
      phaseLabel: '准备',
      phaseIndex: 1,
      phaseCount: 4,
      task: { label: '先去篝火旁占个暖和的位置', complete: false },
      helper: '想提前收尾，就去找 fangk 商量',
    });

    assert.equal(elements.get('runtime-activity').classList.contains('visible'), true);
    assert.equal(elements.get('runtime-activity').dataset.phase, 'preparing');
    assert.equal(elements.get('runtime-activity-title').textContent, '篝火晚会');
    assert.equal(elements.get('runtime-activity-phase').textContent, '准备 1/4');
    assert.equal(elements.get('runtime-activity-progress-value').style.width, '25%');
    assert.equal(elements.get('runtime-activity-task').classList.contains('visible'), true);
    assert.equal(elements.get('runtime-activity-task').dataset.state, 'open');

    hud.setObjectiveNavigation({
      label: '先去篝火旁占个暖和的位置',
      distance: 18.6,
      progress: { current: 0, total: 2 },
    });
    assert.equal(elements.get('runtime-activity-task-meta').textContent, '0/2 · 19m');

    hud.setActivityStatus('篝火晚会', '节目开场啦', {
      phase: 'performing',
      phaseLabel: '活动',
      phaseIndex: 3,
      phaseCount: 4,
      task: { label: '先去篝火旁占个暖和的位置', complete: true },
    });
    assert.equal(elements.get('runtime-activity-progress-value').style.width, '75%');
    assert.equal(elements.get('runtime-activity-task').dataset.state, 'complete');

    hud.setActivityStatus(null);
    assert.equal(elements.get('runtime-activity').classList.contains('visible'), false);
  } finally {
    globalThis.document = previousDocument;
  }
});
