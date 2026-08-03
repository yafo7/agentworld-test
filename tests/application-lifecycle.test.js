import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ApplicationDisposedError,
  ApplicationLifecycle,
} from '../src/engine/runtime/ApplicationLifecycle.js';

test('application lifecycle disposes resources once in reverse assembly order', () => {
  const calls = [];
  const lifecycle = new ApplicationLifecycle();
  lifecycle.add(() => calls.push('first'));
  lifecycle.add({ dispose() { calls.push('second'); } });
  lifecycle.add('third', resource => calls.push(resource));

  assert.deepEqual(lifecycle.dispose(), []);
  assert.deepEqual(calls, ['third', 'second', 'first']);
  assert.deepEqual(lifecycle.dispose(), []);
  assert.deepEqual(calls, ['third', 'second', 'first']);
});

test('application lifecycle removes listeners and reports disposal errors without aborting cleanup', () => {
  const lifecycle = new ApplicationLifecycle();
  const target = new EventTarget();
  let calls = 0;
  lifecycle.listen(target, 'change', () => { calls += 1; });
  lifecycle.add(() => { throw new Error('dispose failed'); });

  target.dispatchEvent(new Event('change'));
  const errors = lifecycle.dispose();
  target.dispatchEvent(new Event('change'));

  assert.equal(calls, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /dispose failed/);
});

test('resources added after disposal are released immediately', () => {
  const lifecycle = new ApplicationLifecycle();
  lifecycle.dispose();
  let disposed = false;
  lifecycle.add({ dispose() { disposed = true; } });
  assert.equal(disposed, true);
});

test('application lifecycle aborts pending work and rejects stale bootstrap checkpoints', () => {
  const lifecycle = new ApplicationLifecycle();
  let aborts = 0;
  lifecycle.signal.addEventListener('abort', () => { aborts += 1; });

  assert.equal(lifecycle.isActive(), true);
  lifecycle.assertActive();
  lifecycle.dispose();

  assert.equal(lifecycle.isActive(), false);
  assert.equal(lifecycle.signal.aborted, true);
  assert.equal(aborts, 1);
  assert.throws(() => lifecycle.assertActive(), ApplicationDisposedError);
});

test('Chii bootstrap owns the animation frame and assembled resource lifecycle', () => {
  const source = readFileSync(
    new URL('../src/demos/chii-island/main.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /new ApplicationLifecycle\(\)/);
  assert.match(source, /applicationLifecycle\.add\(regionGameplay\)/);
  assert.match(source, /applicationLifecycle\.add\(worldClimate\)/);
  assert.match(source, /cancelAnimationFrame\(animationFrameId\)/);
  assert.match(source, /window\.addEventListener\('pagehide', handlePageHide/);
  assert.match(source, /applicationLifecycle\.assertActive\(\)/);
});
