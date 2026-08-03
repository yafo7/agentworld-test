export const CHII_LOADING_PRESETS = Object.freeze({
  island: Object.freeze({
    title: '奇异岛正在醒来',
    detail: '宠物们正在把今天的路牌摆正。',
  }),
  prologue: Object.freeze({
    title: '第0幕正在准备',
    detail: '请系好安全带，虽然它看起来有点松。',
  }),
  showcase: Object.freeze({
    title: '角色们正在入场',
    detail: '大家正在认真排队，孔雀除外。',
  }),
  category: Object.freeze({
    title: '正在调整展台',
    detail: '换一组角色上来，很快就好。',
  }),
  navigation: Object.freeze({
    title: '正在换一条小路',
    detail: '路牌转个方向，马上就到。',
  }),
  sceneStyle: Object.freeze({
    title: '正在更换岛上画风',
    detail: '树和花正在统一一下意见。',
  }),
});

function loadingMarkup() {
  return `
    <div class="chii-loader-scenery" aria-hidden="true">
      <span class="chii-loader-sun"></span>
      <span class="chii-loader-cloud chii-loader-cloud-a"></span>
      <span class="chii-loader-cloud chii-loader-cloud-b"></span>
      <span class="chii-loader-ground"></span>
      <span class="chii-loader-tile chii-loader-tile-a"></span>
      <span class="chii-loader-tile chii-loader-tile-b"></span>
      <span class="chii-loader-tile chii-loader-tile-c"></span>
    </div>
    <section class="chii-loader-bubble">
      <div class="chii-loader-heading">
        <span class="chii-loader-face" aria-hidden="true">
          <i></i><i></i>
        </span>
        <div>
          <span class="chii-loader-badge">CHII ISLAND</span>
          <strong data-chii-loader-title>奇异岛正在醒来</strong>
        </div>
      </div>
      <p data-chii-loader-detail>宠物们正在把今天的路牌摆正。</p>
      <div class="chii-loader-dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <button class="chii-loader-retry" type="button" hidden>再试一次</button>
    </section>
  `;
}

function ensureRoot() {
  let root = document.getElementById('chii-page-loader');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'chii-page-loader';
  root.className = 'chii-page-loader';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-busy', 'true');
  root.innerHTML = loadingMarkup();
  document.body.prepend(root);
  return root;
}

export class ChiiPageLoadingScreen {
  constructor({
    preset = 'island',
    bindNavigation = true,
    minimumVisibleMs = 420,
  } = {}) {
    this.root = ensureRoot();
    this.title = this.root.querySelector('[data-chii-loader-title]');
    this.detail = this.root.querySelector('[data-chii-loader-detail]');
    this.retryButton = this.root.querySelector('.chii-loader-retry');
    this.minimumVisibleMs = minimumVisibleMs;
    this.shownAt = performance.now();
    this.hideTimer = null;
    this.hiddenTimer = null;
    this.navigationHandler = event => this._handleNavigation(event);
    this.retryButton?.addEventListener('click', () => window.location.reload());
    if (bindNavigation) document.addEventListener('click', this.navigationHandler);
    window.addEventListener('pageshow', event => {
      if (event.persisted) this.hide({ immediate: true });
    });
    this.show(CHII_LOADING_PRESETS[preset] || CHII_LOADING_PRESETS.island);
  }

  show({
    title = CHII_LOADING_PRESETS.island.title,
    detail = CHII_LOADING_PRESETS.island.detail,
  } = {}) {
    clearTimeout(this.hideTimer);
    clearTimeout(this.hiddenTimer);
    this.root.hidden = false;
    this.root.classList.remove('is-leaving', 'is-error');
    this.root.setAttribute('aria-busy', 'true');
    this.title.textContent = title;
    this.detail.textContent = detail;
    this.retryButton.hidden = true;
    this.shownAt = performance.now();
    document.documentElement.classList.add('chii-loading-active');
    return this;
  }

  hide({ immediate = false } = {}) {
    clearTimeout(this.hideTimer);
    clearTimeout(this.hiddenTimer);
    const elapsed = performance.now() - this.shownAt;
    const delay = immediate ? 0 : Math.max(0, this.minimumVisibleMs - elapsed);
    this.hideTimer = setTimeout(() => {
      this.root.classList.add('is-leaving');
      this.root.setAttribute('aria-busy', 'false');
      this.hiddenTimer = setTimeout(() => {
        this.root.hidden = true;
        this.root.classList.remove('is-leaving');
        document.documentElement.classList.remove('chii-loading-active');
      }, immediate ? 0 : 280);
    }, delay);
    return this;
  }

  fail({
    title = '小岛打了个喷嚏',
    detail = '有一块地砖没站稳，请再试一次。',
  } = {}) {
    clearTimeout(this.hideTimer);
    clearTimeout(this.hiddenTimer);
    this.show({ title, detail });
    this.root.classList.add('is-error');
    this.root.setAttribute('aria-busy', 'false');
    this.retryButton.hidden = false;
    return this;
  }

  navigate(url, copy = CHII_LOADING_PRESETS.navigation) {
    this.show(copy);
    setTimeout(() => window.location.assign(url), 220);
  }

  reload(copy = CHII_LOADING_PRESETS.navigation) {
    this.show(copy);
    setTimeout(() => window.location.reload(), 220);
  }

  _handleNavigation(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[data-chii-navigation]');
    if (!anchor) return;
    event.preventDefault();
    this.navigate(anchor.href, {
      title: anchor.dataset.loadingTitle || CHII_LOADING_PRESETS.navigation.title,
      detail: anchor.dataset.loadingDetail || CHII_LOADING_PRESETS.navigation.detail,
    });
  }

  dispose() {
    clearTimeout(this.hideTimer);
    clearTimeout(this.hiddenTimer);
    document.removeEventListener('click', this.navigationHandler);
    document.documentElement.classList.remove('chii-loading-active');
  }
}

export function createChiiPageLoadingScreen(options) {
  return new ChiiPageLoadingScreen(options);
}
