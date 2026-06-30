import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildModelFromJson } from '../../../engine/model/builder.js';
import { applyAnimation } from '../../../engine/animation/player.js';
import { generateModel, generateAnimation, refineModel } from '../../../backend/voxelApi.js';
import { LOCAL_MODEL_LIBRARY, getLocalAnimationPath } from '../data/localModelLibrary.js';
import {
  loadGeneratedAssets,
  saveGeneratedModel,
  saveAnimationForModel,
  getGeneratedAsset,
  listAnimationsForModel,
  getAnimationPlan,
  deleteAnimation,
} from '../data/generatedLibrary.js';
import {
  fetchStudioAssets,
  getStudioAsset,
} from '../data/studioLibrary.js';

const PREVIEW_BG = 0x0f0f1a;
const API_BASE = '/api/voxel';

/**
 * Fetch asset list from voxel studio backend and merge with local generated models.
 * Local models are always available so the library is never empty.
 * @returns {Promise<Array>}
 */
async function fetchAssetList() {
  let backendAssets = [];
  try {
    const resp = await fetch(`${API_BASE}/api/assets/list`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    backendAssets = await resp.json();
    console.log(`[GenerateSystem] Loaded ${backendAssets.length} assets from backend library`);
  } catch (err) {
    console.warn('[GenerateSystem] Backend asset list unavailable:', err.message);
  }

  // Normalize backend GLTF assets
  const normalizedBackend = backendAssets.map((asset) => ({
    ...asset,
    source: 'backend',
    assetType: 'gltf',
    displayName: asset.name || asset.assetId,
  }));

  // Local voxel JSON models
  const localAssets = LOCAL_MODEL_LIBRARY.map((model) => ({
    source: 'local',
    assetType: 'voxel',
    assetId: model.id,
    name: model.name,
    displayName: model.name,
    path: model.path,
    category: model.category,
    tags: model.tags,
    hasIdleAnimation: model.hasIdleAnimation || false,
  }));

  const generatedAssets = await loadGeneratedAssets();
  const studioAssets = await fetchStudioAssets();

  return [...normalizedBackend, ...localAssets, ...generatedAssets, ...studioAssets];
}

/**
 * Side-panel model editor for Chii Island.
 * Renders into #editor-wrap. Automatically shows the nearest entity's model.
 */
export function createGenerateSystem(onChange) {
  let targetEntity = null;
  let currentModelJson = null;
  let currentModelAssetId = null; // generated-library assetId for the currently applied model
  let pendingModelAssetId = null; // generated-library assetId for the pending model (if already saved)
  let pendingModelJson = null;
  let pendingAnimPlan = null;
  let pendingAnimType = 'interaction';
  let pendingAnimSaved = false;
  let pendingModelSource = null; // 'generate' | 'refine' | 'library' | 'gltf'
  let lastGenerationPrompt = '';
  let lastAnimationPrompt = '';
  let generating = false;

  // ---- DOM: build into #editor-wrap ----
  const editorWrap = document.getElementById('editor-wrap');
  if (!editorWrap) {
    console.error('[GenerateSystem] #editor-wrap not found');
  }

  // Header
  const headerEl = document.createElement('div');
  headerEl.style.cssText = 'padding: 12px 16px; background: #1a1a2e; border-bottom: 1px solid #333;';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'color: #e94560; font-size: 15px; font-weight: bold;';
  titleEl.textContent = '模型编辑器';
  headerEl.appendChild(titleEl);

  // Preview area
  const previewWrap = document.createElement('div');
  previewWrap.style.cssText = 'flex: 1; position: relative; min-height: 180px; background: #0a0a14;';
  const previewCanvas = document.createElement('canvas');
  previewCanvas.style.cssText = 'width: 100%; height: 100%; display: block;';
  previewWrap.appendChild(previewCanvas);

  // Controls
  const controlEl = document.createElement('div');
  controlEl.style.cssText = 'padding: 14px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid #333;';

  const infoName = document.createElement('div');
  infoName.style.cssText = 'color: #fff; font-size: 14px; font-weight: bold;';
  infoName.textContent = '未选择模型';
  controlEl.appendChild(infoName);

  const infoTags = document.createElement('div');
  infoTags.style.cssText = 'color: #888; font-size: 11px;';
  controlEl.appendChild(infoTags);

  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.placeholder = '输入描述词...';
  inputEl.style.cssText = `
    width: 100%; padding: 8px 10px; border-radius: 4px; box-sizing: border-box;
    border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08);
    color: #fff; font-size: 13px; outline: none;
  `;
  controlEl.appendChild(inputEl);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: 6px;';
  const genBtn = document.createElement('button');
  genBtn.textContent = '重新生成';
  genBtn.style.cssText = _btnStyle('#4a90d9', 'flex:1');
  const refineBtn = document.createElement('button');
  refineBtn.textContent = '改造';
  refineBtn.style.cssText = _btnStyle('#e94560', 'flex:1');
  btnRow.appendChild(genBtn);
  btnRow.appendChild(refineBtn);
  controlEl.appendChild(btnRow);

  const libraryBtn = document.createElement('button');
  libraryBtn.textContent = '📚 从模型库选择';
  libraryBtn.style.cssText = _btnStyle('#9c27b0', 'width: 100%');
  controlEl.appendChild(libraryBtn);

  // Animation generation section
  const animSection = document.createElement('div');
  animSection.style.cssText = 'margin-top: 4px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.15); display: flex; flex-direction: column; gap: 8px;';

  const animLabel = document.createElement('div');
  animLabel.textContent = '✨ 新建动画';
  animLabel.style.cssText = 'color: #ffaa44; font-size: 12px; font-weight: bold;';
  animSection.appendChild(animLabel);

  const animInputEl = document.createElement('input');
  animInputEl.type = 'text';
  animInputEl.placeholder = '输入动画描述，如：轻轻摇摆、上下浮动...';
  animInputEl.style.cssText = `
    width: 100%; padding: 8px 10px; border-radius: 4px; box-sizing: border-box;
    border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08);
    color: #fff; font-size: 13px; outline: none;
  `;
  animSection.appendChild(animInputEl);

  const animBtnRow = document.createElement('div');
  animBtnRow.style.cssText = 'display: flex; gap: 6px;';
  const animGenBtn = document.createElement('button');
  animGenBtn.textContent = '生成动画';
  animGenBtn.style.cssText = _btnStyle('#ffaa44', 'flex:1');
  const animStopBtn = document.createElement('button');
  animStopBtn.textContent = '停止预览';
  animStopBtn.style.cssText = _btnStyle('#888', 'flex:1');
  animBtnRow.appendChild(animGenBtn);
  animBtnRow.appendChild(animStopBtn);
  animSection.appendChild(animBtnRow);

  // Animation type selector
  const animTypeRow = document.createElement('div');
  animTypeRow.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 12px; color: #ccc;';
  animTypeRow.innerHTML = `
    <span>应用类型：</span>
    <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
      <input type="radio" name="animType" value="interaction" checked>
      <span>E 交互</span>
    </label>
    <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
      <input type="radio" name="animType" value="idle">
      <span>idle 循环</span>
    </label>
  `;
  animSection.appendChild(animTypeRow);

  // Animation library section
  const animLibrarySection = document.createElement('div');
  animLibrarySection.style.cssText = 'margin-top: 8px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.15); display: flex; flex-direction: column; gap: 8px;';

  const animLibraryLabel = document.createElement('div');
  animLibraryLabel.textContent = '🎬 动画库';
  animLibraryLabel.style.cssText = 'color: #ff79c6; font-size: 12px; font-weight: bold;';
  animLibrarySection.appendChild(animLibraryLabel);

  const animLibraryList = document.createElement('div');
  animLibraryList.style.cssText = 'display: flex; flex-direction: column; gap: 6px; max-height: 160px; overflow-y: auto;';
  animLibrarySection.appendChild(animLibraryList);

  animSection.appendChild(animLibrarySection);

  controlEl.appendChild(animSection);

  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'color: #888; font-size: 12px; min-height: 16px;';
  statusEl.textContent = '靠近模型以自动加载';
  controlEl.appendChild(statusEl);

  // Footer confirm
  const footerEl = document.createElement('div');
  footerEl.style.cssText = 'padding: 12px; border-top: 1px solid #333; display: flex; gap: 8px;';
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '确认替换';
  confirmBtn.style.cssText = _btnStyle('#5cb85c', 'flex:1');
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = _btnStyle('#888', 'flex:1');
  footerEl.appendChild(confirmBtn);
  footerEl.appendChild(cancelBtn);

  if (editorWrap) {
    editorWrap.appendChild(headerEl);
    editorWrap.appendChild(previewWrap);
    editorWrap.appendChild(controlEl);
    editorWrap.appendChild(footerEl);
  }

  // ---- events ----
  confirmBtn.addEventListener('click', confirmReplace);
  cancelBtn.addEventListener('click', () => {
    if (targetEntity && currentModelJson) {
      _showModelJson(currentModelJson);
      pendingModelJson = currentModelJson;
      pendingModelAssetId = null;
      pendingModelSource = 'library';
      pendingAnimPlan = null;
      pendingAnimType = 'interaction';
      _setStatus('已重置为当前模型');
    }
  });
  genBtn.addEventListener('click', () => _doGenerate(inputEl.value.trim()));
  refineBtn.addEventListener('click', () => _doRefine(inputEl.value.trim()));
  libraryBtn.addEventListener('click', () => _showLibraryPicker());
  animGenBtn.addEventListener('click', () => _doGenerateAnimation(animInputEl.value.trim()));
  animStopBtn.addEventListener('click', () => {
    previewAnimPlan = null;
    previewAnimTime = 0;
    previewAnimPartMap = null;
    _setStatus('动画预览已停止', '#888');
  });

  // Animation type radio buttons
  const animTypeRadios = animTypeRow.querySelectorAll('input[name="animType"]');
  animTypeRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      pendingAnimType = radio.value;
    });
  });
  animInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _doGenerateAnimation(animInputEl.value.trim());
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _doRefine(inputEl.value.trim());
  });

  function _btnStyle(bg, extra = '') {
    return `padding: 7px 12px; border-radius: 4px; border: none; background: ${bg}; color: #fff; font-size: 12px; cursor: pointer; font-family: inherit; ${extra}`;
  }
  function _setStatus(text, color = '#888') {
    statusEl.textContent = text;
    statusEl.style.color = color;
  }

  // ---- animation library helpers ----

  function _getSelectedAnimType() {
    for (const radio of animTypeRadios) {
      if (radio.checked) return radio.value;
    }
    return 'interaction';
  }

  async function _getOrCreateModelAssetId() {
    if (pendingModelAssetId) return pendingModelAssetId;
    if (currentModelAssetId && pendingModelSource !== 'generate' && pendingModelSource !== 'refine') {
      return currentModelAssetId;
    }
    if (!targetEntity || !currentModelJson || pendingModelJson?._isGLTF) return null;

    const modelJsonToSave = pendingModelJson?._isGLTF ? null : (pendingModelJson || currentModelJson);
    if (!modelJsonToSave) return null;

    _setStatus('正在保存模型到动画库...', '#ffaa44');
    try {
      const { assetId } = await saveGeneratedModel({
        name: targetEntity.name,
        description: lastGenerationPrompt || targetEntity.name || '模型动画',
        modelJson: modelJsonToSave,
        tags: targetEntity.tags || [],
      });
      pendingModelAssetId = assetId;
      currentModelAssetId = assetId;
      targetEntity._generatedAssetId = assetId;
      _setStatus('模型已保存到动画库', '#5cb85c');
      return assetId;
    } catch (err) {
      console.error('[Editor] Failed to save model for animation library:', err);
      _setStatus('保存模型失败', '#e94560');
      return null;
    }
  }

  function _applyAnimToEntity(plan, type) {
    if (!targetEntity || !plan) return;
    if (type === 'interaction') {
      if (typeof targetEntity.setInteractionAnimation === 'function') {
        targetEntity.setInteractionAnimation(plan, plan._duration ?? 2.5);
        targetEntity.playInteractionAnimation?.();
      }
    } else {
      if (typeof targetEntity.playIdleAnimation === 'function') {
        targetEntity.playIdleAnimation(plan, plan._duration ?? 2.5);
      }
    }
  }

  async function _previewAnimationPlan(plan) {
    if (!plan || !previewModelGroup) return;
    previewAnimPlan = plan;
    previewAnimDuration = plan._duration ?? 2.5;
    previewAnimTime = 0;
    previewAnimPartMap = null;
  }

  function _makeAnimationItem(animMeta) {
    const item = document.createElement('div');
    item.style.cssText = 'padding: 8px; background: #2a2a3e; border-radius: 6px; display: flex; flex-direction: column; gap: 6px;';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px;';

    const nameWrap = document.createElement('div');
    nameWrap.style.cssText = 'display: flex; align-items: center; gap: 6px; min-width: 0;';

    const nameEl = document.createElement('div');
    nameEl.textContent = animMeta.name;
    nameEl.style.cssText = 'font-size: 12px; font-weight: bold; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';

    const typeBadge = document.createElement('span');
    typeBadge.textContent = animMeta.type === 'interaction' ? 'E 交互' : 'idle';
    typeBadge.style.cssText = `font-size: 10px; padding: 1px 5px; border-radius: 4px; color: #fff; white-space: nowrap; ${animMeta.type === 'interaction' ? 'background: #e94560;' : 'background: #4a90d9;'}`;

    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(typeBadge);

    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display: flex; gap: 4px; flex-shrink: 0;';

    const previewBtn = document.createElement('button');
    previewBtn.textContent = '预览';
    previewBtn.style.cssText = _btnStyle('#888', 'padding: 4px 8px; font-size: 11px;');
    previewBtn.onclick = async () => {
      const plan = await getAnimationPlan(currentModelAssetId, animMeta.animId);
      if (plan) {
        await _previewAnimationPlan(plan);
        _setStatus(`正在预览：${animMeta.name}`, '#5cb85c');
      }
    };

    const applyInteractionBtn = document.createElement('button');
    applyInteractionBtn.textContent = 'E';
    applyInteractionBtn.title = '应用为 E 交互';
    applyInteractionBtn.style.cssText = _btnStyle('#e94560', 'padding: 4px 8px; font-size: 11px;');
    applyInteractionBtn.onclick = async () => {
      const plan = await getAnimationPlan(currentModelAssetId, animMeta.animId);
      if (plan) {
        _applyAnimToEntity(plan, 'interaction');
        _setStatus(`已应用为 E 交互：${animMeta.name}`, '#5cb85c');
        if (typeof onChange === 'function') onChange();
      }
    };

    const applyIdleBtn = document.createElement('button');
    applyIdleBtn.textContent = 'I';
    applyIdleBtn.title = '应用为 idle 循环';
    applyIdleBtn.style.cssText = _btnStyle('#4a90d9', 'padding: 4px 8px; font-size: 11px;');
    applyIdleBtn.onclick = async () => {
      const plan = await getAnimationPlan(currentModelAssetId, animMeta.animId);
      if (plan) {
        _applyAnimToEntity(plan, 'idle');
        _setStatus(`已应用为 idle：${animMeta.name}`, '#5cb85c');
        if (typeof onChange === 'function') onChange();
      }
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.title = '删除';
    deleteBtn.style.cssText = _btnStyle('#666', 'padding: 4px 8px; font-size: 11px;');
    deleteBtn.onclick = () => {
      deleteAnimation(currentModelAssetId, animMeta.animId);
      _refreshAnimationLibrary();
      _setStatus('已删除动画', '#888');
    };

    btnWrap.appendChild(previewBtn);
    btnWrap.appendChild(applyInteractionBtn);
    btnWrap.appendChild(applyIdleBtn);
    btnWrap.appendChild(deleteBtn);

    header.appendChild(nameWrap);
    header.appendChild(btnWrap);
    item.appendChild(header);

    return item;
  }

  async function _refreshAnimationLibrary() {
    animLibraryList.innerHTML = '';
    if (!currentModelAssetId) {
      const empty = document.createElement('div');
      empty.textContent = '生成或保存模型后可建立动画库';
      empty.style.cssText = 'font-size: 11px; color: #666;';
      animLibraryList.appendChild(empty);
      return;
    }

    const anims = listAnimationsForModel(currentModelAssetId);
    if (anims.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '暂无动画，生成后会自动保存到这里';
      empty.style.cssText = 'font-size: 11px; color: #666;';
      animLibraryList.appendChild(empty);
      return;
    }

    for (const anim of anims) {
      animLibraryList.appendChild(_makeAnimationItem(anim));
    }
  }

  // ---- preview scene ----
  const previewScene = new THREE.Scene();
  previewScene.background = new THREE.Color(PREVIEW_BG);
  const previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  previewCamera.position.set(4, 3, 6);
  previewCamera.lookAt(0, 1, 0);
  let previewRenderer = null;
  let previewOrbitGroup = null;
  let previewModelGroup = null;
  let previewAnimPlan = null;
  let previewAnimDuration = 2.5;
  let previewAnimTime = 0;
  let previewAnimPartMap = null;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  function _initRenderer() {
    if (previewRenderer) return;
    previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true });
    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _resizePreview();

    previewScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    previewScene.add(dir);
    const back = new THREE.DirectionalLight(0x4455ff, 0.3);
    back.position.set(-5, 2, -5);
    previewScene.add(back);

    const grid = new THREE.GridHelper(10, 10, 0x333344, 0x222233);
    previewScene.add(grid);

    // Orbit container for free rotation (horizontal + vertical)
    previewOrbitGroup = new THREE.Group();
    previewScene.add(previewOrbitGroup);

    previewCanvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging || !previewOrbitGroup) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      previewOrbitGroup.rotation.y += dx * 0.01;
      previewOrbitGroup.rotation.x += dy * 0.01;
      // Clamp vertical orbit to avoid flipping upside-down
      previewOrbitGroup.rotation.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, previewOrbitGroup.rotation.x));
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });
    window.addEventListener('mouseup', () => { isDragging = false; });

    // Mouse wheel zoom
    previewCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomSpeed = 0.001;
      const minDist = 2;
      const maxDist = 20;
      const target = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3().copy(previewCamera.position).sub(target);
      const dist = dir.length();
      const newDist = Math.max(minDist, Math.min(maxDist, dist + e.deltaY * zoomSpeed * dist));
      dir.normalize().multiplyScalar(newDist);
      previewCamera.position.copy(dir.add(target));
    }, { passive: false });
  }

  function _resizePreview() {
    if (!previewRenderer || !previewWrap) return;
    const rect = previewWrap.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    previewCamera.aspect = w / h;
    previewCamera.updateProjectionMatrix();
    previewRenderer.setSize(w, h);
  }

  function _clearPreviewModel() {
    if (previewModelGroup) {
      previewOrbitGroup.remove(previewModelGroup);
      previewModelGroup = null;
    }
    previewAnimPlan = null;
    previewAnimPartMap = null;
    previewAnimTime = 0;
  }

  function _showModelJson(modelJson) {
    _clearPreviewModel();
    if (!modelJson) return;
    const mesh = buildModelFromJson(modelJson);
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    mesh.position.set(-center.x, -box.min.y, -center.z);
    previewModelGroup = mesh;
    previewOrbitGroup.add(previewModelGroup);
  }

  function _showGLTFModel(gltfScene) {
    _clearPreviewModel();
    if (!gltfScene) return;
    const box = new THREE.Box3().setFromObject(gltfScene);
    const center = box.getCenter(new THREE.Vector3());
    gltfScene.position.set(-center.x, -box.min.y, -center.z);
    previewModelGroup = gltfScene;
    previewOrbitGroup.add(previewModelGroup);
  }

  async function _showLibraryPicker() {
    if (generating) return;
    _setStatus('加载模型库...', '#9c27b0');

    const assets = await fetchAssetList();
    if (!assets || assets.length === 0) {
      _setStatus('模型库为空或加载失败', '#e94560');
      return;
    }

    // Create popup selector
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:3000;';

    const panel = document.createElement('div');
    panel.style.cssText = 'background:#1a1a2e;border-radius:8px;padding:20px;max-width:520px;max-height:75vh;overflow-y:auto;color:#fff;';

    const title = document.createElement('h3');
    title.textContent = '📚 选择模型';
    title.style.cssText = 'margin:0 0 16px 0;color:#9c27b0;';
    panel.appendChild(title);

    // Generated assets section
    const generatedAssets = assets.filter((a) => a.source === 'generated');
    if (generatedAssets.length > 0) {
      const generatedTitle = document.createElement('div');
      generatedTitle.textContent = `已生成模型 (${generatedAssets.length})`;
      generatedTitle.style.cssText = 'font-size:12px;color:#ff5722;margin-bottom:8px;text-transform:uppercase;';
      panel.appendChild(generatedTitle);

      const generatedList = document.createElement('div');
      generatedList.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:16px;';
      generatedAssets.forEach((asset) => generatedList.appendChild(_makeAssetItem(asset, overlay)));
      panel.appendChild(generatedList);
    }

    // Studio (Voxel Studio) section
    const studioAssets = assets.filter((a) => a.source === 'studio');
    if (studioAssets.length > 0) {
      const studioTitle = document.createElement('div');
      studioTitle.textContent = `体素工作室 (${studioAssets.length})`;
      studioTitle.style.cssText = 'font-size:12px;color:#00d9ff;margin-bottom:8px;text-transform:uppercase;';
      panel.appendChild(studioTitle);

      const studioList = document.createElement('div');
      studioList.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:16px;';
      studioAssets.forEach((asset) => studioList.appendChild(_makeAssetItem(asset, overlay)));
      panel.appendChild(studioList);
    }

    // Backend GLTF section
    const backendAssets = assets.filter((a) => a.source === 'backend');
    if (backendAssets.length > 0) {
      const backendTitle = document.createElement('div');
      backendTitle.textContent = `云端 GLTF 模型 (${backendAssets.length})`;
      backendTitle.style.cssText = 'font-size:12px;color:#888;margin-bottom:8px;text-transform:uppercase;';
      panel.appendChild(backendTitle);

      const backendList = document.createElement('div');
      backendList.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:16px;';
      backendAssets.forEach((asset) => backendList.appendChild(_makeAssetItem(asset, overlay)));
      panel.appendChild(backendList);
    }

    // Local voxel section
    const localAssets = assets.filter((a) => a.source === 'local');
    if (localAssets.length > 0) {
      const localTitle = document.createElement('div');
      localTitle.textContent = `本地体素模型 (${localAssets.length})`;
      localTitle.style.cssText = 'font-size:12px;color:#888;margin-bottom:8px;text-transform:uppercase;';
      panel.appendChild(localTitle);

      const localList = document.createElement('div');
      localList.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:16px;';
      localAssets.forEach((asset) => localList.appendChild(_makeAssetItem(asset, overlay)));
      panel.appendChild(localList);
    }

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '取消';
    closeBtn.style.cssText = _btnStyle('#888', 'width:100%;margin-top:12px;');
    closeBtn.onclick = () => {
      document.body.removeChild(overlay);
      _setStatus('已取消', '#888');
    };
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        _setStatus('已取消', '#888');
      }
    };

    _setStatus(`找到 ${assets.length} 个模型`, '#9c27b0');
  }

  function _makeAssetItem(asset, overlay) {
    const item = document.createElement('div');
    item.style.cssText = 'padding:10px;background:#2a2a3e;border-radius:6px;cursor:pointer;transition:background 0.2s;display:flex;align-items:center;gap:10px;';
    item.onmouseenter = () => item.style.background = '#3a3a4e';
    item.onmouseleave = () => item.style.background = '#2a2a3e';

    const badge = document.createElement('span');
    let badgeText;
    let badgeBg;
    if (asset.source === 'backend') {
      badgeText = 'GLTF';
      badgeBg = '#4a90d9';
    } else if (asset.source === 'generated') {
      badgeText = '已生成';
      badgeBg = '#ff5722';
    } else if (asset.source === 'studio') {
      badgeText = 'STUDIO';
      badgeBg = '#00d9ff';
    } else {
      badgeText = asset.category || 'VOXEL';
      badgeBg = '#5cb85c';
    }
    badge.textContent = badgeText;
    badge.style.cssText = `font-size:10px;padding:2px 6px;border-radius:4px;background:${badgeBg};color:#fff;white-space:nowrap;`;

    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'flex:1;min-width:0;';

    const name = document.createElement('div');
    name.textContent = asset.displayName || asset.name || asset.assetId;
    name.style.cssText = 'font-weight:bold;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

    const meta = document.createElement('div');
    if (asset.source === 'backend') {
      meta.textContent = asset.assetId;
    } else if (asset.source === 'generated') {
      meta.textContent = asset.tags?.join('、') || asset.description || asset.path;
    } else if (asset.source === 'studio') {
      meta.textContent = asset.description || asset.assetId;
    } else {
      meta.textContent = asset.tags?.join('、') || asset.path;
    }
    meta.style.cssText = 'font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

    textWrap.appendChild(name);
    textWrap.appendChild(meta);
    item.appendChild(badge);
    item.appendChild(textWrap);

    item.onclick = () => {
      document.body.removeChild(overlay);
      _loadAssetFromLibrary(asset);
    };
    return item;
  }

  async function _loadAssetFromLibrary(asset) {
    if (generating) return;
    generating = true;
    inputEl.disabled = true;
    animInputEl.disabled = true;
    _setStatus(`加载 ${asset.displayName || asset.name}...`, '#9c27b0');

    try {
      if (asset.source === 'generated') {
        const { modelJson, animPlan, animations } = await getGeneratedAsset(asset.assetId);
        if (!modelJson) throw new Error('Generated model data not found');

        _showModelJson(modelJson);
        pendingModelJson = modelJson;
        pendingModelAssetId = asset.assetId;
        currentModelAssetId = asset.assetId;
        pendingModelSource = 'library';

        if (animPlan) {
          previewAnimPlan = animPlan;
          previewAnimDuration = animPlan._duration ?? 2.5;
          previewAnimTime = 0;
          previewAnimPartMap = null;
          pendingAnimPlan = animPlan;
          pendingAnimType = animations?.[0]?.type || 'interaction';
          pendingAnimSaved = true;
        }
        _refreshAnimationLibrary();

        _setStatus(`加载完成：${asset.name}`, '#5cb85c');
        return;
      }

      if (asset.source === 'studio') {
        const { modelJson, animPlan } = await getStudioAsset(asset);
        if (!modelJson) throw new Error('Studio model data not found');

        _showModelJson(modelJson);
        pendingModelJson = modelJson;
        pendingModelSource = 'library';
        currentModelAssetId = null; // studio models need to be saved before adding animations

        if (animPlan) {
          previewAnimPlan = animPlan;
          previewAnimDuration = animPlan._duration ?? 2.5;
          previewAnimTime = 0;
          previewAnimPartMap = null;
          pendingAnimPlan = animPlan;
        }
        _refreshAnimationLibrary();

        _setStatus(`加载完成：${asset.name}`, '#5cb85c');
        return;
      }

      if (asset.source === 'local') {
        // Local voxel JSON model
        const resp = await fetch(`/${asset.path}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const modelJson = await resp.json();

        _showModelJson(modelJson);
        pendingModelJson = modelJson;
        pendingModelSource = 'library';
        currentModelAssetId = null; // local models need to be saved before adding animations

        // If a local idle animation exists, load and preview it
        const animPath = getLocalAnimationPath(asset.assetId);
        if (animPath) {
          try {
            const animResp = await fetch(`/${animPath}`);
            if (animResp.ok) {
              const plan = await animResp.json();
              previewAnimPlan = plan;
              previewAnimDuration = plan._duration ?? 2.5;
              previewAnimTime = 0;
              previewAnimPartMap = null;
              pendingAnimPlan = plan;
            }
          } catch (animErr) {
            console.warn('[GenerateSystem] Local idle animation load failed:', animErr.message);
          }
        }
        _refreshAnimationLibrary();

        _setStatus(`加载完成：${asset.name}`, '#5cb85c');
        return;
      }

      // Backend GLTF model
      const loader = new GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.load(asset.glbUrl, resolve, undefined, reject);
      });

      _showGLTFModel(gltf.scene);
      pendingModelJson = { _isGLTF: true, _gltfScene: gltf.scene.clone(), _asset: asset };
      pendingModelSource = 'gltf';
      _setStatus(`加载完成：${asset.name}`, '#5cb85c');
    } catch (err) {
      console.error('[GenerateSystem] Load asset failed:', err);
      _setStatus(`加载失败: ${err.message}`, '#e94560');
    } finally {
      generating = false;
      inputEl.disabled = false;
      animInputEl.disabled = false;
    }
  }

  // ---- public methods ----
  function setTargetEntity(entity) {
    if (entity === targetEntity) return;
    if (!entity) {
      targetEntity = null;
      currentModelJson = null;
      currentModelAssetId = null;
      pendingModelAssetId = null;
      pendingModelJson = null;
      pendingModelSource = null;
      pendingAnimPlan = null;
      pendingAnimType = 'interaction';
      pendingAnimSaved = false;
      previewAnimPlan = null;
      previewAnimTime = 0;
      previewAnimPartMap = null;
      lastGenerationPrompt = '';
      lastAnimationPrompt = '';
      infoName.textContent = '未选择模型';
      infoTags.textContent = '';
      _clearPreviewModel();
      _refreshAnimationLibrary();
      _setStatus('靠近模型以自动加载');
      return;
    }
    _initRenderer();
    targetEntity = entity;
    currentModelJson = entity._originalModelJson || null;
    currentModelAssetId = entity._generatedAssetId || null;
    pendingModelAssetId = null;
    pendingModelJson = currentModelJson;
    pendingModelSource = currentModelJson ? 'library' : null;
    pendingAnimPlan = null;
    pendingAnimType = 'interaction';
    previewAnimPlan = null;
    previewAnimTime = 0;
    previewAnimPartMap = null;
    lastGenerationPrompt = '';
    lastAnimationPrompt = '';

    infoName.textContent = entity.name || '未命名';
    infoTags.textContent = (entity.tags || []).join('、') || '无标签';
    inputEl.value = '';
    inputEl.disabled = false;
    animInputEl.value = '';
    animInputEl.disabled = false;
    _setStatus('就绪');
    _showModelJson(currentModelJson);
    _refreshAnimationLibrary();
  }

  function getTarget() {
    return targetEntity;
  }

  async function _doGenerate(description) {
    if (generating || !description) return;
    generating = true;
    inputEl.disabled = true;
    animInputEl.disabled = true;
    _setStatus('生成中...', '#4a90d9');

    try {
      const { modelJson } = await generateModel(description, 'fireworks', 'standard');
      if (!modelJson) throw new Error('No modelJson');
      _showModelJson(modelJson);
      pendingModelJson = modelJson;
      pendingModelSource = 'generate';
      lastGenerationPrompt = description;
      pendingAnimPlan = null;
      _setStatus('生成完成，可确认替换', '#5cb85c');
    } catch (err) {
      console.error('[Editor] Generate failed:', err);
      _setStatus(`失败: ${err.message}`, '#e94560');
    } finally {
      generating = false;
      inputEl.disabled = false;
      animInputEl.disabled = false;
    }
  }

  async function _doRefine(description) {
    if (generating || !description || !currentModelJson) return;
    generating = true;
    inputEl.disabled = true;
    animInputEl.disabled = true;
    _setStatus('改造中...', '#e94560');

    try {
      let resultModelJson;
      try {
        const result = await refineModel(currentModelJson, description, 'fireworks');
        resultModelJson = result.modelJson;
      } catch (refineErr) {
        console.warn('[Editor] Refine failed, fallback:', refineErr.message);
        const result = await generateModel(description, 'fireworks', 'standard');
        resultModelJson = result.modelJson;
      }
      if (!resultModelJson) throw new Error('No modelJson');
      _showModelJson(resultModelJson);
      pendingModelJson = resultModelJson;
      pendingModelSource = 'refine';
      lastGenerationPrompt = description;
      pendingAnimPlan = null;
      _setStatus('改造完成，可确认替换', '#5cb85c');
    } catch (err) {
      console.error('[Editor] Refine failed:', err);
      _setStatus(`失败: ${err.message}`, '#e94560');
    } finally {
      generating = false;
      inputEl.disabled = false;
      animInputEl.disabled = false;
    }
  }

  async function _doGenerateAnimation(description) {
    if (generating || !description || !pendingModelJson) return;
    const modelJsonForAnim = pendingModelJson._isGLTF ? currentModelJson : pendingModelJson;
    if (!modelJsonForAnim) {
      _setStatus('GLTF 模型暂不支持动画生成', '#e94560');
      return;
    }

    generating = true;
    inputEl.disabled = true;
    animInputEl.disabled = true;
    _setStatus('生成动画中...', '#ffaa44');

    try {
      // Ensure the model is registered in the animation library
      const modelId = await _getOrCreateModelAssetId();
      if (!modelId) {
        _setStatus('无法保存模型到动画库', '#e94560');
        return;
      }
      pendingModelAssetId = modelId;

      const { plan } = await generateAnimation(modelJsonForAnim, description, 2.5, 'fireworks', false);
      if (!plan) throw new Error('No animation plan');

      const type = _getSelectedAnimType();
      const animName = description.trim();

      // Save to animation library immediately
      await saveAnimationForModel({
        modelId,
        name: animName,
        plan,
        type,
      });
      pendingAnimSaved = true;

      previewAnimPlan = plan;
      previewAnimDuration = plan._duration ?? 2.5;
      previewAnimTime = 0;
      previewAnimPartMap = null;
      pendingAnimPlan = plan;
      pendingAnimType = type;
      lastAnimationPrompt = animName;

      _refreshAnimationLibrary();
      _setStatus(`动画已生成并保存，确认替换后应用为 ${type === 'interaction' ? 'E 交互' : 'idle'}`, '#5cb85c');
    } catch (err) {
      console.error('[Editor] Animation generation failed:', err);
      _setStatus(`动画生成失败: ${err.message}`, '#e94560');
    } finally {
      generating = false;
      inputEl.disabled = false;
      animInputEl.disabled = false;
    }
  }

  async function confirmReplace() {
    if (!targetEntity || !pendingModelJson) {
      _setStatus('没有可替换的模型', '#e94560');
      return;
    }
    if (generating) return;
    try {
      let mesh;
      let modelJsonToStore;
      // Check if it's a GLTF model from library
      if (pendingModelJson._isGLTF) {
        mesh = pendingModelJson._gltfScene;
        if (!mesh) throw new Error('GLTF scene not found');
        modelJsonToStore = pendingModelJson;
      } else {
        // Normal voxel JSON model
        mesh = buildModelFromJson(pendingModelJson);
        if (!mesh) throw new Error('Build mesh failed');
        modelJsonToStore = pendingModelJson;
      }
      _replaceEntityModel(targetEntity, mesh, modelJsonToStore);
      currentModelJson = pendingModelJson._isGLTF ? null : pendingModelJson;

      const appliedAnimPlan = pendingAnimPlan;
      if (appliedAnimPlan) {
        _applyAnimationToEntity(targetEntity, appliedAnimPlan, appliedAnimPlan._duration ?? 2.5, pendingAnimType);
      }

      // Persist newly generated/refined voxel assets to the generated library
      const shouldPersistModel =
        !pendingModelJson._isGLTF &&
        !pendingModelAssetId &&
        (pendingModelSource === 'generate' || pendingModelSource === 'refine' || currentModelAssetId === null);
      if (shouldPersistModel) {
        const prompt = lastGenerationPrompt || inputEl.value.trim() || targetEntity.name || '生成模型';
        try {
          const { assetId } = await saveGeneratedModel({
            name: targetEntity.name,
            description: prompt,
            modelJson: pendingModelJson,
            tags: targetEntity.tags || [],
          });
          pendingModelAssetId = assetId;
          currentModelAssetId = assetId;
          targetEntity._generatedAssetId = assetId;
        } catch (err) {
          console.warn('[Editor] Failed to persist model to generated library:', err.message);
          _setStatus('替换成功，但模型同步到库失败', '#e94560');
        }
      }

      // Always save the animation if we have a plan and a model asset id and it wasn't saved during generation
      if (appliedAnimPlan && pendingModelAssetId && !pendingAnimSaved) {
        try {
          await saveAnimationForModel({
            modelId: pendingModelAssetId,
            name: lastAnimationPrompt || animInputEl.value.trim() || '生成动画',
            plan: appliedAnimPlan,
            type: pendingAnimType,
          });
          _refreshAnimationLibrary();
          _setStatus('替换成功，已同步到动画库', '#5cb85c');
        } catch (err) {
          console.warn('[Editor] Failed to save animation:', err.message);
          _setStatus('替换成功，但动画保存失败', '#e94560');
        }
      } else {
        _setStatus('替换成功', '#5cb85c');
      }

      // Mark as library-sourced so repeated confirm clicks don't duplicate-save
      pendingModelSource = 'library';
      pendingModelAssetId = null;
      pendingAnimSaved = false;
      if (typeof onChange === 'function') onChange();
    } catch (err) {
      console.error('[Editor] Replace failed:', err);
      _setStatus(`替换失败: ${err.message}`, '#e94560');
    }
  }

  function _applyAnimationToEntity(entity, plan, duration, type = 'interaction') {
    if (!entity || !plan) return;
    if (type === 'interaction') {
      if (typeof entity.setInteractionAnimation === 'function') {
        entity.setInteractionAnimation(plan, duration);
      } else if (entity._interactionPlan !== undefined) {
        entity._interactionPlan = plan;
        entity._interactionDuration = duration;
        entity._interactionTime = 0;
        entity._interactionPlaying = false;
        entity._interactionPartMap = null;
      }
    } else {
      if (typeof entity.playIdleAnimation === 'function') {
        entity.playIdleAnimation(plan, duration);
      } else if (entity._animIdle !== undefined) {
        entity._animIdle = plan;
        entity._animDuration = duration;
        entity._animTime = 0;
        entity._animPartMap = null;
      }
    }
  }

  function _replaceEntityModel(entity, newMesh, modelJson) {
    const parent = entity._content || entity.mesh;
    if (entity._modelGroup) {
      parent.remove(entity._modelGroup);
      entity._modelGroup = null;
    }
    if (entity._fallback) {
      parent.remove(entity._fallback);
    }
    const box = new THREE.Box3().setFromObject(newMesh);
    newMesh.position.y = -box.min.y;
    if (entity._yOffset) newMesh.position.y += entity._yOffset;
    parent.add(newMesh);
    entity._modelGroup = newMesh;
    entity._originalModelJson = modelJson;
    entity._hasCustomModel = true;

    if (entity._animIdle !== undefined) {
      entity._animIdle = null;
      entity._animPartMap = null;
      if (entity._animTime !== undefined) entity._animTime = 0;
    }
    if (entity._interactionPlan !== undefined) {
      entity._interactionPlan = null;
      entity._interactionPlaying = false;
      entity._interactionPartMap = null;
    }
  }

  return {
    setTargetEntity,
    getTarget,
    update(dt) {
      if (previewOrbitGroup && !isDragging) {
        previewOrbitGroup.rotation.y += dt * 0.3;
      }
      if (previewModelGroup && previewAnimPlan) {
        previewAnimTime += dt;
        const t = previewAnimTime % previewAnimDuration;
        previewAnimPartMap = applyAnimation(previewAnimPlan, previewAnimDuration, previewModelGroup, t, previewAnimPartMap);
      }
      if (previewRenderer) previewRenderer.render(previewScene, previewCamera);
    },
    resizePreview: _resizePreview,
  };
}
