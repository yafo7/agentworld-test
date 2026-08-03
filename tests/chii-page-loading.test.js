import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

const islandHtml = read('src/demos/chii-island/index.html');
const islandMain = read('src/demos/chii-island/main.js');
const showcaseHtml = read('src/demos/chii-island/player-candidates.html');
const showcaseScript = read('src/demos/chii-island/player-candidates.js');
const friendsHtml = read('src/demos/agentland-friends/index.html');
const friendsMain = read('src/demos/agentland-friends/main.js');
const ghostHtml = read('src/demos/ghost-home/index.html');

test('demos share the engine loading screen without importing each other', () => {
  for (const html of [islandHtml, showcaseHtml]) {
    assert.match(html, /id="chii-page-loader"/);
    assert.match(html, /engine\/ui\/page-loading\.css/);
    assert.match(html, /data-chii-navigation/);
  }
  assert.match(islandMain, /createChiiPageLoadingScreen/);
  assert.match(islandMain, /pageLoading\.reload\(CHII_LOADING_PRESETS\.sceneStyle\)/);
  assert.match(showcaseScript, /createChiiPageLoadingScreen/);
  assert.match(showcaseScript, /pageLoading\.show/);
  assert.match(friendsHtml, /engine\/ui\/page-loading\.css/);
  assert.match(friendsHtml, /data-chii-navigation/);
  assert.match(friendsMain, /createPageLoadingScreen/);
  assert.doesNotMatch(friendsMain, /demos\/chii-island|\.\.\/chii-island/);
  assert.match(friendsMain, /pageLoading\.show/);
  assert.doesNotMatch(showcaseHtml, /showcase-loading/);
  assert.doesNotMatch(showcaseScript, /showcase-loading|loading\.hidden/);
});

test('the retired right-side Studio editor is no longer mounted or shipped', () => {
  for (const html of [islandHtml, ghostHtml]) {
    assert.doesNotMatch(html, /id="editor-wrap"|id="resizer"/);
  }
  for (const script of [islandMain, friendsMain]) {
    assert.doesNotMatch(script, /createGenerateSystem|generateSystem|editor-wrap|resizer/);
  }
  assert.match(ghostHtml, /agentland-friends/);
  assert.doesNotMatch(ghostHtml, /main\.js/);
  assert.equal(
    existsSync(new URL('src/demos/chii-island/systems/generateSystem.js', root)),
    false,
  );
  assert.equal(
    existsSync(new URL('src/demos/chii-island/data/studioLibrary.js', root)),
    false,
  );
});
