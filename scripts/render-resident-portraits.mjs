// Run with Chii's Vite server running: node scripts/render-resident-portraits.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { RESIDENT_VOXEL_IDS } from '../src/demos/chii-island/data/assetCatalog.js';
import { getChiiCharacterVariants } from '../src/demos/chii-island/data/characterVariants.js';

const root = new URL('../public/ui/resident-portraits/', import.meta.url);
const variants = RESIDENT_VOXEL_IDS.flatMap(getChiiCharacterVariants);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Use the game's model builder and bundled geometry runtime without starting a game session.
  await page.route('**/__portrait_studio', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Portrait studio</title>' }));
  await page.route('**/api/voxel/api/templates/module.js', route => route.abort());
  await page.goto(`${process.env.CHII_VERIFY_ORIGIN || 'http://127.0.0.1:5173'}/__portrait_studio`);
  const images = await page.evaluate(async variants => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { buildModelFromJson } = await import('/src/engine/model/builder.js');
    const { initRuntime } = await import('/src/engine/runtime/runtimeProvider.js');
    await initRuntime(T);
    const renderer = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(256, 256, false);
    renderer.setClearColor(0, 0);
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xfffcf5, 0xc3cdd2, 1.8));
    const key = new T.DirectionalLight(0xfff4df, 2.2);
    key.position.set(-3, 6, 5); scene.add(key);
    const out = [];
    for (const { id, assetId, model: path } of variants) {
      const response = await fetch('/' + path);
      if (!response.ok) throw Error(`Missing ${path}`);
      const model = buildModelFromJson(await response.json());
      scene.add(model); model.updateMatrixWorld(true);
      const head = model.getObjectByName('head');
      const box = new T.Box3().setFromObject(head || model, true);
      const center = box.getCenter(new T.Vector3()), dims = box.getSize(new T.Vector3());
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
      const direction = new T.Vector3(assetId === 'mako' ? 0.54 : 0.36, assetId === 'crab' ? 0.27 : 0.18, 1).normalize();
      camera.position.copy(center).addScaledVector(direction, Math.max(dims.length() * 3, 12));
      camera.lookAt(center); camera.updateMatrixWorld();
      const projected = new T.Box2();
      (head || model).traverse(mesh => {
        const vertices = mesh.geometry?.getAttribute('position');
        if (!vertices) return;
        const p = new T.Vector3();
        for (let i = 0; i < vertices.count; ++i) {
          p.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
          projected.expandByPoint(new T.Vector2(p.x, p.y));
        }
      });
      const span = projected.getSize(new T.Vector2()), focus = projected.getCenter(new T.Vector2());
      const half = Math.max(span.x, span.y) * (head ? 0.64 : 0.34);
      if (!Number.isFinite(half) || half <= 0) throw Error(`No geometry for ${path}`);
      const cy = focus.y - half * (head ? 0.12 : 0);
      camera.left = focus.x - half; camera.right = focus.x + half;
      camera.top = cy + half; camera.bottom = cy - half; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      out.push({ id, assetId, png: renderer.domElement.toDataURL().split(',')[1] });
      scene.remove(model); model.traverse(o => o.geometry?.dispose());
    }
    renderer.dispose();
    return out;
  }, variants);
  for (const { id, assetId, png } of images) {
    const dir = new URL(`${id}/`, root);
    await mkdir(dir, { recursive: true });
    await writeFile(fileURLToPath(new URL(`${assetId}.png`, dir)), Buffer.from(png, 'base64'));
  }
  console.log(`Rendered ${images.length} model portraits.`);
} finally { await browser.close(); }
