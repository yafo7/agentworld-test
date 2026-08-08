import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../src/demos/chii-island/index.html', import.meta.url), 'utf8');

test('minimap owns the upper-right corner and activity card uses the right middle', () => {
  assert.match(html, /#island-minimap-shell\s*\{[\s\S]*?top:\s*16px;\s*right:\s*16px;/);
  assert.match(html, /#runtime-activity\s*\{[\s\S]*?top:\s*50%;\s*right:\s*16px;/);
  assert.match(html, /#runtime-activity\s*\{[\s\S]*?transform:\s*translateY\(-50%\)/);
});

test('minimap is a circular canvas without the previous framed island card', () => {
  assert.match(html, /#island-minimap\s*\{[\s\S]*?border-radius:\s*50%/);
  assert.doesNotMatch(html, /class="island-minimap-title"/);
  assert.doesNotMatch(html, /class="island-minimap-north"/);
});

test('guidance UI exposes map, objective distance, and screen-edge marker surfaces', () => {
  assert.match(html, /id="island-minimap"/);
  assert.match(html, /id="runtime-activity-task-meta"/);
  assert.match(html, /id="objective-edge-marker"/);
});
