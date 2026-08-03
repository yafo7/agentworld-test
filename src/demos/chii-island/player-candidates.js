import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyAnimation } from '../../engine/animation/player.js';
import { ParticleSystem } from '../../engine/animation/particles.js';
import { buildModelFromJson } from '../../engine/model/builder.js';
import { initRuntime } from '../../engine/runtime/runtimeProvider.js';
import { CharacterEquipmentService } from '../../gameplay/equipment/CharacterEquipmentService.js';
import { generatedAssets } from '../../assets/repositories/GeneratedAssetRepository.js';
import { defaultContentGeneration } from '../../integrations/content/VoxelContentAdapter.js';
import { CharacterAppearanceStore } from '../../storage/CharacterAppearanceStore.js';
import { EquipmentMountCache } from '../../storage/EquipmentMountCache.js';
import {
  createCharacterShowcaseCatalog,
  getShowcaseAnimationLabel,
} from './data/characterShowcaseCatalog.js';
import {
  CHII_EQUIPMENT_ITEMS,
  CHII_EQUIPMENT_CATALOG,
  CHII_EQUIPMENT_SLOTS,
  createEmptyEquipmentLoadout,
  getCharacterOutfits,
  getChiiEquipmentItem,
  getMatchingCharacterOutfit,
} from './data/equipmentCatalog.js';
import {
  CHII_LOADING_PRESETS,
  createChiiPageLoadingScreen,
} from './presentation/ChiiPageLoadingScreen.js';
import { renderEquipmentThumbnails } from './presentation/EquipmentThumbnailRenderer.js';
import { getChiiSceneStyle } from './data/sceneStyle.js';

const CANDIDATE_MANIFEST = '/generated/player-candidates/phrolova/manifest.json';
const pageLoading = createChiiPageLoadingScreen({ preset: 'showcase' });
const status = document.querySelector('#preview-status');
const canvas = document.querySelector('#preview-canvas');
const categoryTabs = document.querySelector('#category-tabs');
const characterStrip = document.querySelector('#character-strip');
const motionSwitcher = document.querySelector('#motion-switcher');
const overviewButton = document.querySelector('#overview-button');
const characterPanel = document.querySelector('#character-panel');
const characterGroup = document.querySelector('#character-group');
const characterRole = document.querySelector('#character-role');
const characterName = document.querySelector('#character-name');
const characterDescription = document.querySelector('#character-description');
const characterTags = document.querySelector('#character-tags');
const variantSection = document.querySelector('#variant-section');
const variantSwitcher = document.querySelector('#variant-switcher');
const outfitSwitcher = document.querySelector('#showcase-outfit-switcher');
const clothingSlots = document.querySelector('#showcase-clothing-slots');
const clothingEmpty = document.querySelector('#showcase-clothing-empty');
const propSwitcher = document.querySelector('#showcase-prop-switcher');
const handSwitcher = document.querySelector('#showcase-hand-switcher');
const handSlots = document.querySelector('#showcase-hand-slots');
const equipmentButton = document.querySelector('#showcase-equip-button');
const clearEquipmentButton = document.querySelector('#showcase-clear-button');
const equipmentStatus = document.querySelector('#showcase-equipment-status');
const equipmentService = new CharacterEquipmentService({
  catalog: CHII_EQUIPMENT_CATALOG,
  contentPort: defaultContentGeneration,
  assetRepository: generatedAssets,
  cache: new EquipmentMountCache({ assetRepository: generatedAssets }),
});
const appearanceStore = new CharacterAppearanceStore({ scope: getChiiSceneStyle() });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdce6e0);
scene.fog = new THREE.Fog(0xdce6e0, 34, 68);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
camera.position.set(0, 4.4, 18);
camera.lookAt(0, 2, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4.5;
controls.maxDistance = 52;
controls.minPolarAngle = Math.PI * 0.24;
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xf3fbff, 0x69776b, 2.2));

const keyLight = new THREE.DirectionalLight(0xfff5e5, 3.4);
keyLight.position.set(-5, 10, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -13;
keyLight.shadow.camera.right = 13;
keyLight.shadow.camera.top = 9;
keyLight.shadow.camera.bottom = -3;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xbcd9dd, 1.5);
rimLight.position.set(7, 6, -7);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(52, 28),
  new THREE.MeshStandardMaterial({
    color: 0xaebdb2,
    roughness: 0.92,
    metalness: 0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(44, 44, 0x71877d, 0x96a89f);
grid.position.y = 0.008;
grid.material.transparent = true;
grid.material.opacity = 0.21;
scene.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const jsonCache = new Map();
const categoryCache = new Map();
const cameraGoal = new THREE.Vector3();
const targetGoal = new THREE.Vector3();

let catalog = null;
let currentCategory = null;
let currentRuntimes = [];
let selectedRuntime = null;
let focusMode = 'overview';
let cameraTransitionActive = false;
let activationVersion = 0;
let previousTime = performance.now();
let lastCanvasWidth = 0;
let lastCanvasHeight = 0;
let pointerDownPosition = null;
let selectedPropId = CHII_EQUIPMENT_ITEMS[0]?.id || null;
let selectedHandSlot = 'rightHand';
let equipmentBusy = false;
let equipmentThumbnails = new Map();

function loadJson(path) {
  if (!jsonCache.has(path)) {
    jsonCache.set(path, fetch(path).then(response => {
      if (!response.ok) throw new Error(`${response.status} ${path}`);
      return response.json();
    }));
  }
  return jsonCache.get(path);
}

function capturePose(model) {
  const pose = new Map();
  model.traverse(object => {
    pose.set(object, {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    });
  });
  return pose;
}

function restorePose(pose) {
  for (const [object, transform] of pose) {
    object.position.copy(transform.position);
    object.quaternion.copy(transform.quaternion);
    object.scale.copy(transform.scale);
  }
}

function normalizeCharacter(model, holder, displayHeight) {
  model.updateMatrixWorld(true);
  const originalBox = new THREE.Box3().setFromObject(model);
  const originalSize = originalBox.getSize(new THREE.Vector3());
  const scale = displayHeight / Math.max(originalSize.y, 0.001);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaledBox.min.y;
  holder.add(model);
  return {
    scale: model.scale.x,
    position: model.position.clone(),
  };
}

function createStageMarker(character) {
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(1.24, 1.3, 0.09, 40),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(character.accent),
      emissive: new THREE.Color(character.accent),
      emissiveIntensity: 0.04,
      roughness: 0.74,
      metalness: 0.04,
    }),
  );
  marker.position.y = 0.045;
  marker.receiveShadow = true;
  return marker;
}

function getCharacterSource(character, variantId = null) {
  if (!character.variants?.length) return character;
  return character.variants.find(variant => variant.id === variantId)
    || character.variants[0];
}

async function loadCharacterSource(source) {
  const [modelJson, animationEntries] = await Promise.all([
    loadJson(`/${source.model}`),
    Promise.all(Object.entries(source.animations).map(async ([name, path]) => [
      name,
      await loadJson(`/${path}`),
    ])),
  ]);
  return {
    source,
    modelJson,
    animations: Object.fromEntries(animationEntries),
  };
}

async function loadCharacter(character) {
  const storedAppearance = appearanceStore.get(character.id);
  const source = getCharacterSource(character, storedAppearance?.variantId);
  const bundle = await loadCharacterSource(source);
  const { modelJson } = bundle;
  let displayModelJson = modelJson;
  let equipmentLoadout = createEmptyEquipmentLoadout();
  if (storedAppearance && Object.values(storedAppearance.loadout || {}).some(Boolean)) {
    try {
      const equipped = await equipmentService.resolveLoadout({
        characterId: character.id,
        variantId: character.variants?.length ? source.id : 'default',
        baseModelJson: modelJson,
        loadout: storedAppearance.loadout,
      });
      displayModelJson = equipped.modelJson;
      equipmentLoadout = equipped.loadout;
    } catch (error) {
      console.warn(`[CharacterShowcase] Stored ${character.id} outfit skipped:`, error.message);
    }
  }

  const holder = new THREE.Group();
  holder.userData.showcaseId = character.id;
  const marker = createStageMarker(character);
  holder.add(marker);

  const model = buildModelFromJson(displayModelJson);
  model.traverse(child => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  const normalization = normalizeCharacter(model, holder, source.displayHeight || character.displayHeight);

  const runtime = {
    id: character.id,
    character,
    holder,
    marker,
    model,
    animations: bundle.animations,
    particles: new ParticleSystem(scene),
    originalPose: capturePose(model),
    basePose: null,
    activeAnimation: 'idle',
    elapsed: 0,
    activeVariantId: character.variants?.length ? source.id : 'default',
    baseModelJson: modelJson,
    currentModelJson: displayModelJson,
    normalization,
    equipmentLoadout,
    appearanceOutfitId: storedAppearance?.outfitId || null,
    equipmentRequestVersion: 0,
  };
  setRuntimeAnimation(runtime, 'idle');
  return runtime;
}

function setRuntimeAnimation(runtime, animationName) {
  if (!runtime) return;
  runtime.particles.dispose();
  restorePose(runtime.originalPose);
  runtime.basePose = null;
  runtime.elapsed = 0;
  runtime.activeAnimation = runtime.animations[animationName]
    ? animationName
    : Object.keys(runtime.animations)[0] || null;
  const plan = runtime.animations[runtime.activeAnimation];
  if (plan) runtime.particles.setup(plan, runtime.model);
}

function prepareShowcaseModel(model) {
  model.traverse(child => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function replaceRuntimeModel(runtime, modelJson, {
  preserveNormalization = true,
} = {}) {
  if (!runtime || !modelJson) return false;
  runtime.particles.dispose();
  if (runtime.model) runtime.holder.remove(runtime.model);

  const model = buildModelFromJson(modelJson);
  prepareShowcaseModel(model);
  if (preserveNormalization && runtime.normalization) {
    model.scale.setScalar(runtime.normalization.scale);
    model.position.copy(runtime.normalization.position);
    runtime.holder.add(model);
  } else {
    runtime.normalization = normalizeCharacter(
      model,
      runtime.holder,
      getCharacterSource(runtime.character, runtime.activeVariantId).displayHeight
        || runtime.character.displayHeight,
    );
  }

  runtime.model = model;
  runtime.currentModelJson = modelJson;
  runtime.originalPose = capturePose(model);
  runtime.basePose = null;
  runtime.elapsed = 0;
  setRuntimeAnimation(runtime, runtime.activeAnimation || 'idle');
  return true;
}

function setEquipmentStatus(message, state = 'ready') {
  equipmentStatus.textContent = message;
  equipmentStatus.dataset.state = state;
}

function setEquipmentBusy(busy) {
  equipmentBusy = Boolean(busy);
  characterPanel.classList.toggle('is-equipment-busy', equipmentBusy);
  for (const control of characterPanel.querySelectorAll(
    '#variant-switcher button, #showcase-outfit-switcher button, #showcase-clothing-slots button, #showcase-prop-switcher button, #showcase-hand-switcher button, #showcase-hand-slots button, #showcase-equip-button, #showcase-clear-button',
  )) {
    control.disabled = equipmentBusy;
  }
  if (!equipmentBusy && selectedRuntime) {
    renderVariantControls();
    renderEquipmentControls();
  }
}

function selectedHandItemId() {
  return selectedRuntime?.equipmentLoadout?.[selectedHandSlot] || null;
}

function persistRuntimeAppearance(runtime) {
  if (!runtime) return;
  const outfit = getMatchingCharacterOutfit(runtime.character.id, runtime.equipmentLoadout);
  runtime.appearanceOutfitId = outfit?.id || null;
  appearanceStore.set(runtime.character.id, {
    variantId: runtime.activeVariantId,
    outfitId: runtime.appearanceOutfitId,
    loadout: runtime.equipmentLoadout,
  });
}

async function applySelectedRuntimeLoadout(nextLoadout, {
  workingMessage = '正在认真装配...',
  completeMessage = '装好啦，转一圈看看吧。',
} = {}) {
  const runtime = selectedRuntime;
  if (!runtime || equipmentBusy) return false;
  const version = ++runtime.equipmentRequestVersion;
  setEquipmentBusy(true);
  setEquipmentStatus(workingMessage, 'working');
  status.textContent = `${runtime.character.name}正在试装...`;

  try {
    const result = await equipmentService.resolveLoadout({
      characterId: runtime.character.id,
      variantId: runtime.activeVariantId,
      baseModelJson: runtime.baseModelJson,
      loadout: nextLoadout,
    });
    if (version !== runtime.equipmentRequestVersion || selectedRuntime !== runtime) return false;
    runtime.equipmentLoadout = result.loadout;
    replaceRuntimeModel(runtime, result.modelJson, { preserveNormalization: true });
    persistRuntimeAppearance(runtime);
    renderEquipmentControls();
    focusCharacter(runtime);
    setEquipmentStatus(completeMessage, 'complete');
    status.textContent = `${runtime.character.name} · 装扮已更新`;
    return true;
  } catch (error) {
    console.error('[CharacterShowcase] Equipment failed:', error);
    setEquipmentStatus(`这次没装稳：${error.message}`, 'error');
    status.textContent = `${runtime.character.name}的装配暂时没成功`;
    return false;
  } finally {
    if (version === runtime.equipmentRequestVersion) setEquipmentBusy(false);
  }
}

async function switchSelectedVariant(variantId) {
  const runtime = selectedRuntime;
  if (!runtime || !runtime.character.variants?.length || equipmentBusy) return false;
  if (runtime.activeVariantId === variantId) return true;
  const source = getCharacterSource(runtime.character, variantId);
  if (!source) return false;

  const version = ++runtime.equipmentRequestVersion;
  setEquipmentBusy(true);
  setEquipmentStatus(`正在换成${source.name}...`, 'working');
  status.textContent = `弗洛洛正在更换${source.group}...`;
  try {
    const bundle = await loadCharacterSource(source);
    if (version !== runtime.equipmentRequestVersion || selectedRuntime !== runtime) return false;
    runtime.activeVariantId = source.id;
    runtime.baseModelJson = bundle.modelJson;
    runtime.animations = bundle.animations;
    if (runtime.activeVariantId !== 'original') {
      for (const slot of CHII_EQUIPMENT_SLOTS.filter(entry => entry.kind === 'clothing')) {
        runtime.equipmentLoadout[slot.id] = null;
      }
    }
    runtime.activeAnimation = bundle.animations[runtime.activeAnimation]
      ? runtime.activeAnimation
      : (bundle.animations.idle ? 'idle' : Object.keys(bundle.animations)[0]);
    replaceRuntimeModel(runtime, bundle.modelJson, { preserveNormalization: false });

    const hasEquipment = Object.values(runtime.equipmentLoadout).some(Boolean);
    if (hasEquipment) {
      const equipped = await equipmentService.resolveLoadout({
        characterId: runtime.character.id,
        variantId: runtime.activeVariantId,
        baseModelJson: runtime.baseModelJson,
        loadout: runtime.equipmentLoadout,
      });
      if (version !== runtime.equipmentRequestVersion || selectedRuntime !== runtime) return false;
      replaceRuntimeModel(runtime, equipped.modelJson, { preserveNormalization: true });
    }

    persistRuntimeAppearance(runtime);
    renderSelectedCharacter();
    focusCharacter(runtime);
    setEquipmentStatus(
      runtime.activeVariantId === 'original'
        ? `${source.name}已经站好，Original 衣橱可以正常使用。`
        : `${source.name}已经站好；这个版本的服装暂未制作。`,
      'complete',
    );
    status.textContent = `弗洛洛 · ${source.group}`;
    return true;
  } catch (error) {
    console.error('[CharacterShowcase] Variant switch failed:', error);
    setEquipmentStatus(`模型没换稳：${error.message}`, 'error');
    return false;
  } finally {
    if (version === runtime.equipmentRequestVersion) setEquipmentBusy(false);
  }
}

function stopCategory(runtimes) {
  for (const runtime of runtimes) {
    runtime.particles.dispose();
    restorePose(runtime.originalPose);
    runtime.basePose = null;
    runtime.elapsed = 0;
    runtime.activeAnimation = 'idle';
  }
}

function startCategory(runtimes) {
  for (const runtime of runtimes) setRuntimeAnimation(runtime, 'idle');
}

function layoutCategory(runtimes) {
  const count = runtimes.length;
  const spacing = count <= 2 ? 4.2 : Math.min(3.2, 15 / Math.max(count - 1, 1));
  const startX = -((count - 1) * spacing) / 2;
  runtimes.forEach((runtime, index) => {
    runtime.holder.position.set(startX + index * spacing, 0, 0);
  });
  return spacing;
}

async function ensureCategoryLoaded(category) {
  if (categoryCache.has(category.id)) return categoryCache.get(category.id);

  const group = new THREE.Group();
  group.name = `showcase-${category.id}`;
  group.visible = false;
  scene.add(group);

  const runtimes = await Promise.all(category.characters.map(loadCharacter));
  for (const runtime of runtimes) group.add(runtime.holder);
  const spacing = layoutCategory(runtimes);
  const entry = { group, runtimes, spacing };
  categoryCache.set(category.id, entry);
  return entry;
}

function renderCategoryTabs() {
  categoryTabs.replaceChildren(...catalog.categories.map(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.categoryId = category.id;
    button.innerHTML = `${category.title}<span class="category-count">${category.characters.length}</span>`;
    button.addEventListener('click', () => activateCategory(category.id));
    return button;
  }));
}

function renderCharacterStrip() {
  characterStrip.replaceChildren(...currentRuntimes.map(runtime => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.characterId = runtime.id;
    button.style.setProperty('--character-accent', runtime.character.accent);
    button.setAttribute('aria-pressed', String(runtime === selectedRuntime));
    button.classList.toggle('is-active', runtime === selectedRuntime);

    const dot = document.createElement('span');
    dot.className = 'character-dot';
    const name = document.createElement('strong');
    name.textContent = runtime.character.name;
    const group = document.createElement('small');
    group.textContent = runtime.character.group;
    button.append(dot, name, group);
    button.addEventListener('click', () => selectCharacter(runtime.id));
    return button;
  }));
}

function renderSelectedCharacter() {
  if (!selectedRuntime) return;
  const { character } = selectedRuntime;
  const activeSource = getCharacterSource(character, selectedRuntime.activeVariantId);
  characterGroup.textContent = activeSource.group || character.group;
  characterRole.textContent = activeSource.role || character.role;
  characterName.textContent = character.name;
  characterDescription.textContent = activeSource.description || character.description;
  characterTags.replaceChildren(...character.tags.map(tag => {
    const item = document.createElement('span');
    item.textContent = tag;
    return item;
  }));

  motionSwitcher.replaceChildren(...Object.keys(selectedRuntime.animations).map(animationName => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.animation = animationName;
    button.textContent = getShowcaseAnimationLabel(animationName);
    button.classList.toggle('is-active', selectedRuntime.activeAnimation === animationName);
    button.setAttribute('aria-pressed', String(selectedRuntime.activeAnimation === animationName));
    button.addEventListener('click', () => setSelectedAnimation(animationName));
    return button;
  }));
  renderVariantControls();
  renderEquipmentControls();
}

function renderVariantControls() {
  const variants = selectedRuntime?.character?.variants || [];
  variantSection.hidden = variants.length === 0;
  if (variants.length === 0) {
    variantSwitcher.replaceChildren();
    return;
  }
  variantSwitcher.replaceChildren(...variants.map(variant => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.variantId = variant.id;
    button.classList.toggle('is-active', selectedRuntime.activeVariantId === variant.id);
    button.setAttribute('aria-pressed', String(selectedRuntime.activeVariantId === variant.id));
    button.disabled = equipmentBusy;
    button.innerHTML = `<strong>${variant.group}</strong><small>${variant.name}</small>`;
    button.addEventListener('click', () => switchSelectedVariant(variant.id));
    return button;
  }));
}

function createLoadoutSlotButton(slot) {
  const itemId = selectedRuntime?.equipmentLoadout?.[slot.id] || null;
  const item = getChiiEquipmentItem(itemId);
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.equipmentSlot = slot.id;
  button.classList.toggle('is-active', slot.id === selectedHandSlot);
  button.classList.toggle('has-item', Boolean(item));
  button.disabled = equipmentBusy;

  const label = document.createElement('span');
  label.textContent = slot.label;
  const value = document.createElement('strong');
  value.textContent = item?.shortName || '空';
  button.append(label, value);
  return button;
}

function renderEquipmentControls() {
  if (!selectedRuntime) return;
  const clothing = CHII_EQUIPMENT_SLOTS.filter(slot => slot.kind === 'clothing');
  const hands = CHII_EQUIPMENT_SLOTS.filter(slot => slot.kind === 'prop');
  const outfits = getCharacterOutfits(selectedRuntime.character.id);
  const activeOutfit = getMatchingCharacterOutfit(
    selectedRuntime.character.id,
    selectedRuntime.equipmentLoadout,
  );

  outfitSwitcher.replaceChildren(...outfits.map(outfit => {
    const active = activeOutfit?.id === outfit.id;
    const supported = outfit.supportedVariantIds.includes(selectedRuntime.activeVariantId);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.outfitId = outfit.id;
    button.style.setProperty('--outfit-accent', outfit.accent);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = equipmentBusy || !supported;
    button.innerHTML = `<strong>${outfit.name}</strong><small>${supported ? (active ? '脱下整套' : '穿上整套') : 'Original 专用'}</small>`;
    button.addEventListener('click', () => {
      const nextLoadout = { ...selectedRuntime.equipmentLoadout };
      for (const slot of clothing) nextLoadout[slot.id] = active ? null : outfit.loadout[slot.id];
      applySelectedRuntimeLoadout(nextLoadout, {
        workingMessage: active ? `正在收好${outfit.name}...` : `正在穿上${outfit.name}...`,
        completeMessage: active
          ? `${outfit.name}已经整齐放回衣橱。`
          : `${outfit.name}穿好啦，岛上也会保持这身打扮。`,
      });
    });
    return button;
  }));

  clothingSlots.replaceChildren(...clothing.map(slot => {
    const button = createLoadoutSlotButton(slot);
    button.disabled = equipmentBusy || selectedRuntime.activeVariantId !== 'original';
    button.addEventListener('click', () => {
      const itemId = selectedRuntime.equipmentLoadout[slot.id];
      if (itemId) {
        applySelectedRuntimeLoadout({
          ...selectedRuntime.equipmentLoadout,
          [slot.id]: null,
        }, {
          workingMessage: `正在取下${slot.label}里的装备...`,
          completeMessage: `${slot.label}已经空出来了。`,
        });
      } else {
        const outfitItemId = outfits.find(outfit => outfit.loadout[slot.id])?.loadout[slot.id];
        const outfitItem = getChiiEquipmentItem(outfitItemId);
        if (!outfitItem) {
          setEquipmentStatus(`${slot.label}槽已经留好，目前衣橱里还没有这一类服装。`);
          return;
        }
        applySelectedRuntimeLoadout({
          ...selectedRuntime.equipmentLoadout,
          [slot.id]: outfitItem.id,
        }, {
          workingMessage: `正在穿上${outfitItem.name}...`,
          completeMessage: `${outfitItem.name}穿好啦，回到岛上也看得到。`,
        });
      }
    });
    return button;
  }));
  clothingEmpty.hidden = outfits.length > 0;

  propSwitcher.replaceChildren(...CHII_EQUIPMENT_ITEMS.filter(item => item.kind === 'prop').map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.propId = item.id;
    button.style.setProperty('--item-accent', item.accent);
    button.classList.toggle('is-active', selectedPropId === item.id);
    button.setAttribute('aria-pressed', String(selectedPropId === item.id));
    button.disabled = equipmentBusy;

    const image = document.createElement('img');
    image.alt = '';
    const thumbnail = equipmentThumbnails.get(item.id);
    if (thumbnail) image.src = thumbnail;
    else image.hidden = true;
    const fallback = document.createElement('span');
    fallback.textContent = item.shortName.slice(0, 2);
    const label = document.createElement('strong');
    label.textContent = item.shortName;
    button.append(image, fallback, label);
    button.addEventListener('click', () => {
      selectedPropId = item.id;
      renderEquipmentControls();
      setEquipmentStatus(`选中了${item.name}，再选左手或右手。`);
    });
    return button;
  }));

  for (const button of handSwitcher.querySelectorAll('[data-hand-slot]')) {
    const active = button.dataset.handSlot === selectedHandSlot;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = equipmentBusy;
  }

  handSlots.replaceChildren(...hands.map(slot => {
    const button = createLoadoutSlotButton(slot);
    button.classList.toggle('is-active', slot.id === selectedHandSlot);
    button.addEventListener('click', () => {
      selectedHandSlot = slot.id;
      renderEquipmentControls();
      setEquipmentStatus(`现在会装到${slot.label}。`);
    });
    return button;
  }));

  const selectedProp = getChiiEquipmentItem(selectedPropId);
  const equippedInHand = selectedHandItemId();
  equipmentButton.disabled = equipmentBusy
    || !selectedProp
    || equippedInHand === selectedPropId;
  equipmentButton.textContent = equippedInHand === selectedPropId
    ? `${selectedProp?.name || '道具'}已经在${selectedHandSlot === 'leftHand' ? '左手' : '右手'}`
    : `把${selectedProp?.name || '道具'}装到${selectedHandSlot === 'leftHand' ? '左手' : '右手'}`;
  clearEquipmentButton.disabled = equipmentBusy || !equippedInHand;
}

function updateSelectionPresentation() {
  for (const runtime of currentRuntimes) {
    const active = runtime === selectedRuntime;
    runtime.marker.scale.setScalar(active ? 1.12 : 1);
    runtime.marker.material.emissiveIntensity = active ? 0.34 : 0.04;
  }
  renderCharacterStrip();
  renderSelectedCharacter();
}

function queueCameraTransition(position, target) {
  cameraGoal.copy(position);
  targetGoal.copy(target);
  cameraTransitionActive = true;
}

function getOverviewCameraPose() {
  const count = currentRuntimes.length;
  const spacing = categoryCache.get(currentCategory.id)?.spacing || 3;
  const modelBounds = new THREE.Box3();
  for (const runtime of currentRuntimes) {
    modelBounds.union(new THREE.Box3().setFromObject(runtime.model));
  }
  const measuredWidth = modelBounds.isEmpty() ? 0 : modelBounds.max.x - modelBounds.min.x;
  const framingCenterX = modelBounds.isEmpty()
    ? 0
    : (modelBounds.min.x + modelBounds.max.x) * 0.5;
  const rowWidth = Math.max(8, (count - 1) * spacing + 3, measuredWidth + 1.4);
  const maxHeight = Math.max(...currentRuntimes.map(runtime => runtime.character.displayHeight), 3);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.3));
  const distance = THREE.MathUtils.clamp(
    rowWidth / (2 * Math.tan(horizontalFov / 2)) * 1.08,
    11,
    48,
  );
  return {
    position: new THREE.Vector3(framingCenterX, maxHeight * 0.62 + 1.8, distance),
    target: new THREE.Vector3(framingCenterX, maxHeight * 0.46, 0),
  };
}

function focusOverview(animate = true) {
  if (!currentRuntimes.length) return;
  focusMode = 'overview';
  overviewButton.hidden = true;
  characterPanel.hidden = true;
  controls.minDistance = 8;
  controls.maxDistance = 52;
  const pose = getOverviewCameraPose();
  if (animate) {
    queueCameraTransition(pose.position, pose.target);
  } else {
    camera.position.copy(pose.position);
    controls.target.copy(pose.target);
    cameraTransitionActive = false;
  }
}

function focusCharacter(runtime) {
  if (!runtime) return;
  focusMode = 'character';
  overviewButton.hidden = false;
  characterPanel.hidden = false;
  controls.minDistance = 4.2;
  controls.maxDistance = 13;
  const box = new THREE.Box3().setFromObject(runtime.model);
  const center = box.getCenter(new THREE.Vector3());
  const height = Math.max(box.max.y - box.min.y, 2);
  const target = new THREE.Vector3(runtime.holder.position.x, center.y, 0);
  const position = new THREE.Vector3(
    runtime.holder.position.x + height * 0.22,
    center.y + height * 0.2,
    Math.max(6.2, height * 2.05),
  );
  queueCameraTransition(position, target);
}

function selectCharacter(characterId, { focus = true } = {}) {
  const runtime = currentRuntimes.find(candidate => candidate.id === characterId);
  if (!runtime) return false;

  if (selectedRuntime && selectedRuntime !== runtime) {
    setRuntimeAnimation(selectedRuntime, 'idle');
  }
  selectedRuntime = runtime;
  updateSelectionPresentation();
  const outfit = getMatchingCharacterOutfit(runtime.character.id, runtime.equipmentLoadout);
  const hasEquipment = Object.values(runtime.equipmentLoadout).some(Boolean);
  setEquipmentStatus(
    outfit
      ? `${outfit.name}正穿在身上，回到岛上也会保持。`
      : hasEquipment
        ? '这位角色的装扮已经同步保存。'
        : '先挑衣服或道具，再决定装到哪里。',
    outfit || hasEquipment ? 'complete' : 'ready',
  );
  if (focus) focusCharacter(runtime);
  return true;
}

function setSelectedAnimation(animationName) {
  if (!selectedRuntime?.animations[animationName]) return false;
  setRuntimeAnimation(selectedRuntime, animationName);
  renderSelectedCharacter();
  return true;
}

async function activateCategory(categoryId) {
  const category = catalog.categories.find(entry => entry.id === categoryId);
  if (!category || category === currentCategory) return;

  const version = ++activationVersion;
  pageLoading.show({
    title: `${category.title}正在入场`,
    detail: CHII_LOADING_PRESETS.category.detail,
  });
  status.textContent = `正在整理${category.title}...`;
  if (currentCategory) {
    const previous = categoryCache.get(currentCategory.id);
    if (previous) {
      previous.group.visible = false;
      stopCategory(previous.runtimes);
    }
  }

  try {
    const entry = await ensureCategoryLoaded(category);
    if (version !== activationVersion) return;
    currentCategory = category;
    currentRuntimes = entry.runtimes;
    entry.group.visible = true;
    startCategory(currentRuntimes);
    selectedRuntime = currentRuntimes[0] || null;
    document.documentElement.style.setProperty('--category-accent', category.accent);
    for (const button of categoryTabs.querySelectorAll('button')) {
      const active = button.dataset.categoryId === category.id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    updateSelectionPresentation();
    focusOverview(false);
    status.textContent = `${category.title} · ${currentRuntimes.length} 位角色`;
    pageLoading.hide();
  } catch (error) {
    if (version !== activationVersion) return;
    console.error('[CharacterShowcase] Category load failed:', error);
    status.textContent = `${category.title}尚未准备完成：${error.message}`;
    pageLoading.fail({
      title: `${category.title}还没站好`,
      detail: `展台刚刚晃了一下：${error.message}`,
    });
  }
}

function runtimeFromIntersection(intersection) {
  let object = intersection?.object || null;
  while (object) {
    if (object.userData?.showcaseId) {
      return currentRuntimes.find(runtime => runtime.id === object.userData.showcaseId) || null;
    }
    object = object.parent;
  }
  return null;
}

function raycastCharacter(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(
    currentRuntimes.map(runtime => runtime.holder),
    true,
  );
  return intersections.map(runtimeFromIntersection).find(Boolean) || null;
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === lastCanvasWidth && height === lastCanvasHeight) return;
  lastCanvasWidth = width;
  lastCanvasHeight = height;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.fov = width < 600 ? 52 : width < 900 ? 44 : 38;
  camera.updateProjectionMatrix();
  if (focusMode === 'overview' && currentRuntimes.length) {
    const pose = getOverviewCameraPose();
    queueCameraTransition(pose.position, pose.target);
  }
}

function render(now) {
  const dt = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  for (const runtime of currentRuntimes) {
    const plan = runtime.animations[runtime.activeAnimation];
    if (!plan) continue;
    runtime.elapsed += dt;
    const duration = plan._duration || 2;
    runtime.basePose = applyAnimation(
      plan,
      duration,
      runtime.model,
      runtime.elapsed % duration,
      runtime.basePose,
    );
    runtime.particles.update(dt, runtime.model);
  }

  resize();
  if (cameraTransitionActive) {
    const amount = 1 - Math.exp(-dt * 7);
    camera.position.lerp(cameraGoal, amount);
    controls.target.lerp(targetGoal, amount);
    if (
      camera.position.distanceToSquared(cameraGoal) < 0.0005
      && controls.target.distanceToSquared(targetGoal) < 0.0005
    ) {
      camera.position.copy(cameraGoal);
      controls.target.copy(targetGoal);
      cameraTransitionActive = false;
    }
  }
  controls.update();
  renderer.render(scene, camera);
}

overviewButton.addEventListener('click', () => focusOverview());
canvas.addEventListener('pointerdown', event => {
  pointerDownPosition = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointerup', event => {
  if (!pointerDownPosition) return;
  const distance = Math.hypot(
    event.clientX - pointerDownPosition.x,
    event.clientY - pointerDownPosition.y,
  );
  pointerDownPosition = null;
  if (distance > 6) return;
  const runtime = raycastCharacter(event);
  if (runtime) selectCharacter(runtime.id);
});
canvas.addEventListener('pointermove', event => {
  if (event.buttons) return;
  canvas.classList.toggle('is-hovering-character', Boolean(raycastCharacter(event)));
});
canvas.addEventListener('pointerleave', () => {
  canvas.classList.remove('is-hovering-character');
  pointerDownPosition = null;
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && focusMode === 'character') focusOverview();
});
for (const button of handSwitcher.querySelectorAll('[data-hand-slot]')) {
  button.addEventListener('click', () => {
    if (equipmentBusy) return;
    selectedHandSlot = button.dataset.handSlot;
    renderEquipmentControls();
    setEquipmentStatus(`现在会装到${selectedHandSlot === 'leftHand' ? '左手' : '右手'}。`);
  });
}
equipmentButton.addEventListener('click', () => {
  if (!selectedRuntime || equipmentBusy || !selectedPropId) return;
  const item = getChiiEquipmentItem(selectedPropId);
  applySelectedRuntimeLoadout({
    ...selectedRuntime.equipmentLoadout,
    [selectedHandSlot]: selectedPropId,
  }, {
    workingMessage: `${item.name}正在寻找最稳的位置...`,
    completeMessage: `${item.name}已经装到${selectedHandSlot === 'leftHand' ? '左手' : '右手'}。`,
  });
});
clearEquipmentButton.addEventListener('click', () => {
  if (!selectedRuntime || equipmentBusy || !selectedHandItemId()) return;
  const item = getChiiEquipmentItem(selectedHandItemId());
  applySelectedRuntimeLoadout({
    ...selectedRuntime.equipmentLoadout,
    [selectedHandSlot]: null,
  }, {
    workingMessage: `正在取下${item?.name || '道具'}...`,
    completeMessage: `${selectedHandSlot === 'leftHand' ? '左手' : '右手'}已经空出来了。`,
  });
});

try {
  await initRuntime(THREE);
  const candidateManifest = await loadJson(CANDIDATE_MANIFEST);
  catalog = createCharacterShowcaseCatalog(candidateManifest);
  renderCategoryTabs();
  await activateCategory(catalog.categories[0].id);
  renderEquipmentThumbnails(CHII_EQUIPMENT_ITEMS, {
    loadModelJson: itemId => equipmentService.loadItemModel(itemId),
  }).then(thumbnails => {
    equipmentThumbnails = thumbnails;
    if (selectedRuntime) renderEquipmentControls();
  }).catch(error => {
    console.warn('[CharacterShowcase] Equipment thumbnails skipped:', error.message);
  });
  window.__chiiCharacterShowcase = {
    catalog,
    setCategory: activateCategory,
    selectCharacter,
    setAnimation: setSelectedAnimation,
    switchVariant: switchSelectedVariant,
    toggleOutfit: async outfitId => {
      const outfit = getCharacterOutfits(selectedRuntime?.character.id)
        .find(entry => entry.id === outfitId);
      if (!outfit) return false;
      const active = getMatchingCharacterOutfit(
        selectedRuntime.character.id,
        selectedRuntime.equipmentLoadout,
      )?.id === outfit.id;
      const nextLoadout = { ...selectedRuntime.equipmentLoadout };
      for (const slot of CHII_EQUIPMENT_SLOTS.filter(entry => entry.kind === 'clothing')) {
        nextLoadout[slot.id] = active ? null : outfit.loadout[slot.id];
      }
      return applySelectedRuntimeLoadout(nextLoadout);
    },
    equipProp: async (itemId, slotId = 'rightHand') => {
      selectedPropId = itemId;
      selectedHandSlot = slotId;
      return applySelectedRuntimeLoadout({
        ...selectedRuntime.equipmentLoadout,
        [slotId]: itemId,
      });
    },
    showOverview: focusOverview,
    getState: () => ({
      categoryId: currentCategory?.id || null,
      selectedId: selectedRuntime?.id || null,
      animation: selectedRuntime?.activeAnimation || null,
      variantId: selectedRuntime?.activeVariantId || null,
      outfitId: selectedRuntime?.appearanceOutfitId || null,
      equipment: { ...(selectedRuntime?.equipmentLoadout || {}) },
      focusMode,
      visibleCharacterIds: currentRuntimes.map(runtime => runtime.id),
    }),
  };
  renderer.setAnimationLoop(render);
} catch (error) {
  console.error('[CharacterShowcase] Failed:', error);
  status.textContent = `展柜尚未准备完成：${error.message}`;
  pageLoading.fail({
    title: '角色展柜还没准备好',
    detail: `有位角色走错了入口：${error.message}`,
  });
}
