---
name: chii-dev
description: Safely inspect, start, or stop Chii Island on port 5173, Voxel Studio on port 8000, and the WorldForge map generator on ports 5176/8797. Use when the user asks to run, start, restart, stop, or check Chii local development services or the map generator.
---

# Chii Development Services

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/chii-dev/scripts/services.ps1 -Action status
powershell -ExecutionPolicy Bypass -File .agents/skills/chii-dev/scripts/services.ps1 -Action start
powershell -ExecutionPolicy Bypass -File .agents/skills/chii-dev/scripts/services.ps1 -Action stop
```

Use `-Target game`, `-Target studio`, or `-Target map` to limit the operation.
Default target `all` intentionally preserves the legacy behavior of managing only Chii Island
and Voxel Studio. The map generator is opt-in so routine Chii startup does not consume its ports.

Start, inspect, or stop the map generator:

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/chii-dev/scripts/services.ps1 -Action start -Target map
powershell -ExecutionPolicy Bypass -File .agents/skills/chii-dev/scripts/services.ps1 -Action status -Target map
powershell -ExecutionPolicy Bypass -File .agents/skills/chii-dev/scripts/services.ps1 -Action stop -Target map
```

Interpret user wording such as `启动地图生成器`, `启动 WorldForge`, or `打开地图编辑器`
as `-Action start -Target map`.
When 5173 is occupied by another project, pass an explicit free port such as
`-Target game -GamePort 5174`; status reports whether the listener is owned by
this repository.

Rules:

- Never kill a port blindly. Stop only a process recognized as this repository, Vite, or the sibling Studio server.
- Start the game with `npm run dev:game`; do not run `npm run dev` and a second Studio process together.
- Start WorldForge as two owned processes: the Vite client and its local map API.
- Prefer the sibling `3d-generate` runtime when its required public entry files exist. Otherwise use the verified `agentland/.runtime/worldforge-3d-compat` runtime and report that compatibility mode is active.
- Reuse a healthy existing service.
- Treat any Vite process outside this repository as an ownership conflict.
- Report URLs and any ownership conflict.

URLs:

- Chii Island: `http://localhost:5173/src/demos/chii-island/`
- Agentland Friends: `http://localhost:5173/src/demos/agentland-friends/`
- Ghost Home compatibility redirect: `http://localhost:5173/src/demos/ghost-home/`
- Voxel Studio: `http://localhost:8000/`
- WorldForge map generator: `http://localhost:5176/`
- WorldForge local map API: `http://localhost:8797/`
