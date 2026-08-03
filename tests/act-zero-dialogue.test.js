import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/demos/chii-island/presentation/ActZeroCrashDirector.js', import.meta.url),
  'utf8',
);

test('Act Zero fall and impact lines match the authored script', () => {
  assert.match(source, /快点！再快点啊！监管要来了！/);
  assert.match(source, /饿啊！！！！/);
  assert.match(source, /progress >= 0\.56/);
});
