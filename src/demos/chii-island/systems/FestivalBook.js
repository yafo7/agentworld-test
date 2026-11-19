import { CHII_RESIDENTS } from '../data/residentCatalog.js';
import { compileFestivalProgram } from '../data/festivalProgram.js';
import { assignActivityResident } from '../data/activityParticipation.js';
import { parseSocialPlannerJson } from '../../../gameplay/social/SocialActivityPlanner.js';

const presets = ['party', 'birthday', 'new_year', 'campfire'];
const special = {
  birthday: [['cake', '迎接生日蛋糕'], ['show', '生日庆祝']],
  new_year: [['greeting', '互道新年好'], ['show', '围火表演'], ['meal', '团圆饭']],
};
const nameOf = id => id === 'crab' ? '蟹蟹' : id;

function existingProgram(town, plan) {
  if (plan.festivalProgram) return plan.festivalProgram;
  const events = (special[plan.type] || [['show', plan.title]]).map(([id, name]) => ({ id, name }));
  const cast = {};
  for (const id of plan.participants) {
    const theme = town.residentTheme?.(id === 'crab' ? 'builder_crab' : id, plan.type);
    const { role, actions } = assignActivityResident(plan, id, theme);
    const steps = events.flatMap(event => {
      if (event.id === 'show') return actions.map(a => ({ ...a, name: a.name, seconds: a.seconds || 4, eventId: event.id }));
      const name = event.id === 'cake' ? (role === 'host' ? '推蛋糕桌' : role === 'guest' ? '迎接生日蛋糕' : '看蛋糕入场')
        : event.id === 'meal' ? '享用团圆饭' : '向玩家拜年';
      return [{ name, seconds: 4, eventId: event.id }];
    });
    cast[id] = { role, steps };
  }
  return { events, cast, links: plan.subjectId ? [{ from: plan.hostId, to: plan.subjectId, label: '为寿星庆祝' }] : [] };
}

export class FestivalBook {
  constructor(town, scope, storage = globalThis.localStorage) {
    Object.assign(this, { town, storage, key: 'chii-festival-planning:' + scope });
    this.listeners = new Set();
    try { this.job = JSON.parse(storage?.getItem(this.key) || 'null'); } catch { this.job = null; }
    if (this.job && this.town.activityRegistry.get(this.job.id)?.provenance?.bookPrepared) this.save(null);
    else if (this.job) this.job.status = 'interrupted';
  }

  save(job) {
    if (job) this.storage?.setItem(this.key, JSON.stringify(job));
    else this.storage?.removeItem(this.key);
    this.job = job;
  }
  notify(message) { for (const listener of this.listeners) listener(message); }

  list() {
    const registry = this.town.activityRegistry;
    const custom = registry.list().filter(r => r.type === 'custom_festival' && (r.provenance.bookPrepared || r.status === 'ready'))
      .sort((a,b) => (b.provenance.createdAt || 0) - (a.provenance.createdAt || 0))
      .map(r => ({ id: r.id, plan: { ...r.plan, registryId: r.id }, theme: r.plan.brief?.theme || r.plan.concept || r.title }));
    const fixed = presets.map(type => {
      const plan = this.town._createPresetPlan(type, this.town.organizer, { preview: true });
      return { id: type, plan, theme: plan.dialogue.proposal };
    });
    return [...custom, ...fixed];
  }

  details(entry) { return existingProgram(this.town, entry.plan); }

  live(entry) {
    const plan = this.town.activeActivity?.plan;
    if (!plan || (entry.plan.registryId ? plan.registryId !== entry.plan.registryId : plan.type !== entry.plan.type)) return null;
    return this.town.residentActivity();
  }

  hold(entry) {
    if (this.town.activeActivity) throw new Error('岛上正在举行活动，请在收尾后开场。');
    const checked = this.town._validatePlan(entry.plan);
    const plan = { ...entry.plan, ...checked, id: 'festival_' + crypto.randomUUID(), entry: { type: 'festival_book', petId: 'fangk' } };
    if (!this.town._beginActivity(plan)) throw new Error(this.town.lastNotice || '场地暂时不可用');
  }

  submit(brief) {
    if (this.running || this.job) throw new Error('请先完成正在筹备的节日');
    if (![brief.title, brief.theme, brief.wish].every(s => typeof s === 'string' && s.trim())) throw new Error('请回答三个问题');
    this.save({ id: 'book.' + crypto.randomUUID(), brief, status: 'planning' });
    this.run();
  }

  run() {
    if (!this.job || this.running) return;
    const work = this.job;
    this.running = true;
    this.notify();
    this.completion = this.prepare(work).then(() => {
      if (this.disposed) return;
      this.save(null);
      this.notify('活动已组织完成，可按 Esc 打开岛上节日表查看。');
    }).catch(error => {
      if (this.disposed) return;
      this.save({ ...work, status: 'failed', error: String(error.message || error).slice(0, 130) });
      this.notify(work.plan ? '节目单已保存，素材准备未完成。可从节日表继续。' : '节目单还未完成，可打开节日表查看原因并继续。');
    }).finally(() => { this.running = false; if (!this.disposed) this.notify(); });
  }

  async prepare(job) {
    const town = this.town;
    const residents = CHII_RESIDENTS.map(({ gameplayId: id }) => {
      const pet = town.findParticipant(id);
      if (!pet?._originalModelJson) throw new Error(nameOf(id) + '还没有准备好');
      return { id, traits: pet._profile?.personalityTags || [], animations: Object.keys(pet._animPlans || {}).filter(k => !/^(social_|behavior_|registered_|activity_)/.test(k)) };
    });
    const current = () => { if (this.disposed || this.job?.id !== job.id) throw new Error('已离开本次策划'); };
    if (!job.plan) {
      job.status = 'planning';
      this.save(job);
      job.plan = await this.planFestival(job, residents, current);
    }
    job.status = 'assets';
    this.save(job);
    const plan = job.plan;
    const motions = Object.entries(plan.festivalProgram.cast).flatMap(([id, member]) =>
      member.steps.filter(step => step.generation).map(step => ({ id, step })));
    this.assetProgress = { ready: 0, total: plan.props.length + motions.length };
    this.notify();
    const models = {};
    for (const prop of plan.props) {
      current();
      const { cacheKey, result } = await town.cacheFestivalProp(prop, plan.type);
      models[prop.id] = { kind: 'activity_cache', cacheKey, assetId: result.assetId };
      this.assetProgress.ready++;
      this.notify();
    }
    for (const { id, step } of motions) {
      current();
      const pet = town.findParticipant(id);
      await town.cacheFestivalAnimation(pet, step.generation.prompt, { modelJson: pet._originalModelJson, duration: Math.min(step.seconds, 8) });
      this.assetProgress.ready++;
      this.notify();
    }
    current();
    town.activityRegistry.register({ id: job.id, type: plan.type, title: plan.title, status: 'draft', plan, assets: { models },
      provenance: { bookPrepared: true, createdAt: Date.now() } });
  }

  discard() { if (!this.running) { this.save(null); this.notify(); } }

  async planFestival(job, residents, current) {
    const town = this.town;
    let correction;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { result } = await town.generationController.run({ operation: 'event.plan', source: { kind: 'festival_book', text: job.brief.theme },
        input: { scale: 'festival', festivalBrief: job.brief, residents, objects: town._plannerObjects(), correction }, semanticPlanning: 'disabled' });
      current();
      try {
        const raw = parseSocialPlannerJson(result);
        const program = compileFestivalProgram(raw, residents);
        if (!Array.isArray(raw.props) || raw.props.length > 2 || raw.props.some(p => !p || typeof p.id !== 'string' || !/^[\w-]{1,32}$/.test(p.id) ||
          typeof p.name !== 'string' || !p.name.trim() || typeof p.prompt !== 'string' || !p.prompt.trim()) ||
          new Set(raw.props.map(p => p.id)).size !== raw.props.length) throw new Error('节日道具清单无效');
        const plan = town._validatePlan({ locationId: raw.locationId, dialogue: raw.dialogue,
          id: job.id, title: job.brief.title, type: 'custom_festival', scale: 'festival',
          concept: job.brief.wish, initiatorId: 'fangk', participants: residents.map(p => p.id),
          actionPrompts: Object.fromEntries(residents.map(p => [p.id, program.cast[p.id].steps[0].name])),
          props: raw.props.map(p => ({ ...p, operation: 'generate', revealStage: 'performance' })) });
        return { ...plan, entry: { type: 'festival_book', petId: 'fangk' }, brief: job.brief, festivalProgram: program };
      } catch (error) {
        if (attempt) throw error;
        correction = '上一版未通过校验，请重新输出完整的方案。' + error.message.slice(0, 120);
      }
    }
  }

  dispose() { this.disposed = true; this.listeners.clear(); }
}
