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
    const html = await response.text();
    if (response.ok && html.includes('id="game-wrap"')) return;
  } catch {}
  throw new Error(`Chii Island is not available at ${url}. Run $chii-dev first or set CHII_VERIFY_URL.`);
}

function observePage(page) {
  const errors = [];
  const assetWarnings = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning' && message.text().includes('[Assets]')) assetWarnings.push(message.text());
  });
  return { errors, assetWarnings };
}

async function waitForRuntime(page) {
  await page.waitForFunction(
    () => window.__renderer && window.__player && window.__petManager?.pets?.every(pet => pet._modelGroup),
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(1000);
}

async function readRenderState(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const renderer = window.__renderer;
    window.__chiiRenderPresentation?.render(0);
    const canvas = renderer.domElement;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const stride = Math.max(4, Math.floor(pixels.length / (4 * 8192)) * 4);
    let pixelEnergy = 0;
    let pixelSamples = 0;
    for (let index = 0; index < pixels.length; index += stride) {
      pixelEnergy += pixels[index] + pixels[index + 1] + pixels[index + 2];
      pixelSamples += 1;
    }
    let playerMeshes = 0;
    window.__player.mesh.traverse(object => { if (object.isMesh) playerMeshes++; });
    const rect = canvas.getBoundingClientRect();
    return {
      fatal: document.body.innerText.includes('Failed to start:'),
      contextLost: gl.isContextLost(),
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      playerMeshes,
      petModels: window.__petManager.pets.map(pet => ({ name: pet._petName, loaded: !!pet._modelGroup })),
      pixelEnergy,
      pixelSamples,
      canvasFits: rect.left >= -1 && rect.top >= -1
        && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1
        && rect.width >= window.innerWidth - 2 && rect.height >= window.innerHeight - 2,
      documentFits: document.documentElement.scrollWidth <= window.innerWidth
        && document.documentElement.scrollHeight <= window.innerHeight,
    };
  });
}

run(['test']);
run(['run', 'build']);

if (full) {
  const url = process.env.CHII_VERIFY_URL
    || 'http://127.0.0.1:5173/src/demos/chii-island/?church-town';
  await requireServer(url);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const desktopMessages = observePage(page);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForRuntime(page);
    const render = await readRenderState(page);

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
    await page.close();

    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const mobileMessages = observePage(mobilePage);
    await mobilePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForRuntime(mobilePage);
    const mobileRender = await readRenderState(mobilePage);
    const mobileBefore = await mobilePage.evaluate(() => window.__player.mesh.position.toArray());
    await mobilePage.keyboard.down('KeyW');
    await mobilePage.waitForTimeout(600);
    await mobilePage.keyboard.up('KeyW');
    await mobilePage.waitForTimeout(150);
    const mobileAfter = await mobilePage.evaluate(() => window.__player.mesh.position.toArray());
    const mobileMoved = Math.hypot(
      mobileAfter[0] - mobileBefore[0],
      mobileAfter[2] - mobileBefore[2],
    );
    await mobilePage.keyboard.press('Escape');
    await mobilePage.waitForTimeout(400);
    const mobilePanel = await mobilePage.locator('#mgmt-panel').evaluate(element => {
      const card = element.querySelector('.mgmt-card');
      const rect = card?.getBoundingClientRect();
      return {
        opened: element.classList.contains('visible'),
        fits: Boolean(rect)
          && rect.left >= 0 && rect.top >= 0
          && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
      };
    });
    const mobileScreenshot = path.join(runtimeDir, 'chii-verify-mobile.png');
    await mobilePage.screenshot({ path: mobileScreenshot, fullPage: true });
    await mobilePage.close();

    const desktopPassed = !render.fatal
      && !render.contextLost
      && render.triangles > 1000
      && render.playerMeshes > 0
      && render.petModels.every(pet => pet.loaded)
      && render.pixelEnergy > render.pixelSamples * 10
      && render.canvasFits
      && render.documentFits
      && panelOpened
      && moved > 0.1
      && dialogueOpened
      && desktopMessages.errors.length === 0
      && desktopMessages.assetWarnings.length === 0;
    const mobilePassed = !mobileRender.fatal
      && !mobileRender.contextLost
      && mobileRender.triangles > 1000
      && mobileRender.playerMeshes > 0
      && mobileRender.petModels.every(pet => pet.loaded)
      && mobileRender.pixelEnergy > mobileRender.pixelSamples * 10
      && mobileRender.canvasFits
      && mobileRender.documentFits
      && mobileMoved > 0.1
      && mobilePanel.opened
      && mobilePanel.fits
      && mobileMessages.errors.length === 0
      && mobileMessages.assetWarnings.length === 0;
    const passed = desktopPassed && mobilePassed;
    console.log(JSON.stringify({
      passed,
      desktop: {
        passed: desktopPassed,
        render,
        interactionPet,
        panelOpened,
        moved,
        dialogueOpened,
        ...desktopMessages,
        screenshot,
      },
      mobile: {
        passed: mobilePassed,
        render: mobileRender,
        panel: mobilePanel,
        moved: mobileMoved,
        ...mobileMessages,
        screenshot: mobileScreenshot,
      },
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
