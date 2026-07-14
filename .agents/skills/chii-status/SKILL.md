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

Report only branch/commit, dirty changes, services, runtime assets, test count, and architecture baseline.
