import { residentPortraitUrl } from './residentPortraits.js';
import { ModalFocusController } from '../../../engine/ui/ModalFocusController.js';
import { festivalNetwork } from '../data/festivalProgram.js';
import { RESIDENT_THEME_ROLES } from '../data/residentThemes.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function festivalStamp(entry, portrait) {
  const prop = { campfire: 'campfire', new_year: 'lantern' }[entry.id];
  return prop ? '<img alt="" src="/ui/journal-' + prop + '.png">' : portrait(entry.plan.subjectId || entry.plan.hostId || 'fangk');
}
const locationName = id => ({ campfire: '篝火旁', apple_tree: '苹果树旁', church_square: '教堂广场' })[id] || '教堂广场';
const prompts = [
  ['title', '你想给节日取什么名字？', '例如，月光音乐节', 20],
  ['theme', '这个节日的主题是什么？', '例如，在月光下分享喜欢的音乐', 100],
  ['wish', '你希望大家一起做什么？', '例如，合奏一首曲子，然后围着篝火跳舞', 180],
];

export class FestivalBookPanel {
  constructor(book, input, portraits) {
    Object.assign(this, { book, input, answers: {}, page: 'list' });
    this.portraits = portraits;
    this.root = document.querySelector('#festival-dialog');
    this.content = this.root.querySelector('.festival-content');
    this.notice = document.querySelector('#festival-notice');
    this.focus = new ModalFocusController(this.root);
    this.root.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      try { this.click(b); } catch (err) { this.message(err.message); }
    };
    this.root.onsubmit = e => { e.preventDefault(); this.next(); };
    this.root.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
    };
    this.root.oncancel = e => { e.preventDefault(); this.close(); };
    this.root.oninput = e => { if (e.target.name) this.answers[e.target.name] = e.target.value; };
    this.onChange = message => {
      if (message) this.message(message);
      if (this.isOpen() && this.page === 'list') this.render();
    };
    book.listeners.add(this.onChange);
  }

  message(text) {
    clearTimeout(this.timer);
    this.notice.textContent = text;
    this.notice.hidden = false;
    const error = this.root.querySelector('.fb-error');
    error.textContent = text;
    error.hidden = !this.isOpen();
    this.timer = setTimeout(() => { this.notice.hidden = true; }, 6500);
  }
  isOpen() { return this.root.open; }
  open(onReturn) {
    if (this.isOpen()) return;
    this.onReturn = onReturn;
    this.page = 'list';
    this.root.querySelector('.fb-error').hidden = true;
    this.render();
    this.input.setPointerLockEnabled(false);
    this.root.showModal();
    this.focus.setOpen(true);
    this.liveTimer = setInterval(() => this.updateLive(), 800);
  }
  close(returnToMenu = true) {
    if (!this.isOpen()) return;
    this.root.close();
    clearInterval(this.liveTimer);
    this.input.setPointerLockEnabled(true);
    this.focus.setOpen(false);
    if (returnToMenu) this.onReturn?.();
    this.onReturn = null;
  }

  click(b) {
    if (b.dataset.entry) {
      this.entry = this.entries.find(e => e.id === b.dataset.entry);
      this.program = this.book.details(this.entry);
      this.network = festivalNetwork(this.program);
      this.member = this.network.nodes[0]?.id;
      this.page = 'detail';
    } else if (b.dataset.member) {
      this.member = b.dataset.member;
    } else switch (b.dataset.action) {
      case 'close': return this.close();
      case 'list': this.page = 'list'; break;
      case 'plan': this.page = 'plan'; this.step = 0; break;
      case 'previous': if (this.step) this.step--; else this.page = 'list'; break;
      case 'retry': this.book.run(); return;
      case 'discard': this.book.discard(); return;
      case 'hold': this.book.hold(this.entry); this.close(false); return;
      default: return;
    }
    this.render();
    if (this.page === 'plan') this.content.querySelector('input,textarea')?.focus();
    if (b.dataset.member) this.content.querySelector('[aria-pressed=true]')?.focus({ preventScroll: true });
  }

  next() {
    const [key] = prompts[this.step];
    if (!this.answers[key]?.trim()) return this.content.querySelector('[name]').focus();
    if (this.step < 2) { this.step++; this.render(); this.content.querySelector('[name]').focus(); return; }
    try {
      this.book.submit({ ...this.answers });
      this.answers = {};
      this.close(false);
      this.message('fangk：明白了，我需要想想怎么组织这个活动，你可以先去四处逛逛。');
    } catch (error) { this.message(error.message); }
  }

  updateLive() {
    if (this.page !== 'detail') return;
    const live = this.book.live(this.entry);
    const memberId = this.member === 'crab' ? 'builder_crab' : this.member;
    const member = live?.cast.find(person => person.id === memberId);
    const label = this.content.querySelector('.fb-live');
    label.hidden = !live;
    label.textContent = live ? [live.phase, member?.action || '本场未到场', member?.target].filter(Boolean).join(' · ') : '';
    const hold = this.content.querySelector('[data-action=hold]');
    hold.disabled = Boolean(this.book.town.activeActivity);
    hold.textContent = live ? '正在举办' : hold.disabled ? '岛上活动进行中' : '举办节日';
  }

  render() {
    const portrait = id => '<img alt="" src="' + residentPortraitUrl(id, this.portraits) + '">';
    const back = '<button class="fb-back" data-action="list">‹ 节日表</button>';
    if (this.page === 'plan') {
      const [key, question, placeholder, max] = prompts[this.step];
      this.content.innerHTML = back + '<section class="fb-interview"><div class="fb-speaker">' + portrait('fangk') +
        '<span>fangk<small>节日策划</small></span><small>' + (this.step + 1) + ' / 3</small></div>' +
        '<form><label for="festival-answer">' + question + '</label><textarea id="festival-answer" name="' + key + '" maxlength="' + max +
        '" required placeholder="' + placeholder + '">' + esc(this.answers[key]) + '</textarea><div class="fb-controls"><button type="button" data-action="previous">上一步</button>' +
        '<button class="fb-primary" type="submit">' + (this.step === 2 ? '委托 fangk 策划并准备素材' : '继续') + '</button></div></form></section>';
    } else if (this.page === 'detail') {
      const { plan, theme } = this.entry;
      const { nodes, edges } = this.network;
      const byId = new Map(nodes.map(n => [n.id, n]));
      const lines = edges.map(e => {
        const a = byId.get(e.from), b = byId.get(e.to);
        return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" class="' +
          (e.direct ? 'direct ' : '') + ([e.from,e.to].includes(this.member) ? 'selected' : '') + '"/>';
      }).join('');
      const people = nodes.map(n => '<button class="fb-node" data-member="' + esc(n.id) + '" aria-pressed="' + (n.id === this.member) +
        '" style="left:' + n.x + '%;top:' + n.y + '%;--size:' + n.size + 'px" aria-label="' + esc(n.name + ' · ' + n.role) + '">' +
        portrait(n.id) + '<span>' + esc(n.name) + '</span></button>').join('');
      const member = this.program.cast[this.member];
      const steps = this.program.events.flatMap(e => member.steps.filter(s => s.eventId === e.id).map(s =>
        '<li><small>' + esc(e.name) + '</small>' + esc(s.name) + '</li>')).join('');
      const peers = edges.filter(e => e.from === this.member || e.to === this.member).map(e =>
        '<li>' + esc(byId.get(e.from === this.member ? e.to : e.from).name) + ' · ' + esc(e.label) + '</li>').join('');
      this.content.innerHTML = back + '<h2>' + esc(plan.title) + '</h2><p class="fb-theme">' + esc(theme) + '</p><div class="fb-tags">' +
        this.program.events.map(e => '<span>' + esc(e.name) + '</span>').join('') + '</div><div class="fb-detail"><section><div class="fb-network" aria-label="岛民参与关系图">' +
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + lines + '</svg>' + people +
        '</div><div class="fb-legend"><span>合作</span><span>同场</span><small>圆越大，参与越多</small></div></section><section class="fb-person"><div class="fb-identity">' +
        portrait(this.member) + '<div><h3>' + esc(byId.get(this.member).name) + '</h3><small>' + esc(RESIDENT_THEME_ROLES[member.role]) + '</small></div></div><p class="fb-live" hidden></p><ol>' + steps + '</ol>' +
        (peers ? '<h4>同场关系</h4><ul>' + peers + '</ul>' : '') + '</section></div><footer><span>' + locationName(plan.locationId) +
        '</span><button class="fb-primary" data-action="hold">举办节日</button></footer>';
      this.updateLive();
    } else {
      this.entries = this.book.list();
      const job = this.book.job;
      const progress = this.book.assetProgress;
      this.content.innerHTML = '<header class="fb-cover"><div><h2>岛上节日表</h2><p>收录 ' + this.entries.length + ' 个节日</p></div><button class="fb-primary" data-action="plan"' +
        (job ? ' disabled' : '') + '>＋ 策划节日</button></header>' +
        (job ? '<div class="fb-speaker fb-job">' + portrait('fangk') + '<span>fangk · ' +
          (this.book.running ? '忙碌中' : '筹备待继续') + '<small>' + esc(job.brief.title + ' · ' + (this.book.running ?
          (job.status === 'assets' && progress ? '准备动作和道具 ' + progress.ready + ' / ' + progress.total : '编排节目') : job.error || '上次筹备已中断')) + '</small></span>' +
          (this.book.running ? '' : '<button data-action="retry">继续筹备</button><button data-action="discard">放弃草稿</button>') + '</div>' : '') +
        '<div class="fb-entries">' + this.entries.map(e => '<button class="fb-entry" data-entry="' + esc(e.id) + '"><span class="fb-stamp">' +
        festivalStamp(e, portrait) + '</span><span><strong>' + esc(e.plan.title) + '</strong><small>' +
        locationName(e.plan.locationId) + ' · ' + e.plan.participants.length + ' 位岛民</small></span><b>›</b></button>').join('') + '</div>';
    }
  }

  dispose() {
    this.book.listeners.delete(this.onChange);
    clearTimeout(this.timer);
    this.close(false);
    this.focus.dispose();
    this.root.onclick = this.root.onsubmit = this.root.oninput = this.root.oncancel = this.root.onkeydown = null;
  }
}
