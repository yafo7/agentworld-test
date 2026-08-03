import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyAnimation } from '../../engine/animation/player.js';
import { buildModelFromJson } from '../../engine/model/builder.js';
import { initRuntime } from '../../engine/runtime/runtimeProvider.js';
import { createChiiPageLoadingScreen } from '../chii-island/presentation/ChiiPageLoadingScreen.js';
import { AGENTLAND_FRIEND_PROFILES } from './data/friendProfiles.js';
import { AGENTLAND_FRIEND_STORIES } from './data/storyScenarios.js';
import { FriendActivityDirector } from './systems/FriendActivityDirector.js';

const canvas = document.querySelector('#friends-canvas');
const rosterEl = document.querySelector('#friend-roster');
const storyButton = document.querySelector('#start-story');
const storyPhaseEl = document.querySelector('#story-phase');
const storyProgressEl = document.querySelector('#story-progress');
const storyProgressValueEl = document.querySelector('#story-progress-value');
const storyTitleEl = document.querySelector('#story-title');
const storyDetailEl = document.querySelector('#story-detail');
const storyLogEl = document.querySelector('#story-log');
const storyPanelEl = document.querySelector('#story-panel');
const speechLayer = document.querySelector('#speech-layer');
const friendDetail = document.querySelector('#friend-detail');
const friendDetailRole = document.querySelector('#friend-detail-role');
const friendDetailName = document.querySelector('#friend-detail-name');
const friendDetailPersonality = document.querySelector('#friend-detail-personality');
const friendDetailReference = document.querySelector('#friend-detail-reference');
const referenceDesk = document.querySelector('.reference-desk');
const referenceToggle = document.querySelector('#reference-toggle');
const pageLoading = createChiiPageLoadingScreen({ preset: 'showcase' });
const badge = document.querySelector('.chii-loader-badge');
if (badge) badge.textContent = 'AGENTLAND FRIENDS';
pageLoading.show({ title: '朋友庭院正在开门', detail: '样例朋友们正在决定谁先假装不紧张。' });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbddbd2);
scene.fog = new THREE.Fog(0xbddbd2, 34, 70);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
camera.position.set(18, 14, 24);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.7, 1);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 12;
controls.maxDistance = 42;
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.46;

const actors = [];
const actorsById = new Map();
const speechEntries = new Map();
const referenceUrls = new Set();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let director = null;
let selectedActor = null;
let previousTime = performance.now();
let pointerStart = null;

function material(color, roughness = 0.86) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function box(size, color, position, rotationY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function createTree(x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.38 * scale, 2.6 * scale, 7), material(0x8a6444));
  trunk.position.y = 1.3 * scale;
  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35 * scale, 0), material(0x4e9368));
  crown.position.y = 3.1 * scale;
  trunk.castShadow = true;
  crown.castShadow = true;
  group.add(trunk, crown);
  scene.add(group);
}

function createFlowerPatch(x, z, color) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.45, 5), material(0x4f8b58));
    stem.position.set(Math.cos(angle) * 0.35, 0.23, Math.sin(angle) * 0.35);
    const bloom = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), material(color));
    bloom.position.copy(stem.position).add(new THREE.Vector3(0, 0.25, 0));
    group.add(stem, bloom);
  }
  scene.add(group);
}

function createGarden() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(56, 36), material(0x86b978, 0.95));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  for (let index = -6; index <= 6; index += 1) {
    box([1.7, 0.12, 1.25], index % 2 ? 0xcab798 : 0xd6c6a7, [index * 1.75, 0.06, 1], (index % 3 - 1) * 0.025);
  }

  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(4.1, 42),
    new THREE.MeshStandardMaterial({ color: 0x6eb6c3, roughness: 0.32, metalness: 0, transparent: true, opacity: 0.88 }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(10, 0.035, -5.2);
  scene.add(pond);
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    box([0.75, 0.32, 0.55], 0x8c9792, [10 + Math.cos(angle) * 4.25, 0.15, -5.2 + Math.sin(angle) * 4.25], -angle);
  }

  box([5.8, 0.08, 4.3], 0xe6b76c, [0, 0.08, 3.2]);
  box([2.5, 0.16, 1.1], 0xbf6d56, [0, 0.19, 3.2]);
  box([0.16, 0.85, 0.16], 0x6e533e, [-1, 0.55, 3.2]);
  box([0.16, 0.85, 0.16], 0x6e533e, [1, 0.55, 3.2]);

  const pavilion = new THREE.Group();
  pavilion.position.set(-10, 0, -6);
  const postMaterial = material(0x6e5140);
  for (const [x, z] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.3, 0.25), postMaterial);
    post.position.set(x, 1.65, z);
    post.castShadow = true;
    pavilion.add(post);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 1.35, 4), material(0xc85f50));
  roof.position.y = 3.75;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  pavilion.add(roof);
  scene.add(pavilion);

  [[-15, -8, 1.2], [-15, 7, 1], [-7, 9, 1.1], [15, 7, 1.15], [16, 1, 0.95], [5, -10, 1.05]]
    .forEach(([x, z, scale]) => createTree(x, z, scale));
  createFlowerPatch(-5, 6.5, 0xf08ca4);
  createFlowerPatch(5, 6.8, 0xefd362);
  createFlowerPatch(-3.6, -5.5, 0x8ea9e6);
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

function normalizeModel(model, holder, displayHeight) {
  model.updateMatrixWorld(true);
  const initialBox = new THREE.Box3().setFromObject(model);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const scale = displayHeight / Math.max(initialSize.y, 0.001);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const boxAfterScale = new THREE.Box3().setFromObject(model);
  const center = boxAfterScale.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= boxAfterScale.min.y;
  holder.add(model);
}

function createFallbackModel(profile) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.75), material(profile.accent));
  body.name = 'body';
  body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 1.05), material(0xffd9ba));
  head.name = 'head';
  head.position.y = 2.3;
  root.add(body, head);
  return root;
}

async function loadJson(path) {
  const response = await fetch(`/${path}`);
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

class FriendActor {
  constructor(profile, model, animations) {
    this.id = profile.id;
    this.profile = profile;
    this.holder = new THREE.Group();
    this.holder.name = `friend-${profile.id}`;
    this.holder.userData.friendActorId = profile.id;
    this.holder.position.set(...profile.initialPosition);
    this.model = model;
    this.animations = animations;
    this.destination = null;
    this.autonomous = true;
    this.roamTimer = 1.5 + Math.random() * 2.5;
    this.animationName = null;
    this.animationTime = 0;
    this.basePose = null;
    normalizeModel(model, this.holder, profile.displayHeight);
    model.traverse(child => {
      child.userData.friendActorId = profile.id;
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    this.originalPose = capturePose(model);
    this.play('idle');
    scene.add(this.holder);
  }

  setAutonomous(enabled) {
    this.autonomous = !!enabled;
    if (enabled) this.roamTimer = 1 + Math.random() * 2;
  }

  moveTo(position) {
    this.destination = new THREE.Vector3(position.x, 0, position.z);
    this.play('run');
  }

  stop() {
    this.destination = null;
    this.play('idle');
  }

  hasArrived() {
    return !this.destination;
  }

  play(name) {
    const next = this.animations[name] ? name : (this.animations.idle ? 'idle' : Object.keys(this.animations)[0]);
    if (!next || next === this.animationName) return;
    restorePose(this.originalPose);
    this.animationName = next;
    this.animationTime = 0;
    this.basePose = null;
  }

  update(dt) {
    if (this.destination) {
      const delta = this.destination.clone().sub(this.holder.position);
      delta.y = 0;
      const distance = delta.length();
      if (distance <= 0.12) {
        this.holder.position.x = this.destination.x;
        this.holder.position.z = this.destination.z;
        this.destination = null;
        this.play('idle');
      } else {
        delta.normalize();
        const step = Math.min(distance, 3.6 * dt);
        this.holder.position.addScaledVector(delta, step);
        this.holder.rotation.y = Math.atan2(delta.x, delta.z);
        this.play('run');
      }
    } else if (this.autonomous) {
      this.roamTimer -= dt;
      if (this.roamTimer <= 0) {
        this.roamTimer = 3.5 + Math.random() * 4.5;
        if (Math.random() < 0.7) this.moveTo(randomGardenPoint());
        else this.play('idle');
      }
    }

    const plan = this.animations[this.animationName];
    if (!plan) return;
    const duration = Math.max(0.1, plan._duration || 2.5);
    this.animationTime = (this.animationTime + dt) % duration;
    this.basePose = applyAnimation(plan, duration, this.model, this.animationTime, this.basePose);
  }
}

function randomGardenPoint() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const point = new THREE.Vector3(-13 + Math.random() * 26, 0, -8 + Math.random() * 16);
    const pondDistance = Math.hypot(point.x - 10, point.z + 5.2);
    if (pondDistance > 5) return point;
  }
  return new THREE.Vector3(0, 0, 0);
}

async function loadFriend(profile) {
  let model;
  try {
    model = buildModelFromJson(await loadJson(profile.model));
  } catch (error) {
    console.warn(`[AgentlandFriends] ${profile.id} model fallback:`, error.message);
    model = createFallbackModel(profile);
  }
  const entries = await Promise.all(Object.entries(profile.animations).map(async ([name, path]) => {
    try {
      return [name, await loadJson(path)];
    } catch (error) {
      console.warn(`[AgentlandFriends] ${profile.id}/${name} animation skipped:`, error.message);
      return null;
    }
  }));
  return new FriendActor(profile, model, Object.fromEntries(entries.filter(Boolean)));
}

function setStoryStage({ phase, phaseIndex, phaseLabel, title, detail }) {
  storyPanelEl.dataset.phase = phase;
  storyPhaseEl.textContent = phaseLabel;
  storyProgressEl.textContent = `${phaseIndex}/4`;
  storyProgressValueEl.style.width = `${Math.max(0, Math.min(100, (phaseIndex / 4) * 100))}%`;
  storyTitleEl.textContent = title;
  storyDetailEl.textContent = detail;
  storyButton.disabled = phase !== 'idle';
  storyButton.textContent = phase === 'idle' ? '演一段庭院小故事' : '小故事正在发生';
}

function showLine({ speakerId, text, system }) {
  const actor = speakerId ? actorsById.get(speakerId) : null;
  if (actor) {
    let entry = speechEntries.get(speakerId);
    if (!entry) {
      const element = document.createElement('div');
      element.className = 'friend-speech';
      speechLayer.append(element);
      entry = { element, expiresAt: 0 };
      speechEntries.set(speakerId, entry);
    }
    entry.element.textContent = text;
    entry.element.hidden = false;
    entry.expiresAt = performance.now() + Math.max(3400, text.length * 135);
  }

  const item = document.createElement('li');
  item.textContent = system || !actor ? text : `${actor.profile.name}：${text}`;
  storyLogEl.prepend(item);
  while (storyLogEl.children.length > 4) storyLogEl.lastElementChild.remove();
}

function updateSpeech() {
  const now = performance.now();
  const worldPoint = new THREE.Vector3();
  for (const [id, entry] of speechEntries) {
    const actor = actorsById.get(id);
    if (!actor || now >= entry.expiresAt) {
      entry.element.hidden = true;
      continue;
    }
    worldPoint.copy(actor.holder.position).add(new THREE.Vector3(0, actor.profile.displayHeight + 1, 0));
    worldPoint.project(camera);
    const visible = worldPoint.z > -1 && worldPoint.z < 1;
    entry.element.hidden = !visible;
    if (!visible) continue;
    entry.element.style.left = `${(worldPoint.x * 0.5 + 0.5) * window.innerWidth}px`;
    entry.element.style.top = `${(-worldPoint.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
}

function renderRoster() {
  rosterEl.replaceChildren(...actors.map(actor => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'friend-chip';
    button.style.setProperty('--friend-accent', actor.profile.accent);
    button.setAttribute('aria-pressed', String(actor === selectedActor));
    button.innerHTML = `<strong>${actor.profile.name}</strong><small>${actor.profile.role}</small>`;
    button.addEventListener('click', () => selectActor(actor));
    return button;
  }));
}

function selectActor(actor) {
  selectedActor = actor;
  friendDetail.hidden = false;
  friendDetailRole.textContent = actor.profile.role;
  friendDetailName.textContent = actor.profile.name;
  friendDetailPersonality.textContent = actor.profile.personality;
  friendDetailReference.textContent = actor.profile.referenceStatus;
  renderRoster();
  controls.target.lerp(actor.holder.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 0.65);
}

function bindReferenceInput(inputId, listId) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    list.querySelector('.reference-empty')?.remove();
    for (const file of files) {
      const url = URL.createObjectURL(file);
      referenceUrls.add(url);
      const figure = document.createElement('figure');
      figure.className = 'reference-preview';
      const image = document.createElement('img');
      image.src = url;
      image.alt = file.name;
      const caption = document.createElement('figcaption');
      caption.textContent = file.name;
      figure.append(image, caption);
      list.append(figure);
    }
    input.value = '';
  });
}

function handleCanvasSelection(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(actors.map(actor => actor.model), true);
  const id = hits[0]?.object?.userData?.friendActorId;
  if (id) selectActor(actorsById.get(id));
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0, (now - previousTime) / 1000));
  previousTime = now;
  resize();
  director?.update(dt);
  for (const actor of actors) actor.update(dt);
  updateSpeech();
  controls.update();
  renderer.render(scene, camera);
}

async function init() {
  scene.add(new THREE.HemisphereLight(0xf7fbef, 0x617362, 2.5));
  const sun = new THREE.DirectionalLight(0xffefd0, 3.4);
  sun.position.set(-8, 15, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  scene.add(sun);
  createGarden();

  await initRuntime(THREE);
  const loaded = await Promise.all(AGENTLAND_FRIEND_PROFILES.map(loadFriend));
  for (const actor of loaded) {
    actors.push(actor);
    actorsById.set(actor.id, actor);
  }

  director = new FriendActivityDirector({
    actors,
    stories: AGENTLAND_FRIEND_STORIES,
    onStage: setStoryStage,
    onLine: showLine,
    onComplete: story => {
      showLine({ speakerId: null, text: `《${story.title}》已经记进今天的朋友日记。`, system: true });
    },
  });

  renderRoster();
  selectActor(actors[0]);
  bindReferenceInput('scene-reference-input', 'scene-reference-list');
  bindReferenceInput('friend-reference-input', 'friend-reference-list');
  referenceToggle.addEventListener('click', () => {
    const collapsed = referenceDesk.classList.toggle('is-collapsed');
    referenceToggle.textContent = collapsed ? '›' : '‹';
    referenceToggle.setAttribute('aria-expanded', String(!collapsed));
    referenceToggle.setAttribute('aria-label', collapsed ? '展开美术参考台' : '收起美术参考台');
  });
  storyButton.addEventListener('click', () => {
    storyLogEl.replaceChildren();
    director.start(AGENTLAND_FRIEND_STORIES[0].id);
  });
  canvas.addEventListener('pointerdown', event => {
    pointerStart = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', event => {
    if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) return;
    handleCanvasSelection(event);
  });
  window.addEventListener('beforeunload', () => {
    for (const url of referenceUrls) URL.revokeObjectURL(url);
  });
  pageLoading.hide();
  requestAnimationFrame(animate);
}

init().catch(error => {
  console.error('[AgentlandFriends] Failed to start:', error);
  pageLoading.fail({ title: '朋友庭院暂时没开门', detail: error.message });
});
