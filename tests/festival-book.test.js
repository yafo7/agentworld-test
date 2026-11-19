import test from 'node:test';
import assert from 'node:assert/strict';
import { FestivalBook } from '../src/demos/chii-island/systems/FestivalBook.js';
import { CHII_RESIDENTS } from '../src/demos/chii-island/data/residentCatalog.js';
import { compileFestivalProgram, festivalNetwork, programAssignment } from '../src/demos/chii-island/data/festivalProgram.js';
import { dayPeriod } from '../src/demos/chii-island/data/residentDay.js';
import { describeResidentThemes, restoreThemeEdits, validateThemeEdits } from '../src/demos/chii-island/data/residentThemes.js';
import { validateActivityPlan } from '../src/gameplay/social/ActivityPlanValidator.js';

const residents = CHII_RESIDENTS.map(r => ({ id: r.gameplayId, animations: ['idle', 'dance'] }));
function script() {
  return {
    locationId: 'church_square',
    events: [{ id: 'setup', name: '布置花环' }, { id: 'show', name: '迎春舞' }],
    cast: Object.fromEntries(residents.map(({id}) => [id, id === 'fangk'
      ? { role: 'host', steps: [{ eventId: 'setup', name: '摆好花环', seconds: 5, prompt: '抬手摆花环' },
        { eventId: 'show', name: '领舞', seconds: 6, animation: 'dance' }] }
      : { role: 'spectator', steps: [{ eventId: 'show', name: '观看', seconds: 2, animation: 'idle' }] }])),
    links: [{ from: 'fangk', to: 'momo', label: '开场呼应' }],
    props: [{id:'wreath', name:'花环', prompt:'粉色春花装点原木编织的节日圆形花环', sizeProfile:'festival_prop'}],
  };
}

test('island clock selects the new daily period at each boundary including midnight', () => {
  assert.deepEqual([0, 5.9, 6, 9.9, 10, 13.9, 14, 17.9, 18, 23.9].map(dayPeriod),
    ['night','night','morning','morning','midday','midday','afternoon','afternoon','night','night']);
});
test('stage tracks share event boundaries and the graph distinguishes cooperating from attending', () => {
  const program = compileFestivalProgram(script(), residents);
  const { actions } = programAssignment(program, 'lingq');
  assert.deepEqual(actions.map(s => [s.eventId,s.kind,s.seconds]), [['setup','wait',5],['show','wait',2],['show','wait',4]]);
  const { nodes,edges } = festivalNetwork(program);
  assert.equal(nodes.length, residents.length);
  assert.equal(nodes[0].id, 'fangk');
  assert.equal(nodes[0].x, 50);
  assert.ok(nodes[0].size > nodes.at(-1).size);
  assert.equal(edges.filter(e => e.direct).length, 1);
  assert.equal(edges.find(e => e.direct).label, '开场呼应');
  assert.ok(edges.some(e => !e.direct && e.label === '迎春舞'));
});
test('a morning run keeps its locomotion pace after a natural-language edit', () => {
  const theme = describeResidentThemes('fangk', ['idle', 'run']);
  const edits = validateThemeEdits([{ themeId: 'morning', actions: [{ name:'清晨慢跑', kind:'stroll', pace:'run', seconds:12 }] }], theme, ['idle','run']);
  assert.equal(edits.morning.actions[0].pace, 'run');
  const restored = restoreThemeEdits([{ themeId:'midday', actions:[{kind:'perform', name:'旧动作', animation:'old-clip', seconds:5}] },
    { themeId:'morning', actions:edits.morning.actions }], theme, ['idle','run']);
  assert.deepEqual(Object.keys(restored), ['morning']);
});
test('a curated festival matches its live performance through its registration', () => {
  const live = { phase:'迎接生日蛋糕' };
  const town = { activeActivity:{plan:{type:'birthday',registryId:'curated.mako-birthday'}},residentActivity:()=>live };
  const book = new FestivalBook(town,'test',null);
  assert.equal(book.live({id:'birthday',plan:{type:'birthday',registryId:'curated.mako-birthday'}}), live);
  assert.equal(book.live({id:'party',plan:{type:'party'}}), null);
});
test('invalid resident, event and motion assignments fail before asset generation', () => {
  for (const change of [r => delete r.cast.crab, r => r.cast.momo.steps[0].animation = 'unknown',
    r => r.cast.mako.steps[0].eventId = 'missing', r => r.events.push({ id: 'unused', name: '空场' })]) {
    const raw = script();
    change(raw);
    assert.throws(() => compileFestivalProgram(raw, residents));
  }
});
test('a borrowed clip is resolved per resident, without restarting or erasing choreography', () => {
  const raw = script();
  raw.cast.fangk.steps[0] = { eventId:'setup', name:'挥手指挥', animation:'wave', seconds:6 };
  raw.cast.momo.steps = [{ eventId:'show', name:'豪放舞动', animation:'dance', seconds:7 },
    { eventId:'show', name:'举手摇铃', prompt:' 抬臂，左右摇铃。' }];
  const program = compileFestivalProgram(raw, residents.map(r => r.id === 'momo' ? {...r, animations:['idle']} : r));
  assert.equal(program.cast.fangk.steps[0].generation.prompt, '抬起前肢左右挥动');
  assert.equal(program.cast.momo.steps[0].seconds, 7);
  assert.equal(program.cast.momo.steps[0].generation.prompt, '跟随节拍左右踏步摆动身体');
  assert.equal(program.cast.momo.steps[1].generation.prompt, '抬臂左右摇铃');
  assert.equal(program.cast.fangk.steps[1].animation, 'dance');
});
test('interrupted preparation resumes a saved festival and publishes only after props and animations are ready', async () => {
  const rows = new Map(), data = new Map();
  const storage = { getItem: k => data.get(k), setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
  let chats = 0, modelsGenerated = 0, animationReady = false, cachedProp;
  const town = {
    activityRegistry: { get: id => rows.get(id), register: r => rows.set(r.id,r), list: () => [...rows.values()] },
    findParticipant: () => ({ _originalModelJson: {}, _animPlans: { idle:{}, dance:{} } }),
    _plannerObjects: () => [], _validatePlan: validateActivityPlan,
    generationController: { run: async packet => {
      chats++;
      assert.equal(packet.input.residents.length, 7);
      if (chats === 1) return {result:'{"events":[]}'};
      assert.match(packet.input.correction, /节目/);
      return { result: JSON.stringify(script()) };
    } },
    cacheFestivalProp: async () => {
      if (!cachedProp) { modelsGenerated++; cachedProp = {cacheKey:'wreath',result:{assetId:'wreath-model'}}; }
      return cachedProp;
    },
    cacheFestivalAnimation: async () => { if (!animationReady) throw new Error('动画服务暂时不可用'); },
    _createPresetPlan: type => ({type, dialogue:{proposal:'邀请'}}),
  };
  const service = new FestivalBook(town,'island',storage);
  service.submit({title:'迎春日', theme:'春花', wish:'一起跳舞'});
  await service.completion;
  assert.equal(service.job.status, 'failed');
  assert.match(service.job.error, /动画服务/);
  assert.equal(rows.size, 0);
  service.dispose();
  const reopened = new FestivalBook(town,'island',storage);
  assert.equal(reopened.job.status, 'interrupted');
  animationReady = true;
  reopened.run();
  await reopened.completion;
  assert.equal(chats, 2);
  assert.equal(modelsGenerated, 1);
  assert.equal(reopened.job, null);
  const entry = reopened.list()[0];
  assert.equal(entry.plan.title, '迎春日');
  assert.equal(Object.keys(reopened.details(entry).cast).length, 7);
  assert.equal(rows.get(entry.id).assets.models.wreath.assetId, 'wreath-model');
  assert.equal(town.activeActivity, undefined);
});
