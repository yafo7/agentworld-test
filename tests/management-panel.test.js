import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(
  new URL('../src/demos/chii-island/index.html', import.meta.url),
  'utf8',
);
const main = fs.readFileSync(
  new URL('../src/demos/chii-island/main.js', import.meta.url),
  'utf8',
);
const panel = fs.readFileSync(
  new URL('../src/demos/chii-island/presentation/SceneManagementPanel.js', import.meta.url),
  'utf8',
);

test('ESC management panel exposes an accessible close button using the shared close state', () => {
  assert.match(html, /id="btn-close-mgmt"/);
  assert.match(html, /aria-label="关闭管理面板"/);
  assert.match(main, /new SceneManagementPanel\(/);
  assert.match(panel, /this\._listen\(elements\.closeButton, 'click', \(\) => this\.setOpen\(false\)\)/);
});

test('ESC management panel can replay the completed Act Zero prologue', () => {
  assert.match(html, /id="btn-replay-act-zero"/);
  assert.match(html, /重播第0幕：落难/);
  assert.match(main, /actZeroDirector\.replay\(\)/);
});

test('ESC management panel opens the character showcase through the shared page transition', () => {
  const showcaseLink = html.match(/<a\b[^>]*\bid="btn-open-character-showcase"[^>]*>/)?.[0];
  assert.ok(showcaseLink);
  assert.match(showcaseLink, /href="\.\/player-candidates\.html"/);
  assert.match(showcaseLink, /data-chii-navigation/);
  assert.doesNotMatch(showcaseLink, /target="_blank"/);
  assert.match(main, /createChiiPageLoadingScreen/);
});

test('ESC management panel sits above runtime HUD overlays', () => {
  const styles = fs.readFileSync(new URL('../src/demos/chii-island/presentation/island-shell.css', import.meta.url), 'utf8');
  assert.match(styles, /#mgmt-panel\s*\{[\s\S]*?z-index:\s*300/);
});

test('ESC scene switcher presents Original first', () => {
  const original = html.indexOf('data-scene-style="original">Original');
  const pro = html.indexOf('data-scene-style="pro">Pro 场景');
  const forge = html.indexOf('data-scene-style="forge">Forge 场景');
  assert.ok(original >= 0 && original < pro && pro < forge);
  assert.doesNotMatch(html, /data-scene-style="voxel"/);
  assert.doesNotMatch(html, /初版场景/);
});
