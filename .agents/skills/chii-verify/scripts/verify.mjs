import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const full = process.argv.includes('--full');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args) {
  const command = process.platform === 'win32' ? process.env.ComSpec : npm;
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', npm, ...args]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`[chii-verify] Unable to run npm ${args.join(' ')}: ${result.error.message}`);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

async function requireServer(url) {
  try {
    const response = await fetch(url);
    if (response.ok) return;
  } catch {}
  throw new Error('Chii Island is not running on 5173. Run $chii-dev first.');
}

run(['test']);
run(['run', 'build']);

if (full) {
  const url = 'http://127.0.0.1:5173/src/demos/chii-island/?church-town';
  await requireServer(url);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const assetWarnings = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning' && message.text().includes('[Assets]')) assetWarnings.push(message.text());
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => window.__renderer && window.__player && window.__petManager?.pets?.every(pet => pet._modelGroup),
      null,
      { timeout: 30000 },
    );
    await page.waitForTimeout(1000);

    const render = await page.evaluate(() => {
      const renderer = window.__renderer;
      const canvas = renderer.domElement;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      let playerMeshes = 0;
      window.__player.mesh.traverse(object => { if (object.isMesh) playerMeshes++; });
      return {
        fatal: document.body.innerText.includes('Failed to start:'),
        contextLost: gl.isContextLost(),
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        playerMeshes,
        petModels: window.__petManager.pets.map(pet => ({ name: pet._petName, loaded: !!pet._modelGroup })),
      };
    });

    const interactionPet = await page.evaluate(() => {
      const pet = window.__townSocialSystem?.organizer || window.__petManager.pets[0];
      if (!pet?.mesh) return null;
      pet.stopWalking?.();
      window.__player.teleport({
        x: pet.mesh.position.x + 2,
        y: 0,
        z: pet.mesh.position.z,
      });
      return pet._petName || null;
    });
    await page.waitForFunction(
      () => document.querySelector('#interact-prompt')?.classList.contains('visible'),
      null,
      { timeout: 5000 },
    );
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(400);
    const dialogueOpened = await page.locator('#dialogue-root').evaluate(element => element.classList.contains('active'));

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    let panelOpened = await page.locator('#mgmt-panel').evaluate(element => element.classList.contains('visible'));
    if (!panelOpened) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      panelOpened = await page.locator('#mgmt-panel').evaluate(element => element.classList.contains('visible'));
    }
    if (panelOpened) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    const before = await page.evaluate(() => window.__player.mesh.position.toArray());
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => window.__player.mesh.position.toArray());
    const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);

    const runtimeDir = path.join(repoRoot, '.agents/runtime');
    await mkdir(runtimeDir, { recursive: true });
    const screenshot = path.join(runtimeDir, 'chii-verify.png');
    await page.screenshot({ path: screenshot, fullPage: true });

    const passed = !render.fatal
      && !render.contextLost
      && render.triangles > 1000
      && render.playerMeshes > 0
      && render.petModels.every(pet => pet.loaded)
      && panelOpened
      && moved > 0.1
      && dialogueOpened
      && errors.length === 0
      && assetWarnings.length === 0;
    console.log(JSON.stringify({ passed, render, interactionPet, panelOpened, moved, dialogueOpened, errors, assetWarnings, screenshot }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
