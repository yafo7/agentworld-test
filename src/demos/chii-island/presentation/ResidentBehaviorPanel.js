import { directionKey, getDirection } from '../data/residentRoutines.js';
import { residentDay } from '../data/residentDay.js';
import { describeResidentThemes, editableResidentThemes, restoreThemeEdits, validateThemeEdits } from '../data/residentThemes.js';
import { createChiiAnimalAgentProfile } from '../data/animalAgentProfiles.js';
import { parseResidentBehaviorResponse, withPlanningTimeout } from '../../../gameplay/agents/ResidentBehaviorSystem.js';
import { PromptCompiler } from '../../../gameplay/ai/prompts/PromptCompiler.js';
import { defaultContentGeneration } from '../../../integrations/content/VoxelContentAdapter.js';

const labels = { choice: '可选动作', sequence: '动作步骤', phase: '按活动阶段' };

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

export class ResidentBehaviorPanel {
  constructor({ getSelected, getAnimations, preview, store }) {
    Object.assign(this, { getSelected, getAnimations, preview, store });
    this.switcher = document.querySelector('#resident-view-switch');
    this.button = document.querySelector('#behavior-details-button');
    this.appearanceButton = document.querySelector('#resident-appearance-button');
    this.appearance = document.querySelector('#resident-appearance');
    this.panel = document.querySelector('#resident-behavior');
    this.content = document.querySelector('#behavior-details-content');
    this.form = document.querySelector('#behavior-edit-form');
    this.scope = document.querySelector('#behavior-scope');
    this.input = document.querySelector('#behavior-direction');
    this.feedback = document.querySelector('#behavior-edit-status');
    this.submit = this.form.querySelector('[type=submit]');
    this.pending = new Set();
    this.button.onclick = () => this.open(true);
    this.appearanceButton.onclick = () => this.open(false);
    this.form.onsubmit = event => { event.preventDefault(); void this.edit(); };
    this.scope.onchange = () => {
      this.input.placeholder = this.scope.value ? '说说你希望它在这个状态下做什么' : '例如，让它在空闲时更爱锻炼';
    };
    window.addEventListener('storage', event => {
      if (!this.panel.hidden && (event.key?.startsWith('chii_animal_agents_v1:') || event.key === directionKey(this.store.scope, this.residentId))) this.render();
    });
    window.addEventListener('focus', () => { if (!this.panel.hidden) this.render(); });
  }

  select(available) {
    this.switcher.hidden = !available;
    const id = this.getSelected()?.id;
    if (id !== this.residentId) {
      this.residentId = id;
      this.inspected = null;
      this.scope.replaceChildren();
      this.scopeSignature = null;
      this.input.value = '';
      this.feedback.textContent = '';
      this.submit.disabled = this.pending.has(id);
    }
    if (!available) this.open(false);
    else if (!this.panel.hidden) this.render();
  }

  open(visible) {
    this.panel.hidden = !visible;
    this.appearance.hidden = visible;
    this.button.setAttribute('aria-pressed', String(visible));
    this.appearanceButton.setAttribute('aria-pressed', String(!visible));
    if (visible) this.render();
  }

  state() {
    const id = this.residentId;
    const animations = this.getAnimations();
    const saved = this.store.load(id)?.behavior;
    const direction = getDirection(this.store.scope, id);
    const themes = describeResidentThemes(id, animations);
    for (const data of [saved, direction]) {
      if (!data?.edits?.length) continue;
      Object.assign(themes, restoreThemeEdits(data.edits, themes, animations));
    }
    const day = residentDay(id, themes);
    for (const data of [saved, direction]) {
      const edits = data?.edits?.filter(edit => Object.hasOwn(day, edit.themeId));
      if (edits?.length) {
        Object.assign(day, restoreThemeEdits(edits, day, animations));
      }
    }
    return { themes: day, saved, direction, animations };
  }

  render() {
    const { themes, saved, direction, animations } = this.state();
    const live = saved?.live;
    const current = live && Object.hasOwn(themes, live.themeId) ? live.themeId : null;
    const id = Object.hasOwn(themes, this.inspected) ? this.inspected : current || 'morning';
    const theme = themes[id] || themes.daily;
    const fragment = document.createDocumentFragment();
    const summary = node('section', 'resident-now');
    summary.append(node('h3', '', '日常作息'), node('p', '', current
      ? [themes[current].when, live.action, live.target].filter(Boolean).join(' · ')
      : '平日按岛上的时间活动。'));
    fragment.append(summary);
    const list = node('div', 'resident-themes');
    for (const [themeId, entry] of Object.entries(themes)) {
      const button = node('button', '', entry.hours + ' · ' + entry.name);
      button.type = 'button';
      button.dataset.themeId = themeId;
      button.setAttribute('aria-pressed', String(themeId === id));
      if (themeId === current) button.append(node('span', '', '当前'));
      button.onclick = () => {
        this.inspected = themeId;
        this.render();
        this.content.querySelector(`[data-theme-id="${themeId}"]`)?.focus({ preventScroll: true });
      };
      list.append(button);
    }
    fragment.append(list);
    const detail = node('section', 'resident-theme-detail');
    detail.append(node('h3', '', theme.name), node('p', '', theme.when), node('h4', '', labels[theme.mode]));
    const actions = node(theme.mode === 'sequence' ? 'ol' : 'ul', 'resident-actions');
    theme.actions.forEach(action => {
      const item = node('li', 'resident-action');
      if (action.phase) item.append(node('small', '', action.phase));
      item.append(node('span', '', action.name));
      if (action.generation) item.append(node('small', '', '新动作 · 在岛上准备'));
      if (id === current && action.name === live.action) item.append(node('b', '', '执行中'));
      if (animations.includes(action.animation)) {
        const play = node('button', '', '预览');
        play.type = 'button';
        play.setAttribute('aria-label', '预览' + action.name);
        play.onclick = () => {
          this.preview(action.animation);
          this.content.querySelectorAll('.resident-action button').forEach(button => button.setAttribute('aria-pressed', String(button === play)));
        };
        item.append(play);
      }
      actions.append(item);
    });
    detail.append(actions);

    if (live?.reason && id === current) detail.append(node('p', 'resident-now-meta', live.reason));
    if (direction?.text && direction.edits?.some(edit => Object.hasOwn(themes, edit.themeId))) detail.append(node('p', 'resident-now-meta', '上次调整 · ' + direction.text));
    if (saved?.error) detail.append(node('p', 'resident-now-meta', saved.error));
    fragment.append(detail);
    const focused = this.content.contains(document.activeElement) && document.activeElement.dataset.themeId;
    this.content.replaceChildren(fragment);
    if (focused) this.content.querySelector(`[data-theme-id="${focused}"]`)?.focus({ preventScroll: true });
    const previousScope = this.scope.value;
    const options = [node('option', '', '整体偏好')];
    options[0].value = '';
    for (const [themeId, entry] of Object.entries(editableResidentThemes(themes))) {
      const option = node('option', '', '只调整' + entry.name);
      option.value = themeId;
      options.push(option);
    }
    const scopeSignature = options.map(option => [option.value, option.textContent]).join('|');
    if (scopeSignature !== this.scopeSignature) {
      this.scopeSignature = scopeSignature;
      this.scope.replaceChildren(...options);
      this.scope.value = options.some(option => option.value === previousScope) ? previousScope : '';
    }
  }

  async edit() {
    const id = this.residentId;
    const text = this.input.value.trim();
    const scope = this.scope.value;
    if (!id || !text || this.pending.has(id)) return;
    const { themes, direction, animations } = this.state();
    this.pending.add(id);
    this.submit.disabled = true;
    this.feedback.textContent = '正在调整居民行为…';
    try {
      const context = {
        task: 'editThemes', scope, residents: [{ residentId: id, profile: createChiiAnimalAgentProfile(id),
          themes: editableResidentThemes(themes), animations, playerDirection: text }],
      };
      const compiler = new PromptCompiler();
      const packet = compiler.compile({ operation: 'resident.behavior', source: { text }, input: { context } });
      const raw = await withPlanningTimeout(defaultContentGeneration.chat(packet.payload), 60_000);
      const result = parseResidentBehaviorResponse(raw);
      const proposal = result.proposals?.find(entry => entry.residentId === id);
      if (!proposal?.edits?.length) throw new Error(proposal?.reason || '这次没有可应用的修改');
      const edits = validateThemeEdits(proposal.edits, themes, animations, scope);
      if (getDirection(this.store.scope, id)?.revision !== direction?.revision) throw new Error('另一页刚刚更新了这位居民，请再试一次');
      const previous = (direction?.edits || []).filter(edit => !Object.hasOwn(edits, edit.themeId));
      const next = [...previous, ...proposal.edits];
      const changes = Object.values(edits).map(theme => theme.name).join('、');
      const reason = typeof proposal.reason === 'string' ? proposal.reason.slice(0, 160) : changes;
      this.store.storage.setItem(directionKey(this.store.scope, id), JSON.stringify({
        text, edits: next, reason, revision: globalThis.crypto?.randomUUID?.() || String(Date.now()),
      }));
      if (id === this.residentId) {
        this.inspected = Object.keys(edits)[0];
        this.render();
        this.feedback.textContent = '已更新' + changes + '。' + reason;
      }
    } catch (error) {
      if (id === this.residentId) this.feedback.textContent = '调整未保存。' + (error.message.startsWith('Backend') ? '稍后可再试。' : error.message.slice(0, 100));
    } finally {
      this.pending.delete(id);
      if (id === this.residentId) this.submit.disabled = false;
    }
  }
}
