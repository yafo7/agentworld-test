import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const service = process.argv[2];
const root = resolve(import.meta.dirname, '..');
const definitions = {
  studio: {
    cwd: resolve(process.env.CHII_STUDIO_DIR || resolve(root, '../3d-generate')),
    command: process.env.CHII_PYTHON || 'python',
    args: ['server.py'],
  },
  voxel: {
    cwd: resolve(process.env.CHII_VOXEL_DIR || resolve(root, '../voxel-game')),
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['exec', '--', 'vite', '--port', '5174', '--host', '127.0.0.1'],
  },
};

const definition = definitions[service];
if (!definition) {
  console.error('Usage: node scripts/start-sibling-service.mjs <studio|voxel>');
  process.exit(2);
}

const child = spawn(definition.command, definition.args, {
  cwd: definition.cwd,
  stdio: 'inherit',
  windowsHide: true,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', error => {
  console.error(`[${service}] ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', code => process.exit(code ?? 1));
