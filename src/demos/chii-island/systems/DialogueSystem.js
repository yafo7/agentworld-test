const DIALOGUE_STYLES = `
  #dialogue-root {
    position: fixed; inset: 0; z-index: 250;
    display: none; align-items: flex-end; justify-content: center;
    pointer-events: none;
  }
  #dialogue-root.active { display: flex; }
  #dialogue-root [hidden] { display: none !important; }
  .dialogue-box {
    pointer-events: auto;
    width: min(640px, 90vw); min-width: min(420px, 90vw);
    box-sizing: border-box; max-width: calc(100vw - 24px);
    margin-bottom: 22px; padding: 16px 22px;
    border: 3px solid #2a2330; border-radius: 8px;
    background: #fdf6e3; color: #2a2330;
    box-shadow: 6px 6px 0 rgba(42, 35, 48, 0.3);
    display: flex; flex-direction: column; gap: 10px;
    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  }
  .dialogue-header { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; }
  .dialogue-dot { width: 12px; height: 12px; border-radius: 50%; background: #e9b44c; flex: 0 0 auto; }
  .dialogue-body { min-height: 48px; font-size: 15px; line-height: 1.7; }
  .dialogue-input-row { display: flex; gap: 8px; }
  .dialogue-input {
    flex: 1; min-width: 0; padding: 8px 12px;
    border: 2px solid #2a2330; border-radius: 6px;
    background: #fff; color: #2a2330; outline: none;
    font: inherit; font-size: 14px;
  }
  .dialogue-input:focus { border-color: #e9b44c; }
  .dialogue-send {
    padding: 8px 16px; border: 2px solid #2a2330; border-radius: 6px;
    background: #4a90d9; color: #fff; cursor: pointer; font: inherit; font-size: 14px;
  }
  .dialogue-hints { padding-top: 8px; border-top: 1px dashed #ccc; color: #776b7e; font-size: 11px; text-align: center; }
  .dialogue-choices { display: flex; flex-direction: column; gap: 8px; max-height: min(42vh, 360px); overflow-x: hidden; overflow-y: auto; }
  .dialogue-choice-btn {
    padding: 10px 16px; border: 2px solid #2a2330; border-radius: 8px;
    background: #fff8e7; color: #2a2330; cursor: pointer;
    font: inherit; font-size: 14px; text-align: left;
  }
  .dialogue-choice-btn:hover, .dialogue-choice-btn.focused { background: #e9b44c; color: #fff6e5; transform: translateX(4px); }
`;

function optionRecord(option, index) {
  if (typeof option === 'string') return { key: String(index), label: option };
  return {
    key: option?.key ?? String(index),
    label: option?.label ?? String(option?.key ?? index),
  };
}

export function createDialogueSystem() {
  let root = null;
  let textElement = null;
  let inputRow = null;
  let textInput = null;
  let sendButton = null;
  let hintElement = null;
  let choicesElement = null;
  let speakerNameElement = null;
  let active = false;
  let mode = null;
  let choiceIndex = 0;
  let options = [];
  let resolveActive = null;
  let timer = null;
  let onDialogueEnd = null;
  let defaultSpeakerName = 'momo';

  function ensureContainer() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'dialogue-root';
    root.innerHTML = `
      <div class="dialogue-box">
        <div class="dialogue-header"><span class="dialogue-dot"></span><span class="dialogue-name"></span></div>
        <div class="dialogue-body"><span class="dialogue-text"></span></div>
        <div class="dialogue-input-row" hidden>
          <input type="text" class="dialogue-input" />
          <button class="dialogue-send" type="button">发送</button>
        </div>
        <div class="dialogue-choices" hidden></div>
        <div class="dialogue-hints"></div>
      </div>
    `;
    document.body.appendChild(root);

    if (!document.getElementById('dialogue-styles')) {
      const style = document.createElement('style');
      style.id = 'dialogue-styles';
      style.textContent = DIALOGUE_STYLES;
      document.head.appendChild(style);
    }

    textElement = root.querySelector('.dialogue-text');
    inputRow = root.querySelector('.dialogue-input-row');
    textInput = root.querySelector('.dialogue-input');
    sendButton = root.querySelector('.dialogue-send');
    hintElement = root.querySelector('.dialogue-hints');
    choicesElement = root.querySelector('.dialogue-choices');
    speakerNameElement = root.querySelector('.dialogue-name');
    sendButton.addEventListener('click', submitInput);
    textInput.addEventListener('keydown', handleInputKeydown);
  }

  function open({ speakerName, text }) {
    if (active) hide();
    ensureContainer();
    active = true;
    mode = null;
    options = [];
    choiceIndex = 0;
    root.classList.add('active');
    speakerNameElement.textContent = speakerName || defaultSpeakerName;
    textElement.textContent = text || '';
    inputRow.hidden = true;
    choicesElement.hidden = true;
    choicesElement.replaceChildren();
  }

  function finish(value, { notifyEnd = false } = {}) {
    if (!active) return;
    clearTimeout(timer);
    timer = null;
    const resolve = resolveActive;
    resolveActive = null;
    active = false;
    mode = null;
    options = [];
    root?.classList.remove('active');
    if (inputRow) inputRow.hidden = true;
    if (choicesElement) choicesElement.hidden = true;
    resolve?.(value);
    if (notifyEnd) onDialogueEnd?.();
  }

  function hide() {
    finish(null, { notifyEnd: true });
  }

  function submitInput() {
    if (mode !== 'input') return;
    const value = textInput.value.trim();
    if (value) finish(value);
  }

  function handleInputKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      hide();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      submitInput();
    }
  }

  function selectChoice(index) {
    if (mode !== 'choice' || index < 0 || index >= options.length) return;
    finish({ index, ...options[index] });
  }

  function renderChoices() {
    choicesElement.replaceChildren();
    for (const [index, option] of options.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `dialogue-choice-btn${index === choiceIndex ? ' focused' : ''}`;
      button.textContent = option.label;
      button.addEventListener('click', () => selectChoice(index));
      choicesElement.appendChild(button);
    }
  }

  function updateChoiceFocus() {
    const buttons = choicesElement?.querySelectorAll('.dialogue-choice-btn') || [];
    buttons.forEach((button, index) => button.classList.toggle('focused', index === choiceIndex));
    buttons[choiceIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function handleKeydown(event) {
    if (!active || event.target === textInput) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      hide();
      return;
    }
    if (mode === 'choice') {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const delta = event.key === 'ArrowUp' ? -1 : 1;
        choiceIndex = Math.max(0, Math.min(options.length - 1, choiceIndex + delta));
        updateChoiceFocus();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        selectChoice(choiceIndex);
      }
      return;
    }
    if (mode === 'message' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      finish(true);
    }
  }
  window.addEventListener('keydown', handleKeydown);

  function askChoice({ speakerName, text, options: choices }) {
    return new Promise(resolve => {
      open({ speakerName, text });
      resolveActive = resolve;
      mode = 'choice';
      options = (choices || []).map(optionRecord);
      choicesElement.hidden = false;
      hintElement.textContent = '上下选择 · Enter 确认 · Esc 关闭';
      renderChoices();
    });
  }

  function askInput({ speakerName, text, placeholder }) {
    return new Promise(resolve => {
      open({ speakerName, text });
      resolveActive = resolve;
      mode = 'input';
      inputRow.hidden = false;
      textInput.placeholder = placeholder || '输入具体描述...';
      textInput.value = '';
      hintElement.textContent = '输入后按 Enter 发送 · Esc 关闭';
      setTimeout(() => textInput.focus(), 100);
    });
  }

  function say({ speakerName, text }) {
    return new Promise(resolve => {
      open({ speakerName, text });
      resolveActive = resolve;
      mode = 'message';
      hintElement.textContent = 'Enter / Space 继续 · Esc 关闭';
    });
  }

  function sayTimed({ speakerName, text, duration = 2800 }) {
    if (active) return Promise.resolve(false);
    return new Promise(resolve => {
      open({ speakerName, text });
      resolveActive = resolve;
      mode = 'message';
      hintElement.textContent = 'Enter / Space 继续';
      timer = setTimeout(() => finish(true), Math.max(900, Number(duration) || 2800));
    });
  }

  function dispose() {
    hide();
    window.removeEventListener('keydown', handleKeydown);
    sendButton?.removeEventListener('click', submitInput);
    textInput?.removeEventListener('keydown', handleInputKeydown);
    root?.remove();
    root = null;
  }

  return {
    askChoice,
    askInput,
    say,
    sayTimed,
    hide,
    update() {},
    isActive: () => active,
    setOnDialogueEnd(callback) { onDialogueEnd = callback; },
    setPetSpeakerName(name) { defaultSpeakerName = name || 'momo'; },
    dispose,
  };
}
