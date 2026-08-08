import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8');

test('verify workflow installs Playwright Chromium on both CI platforms', () => {
  assert.match(workflow, /if: runner\.os == 'Linux'[\s\S]*?playwright install --with-deps chromium/);
  assert.match(workflow, /if: runner\.os == 'Windows'[\s\S]*?playwright install chromium/);
  assert.match(workflow, /fail-fast:\s*false/);
});
