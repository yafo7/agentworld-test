import { spawnSync } from 'node:child_process';

const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const checks = [
  ['secret scan', ['run', 'scan:secrets']],
  ['tests', ['test']],
  ['story baseline', ['run', 'test:story-baseline']],
  ['town activity audit', ['run', 'audit:town-activities']],
  ['render compatibility', ['run', 'test:render-compat']],
  ['production build', ['run', 'build']],
];

for (const [label, args] of checks) {
  console.log(`\n[verify] ${label}`);
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
  const result = spawnSync(npmCommand, commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32' && !npmExecPath,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('\n[verify] all checks passed');
