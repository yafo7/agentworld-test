import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dialogue hidden controls cannot be reopened by mode-specific flex styles', async () => {
  const source = await readFile(
    new URL('../src/demos/chii-island/systems/DialogueSystem.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /#dialogue-root \[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test('dialogue choices never expose a horizontal scrollbar', async () => {
  const source = await readFile(
    new URL('../src/demos/chii-island/systems/DialogueSystem.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /\.dialogue-choices\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s);
  assert.match(source, /\.dialogue-box\s*\{[^}]*box-sizing:\s*border-box;[^}]*max-width:\s*calc\(100vw - 24px\);/s);
});
