import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

async function countTests(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await countTests(target);
    else if (entry.name.endsWith('.test.js')) count++;
  }
  return count;
}

export async function collectStatus() {
  const dirtyLines = git(['status', '--short']).split(/\r?\n/).filter(Boolean);
  const generatedChanges = dirtyLines.filter(line => line.includes('public/generated/')).length;
  const manifestPath = path.join(repoRoot, 'public/generated/chii-runtime-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'));
  return {
    branch: git(['branch', '--show-current']) || '(detached)',
    commit: git(['log', '-1', '--format=%h %s']) || 'unknown',
    dirtyChanges: dirtyLines.length,
    generatedChanges,
    codeChanges: dirtyLines.length - generatedChanges,
    services: {
      game5173: await portOpen(5173),
      studio8000: await portOpen(8000),
    },
    assets: {
      syncedAt: manifest.syncedAt || null,
      source: manifest.source || null,
      count: Array.isArray(manifest.assets) ? manifest.assets.length : 0,
    },
    testFiles: await countTests(path.join(repoRoot, 'tests')),
    architecture: 'P0-P6 complete; engine isolated; current Chii must not import legacy',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const status = await collectStatus();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log([
      'Chii Island Status',
      `branch: ${status.branch}`,
      `commit: ${status.commit}`,
      `worktree: ${status.dirtyChanges} changes (${status.codeChanges} code, ${status.generatedChanges} generated)`,
      `services: game=${status.services.game5173 ? 'up' : 'down'} studio=${status.services.studio8000 ? 'up' : 'down'}`,
      `assets: ${status.assets.count} synced, source=${status.assets.source || 'unknown'}, at=${status.assets.syncedAt || 'unknown'}`,
      `tests: ${status.testFiles} files`,
      `architecture: ${status.architecture}`,
    ].join('\n'));
  }
}
