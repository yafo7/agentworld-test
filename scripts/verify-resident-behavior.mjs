import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.CHII_VERIFY_ORIGIN || 'http://127.0.0.1:5173';
const output = '.agents/runtime';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
const results = {};
let requests = 0;
// Repeatable integration fixture: all actual DOM, navigation and graph execution remain live.
await context.route('**/api/voxel/api/chat', async route => {
  const payload = route.request().postDataJSON();
  const input = JSON.parse(payload.messages?.[1]?.content || '{}');
  if (!input.residents) return route.fulfill({ json: { ok: true, content: '{}' } });
  requests++;
  const target = input.world.objects.find(o => o.id.endsWith('behavior-test-cafe')) || input.world.objects.find(o => o.affordances.includes('shade'));
  const proposals = input.residents.map(r => ({ residentId: r.residentId, decision: 'revise', reason: target?.id.endsWith('behavior-test-cafe') ? '树林消失了，到新咖啡厅附近休息。' : '树林里有阴凉，过去休息。', switchPolicy: 'interrupt', graph: { schemaVersion: 1, entryStateId: 'go', states: [
    { id: 'go', name: `前往${target?.name || '休息点'}`, kind: target ? 'visit' : 'wait', ...(target ? { targetId: target.id } : {}), seconds: 120, onSuccess: 'rest', onFailure: 'pause' },
    { id: 'rest', name: '和邻居休息', kind: 'wait', ...(target ? { targetId: target.id } : {}), seconds: 40, onSuccess: 'rest', onFailure: 'pause' },
    { id: 'pause', name: '等一等', kind: 'wait', seconds: 10, onSuccess: 'go', onFailure: 'go' },
  ] } }));
  await route.fulfill({ json: { ok: true, content: JSON.stringify({ proposals }) } });
});
try {
  const page = await context.newPage();
  page.on('pageerror', e => { errors.push(e.message); console.log('Page error:', e.message); });
  await page.goto(`${base}/src/demos/chii-island/?church-town`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__chiiAgents?.behaviorSystem && [...window.__chiiAgents.runtimes.values()].every(r => r.behavior?.source === 'ai'), null, { timeout: 90000 });
  results.initial = await page.evaluate(() => window.__chiiAgents.inspect().map(r => ({ id: r.residentId, source: r.behavior.source, states: r.behavior.graph.states.length })));
  results.replacement = await page.evaluate(async () => {
    const c = window.__chiiAgents;
    const s = c.behaviorSystem;
    const runtime = c.getRuntime('momo');
    runtime.pet.petState.transition('free_roam', { reason: 'behavior-verification' });
    runtime.pet.stopWalking();
    const original = runtime.behavior.plan.states[0].targetId;
    const entity = s.world.resolve(original);
    // Remove only a test-context entity through its registry, leaving user's storage untouched.
    s.registry.remove(entity);
    const cancelled = runtime.behavior.plan === null;
    const p = runtime.pet.mesh.position;
    const { StaticEntity } = await import('/src/engine/entity/StaticEntity.js');
    const cafe = new StaticEntity({ id: 'behavior-test-cafe', name: '新咖啡厅', position: [p.x + 7, 0, p.z], tags: ['cafe'], modelJson: entity._originalModelJson });
    cafe._instanceId = 'behavior-test-cafe';
    s.registry.add(cafe, { persistenceMode: 'temporary-test' });
    await s.request('verification_replacement');
    return { cancelled, target: runtime.behavior.plan.states[0].targetId, source: runtime.behavior.source };
  });
  assert.equal(results.replacement.cancelled, true);
  assert.ok(results.replacement.target.endsWith('behavior-test-cafe'));
  try {
    await page.waitForFunction(() => window.__chiiAgents.getRuntime('momo').behavior.currentStateId === 'rest', null, { timeout: 45000 });
  } catch (error) {
    console.log('Arrival diagnostics', await page.evaluate(() => {
      const r = window.__chiiAgents.getRuntime('momo');
      return { behavior: r.behavior.snapshot(), execution: { ...r.behavior.execution, cleanup: null }, position: r.pet.mesh.position.toArray(), state: r.pet.petState.current, target: r.pet._targetPosition, path: r.pet._navigationPath };
    }));
    throw error;
  }
  results.arrival = await page.evaluate(() => {
    const c = window.__chiiAgents;
    c.flush();
    return c.getRuntime('momo').behavior.snapshot();
  });
  assert.equal(results.arrival.source, 'ai');
  const showcase = await context.newPage();
  showcase.on('pageerror', e => errors.push(e.message));
  await showcase.goto(`${base}/src/demos/chii-island/player-candidates.html`, { waitUntil: 'domcontentloaded' });
  await showcase.locator('[data-category-id="residents"]').click({ timeout: 90000 });
  await showcase.locator('[data-character-id="momo"]').click();
  await showcase.locator('#behavior-details-button').click();
  await showcase.locator('.behavior-node.is-current').waitFor();
  assert.match(await showcase.locator('#behavior-details-content').innerText(), /咖啡厅/);
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await showcase.setViewportSize(size);
    await showcase.screenshot({ path: `${output}/resident-behavior-${size.width}.png` });
    const bounds = await showcase.locator('#behavior-details-dialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= size.width + 1 && bounds.y + bounds.height <= size.height + 1);
  }
  await showcase.keyboard.press('Escape');
  assert.equal(await showcase.locator('#behavior-details-dialog').evaluate(e => e.open), false);
  assert.equal(await showcase.evaluate(() => document.activeElement.id), 'behavior-details-button');
  // Reload the main island: IDs are revalidated, deleted test entities cannot become real destinations.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__chiiAgents?.getRuntime('momo')?.behavior?.plan, null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__chiiAgents.getRuntime('momo').behavior.plan.states.some(s => s.targetId?.endsWith('behavior-test-cafe'))), false);
  results.errors = errors;
  results.requests = requests;
  assert.deepEqual(errors, []);
  await writeFile(`${output}/resident-behavior-verification.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ residents: results.initial.length, replacement: results.replacement, arrival: results.arrival.currentStateId, requests, errors }, null, 2));
} finally { await browser.close(); }
