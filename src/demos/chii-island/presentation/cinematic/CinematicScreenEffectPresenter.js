import {
  CINEMATIC_TRANSITION_IDS,
  sampleCinematicTransition,
} from './CinematicTemplateLibrary.js';

const STYLE_ID = 'chii-cinematic-screen-effect-styles';

function installStyles(documentRef) {
  if (documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cinematic-screen-effects {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }
    .cinematic-screen-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .cinematic-screen-iris {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 200vmax;
      height: 200vmax;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 3vmax 200vmax #05070b;
      opacity: 0;
      will-change: width, height, opacity;
    }
    .cinematic-screen-blur {
      background: rgba(5, 7, 11, 0.08);
      opacity: 0;
      backdrop-filter: blur(0);
    }
    .cinematic-screen-eyelid {
      position: absolute;
      left: -4%;
      width: 108%;
      height: 52%;
      background: #05070b;
      will-change: transform;
    }
    .cinematic-screen-eyelid.top {
      top: 0;
      border-radius: 0 0 52% 52%;
      transform: translateY(-100%);
      transform-origin: top;
    }
    .cinematic-screen-eyelid.bottom {
      bottom: 0;
      border-radius: 52% 52% 0 0;
      transform: translateY(100%);
      transform-origin: bottom;
    }
    .cinematic-screen-solid {
      background: #05070b;
      opacity: 0;
      transition: opacity 0ms ease;
    }
    .cinematic-screen-flash {
      background: #ffffff;
      opacity: 0;
    }
    @media (prefers-reduced-motion: reduce) {
      .cinematic-screen-solid {
        transition-duration: 0ms !important;
      }
    }
  `;
  documentRef.head.appendChild(style);
}

export class CinematicScreenEffectPresenter {
  constructor({ parent, documentRef = globalThis.document } = {}) {
    if (!parent || !documentRef) {
      throw new TypeError('CinematicScreenEffectPresenter requires a parent and document');
    }
    installStyles(documentRef);
    this.document = documentRef;
    this.root = documentRef.createElement('div');
    this.root.className = 'cinematic-screen-effects';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <div class="cinematic-screen-iris"></div>
      <div class="cinematic-screen-layer cinematic-screen-blur"></div>
      <div class="cinematic-screen-layer cinematic-screen-blink">
        <div class="cinematic-screen-eyelid top"></div>
        <div class="cinematic-screen-eyelid bottom"></div>
      </div>
      <div class="cinematic-screen-layer cinematic-screen-solid"></div>
      <div class="cinematic-screen-layer cinematic-screen-flash"></div>
    `;
    parent.prepend(this.root);
    this.iris = this.root.querySelector('.cinematic-screen-iris');
    this.blur = this.root.querySelector('.cinematic-screen-blur');
    this.topEyelid = this.root.querySelector('.cinematic-screen-eyelid.top');
    this.bottomEyelid = this.root.querySelector('.cinematic-screen-eyelid.bottom');
    this.solid = this.root.querySelector('.cinematic-screen-solid');
    this.flash = this.root.querySelector('.cinematic-screen-flash');
    this.clear();
  }

  apply(transitionId, progress, options = {}) {
    this._applyState(sampleCinematicTransition(transitionId, progress, options));
  }

  setSolidFade(opacity, durationMs = 320) {
    this.solid.style.transitionDuration = `${Math.max(0, durationMs)}ms`;
    this.solid.style.opacity = String(Math.max(0, Math.min(1, opacity)));
  }

  clear() {
    this._applyState(sampleCinematicTransition(CINEMATIC_TRANSITION_IDS.CUT, 1));
  }

  _applyState(state) {
    const closure = Math.max(0, Math.min(1, state.eyelidClosure));
    this.solid.style.transitionDuration = '0ms';
    this.solid.style.opacity = String(state.solidBlackOpacity);
    this.iris.style.left = `${state.irisCenterX}%`;
    this.iris.style.top = `${state.irisCenterY}%`;
    this.iris.style.width = `${state.irisRadiusVmax * 2}vmax`;
    this.iris.style.height = `${state.irisRadiusVmax * 2}vmax`;
    this.iris.style.boxShadow = `0 0 ${Math.max(0, state.irisFeatherVmax)}vmax 200vmax #05070b`;
    this.iris.style.opacity = String(state.irisOpacity);
    this.topEyelid.style.transform = `translateY(${-100 + closure * 100}%)`;
    this.bottomEyelid.style.transform = `translateY(${100 - closure * 100}%)`;
    this.blur.style.opacity = state.blurPx > 0 ? '1' : '0';
    this.blur.style.backdropFilter = `blur(${Math.max(0, state.blurPx)}px)`;
    this.flash.style.opacity = String(state.flashOpacity);
  }

  dispose() {
    this.root.remove();
  }
}
