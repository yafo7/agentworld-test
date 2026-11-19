import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldObjectRegistry } from '../src/world/WorldObjectRegistry.js';
import { IslandWorldInformation } from '../src/gameplay/agents/IslandWorldInformation.js';
import { validateResidentPlan, fallbackResidentPlan } from '../src/gameplay/agents/ResidentBehaviorPlan.js';
import { ResidentBehaviorRuntime } from '../src/gameplay/agents/ResidentBehaviorRuntime.js';
import { ResidentBehaviorSystem } from '../src/gameplay/agents/ResidentBehaviorSystem.js';
import { PromptCompiler } from '../src/gameplay/ai/prompts/PromptCompiler.js';
import { ChiiResidentBehaviorBody } from '../src/demos/chii-island/systems/ChiiResidentBehaviorBody.js';
import { TownActivityAssetCache } from '../src/storage/TownActivityAssetCache.js';

function fixture(controller = null) {
  const tree = { id: 'tree', name: '树林', tags: ['tree'], position: { x: 10, z: 0 } };
  const registry = new WorldObjectRegistry([tree]);
  const calls = [];
  let free = true;
  const runtime = { epoch: 0, disposed: false, profile: { identity: { residentId: 'momo', displayName: 'momo' }, preferences: { objects: { tree: 1 } } }, state: { drives: {} }, memory: { episodic: [], remember: e => calls.push(e) },
    pet: { _originalModelJson: { nodes: [{ id: 'body' }] }, _animPlans: { idle: {} }, position: { x: 0, z: 0 }, stopWalking: () => calls.push('stop') }, _canAct: () => free };
  const body = { approach: () => ({ x: 7, z: 0 }), near: () => true, perform: () => { calls.push('perform'); return () => calls.push('cleanup'); }, prepare: async () => new Map() };
  const coordinator = { runtimes: new Map([['momo', runtime]]), flush() { calls.push('flush'); } };
  const system = new ResidentBehaviorSystem({ coordinator, registry, body, generationController: controller, scope: 'test' });
  system.attach(runtime);
  return { tree, registry, runtime, body, system, calls, setFree: v => { free = v; } };
}

test('world summaries are bounded, exclude geometry/coordinates, retain cafe among many trees', () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) f.registry.add({ id: `tree-${i}`, name: '树', position: { x: i, z: 1 } });
  f.registry.add({ id: 'cafe', name: '咖啡厅', position: { x: 0, z: 0 } });
  f.system.world.refresh();
  const s = f.system.world.publicSnapshot();
  assert.equal(s.objects.length, 80);
  assert.equal(s.totals.shade, 101);
  assert.ok(s.objects.some(o => o.id === 'cafe'));
  assert.ok(s.objects.every(o => !('position' in o)));
  const revision = s.revision;
  f.system.world.refresh();
  assert.equal(f.system.world.revision, revision);
});

test('deleted trees cancel immediately and offline plan moves to the new cafe', async () => {
  const f = fixture();
  await f.system.request();
  f.runtime.behavior.update(0.1);
  assert.equal(f.runtime.behavior.status, 'moving');
  f.registry.remove(f.tree);
  assert.equal(f.runtime.behavior.plan, null);
  assert.ok(f.calls.includes('stop'));
  f.registry.add({ id: 'cafe', name: '咖啡厅', position: { x: 20, z: 5 } });
  await f.system.request();
  assert.equal(f.runtime.behavior.plan.states[0].targetId, 'cafe');
});

test('plan rejects missing targets, arbitrary animation, invalid transitions, unreachable nodes and excess generation', () => {
  const f = fixture();
  const world = f.system.world.publicSnapshot();
  const graph = fallbackResidentPlan(f.runtime, world).graph;
  assert.doesNotThrow(() => validateResidentPlan(graph, world));
  assert.throws(() => validateResidentPlan({ ...graph, entryStateId: 'bad' }, world));
  assert.throws(() => validateResidentPlan({ ...graph, states: graph.states.map(s => ({ ...s, onFailure: 'bad' })) }, world));
  assert.throws(() => validateResidentPlan(graph, { objects: [] }));
  const extra = { id: 'extra', name: '未知动作', kind: 'perform', animation: 'dangerous', seconds: 2, onSuccess: 'extra', onFailure: 'extra' };
  assert.throws(() => validateResidentPlan({ ...graph, states: [...graph.states, extra] }, world));
});

test('arrival is recorded only at actual position; failures take the failure edge', async () => {
  const f = fixture();
  await f.system.request();
  const b = f.runtime.behavior;
  b.update(1);
  assert.equal(f.calls.filter(c => c?.type === 'behavior_arrival').length, 0);
  f.runtime.pet.position = { x: 7, z: 0 };
  b.update(1);
  assert.equal(b.currentStateId, 'rest');
  assert.equal(f.calls.filter(c => c?.type === 'behavior_arrival').length, 1);
  b.currentStateId = 'approach';
  f.runtime.pet.position = { x: 0, z: 0 };
  b.update(121);
  assert.equal(b.currentStateId, 'pause');
});

test('unrelated revisions preserve progress and follow mode suspends the graph', async () => {
  const f = fixture();
  await f.system.request();
  const b = f.runtime.behavior;
  b.currentStateId = 'rest';
  b.update(5);
  const execution = b.execution;
  b.offer(structuredClone(b.plan), { reason: '继续乘凉', source: 'ai' });
  assert.equal(b.execution, execution);
  assert.equal(b.execution.elapsed, 5);
  f.setFree(false);
  b.update(2);
  assert.equal(b.status, 'suspended');
  assert.equal(b.execution, null);
  f.setFree(true);
  b.update(1);
  assert.equal(b.currentStateId, 'rest');
  assert.equal(b.status, 'running');
});

test('slow AI response cannot resurrect a deleted target or cross a restored epoch', async () => {
  let resolve;
  const f = fixture({ run: () => new Promise(r => { resolve = r; }) });
  const pending = f.system.request();
  const old = structuredClone(f.runtime.behavior.plan);
  f.registry.remove(f.tree);
  resolve({ result: { proposals: [{ residentId: 'momo', decision: 'revise', reason: '旧树', graph: old }] } });
  await pending;
  assert.equal(f.runtime.behavior.plan, null);
  assert.equal(f.system.dirty, true);
  const second = f.system.request();
  f.runtime.epoch++;
  resolve({ result: { proposals: [{ residentId: 'momo', decision: 'keep', reason: '过期' }] } });
  await second;
  assert.notEqual(f.runtime.behavior.reason, '过期');
});

test('planning coalesces changes and refreshes at five minutes even without object events', async () => {
  let calls = 0;
  const f = fixture({ run: async () => { calls++; return { result: { proposals: [{ residentId: 'momo', decision: 'keep', reason: '继续' }] } }; } });
  f.system.update(1);
  assert.equal(calls, 0);
  f.system.update(1);
  await f.system.job;
  assert.equal(calls, 1);
  f.system.update(299);
  assert.equal(calls, 1);
  f.system.update(1);
  await f.system.job;
  assert.equal(calls, 2);
  f.registry.updateMetadata(f.tree, { unrelatedRendererFlag: true });
  f.system.update(3);
  assert.equal(calls, 2);
});

test('AI revision installs a validated graph; generation failure retains the old graph', async () => {
  let response;
  const f = fixture({ run: async () => ({ result: response }) });
  response = { proposals: [{ residentId: 'momo', decision: 'revise', reason: '伸展身体', graph: { schemaVersion: 1, entryStateId: 'stretch', states: [{ id: 'stretch', name: '伸展身体', kind: 'perform', seconds: 5, generation: { prompt: '双手缓缓向上伸展' }, onSuccess: 'stretch', onFailure: 'stretch' }] } }] };
  f.body.prepare = async () => { throw new Error('服务离线'); };
  await f.system.request();
  assert.equal(f.runtime.behavior.source, 'local');
  assert.match(f.runtime.behavior.error, /服务离线/);
  f.body.prepare = async () => new Map([['stretch', {}]]);
  await f.system.request();
  assert.equal(f.runtime.behavior.source, 'ai');
  assert.equal(f.runtime.behavior.currentStateId, 'stretch');
});

test('behavior prompt uses the shared compiled controller contract', () => {
  const packet = new PromptCompiler().compile({ operation: 'resident.behavior', source: { text: '安排' }, input: { context: { world: { revision: 1 }, residents: [] } } });
  assert.equal(packet.validation.valid, true);
  assert.equal(packet.payload.profile, 'planner');
  assert.match(packet.payload.messages[0].content, /modelChange/);
});

test('generated animation is keyed by exact model and reused across preparations', async () => {
  let calls = 0;
  const f = fixture();
  const body = new ChiiResidentBehaviorBody({ scope: 'test', getPets: () => [], cache: new TownActivityAssetCache({ storage: null }), generationController: { run: async () => { calls++; return { result: { plan: { _duration: 3, body: { swing: { amplitude: 0.1 } } } } }; } } });
  const graph = { states: [{ id: 'stretch', generation: { prompt: '双手缓缓向上伸展' } }] };
  const first = await body.prepare(f.runtime, graph, () => true);
  const second = await body.prepare(f.runtime, graph, () => true);
  assert.equal(calls, 1);
  assert.equal(first.get('stretch').key, second.get('stretch').key);
  f.runtime.pet._originalModelJson = { nodes: [{ id: 'other' }] };
  await body.prepare(f.runtime, graph, () => true);
  assert.equal(calls, 2);
});

test('disposed system never applies a pending AI plan', async () => {
  let resolve;
  const f = fixture({ run: () => new Promise(r => { resolve = r; }) });
  const pending = f.system.request();
  const previous = f.runtime.behavior.reason;
  f.system.dispose();
  resolve({ result: { proposals: [{ residentId: 'momo', decision: 'keep', reason: '不能写入' }] } });
  await pending;
  assert.equal(f.runtime.behavior.reason, previous);
});

test('restored built-in animation graph is revalidated and resumes its node', async () => {
  const f = fixture();
  const graph = { schemaVersion: 1, entryStateId: 'rest', states: [{ id: 'rest', name: '呼吸', kind: 'perform', animation: 'idle', seconds: 20, onSuccess: 'rest', onFailure: 'rest' }] };
  f.runtime.behavior.restore({ graph, currentStateId: 'rest', elapsed: 5, reason: '延续安排', revision: 3 });
  await f.system.request();
  assert.equal(f.runtime.behavior.plan.states[0].animation, 'idle');
  assert.equal(f.runtime.behavior.currentStateId, 'rest');
  assert.equal(f.runtime.behavior.revision, 4);
});

test('planning timeout releases the queue and keeps the local plan', async () => {
  const f = fixture({ run: () => new Promise(() => {}) });
  f.system.planningTimeoutMs = 5;
  await f.system.request();
  assert.equal(f.system.job, null);
  assert.match(f.system.lastError, /超时/);
  assert.ok(f.runtime.behavior.plan);
});

test('model variant is generated before its animation and restores without overwriting a newer outfit', async () => {
  const f = fixture();
  const base = f.runtime.pet._originalModelJson;
  const variant = { nodes: [{ id: 'body', color: '#fff' }] };
  const newer = { nodes: [{ id: 'body', color: '#000' }] };
  const operations = [];
  f.runtime.pet.replaceModelFromJson = model => { f.runtime.pet._originalModelJson = model; return true; };
  f.runtime.pet.loadAnimation = () => {};
  f.runtime.pet.playAnimation = () => {};
  const body = new ChiiResidentBehaviorBody({ scope: 'test', getPets: () => [], cache: new TownActivityAssetCache({ storage: null }), generationController: { run: async intent => {
    operations.push(intent.operation);
    if (intent.operation === 'model.refine') return { result: { modelJson: variant, assetId: 'variant-test' } };
    assert.equal(intent.input.modelJson, variant);
    return { result: { plan: { body: { swing: { amplitude: 0.1 } } } } };
  } } });
  const state = { id: 'stretch', kind: 'perform', generation: { prompt: '双手缓缓向上伸展', modelChange: '双手改成白色' } };
  const assets = await body.prepare(f.runtime, { states: [state] }, () => true);
  assert.deepEqual(operations, ['model.refine', 'animation.generate']);
  const stop = body.perform(f.runtime, state, assets.get(state.id));
  assert.equal(f.runtime.pet._originalModelJson, variant);
  assert.equal(body.baseModel(f.runtime), base);
  stop();
  assert.equal(f.runtime.pet._originalModelJson, base);
  const stopAgain = body.perform(f.runtime, state, assets.get(state.id));
  f.runtime.pet._originalModelJson = newer;
  assert.equal(body.baseModel(f.runtime), newer);
  stopAgain();
  assert.equal(f.runtime.pet._originalModelJson, newer);
});

test('generated graph restores from compatible cache without silently calling generation', async () => {
  const f = fixture();
  let cachedOnly;
  f.body.prepare = async (_runtime, _graph, _current, options) => { cachedOnly = options.cachedOnly; return new Map([['stretch', {}]]); };
  const graph = { schemaVersion: 1, entryStateId: 'stretch', states: [{ id: 'stretch', name: '伸展', kind: 'perform', generation: { prompt: '双手缓缓向上伸展' }, seconds: 8, onSuccess: 'stretch', onFailure: 'stretch' }] };
  f.runtime.behavior.restore({ graph, currentStateId: 'stretch', reason: '缓存动作', source: 'ai' });
  await f.system.request();
  assert.equal(cachedOnly, true);
  assert.equal(f.runtime.behavior.currentStateId, 'stretch');
  assert.equal(f.runtime.behavior.source, 'ai');
});
