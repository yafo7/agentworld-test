import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  RenderPresentationPort,
  assertRenderPresentationPort,
} from '../src/ports/RenderPresentationPort.js';

test('render presentation port keeps frame rendering behind one boundary', () => {
  class ProbePort extends RenderPresentationPort {
    render() {}
    resize() {}
    registerModel() {}
    unregisterModel() {}
  }
  const port = new ProbePort();
  assert.equal(assertRenderPresentationPort(port), port);
});

test('ESC panel exposes render style quality and post processing controls', () => {
  const html = readFileSync(new URL('../src/demos/chii-island/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-render-style="current"/);
  assert.match(html, /data-render-style="cel"/);
  for (const quality of ['low', 'medium', 'high', 'ultra']) {
    assert.match(html, new RegExp(`data-render-quality="${quality}"`));
  }
  assert.match(html, /id="chk-post-processing"/);
});
