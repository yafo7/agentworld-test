import { spawnSync } from 'node:child_process';

const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const checks = [
  ['secret scan', ['run', 'scan:secrets']],
  ['tests', ['test']],
  ['story baseline', ['run', 'test:story-baseline']],
  ['town activity audit', ['run', 'audit:town-activities']],
  ['render compatibility', ['run', 'test:render-compat']],
  ['production build', ['run', 'build']],
];

function githubCommandValue(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

function reportGitHubFailure(label, output) {
  if (!isGitHubActions) return;
  const cleanOutput = String(output || '').replace(/\u001b\[[0-9;]*m/g, '');
  const diagnostic = cleanOutput.slice(-6000) || `${label} exited without diagnostic output`;
  console.error(
    `::error title=${githubCommandValue(`verify: ${label} failed`)}::${githubCommandValue(diagnostic)}`,
  );
}

for (const [label, args] of checks) {
  console.log(`\n[verify] ${label}`);
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
  const result = spawnSync(npmCommand, commandArgs, {
    encoding: isGitHubActions ? 'utf8' : undefined,
    stdio: isGitHubActions ? 'pipe' : 'inherit',
    shell: process.platform === 'win32' && !npmExecPath,
  });
  if (isGitHubActions) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    reportGitHubFailure(label, `${result.stdout || ''}\n${result.stderr || ''}`);
    process.exit(result.status || 1);
  }
}

console.log('\n[verify] all checks passed');
