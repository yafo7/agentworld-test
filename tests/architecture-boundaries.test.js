import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('engine has no backend or demo imports', async () => {
  let stdout = '';
  try {
    ({ stdout } = await execFileAsync('rg', ['-l', 'backend/|demos/', 'src/engine']));
  } catch (error) {
    if (error.code !== 1) throw error;
    stdout = error.stdout || '';
  }
  const actual = stdout.trim().split(/\r?\n/).filter(Boolean).map((path) => path.replaceAll('\\', '/')).sort();
  assert.deepEqual(actual, []);
});

test('browser backend client contains no embedded sk-style credential', async () => {
  const source = await readFile(new URL('../src/backend/chatApi.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /sk-[a-zA-Z0-9]{16,}/);
});
