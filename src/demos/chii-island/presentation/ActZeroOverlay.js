import { ACT_ZERO_WISH_MAX_LENGTH } from '../story/ActZeroStoryState.js';
import { CinematicScreenEffectPresenter } from './cinematic/CinematicScreenEffectPresenter.js';

const STYLE_ID = 'chii-act-zero-styles';

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body.chii-act-zero-active #runtime-world,
    body.chii-act-zero-active #runtime-job,
    body.chii-act-zero-active #runtime-perf,
    body.chii-act-zero-active #interact-prompt,
    body.chii-act-zero-active #interaction-hints,
    body.chii-act-zero-active #object-editor {
      display: none !important;
    }
    #chii-act-zero-ui {
      position: fixed;
      inset: 0;
      z-index: 320;
      pointer-events: none;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      color: #272430;
    }
    .act-zero-caption {
      position: absolute;
      left: 50%;
      bottom: 24px;
      width: min(680px, calc(100vw - 32px));
      transform: translateX(-50%) translateY(12px);
      padding: 16px 18px 14px;
      border: 3px solid #292532;
      border-radius: 8px;
      background: #fff7dc;
      box-shadow: 6px 6px 0 rgba(18, 20, 29, 0.38);
      opacity: 0;
      transition: opacity 180ms ease, transform 180ms ease;
      pointer-events: auto;
    }
    .act-zero-caption.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .act-zero-speaker {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 22px;
      margin-bottom: 7px;
      color: #ba5c38;
      font-size: 15px;
      font-weight: 800;
    }
    .act-zero-speaker-dot {
      width: 12px;
      height: 12px;
      border: 2px solid #292532;
      border-radius: 50%;
      background: #ffd45c;
    }
    .act-zero-text {
      min-height: 32px;
      font-size: 16px;
      line-height: 1.7;
    }
    .act-zero-input-row {
      display: none;
      grid-template-columns: 1fr auto;
      gap: 9px;
      margin-top: 11px;
    }
    .act-zero-input-row.visible {
      display: grid;
    }
    .act-zero-input {
      min-width: 0;
      padding: 10px 12px;
      border: 2px solid #292532;
      border-radius: 6px;
      outline: none;
      background: #fff;
      color: #272430;
      font: inherit;
    }
    .act-zero-input:focus {
      border-color: #e78b47;
      box-shadow: 0 0 0 3px rgba(231, 139, 71, 0.2);
    }
    .act-zero-send,
    .act-zero-skip {
      border: 2px solid #292532;
      border-radius: 6px;
      background: #e97845;
      color: #fff;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .act-zero-send {
      padding: 9px 17px;
    }
    .act-zero-send:hover,
    .act-zero-skip:hover {
      background: #f08b5d;
    }
    .act-zero-skip {
      position: absolute;
      top: 18px;
      right: 18px;
      padding: 8px 13px;
      background: rgba(255, 247, 220, 0.92);
      color: #292532;
      pointer-events: auto;
    }
    .act-zero-status {
      position: absolute;
      top: 24px;
      left: 50%;
      display: none;
      align-items: center;
      gap: 10px;
      transform: translateX(-50%);
      padding: 8px 13px;
      border: 2px solid rgba(255,255,255,0.7);
      border-radius: 999px;
      background: rgba(23, 26, 39, 0.78);
      color: #fff8db;
      font-size: 14px;
      font-weight: 700;
    }
    .act-zero-status.visible {
      display: flex;
    }
    .act-zero-spinner {
      width: 14px;
      height: 14px;
      border: 3px solid rgba(255,255,255,0.3);
      border-top-color: #ffd45c;
      border-radius: 50%;
      animation: act-zero-spin 650ms linear infinite;
    }
    @keyframes act-zero-spin {
      to { transform: rotate(360deg); }
    }
    @media (max-width: 640px) {
      .act-zero-caption {
        bottom: 14px;
        padding: 13px;
      }
      .act-zero-input-row {
        grid-template-columns: 1fr;
      }
      .act-zero-send {
        width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

export class ActZeroOverlay {
  constructor() {
    installStyles();
    this.root = document.createElement('div');
    this.root.id = 'chii-act-zero-ui';
    this.root.innerHTML = `
      <button class="act-zero-skip" type="button" title="跳过序幕">跳过序幕</button>
      <div class="act-zero-status" role="status">
        <span class="act-zero-spinner"></span>
        <span class="act-zero-status-text">正在生成</span>
      </div>
      <section class="act-zero-caption" aria-live="polite">
        <div class="act-zero-speaker">
          <span class="act-zero-speaker-dot"></span>
          <span class="act-zero-speaker-name">旁白</span>
        </div>
        <div class="act-zero-text"></div>
        <form class="act-zero-input-row">
          <input class="act-zero-input" type="text" maxlength="${ACT_ZERO_WISH_MAX_LENGTH}" autocomplete="off" />
          <button class="act-zero-send" type="submit">发送</button>
        </form>
      </section>
    `;
    document.body.appendChild(this.root);
    document.body.classList.add('chii-act-zero-active');

    this.screenEffects = new CinematicScreenEffectPresenter({ parent: this.root });
    this.caption = this.root.querySelector('.act-zero-caption');
    this.speaker = this.root.querySelector('.act-zero-speaker-name');
    this.text = this.root.querySelector('.act-zero-text');
    this.inputRow = this.root.querySelector('.act-zero-input-row');
    this.input = this.root.querySelector('.act-zero-input');
    this.status = this.root.querySelector('.act-zero-status');
    this.statusText = this.root.querySelector('.act-zero-status-text');
    this.skipButton = this.root.querySelector('.act-zero-skip');
    this.inputResolve = null;

    this.inputRow.addEventListener('submit', event => {
      event.preventDefault();
      const value = this.input.value.trim();
      if (!value || !this.inputResolve) return;
      const resolve = this.inputResolve;
      this.inputResolve = null;
      this.inputRow.classList.remove('visible');
      resolve(value);
    });
  }

  onSkip(handler) {
    this.skipButton.onclick = handler;
  }

  setPhase(phase) {
    this.root.dataset.phase = phase;
  }

  setSkipVisible(visible) {
    this.skipButton.style.display = visible ? '' : 'none';
  }

  setFade(opacity, durationMs = 320) {
    this.screenEffects.setSolidFade(opacity, durationMs);
  }

  applyCinematicTransition(transitionId, progress, options = {}) {
    this.screenEffects.apply(transitionId, progress, options);
  }

  clearCinematicTransition() {
    this.screenEffects.clear();
  }

  showCaption(speaker, text) {
    this.speaker.textContent = speaker || '旁白';
    this.text.textContent = text || '';
    this.inputRow.classList.remove('visible');
    this.caption.classList.add('visible');
  }

  hideCaption() {
    this.caption.classList.remove('visible');
    this.inputRow.classList.remove('visible');
  }

  askWish({ speaker, text, placeholder }) {
    this.showCaption(speaker, text);
    this.input.value = '';
    this.input.placeholder = placeholder || '输入一个具体的东西';
    this.inputRow.classList.add('visible');
    setTimeout(() => this.input.focus(), 50);
    return new Promise(resolve => {
      this.inputResolve = resolve;
    });
  }

  showStatus(text = '正在生成') {
    this.statusText.textContent = text;
    this.status.classList.add('visible');
  }

  hideStatus() {
    this.status.classList.remove('visible');
  }

  dispose() {
    if (this.inputResolve) {
      this.inputResolve(null);
      this.inputResolve = null;
    }
    document.body.classList.remove('chii-act-zero-active');
    this.screenEffects.dispose();
    this.root.remove();
  }
}
