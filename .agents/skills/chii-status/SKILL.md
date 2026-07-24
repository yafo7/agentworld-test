---
name: chii-status
description: Produce a concise, current summary of the Chii Island repository, Git worktree, local services, runtime asset manifest, tests, and architecture baseline. Use when the user asks about current progress, project status, context, handoff state, or what to work on next.
---

# Chii Project Status

Run:

```powershell
node .agents/skills/chii-status/scripts/project-status.mjs
```

Use `--json` only when another script needs structured output.

Treat the output as the first context source. Read code only for the subsystem required by the task. Do not re-read the whole repository.

When Studio is running, status performs the same read-only semantic deep diff as `$chii-assets --all --dry-run`. When Studio is down, report `studio-down`; do not treat the manifest timestamp alone as proof that assets are current.

Report only branch/commit, dirty changes, services, runtime assets and deep-diff state, test count, and architecture baseline.
