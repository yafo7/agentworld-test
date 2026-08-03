---
name: chii-dev
description: Safely inspect, start, or stop the local Chii Island game on port 5173 and Voxel Studio on port 8000. Use when the user asks to run, start, restart, stop, or check the local development services.
---

# Chii Development Services

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/chii-dev/scripts/services.ps1 -Action status
powershell -ExecutionPolicy Bypass -File .agents/skills/chii-dev/scripts/services.ps1 -Action start
powershell -ExecutionPolicy Bypass -File .agents/skills/chii-dev/scripts/services.ps1 -Action stop
```

Use `-Target game` or `-Target studio` to limit the operation. Default target is `all`.
When 5173 is occupied by another project, pass an explicit free port such as
`-Target game -GamePort 5174`; status reports whether the listener is owned by
this repository.

Rules:

- Never kill a port blindly. Stop only a process recognized as this repository, Vite, or the sibling Studio server.
- Start the game with `npm run dev:game`; do not run `npm run dev` and a second Studio process together.
- Reuse a healthy existing service.
- Treat any Vite process outside this repository as an ownership conflict.
- Report URLs and any ownership conflict.

URLs:

- Chii Island: `http://localhost:5173/src/demos/chii-island/`
- Agentland Friends: `http://localhost:5173/src/demos/agentland-friends/`
- Ghost Home compatibility redirect: `http://localhost:5173/src/demos/ghost-home/`
- Voxel Studio: `http://localhost:8000/`
