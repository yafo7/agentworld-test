---
name: dev
description: "启动本地开发环境：奇异岛、体素工作室"
---

按顺序启动（避免端口冲突）：

1. 先杀掉可能残留的旧进程（端口 5173、8000）
2. **奇异岛（agentworld-test）** — `npm run dev -- --host 0.0.0.0`，端口 5173
3. **体素工作室（3d-generate）** — `python server.py`，端口 8000

全部后台运行。启动完成后汇总各服务 URL：
- 奇异岛: http://localhost:5173/src/demos/chii-island/
- 鬼屋: http://localhost:5173/src/demos/ghost-home/index.html
- 体素工作室: http://localhost:8000/
