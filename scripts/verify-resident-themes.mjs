import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = (process.env.CHII_VERIFY_ORIGIN || 'http://127.0.0.1:5173') + '/src/demos/chii-island/';
const output = '.agents/runtime';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
let release, animationCalls = 0, festivalCalls = 0;
const gate = new Promise(resolve => { release = resolve; });
await context.route('**/api/voxel/api/chat', async route => {
  const input = JSON.parse(route.request().postDataJSON().messages[1].content);
  let answer;
  if (input.festivalBrief) {
    festivalCalls++;
    assert.equal(input.festivalBrief.title, '灯影舞会');
    assert.equal(input.residents.length, 7);
    await gate;
    const cast = Object.fromEntries(input.residents.map(({ id }) => [id, {
      role: id === 'fangk' ? 'host' : id === 'lingq' ? 'spectator' : 'helper',
      steps: [{ eventId: 'opening', name: id === 'fangk' ? '挥手指挥合奏' : '等候合奏', seconds: 8,
        ...(id === 'fangk' ? { prompt: '挥手指挥合奏' } : { animation: 'idle' }) },
        { eventId: 'finale', name: '欣赏灯影', animation: 'idle', seconds: 8 }],
    }]));
    answer = { title: input.festivalBrief.title, locationId: 'campfire', events: [{ id: 'opening', name: '灯下合奏' }, { id: 'finale', name: '欣赏灯影' }],
      cast, links: [{ from: 'fangk', to: 'lingq', label: '开场应答' }], props: [] };
  } else {
    answer = { proposals: (input.residents || []).map(r => ({ residentId: r.residentId,
      edits: input.task === 'editThemes' ? [{ themeId: 'morning', actions: [{ name: '清晨小跑', kind: 'stroll', pace: 'run', seconds: 8 }] }] : [] })) };
  }
  await route.fulfill({ json: { ok: true, content: JSON.stringify(answer) } });
});
await context.route('**/api/voxel/api/generate/animation-quick', route => {
  animationCalls++;
  return route.fulfill({ json: { ok: true, plan: { _duration: 8, _loop: true, body: { swing: { axis: 'z', amplitude: 0.12, frequency: 1 } } } } });
});
try {
  const island = await context.newPage();
  island.setDefaultTimeout(30000);
  const enter = async () => {
    await island.goto(url + '?church-town', { waitUntil: 'domcontentloaded' });
    await island.waitForFunction(() => window.__chiiAgents?.getRuntime('fangk')?.behavior?.snapshot().live, null, { timeout: 90000 });
    await island.evaluate(() => {
      window.__chiiClimate.setManualClimate({ hour: 15 });
      window.__townSocialSystem.stopActivity('test-reset');
    });
    await island.locator('#chii-page-loader').waitFor({ state: 'hidden' });
  };
  await enter();
  const menu = island.locator('#mgmt-panel.visible');
  const launch = menu.getByRole('button', { name: '岛上节日表' });
  const openBook = async () => {
    await island.keyboard.press('Escape');
    await launch.click();
    await island.locator('#festival-dialog[open]').waitFor();
    assert.equal(await menu.count(), 0);
  };
  assert.equal(await island.locator('#festival-launch').count(), 0);
  await island.keyboard.press('KeyK');
  assert.equal(await island.locator('#festival-dialog[open]').count(), 0);
  await openBook();
  assert.equal(await island.locator('.fb-entry').count(), 4);
  await island.screenshot({ path: output + '/festival-book-list.png' });
  await island.locator('[data-entry=birthday]').click();
  assert.ok(await island.locator('.fb-node').count() >= 2);
  await island.locator('[data-action=list]').click();
  await island.locator('[data-action=plan]').click();
  for (const [field, value] of Object.entries({ title: '灯影舞会', theme: '围火赏灯', wish: '一起合奏' })) {
    await island.locator('textarea[name=' + field + ']').fill(value);
    await island.locator('.fb-interview [type=submit]').click();
  }
  await island.locator('#festival-dialog').waitFor({ state: 'hidden' });
  await openBook();
  await island.locator('.fb-job').getByText(/忙碌中/).waitFor();
  await island.keyboard.press('Escape');
  await menu.waitFor();
  assert.equal(await island.evaluate(() => document.activeElement.id), 'btn-open-festival-book');
  await island.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  const before = await island.evaluate(() => window.__player.mesh.position.toArray());
  await island.keyboard.down('KeyW');
  await island.waitForFunction(p => window.__player.mesh.position.distanceTo({x:p[0], y:p[1], z:p[2]}) > 0.1, before, { timeout: 12000 });
  await island.keyboard.up('KeyW');
  assert.equal(await island.evaluate(() => !!window.__townSocialSystem.activeActivity), false);
  release();
  await island.locator('#festival-notice').getByText(/活动已组织完成/).waitFor();
  assert.equal(festivalCalls, 1);
  assert.ok(animationCalls >= 1);
  await enter();
  await openBook();
  await island.locator('.fb-entry').first().getByText('灯影舞会').click();
  assert.equal(await island.locator('.fb-node').count(), 7);
  assert.ok(await island.locator('.fb-network line.direct').count());
  await island.locator('[data-member=lingq]').click();
  assert.match(await island.locator('.fb-person').innerText(), /观看者[\s\S]*等候合奏[\s\S]*开场应答/);
  await island.screenshot({ path: output + '/festival-book-network.png' });
  await island.setViewportSize({ width: 390, height: 844 });
  const fits = await island.locator('.fb-network').evaluate(el => [...el.querySelectorAll('button')].every(b => {
    const r = b.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth;
  }));
  assert.equal(fits, true);
  await island.screenshot({ path: output + '/festival-book-mobile.png' });
  await island.setViewportSize({ width: 1440, height: 900 });
  const callsBeforeShow = animationCalls;
  await island.locator('[data-action=hold]').click();
  await island.waitForFunction(() => window.__townSocialSystem.coordinator.active?.plan.type === 'custom_festival');
  const festival = await island.evaluate(() => {
    const town = window.__townSocialSystem, gathering = town.coordinator.active;
    gathering.participants.forEach((pet, i) => {
      pet.stopWalking();
      pet.setPosition(gathering.slots[i].x, 0, gathering.slots[i].z);
    });
    town.coordinator.update(0);
    return town.residentActivity();
  });
  assert.equal(festival.phase, '灯下合奏');
  assert.equal(festival.cast.find(p => p.id === 'fangk').action, '挥手指挥合奏');
  assert.equal(festival.cast.find(p => p.id === 'lingq').animation, 'idle');
  assert.equal(animationCalls, callsBeforeShow);
  await openBook();
  await island.locator('.fb-entry').first().click();
  await island.locator('.fb-live').waitFor();
  const showcase = await context.newPage();
  await showcase.goto(url + 'player-candidates.html?routine=fangk');
  await showcase.locator('.resident-now h3').getByText('日常作息').waitFor();
  assert.equal(await showcase.locator('[data-theme-id]').count(), 4);
  assert.doesNotMatch(await showcase.locator('#behavior-details-content').innerText(), /灯影舞会|灯下合奏/);
  await showcase.locator('#behavior-scope').selectOption('morning');
  await showcase.locator('#behavior-direction').fill('清晨小跑');
  await showcase.locator('#behavior-edit-form button').click();
  await showcase.locator('#behavior-edit-status').getByText(/已更新/).waitFor();
  await showcase.reload();
  await showcase.locator('[data-theme-id=morning]').click();
  await showcase.locator('.resident-theme-detail').getByText('清晨小跑', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Festival interview, background movement, persistent roster, cached choreography, live graph and personal routines verified.');
} finally {
  release();
  await browser.close();
}
