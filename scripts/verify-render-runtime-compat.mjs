import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLED_RUNTIME_PACKAGE = join(
  ROOT,
  'node_modules',
  '@voxel-studio',
  'render-runtime',
);

export function resolvePinnedRuntimeArchive(packageJson, root = ROOT) {
  const specifier = packageJson.dependencies?.['@voxel-studio/render-runtime'];
  if (!specifier?.startsWith('file:') || !specifier.endsWith('.tgz')) {
    throw new Error('render runtime dependency must reference a pinned local tarball');
  }
  return resolve(root, specifier.slice('file:'.length));
}

export function pinnedRuntimeRevision(archivePath) {
  return basename(archivePath).match(/-([0-9a-f]+)\.tgz$/i)?.[1] || 'vendored';
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...(options.env || {}) },
      shell: options.shell === true,
      stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`));
    });
  });
}

function runNpm(args, cwd) {
  if (process.platform !== 'win32') return run('npm', args, { cwd });
  const command = `npm ${args.join(' ')}`;
  return run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { cwd });
}

async function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolvePromise(port));
    });
  });
}

function browserFixture() {
  return `
import * as THREE from 'three';
import {
  EffectSlotManager,
  MaterialTagRuntime,
  RenderPipeline,
  RenderStyleManager,
  RuntimeIndex,
  createEffectRuntime,
} from '@voxel-studio/render-runtime';
import { validateVfxVocabulary } from '@voxel-studio/render-runtime/effects/VfxTagCatalog.js';

const result = {
  ok: false,
  threeRevision: THREE.REVISION,
  webgl: null,
  apply: null,
  style: null,
  materials: {},
  vfx: null,
  programs: [],
  pixelEnergy: 0,
  errors: [],
};
window.__compatResult = result;

try {
  const vocabulary = await fetch('/material-tags-v1.json').then(response => {
    if (!response.ok) throw new Error('material vocabulary HTTP ' + response.status);
    return response.json();
  });
  const vfxVocabulary = await fetch('/vfx-tags-v1.json').then(response => {
    if (!response.ok) throw new Error('vfx vocabulary HTTP ' + response.status);
    return response.json();
  });
  result.vfx = validateVfxVocabulary(vfxVocabulary);
  const canvas = document.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(480, 320, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  result.webgl = renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl1';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18202b);
  const camera = new THREE.PerspectiveCamera(42, 480 / 320, 0.1, 100);
  camera.position.set(0, 2.8, 9);
  camera.lookAt(0, 0.3, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x263238, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(4, 7, 5);
  scene.add(sun);

  const modelRoot = new THREE.Group();
  modelRoot.name = 'ModelsRoot';
  modelRoot.userData.isModelRoot = true;
  scene.add(modelRoot);

  const specs = [
    ['wood', -3.6, [{ tag: 'base', value: 'wood' }]],
    ['stone', -2.4, [{ tag: 'base', value: 'stone', variant: 'cobblestone' }]],
    ['fur', -1.2, [{ tag: 'base', value: 'fur', variant: 'pink' }]],
    ['foliage', 0, [{ tag: 'foliage', value: 'leaf' }]],
    ['glass', 1.2, [{ tag: 'base', value: 'glass' }]],
    ['emissive', 2.4, [{ tag: 'emissive', value: 0.75 }]],
    ['fire', 3.6, [{ tag: 'fire', value: 0.75, variant: 'blue' }]],
  ];
  const parts = [];
  const meshes = new Map();
  for (const [id, x, tags] of specs) {
    const material = new THREE.MeshStandardMaterial({
      color: id === 'emissive' ? 0x66d9ff : id === 'fire' ? 0x4678ff : 0xb58b62,
      roughness: 0.8,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 1.05), material);
    mesh.name = id;
    mesh.position.set(x, 0.25, 0);
    modelRoot.add(mesh);
    meshes.set(id, mesh);
    parts.push({ id, parent: null, isGroup: false, mesh: { type: 'box' }, tags });
  }
  const model = { name: 'compat-model', style: 'voxel', parts };

  const runtimeIndex = new RuntimeIndex();
  runtimeIndex.registerHierarchy('compat-model', model);
  for (const part of parts) {
    runtimeIndex.registerMesh('compat-model:' + part.id, meshes.get(part.id), {
      modelId: 'compat-model', rawPartId: part.id, source: 'chii-p0-compat', mode: 'mesh',
    });
  }
  const effectRuntime = createEffectRuntime().runtime;
  const effectSlotManager = new EffectSlotManager({
    runtimeIndex,
    scene,
    effectBatchCoordinator: null,
    envMapProvider: { getCurrentEnvMap: () => scene.environment },
  });
  const companions = [];
  const tagRuntime = new MaterialTagRuntime({
    vocabulary,
    runtimeIndex,
    effectSlotManager,
    effectRuntime,
    applyMatcap: () => false,
    createCompanion: (type) => { companions.push(type); return false; },
  });
  result.apply = await tagRuntime.applyModel('compat-model', model);
  result.apply.companionRequests = companions;

  const styleMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xf0d48a, roughness: 0.55 }),
  );
  styleMesh.name = 'style-probe';
  styleMesh.position.set(0, 1.7, 0);
  modelRoot.add(styleMesh);
  const meshRegistry = new Map([['style-probe', styleMesh]]);
  const renderPresets = {
    mode: 'pbr',
    applyPBR() {}, applyInk() {}, applyCel() {}, setCelOutlineStyle() {},
    getLightDirection: () => new THREE.Vector3(0.4, 1, 0.5).normalize(),
  };
  const styleManager = new RenderStyleManager({
    THREE, renderer, scene, meshRegistry, renderPresets,
  });
  styleManager.applyStyle({ renderMode: 'cel', cartoon: { bands: 3, rampStrength: 0.8 } });
  result.style = {
    mode: styleManager.mode,
    ramp: Boolean(styleManager.rampTexture),
    patchKeys: styleMesh.material.userData?.shaderPatchChain?.map(entry => entry.key) || [],
  };

  const pipeline = new RenderPipeline({ renderer, scene, camera, composer: null });
  effectRuntime.updateRuntimeUniforms(modelRoot, { uTime: 0.5 });
  pipeline.renderFrame(1 / 60, 0.5, {});
  renderer.compile(scene, camera);
  pipeline.renderFrame(1 / 60, 0.75, {});

  const gl = renderer.getContext();
  const pixels = new Uint8Array(480 * 320 * 4);
  gl.readPixels(0, 0, 480, 320, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let energy = 0;
  for (let i = 0; i < pixels.length; i += 16) energy += pixels[i] + pixels[i + 1] + pixels[i + 2];
  result.pixelEnergy = energy;

  for (const [id, mesh] of meshes) {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    result.materials[id] = {
      type: material.type,
      effectType: material.userData?.effectMaterialType || null,
      layers: material.userData?.effectLayers?.map(layer => layer.type || layer.id) || [],
      patchKeys: material.userData?.shaderPatchChain?.map(entry => entry.key) || [],
    };
  }
  result.programs = (renderer.info.programs || []).map(program => ({
    runnable: program.diagnostics?.runnable !== false,
    log: program.diagnostics?.programLog || '',
  }));
  const failedPrograms = result.programs.filter(program => !program.runnable || program.log);
  if (result.threeRevision !== '160') throw new Error('expected Three r160, got r' + result.threeRevision);
  if (result.apply.appliedParts < 6) throw new Error('material runtime applied too few parts');
  if (!result.vfx.valid || result.vfx.presetCount < 8) throw new Error('vfx vocabulary contract failed');
  if (result.style.mode !== 'cel' || !result.style.ramp || !result.style.patchKeys.includes('renderStyle:cel')) {
    throw new Error('cel style did not initialize');
  }
  if (result.pixelEnergy <= 0) throw new Error('WebGL output is blank');
  if (failedPrograms.length) throw new Error('shader diagnostics reported a failed program');
  result.ok = true;
} catch (error) {
  result.errors.push(error?.stack || error?.message || String(error));
}
document.body.dataset.done = 'true';
document.querySelector('pre').textContent = JSON.stringify(result, null, 2);
`;
}

async function main() {
  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const tempRoot = await mkdtemp(join(tmpdir(), 'chii-render-compat-'));
  let viteServer = null;
  let browser = null;

  try {
    const upstreamRoot = process.env.CHII_RENDER_RUNTIME_ROOT
      ? resolve(process.env.CHII_RENDER_RUNTIME_ROOT)
      : null;
    const runtimePackage = upstreamRoot
      ? join(upstreamRoot, 'packages', 'voxel-render-runtime')
      : INSTALLED_RUNTIME_PACKAGE;
    const runtimePackageJson = JSON.parse(await readFile(join(runtimePackage, 'package.json'), 'utf8'));
    const vocabularyPath = join(runtimePackage, 'model', 'material-tags-v1.json');
    const vfxVocabularyPath = join(runtimePackage, 'model', 'vfx-tags-v1.json');
    let upstreamCommit;
    if (upstreamRoot) {
      await runNpm(['pack', runtimePackage, '--pack-destination', tempRoot], ROOT);
      upstreamCommit = (await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: upstreamRoot })).stdout;
    } else {
      const pinnedArchive = resolvePinnedRuntimeArchive(packageJson);
      await copyFile(pinnedArchive, join(tempRoot, basename(pinnedArchive)));
      upstreamCommit = pinnedRuntimeRevision(pinnedArchive);
    }
    const archive = (await readdir(tempRoot)).find(name => name.endsWith('.tgz'));
    if (!archive) throw new Error('npm pack did not produce a runtime archive');

    const tempPackage = {
      private: true,
      type: 'module',
      dependencies: {
        three: packageJson.dependencies.three,
        '@voxel-studio/render-runtime': `file:./${archive}`,
      },
    };
    await writeFile(join(tempRoot, 'package.json'), JSON.stringify(tempPackage, null, 2));
    await writeFile(join(tempRoot, 'material-tags-v1.json'), await readFile(vocabularyPath));
    await writeFile(join(tempRoot, 'vfx-tags-v1.json'), await readFile(vfxVocabularyPath));
    await writeFile(join(tempRoot, 'index.html'), '<canvas width="480" height="320"></canvas><pre></pre><script type="module" src="/compat-browser.mjs"></script>');
    await writeFile(join(tempRoot, 'compat-browser.mjs'), browserFixture());
    await runNpm(
      ['install', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'],
      tempRoot,
    );

    const port = await freePort();
    viteServer = await createViteServer({
      root: tempRoot,
      logLevel: 'silent',
      server: {
        host: '127.0.0.1',
        port,
        strictPort: true,
        // GitHub Windows runners may address the temp root through its RUNNER~1
        // short-path alias, which Vite's string-based allow list treats as external.
        fs: { strict: false },
      },
    });
    await viteServer.listen();
    const url = `http://127.0.0.1:${port}/`;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 520, height: 380 } });
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    try {
      await page.waitForFunction(
        () => document.body.dataset.done === 'true',
        null,
        { timeout: 60_000 },
      );
    } catch (error) {
      const pageState = await page.locator('body').innerText().catch(() => 'unavailable');
      throw new Error([
        error.message,
        `browser errors: ${JSON.stringify(browserErrors)}`,
        `page state: ${pageState.slice(0, 2000)}`,
      ].join('\n'));
    }
    const result = await page.evaluate(() => window.__compatResult);
    result.browserErrors = browserErrors;
    result.contract = {
      upstreamCommit,
      runtimeVersion: runtimePackageJson.version,
      runtimeThreePeer: runtimePackageJson.peerDependencies?.three || null,
      chiiThree: packageJson.dependencies.three,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok || browserErrors.length) {
      throw new Error(`render runtime compatibility failed\n${JSON.stringify(result, null, 2)}`);
    }
  } finally {
    await browser?.close().catch(() => {});
    await viteServer?.close().catch(() => {});
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
