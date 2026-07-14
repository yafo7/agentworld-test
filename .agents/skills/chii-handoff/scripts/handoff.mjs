import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectStatus } from '../../chii-status/scripts/project-status.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const status = await collectStatus();
const changedFiles = git(['status', '--short']).split(/\r?\n/).filter(Boolean);
const areas = new Set();
for (const line of changedFiles) {
  if (line.includes('src/engine/')) areas.add('engine');
  if (line.includes('src/backend/') || line.includes('src/integrations/') || line.includes('src/ports/')) areas.add('backend/integration');
  if (line.includes('src/gameplay/') || line.includes('demos/chii-island/')) areas.add('gameplay');
  if (line.includes('public/generated/')) areas.add('assets');
  if (line.includes('.agents/skills/') || line.includes('AGENTS.md')) areas.add('workflow/docs');
}

console.log([
  '# Chii Island Handoff',
  '',
  `- Product: AI-native 3D pet home prototype`,
  `- Branch: ${status.branch}`,
  `- Commit: ${status.commit}`,
  `- Worktree: ${status.dirtyChanges} changes`,
  `- Changed areas: ${[...areas].join(', ') || 'none'}`,
  `- Services: game ${status.services.game5173 ? 'up' : 'down'}, studio ${status.services.studio8000 ? 'up' : 'down'}`,
  `- Runtime assets: ${status.assets.count}, source ${status.assets.source || 'unknown'}`,
  `- Test files: ${status.testFiles}`,
  `- Architecture: ${status.architecture}`,
  '',
  'Add task-specific completed work, verification result, risks, and next priorities before presenting.',
].join('\n'));
