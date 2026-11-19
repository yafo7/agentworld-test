// Explicit opt-in: one real planning request and one real animation request.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

if (!process.argv.includes('--live')) throw new Error('Pass --live to invoke the backend.');
const base = process.env.CHII_VERIFY_ORIGIN || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('response', async response => {
    if (response.url().includes('/api/generate/animation')) {
      try { const data = await response.json(); console.log('Animation response', response.status(), JSON.stringify({ keys: Object.keys(data), hasPlan: Boolean(data.plan), error: data.error })); } catch {}
    }
  });
  // Suppress routine requests; only the explicit fixture below reaches the live service.
  await page.route('**/api/voxel/api/chat', async route => {
    const payload = route.request().postDataJSON();
    const input = JSON.parse(payload.messages?.[1]?.content || '{}');
    if (input.world?.trigger === 'live_verification') return route.continue();
    await route.fulfill({ json: { ok: true, content: JSON.stringify({ proposals: (input.residents || []).map(r => ({ residentId: r.residentId, decision: 'keep', reason: '保持当前安排' })) }) } });
  });
  await page.goto(`${base}/src/demos/chii-island/?church-town`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__chiiAgents?.getRuntime('momo')?.behavior?.plan, null, { timeout: 90000 });
  console.log('Starting real resident planning request');
  const planning = process.argv.includes('--animation-only') ? { skipped: true } : await page.evaluate(async () => {
    const c = window.__chiiAgents;
    const r = c.getRuntime('momo');
    const s = c.behaviorSystem;
    const { validateResidentPlan } = await import('/src/gameplay/agents/ResidentBehaviorPlan.js');
    const world = { ...s.world.publicSnapshot(), trigger: 'live_verification' };
    const context = { world, residents: [{ residentId: 'momo', profile: r.profile, drives: r.state.drives, current: null, animations: Object.keys(r.pet._animPlans), memories: [] }] };
    const start = Date.now();
    const completed = await Promise.race([
      window.__chiiGeneration.run({ operation: 'resident.behavior', source: { kind: 'resident_behavior_verification', text: '安排近期生活' }, input: { context }, semanticPlanning: 'disabled' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Live planning timed out after 90 seconds')), 90000)),
    ]);
    const value = JSON.parse(completed.result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    const proposal = value.proposals.find(p => p.residentId === 'momo');
    if (proposal.decision !== 'revise') throw new Error('Initial live plan must revise');
    let graph;
    try { graph = validateResidentPlan(proposal.graph, { objects: world.objects, animations: Object.keys(r.pet._animPlans) }); }
    catch (error) { return { error: error.message, proposal, animations: Object.keys(r.pet._animPlans) }; }
    return { durationMs: Date.now() - start, decision: proposal.decision, reason: proposal.reason, states: graph.states.map(s => ({ id: s.id, name: s.name, kind: s.kind })) };
  });
  console.log('Real planning passed', JSON.stringify(planning));
  if (planning.error) throw new Error(`Live plan validation failed: ${planning.error}`);
  console.log('Starting one real animation generation request');
  const animation = await page.evaluate(async () => {
    const c = window.__chiiAgents, s = c.behaviorSystem, r = c.getRuntime('momo');
    const { validateResidentPlan } = await import('/src/gameplay/agents/ResidentBehaviorPlan.js');
    const graph = validateResidentPlan({ schemaVersion: 1, entryStateId: 'stretch', states: [
      { id: 'stretch', name: '伸展身体', kind: 'perform', seconds: 8, generation: { prompt: '双手缓缓向上伸展' }, onSuccess: 'rest', onFailure: 'rest' },
      { id: 'rest', name: '轻松休息', kind: 'wait', seconds: 20, onSuccess: 'stretch', onFailure: 'stretch' },
    ] });
    const start = Date.now();
    const assets = await s.body.prepare(r, graph, () => !r.disposed);
    const asset = assets.get('stretch');
    r.pet.petState.transition('free_roam', { reason: 'live-action-verification' });
    r.behavior.offer(graph, { source: 'ai', reason: '真实后端生成的新动作验收', policy: 'interrupt', assets, worldRevision: s.world.revision });
    r.behavior.update(0.1);
    const key = r.pet._animState;
    if (key !== asset.key) throw new Error('Generated action was not activated');
    const { evaluateMotion } = await import('/src/engine/animation/player.js');
    const first = evaluateMotion(asset.plan, asset.plan._duration || 3, r.pet._modelGroup, 0);
    const later = evaluateMotion(asset.plan, asset.plan._duration || 3, r.pet._modelGroup, (asset.plan._duration || 3) * 0.4);
    const motionChanged = JSON.stringify(first) !== JSON.stringify(later);
    if (!motionChanged) throw new Error('Generated tracks do not move');
    const tracks = Object.keys(asset.plan._baked?.animation || asset.plan).filter(k => !k.startsWith('_'));
    const boundTracks = tracks.filter(id => r.pet._modelGroup.getObjectByName(id));
    if (!boundTracks.length) throw new Error('No generated track binds to the resident model');
    return { durationMs: Date.now() - start, key, tracks, boundTracks, motionChanged, state: r.behavior.status };
  });
  assert.ok(animation.tracks.length > 0);
  await mkdir('.agents/runtime', { recursive: true });
  await writeFile('.agents/runtime/resident-behavior-live.json', JSON.stringify({ planning, animation }, null, 2));
  console.log('Real animation passed', JSON.stringify(animation));
} finally { await browser.close(); }
