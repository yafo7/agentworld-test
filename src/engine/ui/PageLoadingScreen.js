export const DEFAULT_LOADING_PRESETS = Object.freeze({
  default: Object.freeze({
    title: '正在准备',
    detail: '内容即将就绪。',
  }),
  navigation: Object.freeze({
    title: '正在切换页面',
    detail: '马上就到。',
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
        <span class="chii-loader-face" aria-hidden="true"><i></i><i></i></span>
        <div>
          <span class="chii-loader-badge"></span>
          <strong data-page-loader-title></strong>
        </div>
      </div>
      <p data-page-loader-detail></p>
      <div class="chii-loader-dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <button class="chii-loader-retry" type="button" hidden>再试一次</button>
    </section>
  `;
}

function ensureRoot(brand) {
  let root = document.getElementById('chii-page-loader');
  if (!root) {
    root = document.createElement('div');
    root.id = 'chii-page-loader';
    root.className = 'chii-page-loader';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = loadingMarkup();
    document.body.prepend(root);
  }
  const badge = root.querySelector('.chii-loader-badge');
  if (badge) badge.textContent = brand;
  return root;
}

export class PageLoadingScreen {
  constructor({
    preset = 'default',
    presets = DEFAULT_LOADING_PRESETS,
    brand = 'APPLICATION',
    bindNavigation = true,
    minimumVisibleMs = 420,
  } = {}) {
    this.presets = presets;
    this.defaultCopy = presets[preset] || presets.default || DEFAULT_LOADING_PRESETS.default;
    this.navigationCopy = presets.navigation || DEFAULT_LOADING_PRESETS.navigation;
    this.root = ensureRoot(brand);
    this.title = this.root.querySelector('[data-page-loader-title], [data-chii-loader-title]');
    this.detail = this.root.querySelector('[data-page-loader-detail], [data-chii-loader-detail]');
    this.retryButton = this.root.querySelector('.chii-loader-retry');
    this.minimumVisibleMs = minimumVisibleMs;
    this.shownAt = performance.now();
    this.hideTimer = null;
    this.hiddenTimer = null;
    this.navigationHandler = event => this._handleNavigation(event);
    this.retryHandler = () => window.location.reload();
    this.pageshowHandler = event => {
      if (event.persisted) this.hide({ immediate: true });
    };
    this.retryButton?.addEventListener('click', this.retryHandler);
    if (bindNavigation) document.addEventListener('click', this.navigationHandler);
    window.addEventListener('pageshow', this.pageshowHandler);
    this.show(this.defaultCopy);
  }

  show({ title = this.defaultCopy.title, detail = this.defaultCopy.detail } = {}) {
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
    const delay = immediate
      ? 0
      : Math.max(0, this.minimumVisibleMs - (performance.now() - this.shownAt));
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

  fail({ title = '加载失败', detail = '请再试一次。' } = {}) {
    clearTimeout(this.hideTimer);
    clearTimeout(this.hiddenTimer);
    this.show({ title, detail });
    this.root.classList.add('is-error');
    this.root.setAttribute('aria-busy', 'false');
    this.retryButton.hidden = false;
    return this;
  }

  navigate(url, copy = this.navigationCopy) {
    this.show(copy);
    setTimeout(() => window.location.assign(url), 220);
  }

  reload(copy = this.navigationCopy) {
    this.show(copy);
    setTimeout(() => window.location.reload(), 220);
  }

  _handleNavigation(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[data-page-navigation], a[data-chii-navigation]');
    if (!anchor) return;
    event.preventDefault();
    this.navigate(anchor.href, {
      title: anchor.dataset.loadingTitle || this.navigationCopy.title,
      detail: anchor.dataset.loadingDetail || this.navigationCopy.detail,
    });
  }

  dispose() {
    clearTimeout(this.hideTimer);
    clearTimeout(this.hiddenTimer);
    document.removeEventListener('click', this.navigationHandler);
    window.removeEventListener('pageshow', this.pageshowHandler);
    this.retryButton?.removeEventListener('click', this.retryHandler);
    document.documentElement.classList.remove('chii-loading-active');
  }
}

export function createPageLoadingScreen(options) {
  return new PageLoadingScreen(options);
}
