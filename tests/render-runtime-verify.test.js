import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pinnedRuntimeRevision,
  resolvePinnedRuntimeArchive,
} from '../scripts/verify-render-runtime-compat.mjs';

test('render compatibility resolves the repository-pinned runtime without a sibling checkout', () => {
  const archive = resolvePinnedRuntimeArchive({
    dependencies: {
      '@voxel-studio/render-runtime': 'file:vendor/voxel-studio-render-runtime-0.1.0-1805dfc.tgz',
    },
  }, '/workspace');

  assert.match(archive.replaceAll('\\', '/'), /\/workspace\/vendor\/voxel-studio-render-runtime-0\.1\.0-1805dfc\.tgz$/);
  assert.equal(pinnedRuntimeRevision(archive), '1805dfc');
});

test('render compatibility rejects an unpinned runtime dependency', () => {
  assert.throws(
    () => resolvePinnedRuntimeArchive({
      dependencies: { '@voxel-studio/render-runtime': '^0.1.0' },
    }),
    /pinned local tarball/,
  );
});
