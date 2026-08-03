import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const patterns = Object.freeze([
  ['OpenAI-style key', new RegExp(String.raw`\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b`, 'g')],
  ['GitHub token', new RegExp(String.raw`\bgh[pousr]_[A-Za-z0-9]{30,}\b`, 'g')],
  ['Google API key', new RegExp(String.raw`\bAIza[A-Za-z0-9_-]{30,}\b`, 'g')],
  ['AWS access key', new RegExp(String.raw`\bAKIA[A-Z0-9]{16}\b`, 'g')],
  ['private key block', new RegExp(String.raw`-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----`, 'g')],
]);

function workspaceFiles() {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
  return result.stdout.split('\0').filter(Boolean);
}

function isGeneratedOrBinary(path) {
  return path.startsWith('public/generated/')
    || path.startsWith('vendor/')
    || /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|tgz|zip)$/i.test(path);
}

export async function scanWorkspaceSecrets(files = workspaceFiles()) {
  const findings = [];
  for (const path of files) {
    if (isGeneratedOrBinary(path)) continue;
    let source;
    try {
      source = await readFile(path, 'utf8');
    } catch {
      continue;
    }
    if (source.includes('\0')) continue;
    for (const [label, pattern] of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source))) {
        const line = source.slice(0, match.index).split(/\r?\n/).length;
        findings.push({ path, line, label });
      }
    }
  }
  return findings;
}

const findings = await scanWorkspaceSecrets();
if (findings.length > 0) {
  console.error('Secret scan failed:');
  for (const finding of findings) {
    console.error(`- ${finding.path}:${finding.line} (${finding.label})`);
  }
  process.exitCode = 1;
} else {
  console.log('Secret scan passed.');
}
