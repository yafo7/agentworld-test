---
name: chii-handoff
description: Produce a concise Chii Island group-meeting update, development handoff, milestone summary, or next-step report from Git, services, assets, tests, and the current task context. Use when the user asks for a project recap, meeting talking points, changelog summary, current progress, risks, or what another agent should do next.
---

# Chii Handoff

Collect deterministic context first:

```powershell
node .agents/skills/chii-handoff/scripts/handoff.mjs
```

Then add only task-specific facts from the current conversation.

Output in this order:

1. Current product statement.
2. What is visibly playable.
3. What changed in this work period.
4. Verification evidence.
5. Risks/blockers.
6. Next 1-3 priorities.

Keep a group-meeting version under 300 Chinese characters unless the user requests detail. Do not claim a feature is complete from documentation alone.
