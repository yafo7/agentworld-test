/**
 * Dialogue system — DOM overlay with typewriter, graph engine, player input.
 * No GSAP, no XState. Simple dt-driven typewriter + keydown event handling.
 *
 * Usage:
 *   const ds = createDialogueSystem();
 *   ds.onTriggerConstruction = (building, desc) => { ... };
 *   ds.onPanCamera = (building) => { ... };
 *   ds.onSwitchToIntro = () => { ... };
 *   ds.show('architect_intro', buildingEntity);
 *   ds.update(dt); // called each frame
 *   ds.hide();
 */
export function createDialogueSystem() {
  // --- state ---
  let _active = false;
  let _currentGraphName = '';
  let _currentNodeIndex = 0;
  let _currentGraph = null;
  let _buildingEntity = null;

  // Typewriter
  let _twText = '';
  let _twIndex = 0;
  let _twAccum = 0;
  let _twDone = false;
  let _twOnComplete = null;
  const TW_SPEED = 35; // chars per second

  // Player input node
  let _inputActive = false;
  let _playerDescription = '';
  let _playerAccepted = false;

  // Thinking delay
  let _thinkingTimer = 0;
  let _thinkingActive = false;

  // Choice state
  let _choiceActive = false;
  let _choiceIndex = 0;
  let _choiceCallbacks = null; // { onSelect(choiceKey) }
  let _customResolve = null;
  let _customChoiceOptions = null;
  let _customInputMode = false;
  let _customMessageMode = false;

  // --- callbacks ---
  let _onTriggerConstruction = null;
  let _onPanCamera = null;
  let _onSwitchToIntro = null;
  let _onBearFollow = null;
  let _onBearResume = null;
  let _onBearChopTree = null;
  let _onDialogueEnd = null; // called when dialogue closes (Esc or end node)

  // --- DOM refs (populated on first show) ---
  let _root = null;
  let _textEl = null;
  let _cursorEl = null;
  let _inputRow = null;
  let _textInput = null;
  let _sendBtn = null;
  let _hintEl = null;
  let _choicesEl = null;
  let _speakerDot = null;
  let _speakerName = null;
  let _petSpeakerName = 'momo';

  // --- dialogue graphs ---
  const GRAPHS = {
    architect_intro: {
      nodes: [
        { id: 'greet', speaker: 'architect', text: '欢迎回来！我可以帮你改造建筑。告诉我你想要什么样的变化？' },
        { id: 'ask', speaker: 'player_input', prompt: '描述你想要的变化...' },
        { id: 'think', speaker: 'architect', text: '让我想想...', isPause: true, pauseMs: 1500 },
        { id: 'accepted', speaker: 'architect', text: '好主意！我这就开始施工。', onExit: 'trigger_construction' },
        { id: 'end', speaker: 'none' },
      ],
      edges: [
        { from: 'greet', to: 'ask' },
        { from: 'ask', to: 'think' },
        { from: 'think', to: 'accepted' },
        { from: 'accepted', to: 'end' },
      ],
    },
    architect_busy: {
      nodes: [
        { id: 'busy', speaker: 'architect', text: '施工还在进行中，请稍后再来。' },
        { id: 'player_ok', speaker: 'player', text: '好的，我过会儿再来。' },
        { id: 'end', speaker: 'none' },
      ],
      edges: [
        { from: 'busy', to: 'player_ok' },
        { from: 'player_ok', to: 'end' },
      ],
    },
    bear_chop_tree: {
      nodes: [
        { id: 'start', speaker: 'npc', text: '是要砍掉这棵树吗？', speakerName: 'momo' },
        { id: 'choice', speaker: 'choice', text: '', options: ['是的！请开始吧。', '再想想'] },
        { id: 'chop', speaker: 'npc', text: '好的，交给我！', speakerName: 'momo', onExit: 'bear_chop_tree' },
        { id: 'rethink', speaker: 'player', text: '再想想。' },
        { id: 'end', speaker: 'none', onEnter: 'bear_resume' },
        { id: 'end_chop', speaker: 'none' },
      ],
      edges: [
        { from: 'start', to: 'choice' },
        { from: 'choice', to: 'chop', choiceKey: 'chop' },
        { from: 'choice', to: 'rethink', choiceKey: 'rethink' },
        { from: 'chop', to: 'end_chop' },
        { from: 'rethink', to: 'end' },
      ],
    },
    bear_greet: {
      nodes: [
        { id: 'start', speaker: 'npc', text: '你好呀，有什么事吗？', speakerName: 'momo' },
        { id: 'choice', speaker: 'choice', text: '', options: ['可以来帮我个忙吗？', '没什么'] },
        { id: 'help', speaker: 'npc', text: '好呀好呀！', speakerName: 'momo', onExit: 'bear_follow' },
        { id: 'nothing', speaker: 'player', text: '没什么。' },
        { id: 'end', speaker: 'none', onEnter: 'bear_resume' },
        { id: 'end_help', speaker: 'none' },
      ],
      edges: [
        { from: 'start', to: 'choice' },
        { from: 'choice', to: 'help', choiceKey: 'help' },
        { from: 'choice', to: 'nothing', choiceKey: 'nothing' },
        { from: 'help', to: 'end_help' },
        { from: 'nothing', to: 'end' },
      ],
    },
    architect_followup: {
      nodes: [
        { id: 'ready', speaker: 'architect', text: '改造完成了！来看看吧。', onEnter: 'pan_camera' },
        { id: 'reveal', speaker: 'architect', text: '如果还想改造其他建筑，随时找我。' },
        { id: 'end', speaker: 'none', onEnter: 'switch_to_intro' },
      ],
      edges: [
        { from: 'ready', to: 'reveal' },
        { from: 'reveal', to: 'end' },
      ],
    },
  };

  // --- DOM creation ---
  function _ensureContainer() {
    if (_root) return;

    _root = document.createElement('div');
    _root.id = 'dialogue-root';
    _root.innerHTML = `
      <div class="dialogue-box">
        <div class="dialogue-header">
          <span class="dialogue-dot"></span>
          <span class="dialogue-name">fangk</span>
        </div>
        <div class="dialogue-body">
          <span class="dialogue-text"></span><span class="dialogue-cursor">|</span>
        </div>
        <div class="dialogue-input-row" style="display:none;">
          <input type="text" class="dialogue-input" placeholder="描述你想要的变化..." />
          <button class="dialogue-send">发送</button>
        </div>
        <div class="dialogue-choices" style="display:none;"></div>
        <div class="dialogue-hints">Enter / Space 继续 · Esc 关闭</div>
      </div>
    `;
    document.body.appendChild(_root);

    // Inject minimal CSS once
    if (!document.getElementById('dialogue-styles')) {
      const style = document.createElement('style');
      style.id = 'dialogue-styles';
      style.textContent = `
        #dialogue-root {
          position: fixed; inset: 0; z-index: 250;
          display: none; align-items: flex-end; justify-content: center;
          pointer-events: none;
        }
        #dialogue-root.active { display: flex; }
        .dialogue-box {
          pointer-events: auto;
          background: #fdf6e3; border: 3px solid #2a2330;
          border-radius: 16px; box-shadow: 6px 6px 0 rgba(42,35,48,0.3);
          padding: 16px 22px; margin-bottom: 22px;
          min-width: 420px; max-width: 640px; width: 90vw;
          font-family: "Microsoft YaHei","PingFang SC",sans-serif;
          color: #2a2330;
          display: flex; flex-direction: column; gap: 10px;
        }
        .dialogue-header {
          display: flex; align-items: center; gap: 10px;
          font-weight: bold; font-size: 16px;
        }
        .dialogue-dot {
          width: 12px; height: 12px; border-radius: 50%;
          background: #e9b44c; flex-shrink: 0;
        }
        .dialogue-body {
          font-size: 15px; line-height: 1.7; min-height: 48px;
        }
        .dialogue-body .dialogue-done { display: none; }
        @keyframes dl-blink { 0%,50% { opacity:1; } 51%,100% { opacity:0; } }
        .dialogue-cursor { animation: dl-blink 0.7s infinite; color: #e9b44c; }
        .dialogue-cursor.done { display: none; }
        .dialogue-input-row {
          display: flex; gap: 8px;
        }
        .dialogue-input {
          flex: 1; padding: 8px 12px;
          border: 2px solid #2a2330; border-radius: 8px;
          font-family: inherit; font-size: 14px; outline: none;
          background: #fff; color: #2a2330;
        }
        .dialogue-input:focus { border-color: #e9b44c; }
        .dialogue-send {
          padding: 8px 16px;
          background: #4a90d9; color: #fff;
          border: 2px solid #2a2330; border-radius: 8px;
          cursor: pointer; font-family: inherit; font-size: 14px;
        }
        .dialogue-send:hover { background: #5aa0e9; }
        .dialogue-hints {
          font-size: 11px; color: #776b7e; text-align: center;
          border-top: 1px dashed #ccc; padding-top: 8px;
        }
        .dialogue-choices {
          display: flex; flex-direction: column; gap: 8px;
        }
        .dialogue-choice-btn {
          padding: 10px 16px; border: 2px solid #2a2330; border-radius: 10px;
          background: #fff8e7; color: #2a2330; cursor: pointer;
          font-family: inherit; font-size: 14px; text-align: left;
          transition: background 0.1s, transform 0.1s;
        }
        .dialogue-choice-btn:hover, .dialogue-choice-btn.focused {
          background: #e9b44c; color: #fff6e5; transform: translateX(4px);
        }
      `;
      document.head.appendChild(style);
    }

    // Cache DOM refs
    _textEl = _root.querySelector('.dialogue-text');
    _cursorEl = _root.querySelector('.dialogue-cursor');
    _inputRow = _root.querySelector('.dialogue-input-row');
    _textInput = _root.querySelector('.dialogue-input');
    _sendBtn = _root.querySelector('.dialogue-send');
    _hintEl = _root.querySelector('.dialogue-hints');
    _choicesEl = _root.querySelector('.dialogue-choices');
    _speakerDot = _root.querySelector('.dialogue-dot');
    _speakerName = _root.querySelector('.dialogue-name');

    // Input events
    _sendBtn.addEventListener('click', _submitInput);
    _textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        _submitInput();
      }
    });
  }

  function _submitInput() {
    const val = _textInput.value.trim();
    if (!val) return;
    if (_customInputMode && _customResolve) {
      const resolve = _customResolve;
      _closeCustom(false);
      resolve(val);
      return;
    }
    _playerDescription = val;
    _playerAccepted = true;
    _inputRow.style.display = 'none';
    _inputActive = false;
    _advanceNode();
  }

  // --- keyboard ---
  function _onKeydown(e) {
    if (!_active) return;
    if (_inputActive) return; // let input handle itself

    if (_customMessageMode && _customResolve && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const resolve = _customResolve;
      _closeCustom(false);
      resolve(true);
      return;
    }

    // Choice navigation
    if (_choiceActive) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const btns = _choicesEl ? _choicesEl.querySelectorAll('.dialogue-choice-btn') : [];
        if (e.key === 'ArrowUp') _choiceIndex = Math.max(0, _choiceIndex - 1);
        else _choiceIndex = Math.min(btns.length - 1, _choiceIndex + 1);
        _updateChoiceFocus();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        _selectChoice(_choiceIndex);
        return;
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      hide();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!_twDone && _twText) {
        // Skip typewriter: reveal all immediately
        _twIndex = _twText.length;
        _textEl.textContent = _twText;
        _twDone = true;
        _twText = '';
        _twAccum = 0;
        _cursorEl.classList.add('done');
        if (_twOnComplete) { const cb = _twOnComplete; _twOnComplete = null; cb(); }
      } else {
        _advanceNode();
      }
    }
  }

  window.addEventListener('keydown', _onKeydown);

  // --- graph engine ---
  function _advanceNode() {
    const graph = _currentGraph;
    if (!graph) return;

    const node = graph.nodes[_currentNodeIndex];
    if (!node) { hide(); return; }

    // Execute onExit action
    _runAction(node.onExit);

    // Find next node
    const edge = graph.edges.find(e => e.from === node.id);
    if (!edge) { hide(); return; }

    const nextNode = graph.nodes.find(n => n.id === edge.to);
    if (!nextNode) { hide(); return; }

    _currentNodeIndex = graph.nodes.indexOf(nextNode);
    _displayNode(nextNode);
  }

  function _displayNode(node) {
    // Execute onEnter action
    _runAction(node.onEnter);

    if (node.speaker === 'none') {
      hide();
      return;
    }

    // Update header
    if (node.speaker === 'player' || node.speaker === 'player_input') {
      _speakerDot.style.background = '#4a90d9';
      _speakerName.textContent = '你';
    } else if (node.speaker === 'choice') {
      // Keep current speaker header for choice nodes
    } else {
      _speakerDot.style.background = '#e9b44c';
      _speakerName.textContent = node.speakerName === 'momo' ? _petSpeakerName : (node.speakerName || 'fangk');
    }

    // Pause node (thinking delay)
    if (node.isPause) {
      _thinkingTimer = node.pauseMs || 1500;
      _thinkingActive = true;
      _hintEl.textContent = '请稍候...';
      // Show placeholder text
      _textEl.textContent = node.text || '...';
      _cursorEl.classList.add('done');
      _twDone = true;
      _twText = '';
      return;
    }

    // Choice node
    if (node.speaker === 'choice') {
      _inputRow.style.display = 'none';
      _inputActive = false;
      _choiceActive = true;
      _choiceIndex = 0;
      _choiceCallbacks = node._callbacks || null;
      _twDone = true;
      _twText = '';
      _textEl.textContent = node.text || '';
      _cursorEl.classList.add('done');
      _hintEl.textContent = '↑↓ 选择 · Enter 确认 · Esc 关闭';
      _renderChoices(node.options || []);
      return;
    }

    // Player input node
    if (node.speaker === 'player_input') {
      _inputRow.style.display = 'flex';
      _textInput.placeholder = node.prompt || '输入你的想法...';
      _textInput.value = '';
      _inputActive = true;
      _textEl.textContent = '';
      _cursorEl.classList.add('done');
      _hintEl.textContent = '输入描述后按 Enter 发送 · Esc 关闭';
      setTimeout(() => _textInput.focus(), 100);
      return;
    }

    // Normal text node
    _inputRow.style.display = 'none';
    _inputActive = false;
    _hintEl.textContent = 'Enter / Space 继续 · Esc 关闭';
    _startTypewriter(node.text || '');
  }

  function _startTypewriter(text) {
    _twText = text;
    _twIndex = 0;
    _twAccum = 0;
    _twDone = false;
    _textEl.textContent = '';
    _cursorEl.classList.remove('done');
    _twOnComplete = () => {
      _cursorEl.classList.add('done');
    };
  }

  function _runAction(action) {
    if (!action) return;
    if (action === 'trigger_construction' && _onTriggerConstruction) {
      _onTriggerConstruction(_buildingEntity, _playerDescription);
    }
    if (action === 'pan_camera' && _onPanCamera) {
      _onPanCamera(_buildingEntity);
    }
    if (action === 'switch_to_intro' && _onSwitchToIntro) {
      _onSwitchToIntro();
    }
    if (action === 'bear_follow' && _onBearFollow) {
      _onBearFollow();
    }
    if (action === 'bear_resume' && _onBearResume) {
      _onBearResume();
    }
    if (action === 'bear_chop_tree' && _onBearChopTree) {
      _onBearChopTree();
    }
  }

  // --- public API ---

  // --- choice helpers ---
  function _renderChoices(options) {
    if (!_choicesEl) return;
    _choicesEl.style.display = 'flex';
    _choicesEl.innerHTML = '';
    _choiceIndex = 0;
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'dialogue-choice-btn' + (i === 0 ? ' focused' : '');
      btn.textContent = (typeof opt === 'string' ? opt : opt.label);
      btn.addEventListener('click', () => _selectChoice(i));
      _choicesEl.appendChild(btn);
    });
  }

  function _selectChoice(index) {
    const options = _choicesEl ? _choicesEl.querySelectorAll('.dialogue-choice-btn') : [];
    if (index < 0 || index >= options.length) return;
    if (_customChoiceOptions && _customResolve) {
      const option = _customChoiceOptions[index];
      const resolve = _customResolve;
      _closeCustom(false);
      resolve({ index, key: option?.key ?? String(index), label: option?.label ?? String(option) });
      return;
    }
    // Find the next edge matching this choice index
    const node = _currentGraph.nodes[_currentNodeIndex];
    const choiceEdges = (_currentGraph.edges || []).filter(e => e.from === node.id);
    const edge = choiceEdges[index];
    if (!edge) { hide(); return; }
    _choicesEl.style.display = 'none';
    _choiceActive = false;
    // Fire callback if set
    if (_choiceCallbacks && _choiceCallbacks.onSelect) {
      _choiceCallbacks.onSelect(edge.choiceKey || edge.to);
    }
    // Navigate to the choice's target node
    const nextNode = _currentGraph.nodes.find(n => n.id === edge.to);
    if (nextNode) {
      _currentNodeIndex = _currentGraph.nodes.indexOf(nextNode);
      _displayNode(nextNode);
    } else {
      hide();
    }
  }

  function _updateChoiceFocus() {
    if (!_choicesEl) return;
    const btns = _choicesEl.querySelectorAll('.dialogue-choice-btn');
    btns.forEach((b, i) => b.classList.toggle('focused', i === _choiceIndex));
  }

  function show(graphName, buildingEntity) {
    _ensureContainer();

    const graph = GRAPHS[graphName];
    if (!graph) { console.warn('[Dialogue] Unknown graph:', graphName); return; }

    _active = true;
    _currentGraphName = graphName;
    _currentGraph = graph;
    _currentNodeIndex = 0;
    _buildingEntity = buildingEntity || null;
    _playerAccepted = false;
    _playerDescription = '';
    _thinkingActive = false;
    _thinkingTimer = 0;

    _root.classList.add('active');
    _displayNode(graph.nodes[0]);
  }

  function hide() {
    if (!_active) return;
    if (_customResolve) {
      const resolve = _customResolve;
      _customResolve = null;
      _customChoiceOptions = null;
      _customInputMode = false;
      resolve(null);
    }
    _active = false;
    _inputActive = false;
    _thinkingActive = false;
    _choiceActive = false;
    _twText = '';
    _twDone = true;

    if (_root) _root.classList.remove('active');
    if (_inputRow) _inputRow.style.display = 'none';
    if (_choicesEl) _choicesEl.style.display = 'none';

    if (_onDialogueEnd) _onDialogueEnd();
  }

  function _openCustomBase(speakerName, text) {
    _ensureContainer();
    _active = true;
    _currentGraphName = 'custom';
    _currentGraph = null;
    _currentNodeIndex = 0;
    _buildingEntity = null;
    _playerAccepted = false;
    _playerDescription = '';
    _thinkingActive = false;
    _thinkingTimer = 0;
    _twText = '';
    _twDone = true;
    _inputActive = false;
    _choiceActive = false;
    _customChoiceOptions = null;
    _customInputMode = false;
    _customMessageMode = false;

    _root.classList.add('active');
    _speakerDot.style.background = '#e9b44c';
    _speakerName.textContent = speakerName || _petSpeakerName || 'momo';
    _textEl.textContent = text || '';
    _cursorEl.classList.add('done');
    _hintEl.textContent = 'Esc 关闭';
  }

  function _closeCustom(notifyEnd = true) {
    _active = false;
    _inputActive = false;
    _thinkingActive = false;
    _choiceActive = false;
    _customChoiceOptions = null;
    _customInputMode = false;
    _customMessageMode = false;
    _customResolve = null;
    _twText = '';
    _twDone = true;

    if (_root) _root.classList.remove('active');
    if (_inputRow) _inputRow.style.display = 'none';
    if (_choicesEl) _choicesEl.style.display = 'none';
    if (notifyEnd && _onDialogueEnd) _onDialogueEnd();
  }

  function askChoice({ speakerName, text, options }) {
    return new Promise((resolve) => {
      _openCustomBase(speakerName, text);
      _customResolve = resolve;
      _customChoiceOptions = (options || []).map((option, index) => {
        if (typeof option === 'string') return { key: String(index), label: option };
        return { key: option.key ?? String(index), label: option.label ?? String(option.label || option.key || index) };
      });
      _choiceActive = true;
      _choiceIndex = 0;
      _inputRow.style.display = 'none';
      _choicesEl.style.display = 'flex';
      _hintEl.textContent = '↑↓ 选择 · Enter 确认 · Esc 关闭';
      _renderChoices(_customChoiceOptions);
    });
  }

  function askInput({ speakerName, text, placeholder }) {
    return new Promise((resolve) => {
      _openCustomBase(speakerName, text);
      _customResolve = resolve;
      _customInputMode = true;
      _inputActive = true;
      _choicesEl.style.display = 'none';
      _inputRow.style.display = 'flex';
      _textInput.placeholder = placeholder || '输入具体描述...';
      _textInput.value = '';
      _hintEl.textContent = '输入后按 Enter 发送 · Esc 关闭';
      setTimeout(() => _textInput.focus(), 100);
    });
  }

  function say({ speakerName, text }) {
    return new Promise((resolve) => {
      _openCustomBase(speakerName, text);
      _customResolve = resolve;
      _customMessageMode = true;
      _hintEl.textContent = 'Enter / Space 继续 · Esc 关闭';
    });
  }

  function update(dt) {
    if (!_active) return;

    // Typewriter
    if (_twText && !_twDone) {
      _twAccum += dt * TW_SPEED;
      const shouldShow = Math.floor(_twAccum);
      if (shouldShow > _twIndex) {
        _twIndex = Math.min(shouldShow, _twText.length);
        _textEl.textContent = _twText.slice(0, _twIndex);
        if (_twIndex >= _twText.length) {
          _twDone = true;
          _twText = '';
          _cursorEl.classList.add('done');
          if (_twOnComplete) { const cb = _twOnComplete; _twOnComplete = null; cb(); }
        }
      }
    }

    // Thinking pause
    if (_thinkingActive) {
      _thinkingTimer -= dt * 1000;
      if (_thinkingTimer <= 0) {
        _thinkingActive = false;
        _advanceNode();
      }
    }
  }

  function isActive() {
    return _active;
  }

  function setOnConstructionTrigger(fn) { _onTriggerConstruction = fn; }
  function setOnPanCamera(fn) { _onPanCamera = fn; }
  function setOnSwitchToIntro(fn) { _onSwitchToIntro = fn; }
  function setOnBearFollow(fn) { _onBearFollow = fn; }
  function setOnBearResume(fn) { _onBearResume = fn; }
  function setOnBearChopTree(fn) { _onBearChopTree = fn; }
  function setOnDialogueEnd(fn) { _onDialogueEnd = fn; }
  function setPetSpeakerName(name) { _petSpeakerName = name || 'momo'; }

  function dispose() {
    hide();
    window.removeEventListener('keydown', _onKeydown);
    if (_root && _root.parentNode) _root.parentNode.removeChild(_root);
    _root = null;
    _textEl = null;
    _cursorEl = null;
    _inputRow = null;
    _textInput = null;
    _sendBtn = null;
    _hintEl = null;
  }

  return {
    show,
    askChoice,
    askInput,
    say,
    hide,
    update,
    isActive,
    setOnConstructionTrigger,
    setOnPanCamera,
    setOnSwitchToIntro,
    setOnBearFollow,
    setOnBearResume,
    setOnBearChopTree,
    setOnDialogueEnd,
    setPetSpeakerName,
    dispose,
  };
}
