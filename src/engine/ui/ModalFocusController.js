const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]';

/** Keyboard focus only. The owning system retains Escape and gameplay locks. */
export class ModalFocusController {
  constructor(root, { documentRef = root?.ownerDocument || globalThis.document } = {}) {
    this.root = root;
    this.document = documentRef;
    this.active = false;
    this.previous = null;
    this.onKeyDown = event => {
      if (!this.active || event.key !== 'Tab') return;
      const controls = this._controls();
      const first = controls[0];
      const last = controls.at(-1);
      const focused = this.document?.activeElement;
      if (!first) {
        event.preventDefault();
        this.root.focus?.();
      } else if (event.shiftKey && (focused === first || !controls.includes(focused))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focused === last || !controls.includes(focused))) {
        event.preventDefault();
        first.focus();
      }
    };
    root?.addEventListener?.('keydown', this.onKeyDown);
  }

  _controls() {
    return [...(this.root?.querySelectorAll?.(FOCUSABLE) || [])].filter(element =>
      !element.disabled && element.tabIndex >= 0 && !element.closest('[hidden], [inert]')
      && element.getClientRects().length > 0);
  }

  setOpen(open, preferred = null) {
    const next = Boolean(open);
    if (next === this.active) return;
    this.active = next;
    if (next) {
      this.previous = this.document?.activeElement;
      (preferred || this._controls()[0])?.focus?.({ preventScroll: true });
    } else {
      const previous = this.previous;
      this.previous = null;
      if (previous?.isConnected && !previous.closest?.('[hidden], [inert], [aria-hidden="true"]')) {
        previous.focus?.({ preventScroll: true });
      }
    }
  }

  dispose() {
    this.setOpen(false);
    this.root?.removeEventListener?.('keydown', this.onKeyDown);
  }
}
