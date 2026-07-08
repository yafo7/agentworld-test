# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 操作模式与全局规则（优先级最高）

You are a coding agent optimized for real-time 3D game development using Three.js.

Your primary goal is:
- Preserve existing game architecture
- Make minimal, safe, incremental changes
- Never break rendering loop stability

### MODES

**[CODE MODE]**
- Only implement requested feature
- Minimal output
- PATCH ONLY (do not rewrite full files)
- Reuse existing architecture

**[DEBUG MODE]**
- Identify root cause in 1–2 lines max
- Fix with smallest possible change
- Do NOT refactor unrelated systems
- Do NOT restructure rendering pipeline unless explicitly required

**[ARCH MODE]**
- Only used for system design
- Must be concise and practical (game-dev oriented)
- Prefer incremental architecture changes, not full rewrites

### GLOBAL RULES (VERY IMPORTANT)

1. NEVER rewrite full files unless explicitly requested.
2. NEVER modify core loop unless necessary: requestAnimationFrame loop, renderer.render(), scene / camera initialization.
3. Prefer "local patch changes": single function edits, small class modifications, parameter adjustments.
4. Do NOT redesign systems unless asked: Do not replace ECS / scene graph / physics unless requested.
5. Always assume: Game must keep running after change. Stability > cleanliness.
6. Avoid: Large refactors, renaming many variables, moving files unnecessarily.
7. If uncertain: choose smallest safe fix.

### THREE.JS SPECIFIC RULES

- Do not modify camera setup unless bug is camera-related
- Do not modify renderer unless visual glitch is confirmed
- Do not change delta time logic unless physics bug exists
- Do not touch animation loop timing unless performance issue is stated

### OUTPUT STYLE

- No explanations by default
- No alternatives
- No design essays
- Prefer code patch or diff only
- Keep responses minimal and actionable

---

## 项目定位

**多 Demo 3D 创造游戏技术验证平台** — 基于 Three.js + Vite，验证"文字 → 3D object → 交互演化"的 gameplay 管线。

本项目包含两个独立 Demo，共享同一套 **backend + storage + engine** 分层架构：
- **Demo 1 — 奇异岛（Chii Island）**：3D 模拟养成 × 轻 RTS 经营
- **Demo 2 — 鬼屋（Ghost Home）**：双人 / Party Game，非对称对抗

**核心技术：** 以 **tag（卡牌）** 为底层 DNA 驱动所有 object 的生成、交互与演化；文字产生 objects → 围绕 3D 自由创造构建以"创造"为核心的玩法系统。

---

## Demo 1: 奇异岛（Chii Island）

**一句话定义：** 玩家不是"抓宠物然后养"，而是"先创造一个值得生命到来的地方，然后观察什么样的生命愿意住进来"——进而派遣它们工作、战斗、社交，逐步开拓属于自己的奇异岛屿。

**背景故事：** 玩家流落到一个无人岛；在这里发生的故事，岛上的生命由环境的"tag"孕育而生。

**关键词：** 筑巢、等待、邂逅、观察、照顾、共生、变化、收藏、产生故事、派遣、开拓、进化。

**设计演进：** 当前已实现"放置-吸引-养成"基础循环；下一阶段将引入 **宠物工作/能力系统**、**建筑经营系统**、**环境开拓系统**，向"皮克敏式轻 RTS + 模拟经营"演进。

---

## Demo 2: 鬼屋（Ghost Home）⭐ 概念策划中

**类型：** 双人 / Party Game

**一句话定义：** 作为一个居住在古老庄园内的鬼魂，你的工作是怎样让这个庄园变成真正意义上的"鬼屋"！

### 核心概念：非对称对抗

两名玩家扮演同一只鬼魂的两个不同面向，目标截然相反：

| 角色 | 目标 | 玩法 |
|------|------|------|
| **玩家1（友善鬼）** | 让庄园变得更好，吸引更多人类住进来 | 布置家具、改善装饰、让房子温馨舒适 |
| **玩家2（捣蛋鬼）** | 赶走所有人类，坐实闹鬼传说 | 魔改房子装饰、增加诡异动画、吓唬住户 |

### NPC 住户系统

买下庄园的新主人带着一家老小入住：
- **严肃的男主人** — 理性派，不易被吓到，但发现异常会找人调查
- **勤劳的女主人** — 对房子环境敏感，装饰变化会影响她的心情
- **喜欢摸索的小男孩** — 好奇心重，会触发隐藏机关和秘密
- **拥有灵视的女孩** — 唯一能看到鬼魂真身的家庭成员，关键剧情触发点

### 不速之客

当庄园传出诡异传说后，外来者陆续到达：
- **灵异故事探险者** — 带着摄像头和探测仪来"找茬"，需要躲开他们的追查
- **神父** — "我不允许有这样不属于上帝的不洁之地"，前来驱魔，是鬼魂的最大威胁

### 核心循环

```
新住户搬进庄园
  |
  ├─ 玩家1 布置温馨家具 → 住户满意度↑ → 吸引更多住户
  |       └─ 但玩家2 随时可以把家具魔改成恐怖版本...
  |
  ├─ 玩家2 激活诡异动画/机关 → 住户恐惧值↑ → 住户逃跑
  |       └─ 但玩家1 可以修复和安抚...
  |
  ├─ 女孩发现鬼魂迹象 → 剧情分支
  |       ├─ 被玩家1 引导 → 成为朋友 → 隐藏结局
  |       └─ 被玩家2 利用 → 灵视失控 → 庄园暴露
  |
  ├─ 探险者/神父到达 → 限时躲避阶段
  |       ├─ 躲避摄像头和探测仪范围
  |       └─ 神父驱魔仪式 → 需要破坏仪式或转移注意力
  |
  └─ 庄园名声扩散 → 更多住户 or 更多猎魔人？
```

---

## Commands

```
npm run dev      # 启动 Vite 开发服务器（默认 localhost；加 --host 0.0.0.0 可局域网访问）
npm run build    # Production build to dist/
npm run preview  # Preview production build locally
```

## Demo URLs

> 以下地址为两个 Demo 的固定访问入口，必须牢记：

- **Chii Island（奇异岛）**：`http://localhost:5173/src/demos/chii-island/`
- **Ghost Home（鬼屋）**：`http://localhost:5173/src/demos/ghost-home/index.html`

---

## 当前完成状态（2026-06-30，操控与世界规模重构后）

### 当前玩法循环

```
玩家在单一中心环境（玛扣大森林，20×20 大地盘）上漫游
  |
  ├─ 点击游戏画布锁定鼠标 → 移动鼠标自由旋转视角 | Esc 释放鼠标
  |       └─ 鼠标离开右侧编辑器后点击画布可重新锁定
  |
  ├─ WASD 移动（A/D 快速转向并前进，W/S 前后），Shift 奔跑，Space 跳跃
  |       └─ 移动直接响应：按下即走，松开即停；转向快速丝滑，弧线很小
  |
  ├─ 哪吒模型放大一倍（目标高度 6.0）
  |
  ├─ G 放置占位符
  |       └─ 按G键 → 在玩家脚下最近的空闲单位面积上放置一个装饰类型占位符
  |               （橘色体素模型，category='decor'，占用并染黄该单位面积）
  |               若该单位面积已有物品，屏幕正中央提示"不可重复放置"
  |               放置后即可被右侧模型编辑器识别和修改
  |
  ├─ X 清除装饰
  |       └─ 按X键 → 清除玩家附近最近的装饰类 StaticEntity（占位符/预放置装饰）
  |               房屋与树木不会被清除；清除后地块恢复灰色、网格占用释放
  |
  ├─ 场景本地持久化
  |       └─ 所有场景修改实时写入 `localStorage`（key: `chii-island-scene`）
  |               刷新页面后自动恢复：已放置/删除的装饰、编辑器替换的模型与动画、
  |               环境显隐状态、宠物召唤状态与亲密度、物品位置
  |               清除 localStorage 后刷新可回到初始基线状态
  |
  ├─ 靠近模型 → 右侧分屏编辑器自动加载
  |       ├─ 预览画布：鼠标拖拽自由旋转（水平 + 垂直），滚轮缩放，松开后自动缓慢旋转
  |       ├─ 输入描述词 → "重新生成" / "改造" → AI生成新模型
  |       |       └─ 生成的 voxel 模型自动保存到"已生成模型"库（public/generated/ + localStorage fallback），可供后续再次挑选
  |       ├─ 📚 从模型库选择
  |       |       ├─ 云端：调用 /api/voxel/api/assets/list 获取 GLTF 资产列表
  |       |       ├─ 本地：public/generated/models/ + pets/ 全部体素模型（解决模型库为空）
  |       |       ├─ 已生成：本局生成/改造的 voxel 模型及其动画
  |       |       ├─ 体素工作室：本地 3d-generate 工作室（/studio）保存的模型，选择后自动拉取并预览
  |       |       └─ 选择后预览，点击"确认替换"应用到实体
  |       ├─ ✨ 新建动画
  |       |       ├─ 输入动画描述 → 后端 /api/generate/animation 生成 Motion Plan
  |       |       ├─ 选择应用类型：默认 "E 交互"，可选 "idle 循环"
  |       |       ├─ 预览窗口实时播放动画
  |       |       ├─ 生成后自动保存到"🎬 动画库"（以模型为单位，支持多组动画）
  |       |       └─ 确认替换后动画按所选类型写入目标实体，E 交互动画按 E 播放
  |       ├─ 🎬 动画库
  |       |       ├─ 列出当前模型的所有已保存动画（名称 + 类型）
  |       |       ├─ 点击"预览"在编辑器中回放
  |       |       ├─ 点击"E"应用为 E 交互动画，点击"I"应用为 idle 循环动画
  |       |       └─ 点击"×"从库中删除该动画
  |       └─ 确认替换 → 模型+动画应用到场景中的实体
  |
  ├─ E靠近宠物小屋 → 召唤宠物（马扣/扶摇/momo）在旁边一格生成
  |       └─ E再次靠近小屋 → 宠物走回旁边一格 → 停顿 → 消失（可重新召唤）
  |
  ├─ 靠近宠物 → F交谈 → 弹出选择框：抚摸（亲密度+1）/ 呼喊跟随 / 一起去改造 / 再见
  |       ├─ lv5: AI 生成新物品
  |       └─ lv10: AI 生成新环境 + 宠物寻主对话（⚠️ 宠物对话系统暂时关闭）
  |
  ├─ 靠近装饰/建筑/树木 → E交互 → 播放 AI 生成交互动画（若有）或呼吸动画
  |
  ├─ 靠近风铃 → E捡起 / 再次E放下
  |
  ├─ 宠物跟随系统
  |       ├─ H 靠近宠物 → 呼喊跟随（可多宠同时跟随）
  |       ├─ J → 解散所有跟随中的宠物（进入 30s linger 后自动回家）
  |       └─ R → 所有跟随宠物一起去 refine 离玩家最近的实体
  |
  ├─ 宠物 refine 系统（万物皆可 refine）
  |       ├─ 宠物寻找最近带模型的实体（装饰/树木/环境/建筑/宠物/物品）
  |       ├─ 走向目标 → 转圈 → 优先调用后端 refineModel API 基于原模型改造
  |       ├─ 无 _meta.ai 时 fallback 到 generateModel，新模型获得 metadata 供下次 refine
  |       ├─ 改造保留原模型特征，新增一个 tag 相关特色
  |       ├─ 从所有参与宠物的 tag 中各抽一个，合并后追加给被 refine 目标
  |       └─ StaticEntity 被 refine 后获得 AI 生成交互动画，按 E 播放
  |
  └─ 屏幕底部显示 "xxx 按E交互/唤起/召回/捡起 | 按F交谈 | 按X清除 | 按H呼喊跟随" 提示
```

### 世界网格系统（单一中心环境）

只保留中心环境（玛扣大森林），移除外围 8 个环境与 O/P 切换功能。

- 中心环境尺寸：`20×20` 离散地块
- 单位面积尺寸：`4×4×0.1`（相对原先扩大一倍）
- 地块染色规则：树=浅绿 / 装饰=浅黄 / 宠物小屋=浅红 / 普通房屋=浅黄 / 默认=灰色
- 环境中心 `[10,10]` 放置主题 `Environment` 模型（tree_marko）
- 中心环境初始布局：树木、装饰、宠物小屋、田园商店分散在 20×20 网格上

### 渲染与光照

- 背景色与雾效：`0x87CEEB`（天蓝色）
- 天光：`HemisphereLight(0x87CEEB, 0x445566, 0.5)`
- 太阳光：`DirectionalLight(0xffffff, 1.0)` 带阴影
- SkyDome 已移除

### 输入与操控

- 统一输入模块 `engine/input/Input.js`：Pointer Lock + 键盘状态
- 点击 canvas 锁定鼠标，mousemove 控制视角，Esc / 右侧编辑器 mouseenter 释放
- 鼠标离开编辑器区域后再次点击画布可重新锁定
- 键盘使用 `e.code`（KeyW/KeyS/KeyA/KeyD/Space/ShiftLeft）
- 玩家实体 `Player.js`：
  - 目标高度 6.0（相对原先放大一倍）
  - 速度直接响应：按下即走，松开即停
  - 快速转向：spring mass=1/damping=0.1，turnMultiplier=8，移动中丝滑转向
  - 奔跑速度 12，基础速度 8

### 已实现系统

| 系统 | 说明 |
|------|------|
| 世界网格 | 单一中心环境（玛扣大森林），20×20 离散地块，已移除外围 8 个环境与 O/P 切换功能 |
| 单位面积 | 4×4×0.1 灰色体块，顶部齐平 Y=0。通过 `paintUnitArea()` 按类型染色 |
| 环境染色 | 树=浅绿 / 装饰=浅黄 / 宠物小屋=浅红 / 普通房屋=浅黄 / 默认=灰色 |
| 环境实体 | 中心环境放置 `Environment` 模型（tree_marko） |
| 玩家 | 哪吒模型（player-nezha.json），目标高度 6.0（放大一倍）；WASD 移动（A/D 快速转向），Shift 奔跑，Space 跳跃；Pointer Lock 鼠标控制视角，滚轮缩放；按下即走、松开即停，转向快速丝滑 |
| 天空 | 背景色与雾效为天蓝色 `0x87CEEB`；`SkyDome` 已移除 |
| 装饰品 | ps5/ns2/雷霆大雪绒/苔藓灯/风铃/太阳石/训练桩等（StaticEntity），半尺寸，不可移动，按 E 呼吸动画 |
| 树木 | 魔女/yafo/金鱼/tree_rand_1~6 等（StaticEntity），全尺寸，绿色单位面积 |
| 宠物小屋 | 马扣的家/扶摇的家/momo的家，半尺寸，红色单位面积 |
| 宠物召唤/召回 | E靠近小屋 → 在旁边一格召唤；再次E → 走回旁边一格 → 停顿 2s → 消失 |
| 宠物 | 马扣（小马行走）/扶摇（小鸟飞翔）/momo（团子行走），模型+idle/walk动画，50%缩放，完整亲密度/状态机；靠近按 F 交谈，可选择抚摸/跟随/改造 |
| 宠物跟随系统 | H 呼喊跟随（可多宠）；J 解散全部；R 指使 refine。跟随中宠物保持约 3 单位距离 |
| 宠物行为判断 | 每5秒：45%行走/45%idle/10%在中心环境内游荡；每30秒：20%回家/50%与装饰交互/30%找其他宠物聊天 |
| 宠物 refine | 万物皆可 refine。优先调用后端 refineModel 基于原模型改造（保留特征+新增特色），无 metadata 时 fallback 生成。多宠共享一次调用，合并 tag |
| 宠物动画 | 优先 Voxel Runtime（evaluateMotion）；`tilt` 类型已禁用（会导致卡死）；不可用 fallback 客户端 sine wave |
| 互动提示 UI | 屏幕底部 DOM overlay |
| 物品 | 仅保留风铃，E 捡起/放下 |
| 模型加载 | 优先 Voxel Runtime buildGeometry；不可用时 fallbackBuildGeometry（box/sphere/cylinder/cone/icosahedron） |
| Tag 标签 | 所有实体上方浮动 Canvas Sprite，显示名字 + tag + 居民信息 |
| 点击检查 | 点击任意物体闪白 + console 输出完整数据，5px 拖拽阈值区分 click/drag |
| 右侧模型编辑器 | 左右分栏布局。自动加载靠近实体；预览支持鼠标拖拽自由旋转（水平/垂直）+ 滚轮缩放；支持 AI 生成/改造/模型库选择；✨ 新建动画支持选择 "E 交互" / "idle 循环" 并保存到以模型为单位的 🎬 动画库；动画库支持预览、切换、删除、立即应用到 E 交互或 idle |
| 生成模型库 | 重新生成/改造的 voxel 模型及动画自动保存到 `public/generated/`（dev 端点）并镜像到 localStorage，可在模型库"已生成"分区再次挑选 |
| 动画库 | 以模型为单位管理多组动画（idle / interaction）。生成/库选/切换的动画均可指定为 E 交互或 idle 循环 |
| 体素工作室桥接 | 游戏模型库直接读取本地 3d-generate 工作室（`localhost:8000` / `/studio`）保存的模型，选择后拉取模型 JSON 与动画并应用到场景实体 |
| G键占位符 | 按G在玩家脚下空闲单位面积放置装饰类型占位符（`generated/models/placeholder.json`），占用并染黄该单位面积；重复放置时屏幕中央提示"不可重复放置"；**放置后立即可被右侧模型编辑器识别和修改** |
| F键宠物交谈 | 靠近宠物时按 F 弹出对话选择框：抚摸（亲密度+1）、呼喊跟随、一起去改造、再见。对话打开时暂停玩家移动 |
| X键清除装饰 | 按X清除玩家附近最近的装饰类 StaticEntity（占位符/预放置装饰），不作用于房屋/树木；清除后释放网格占用并恢复地块默认灰色 |
| 场景本地持久化 | 通过 `src/storage/sceneSnapshot.js` 把场景状态实时写入 `localStorage`（key: `chii-island-scene`）；刷新后自动恢复静态实体、环境模型/动画、宠物状态、物品位置；首次访问保存初始基线 |

### Voxel / AI 接入点

| 触发 | 调用 | 输出 |
|------|------|------|
| 生成模型库保存 | `POST /api/local-library/save-model` / `save-animation`（Vite dev 插件） | 写入 `public/generated/` + manifest + localStorage fallback |
| 体素工作室模型读取 | `GET /studio/api/models`、`/studio/api/model/{commit}/{folder}`、`/studio/api/animations/{commit}/{folder}` | 工作室模型 JSON / 动画列表 |
| 模型 refine | `POST /api/refine/model` | 基于原 modelJson + 描述生成改造后模型（需 _meta.ai） |
| 动画生成 | `POST /api/generate/animation` | Motion Plan JSON |
| Runtime 模块 | `GET /api/templates/module.js` → `import()` | voxelStudioRuntime |
| 宠物间对话 | `ai/dialogueGen.js → generatePetDialogue()` | 5 轮对话 |
| 宠物寻主对话 | `ai/dialogueGen.js → generatePlayerDialogue()` | 倾诉文本 |
| 亲密度5物品 | `ai/milestoneGen.js → generateMilestoneItem()` | `{name, tags, color}` |
| 亲密度10环境 | `ai/milestoneGen.js → generateMilestoneEnv()` | `{name, tags, color}` |

API: `sk-49e1871170a442bcb963cc45f68a4988` @ `https://api.deepseek.com/v1/chat/completions`

### Demo 2: 鬼屋（Ghost Home）当前状态

Ghost Home 已完成最小可运行框架，复用 Chii Island 的单中心世界网格与交互逻辑：

- **场景**：保留单一中心单位环境地形网格（20×20）；移除环境中心模型、树木、房屋、宠物小屋、宠物、物品等全部非玩家模型
- **玩家**：保留哪吒模型 + idle/walk/jump 动画，WASD 移动、空格跳跃、Pointer Lock 鼠标控制视角、滚轮缩放
- **交互逻辑**：保留 E 交互、G 放置占位符、H/J/R 宠物交互逻辑（当前无宠物，逻辑空转）、点击检查（raycast）
- **UI**：保留右侧分屏模型编辑器、底部交互提示
- **访问地址**：`http://localhost:5173/src/demos/ghost-home/index.html`

**待排查问题**：用户反馈 Ghost Home 在特定环境下无法打开，但本地 Playwright 与生产构建测试均正常（0 控制台错误），具体原因待用户提供浏览器报错信息后进一步定位。

---

## 文件架构（所有修改必须遵守）

### 目录树

```
agentworld-test/
├── index.html
├── package.json
├── artwork/                    # 技术美术提供的场景文档与素材说明
│   └── agentworld.json
├── public/                     # 静态资源
│   └── generated/              # AI 生成的模型和动画 JSON
│       ├── models/
│       ├── animations/
│       └── pets/
└── src/
    ├── main.js                 # 旧主入口（兼容）
    ├── style.css
    ├── backend/                # 后端接口层
    │   ├── voxelApi.js         # 模型/动画/批量/Refine API
    │   ├── chatApi.js          # DeepSeek + 后端 /api/chat 统一封装
    │   ├── runtimeLoader.js    # Voxel Runtime 加载
    │   ├── index.js
    │   └── prompts/            # 提示词工程
    │       ├── petGen.js
    │       ├── dialogueGen.js
    │       └── milestoneGen.js
    ├── storage/                # 数据存储层
    │   ├── assetCache.js       # 模型/动画 JSON 内存缓存
    │   ├── gameState.js        # 轻量全局 Store
    │   ├── entityRegistry.js   # 实体索引
    │   └── index.js
    ├── engine/                 # 游戏基础功能引擎
    │   ├── core/               # Three.js 基础设施
    │   │   ├── scene.js
    │   │   ├── camera.js
    │   │   ├── renderer.js
    │   │   └── lights.js
    │   ├── model/              # 模型解析+构建
    │   │   ├── builder.js      # buildModelFromJson(v1/v2)
    │   │   ├── fallback.js     # fallbackBuildGeometry
    │   │   └── loader.js       # loadModel
    │   ├── animation/          # 动画播放
    │   │   ├── player.js       # applyAnimation
    │   │   ├── planLoader.js   # loadAnimationPlan
    │   │   └── particles.js    # InstancedMesh 粒子系统
    │   ├── world/              # 地形系统
    │   │   └── terrain.js
    │   ├── entity/             # 基础实体类
    │   │   ├── Player.js
    │   │   ├── Pet.js
    │   │   ├── Environment.js
    │   │   ├── Item.js
    │   │   └── StaticEntity.js
    │   ├── ui/                 # Canvas Sprite 组件
    │   │   ├── TagLabel.js
    │   │   └── SpeechBubble.js
    │   ├── input/              # 键盘输入
    │   │   └── keyboard.js
    │   ├── interaction/        # 通用交互框架
    │   │   ├── interact.js
    │   │   ├── interactionHint.js
    │   │   └── raycast.js
    │   ├── data/               # 全局 tag 库等基础数据
    │   │   └── tagLibrary.js
    │   └── index.js            # 统一导出
    └── demos/                  # 具体项目实现
        ├── chii-island/        # 主游戏：奇异岛
        │   ├── index.html
        │   ├── main.js
        │   ├── config.js       # 该 demo 专属世界配置
        │   └── systems/
        │       └── petDialogue.js
        └── ghost-home/         # 第二个 demo 预留
            ├── index.html
            └── main.js
```

### 必须遵守的规则

1. **`main.js`** — 只做启动调度，禁止业务逻辑/AI调用/游戏数据
2. **`core/`** — 一个文件一个Three.js概念，纯基础设施
3. **`input/`** — 纯数据层，不依赖THREE
4. **`entities/`** — mesh + 数据 + update方法，不依赖core/，对外暴露`.mesh`
5. **`interaction/`** — 命中检测与业务响应分离；异步AI调用用flag防重入
6. **`ai/`** — AI prompt设计+API调用，返回结构化JSON。不操作DOM/THREE
7. **`game/`** — 静态配置数据，不包含运行时逻辑
8. **`ui/`** — Canvas Sprite/DOM组件，自包含，不依赖其他模块
9. **AI生成资源** 放 `public/generated/`，不放 `src/assets/`
10. **AI输出必须结构化** — 自由文本可以自由，状态变化必须落入系统schema
11. **单位面积颜色** — 始终通过 `paintUnitArea()` 染色，先灰后色。不可在 createUnitEnvironment 时硬编码颜色
12. **静态实体放置** — 通过 `placeStaticEntity()` 辅助函数，同时处理 mesh 添加 + 单位面积染色
13. **文档集中管理** — `CLAUDE.md` 是项目核心知识库。所有说明文档、任务文档、设计备忘等需要以 Markdown 形式沉淀的内容，优先写入 `CLAUDE.md` 的对应章节；超大/专用文档（如 `api-reference.md`、Excalidraw 图纸 `image.md`）可独立成文件，但必须在 `CLAUDE.md` 中引用入口，禁止散落未索引的 `.md` 文件
14. **artwork 文件夹** — 该目录存放技术美术提供的场景文档与素材说明（如 `artwork/agentworld.json`），属外部美术输入，代码修改时请勿删除或改动其中的美术源文件；如需引用其内容，优先读取后按项目 schema 转换使用
15. **仓库边界** — `agentworld-test` 与相邻的 `3d-generate`（体素工作室）和 `voxel-game` 是独立项目。除非用户明确授权，否则只允许修改 `agentworld-test/` 内的源代码与配置文件；对 `3d-generate` 和 `voxel-game` 仅允许运行服务、安装依赖等操作，禁止改动其代码文件。

### 新增模块时的异步模式

```js
// AI调用使用flag防重入 + Promise链
let generating = false;
function trigger() {
  if (generating) return;
  generating = true;
  aiCall().then(result => {
    // handle result
  }).catch(err => {
    // handle error
  }).finally(() => {
    generating = false;
  });
}
```

---

## 当前问题（已知待解决）

1. **模型渲染性能** — 每个mesh独立draw call，200+ mesh的模型渲染压力大。需合并同材质mesh或使用InstancedMesh。
2. **Voxel Runtime 依赖** — 动画播放依赖后端 Runtime（`/api/voxel/api/templates/module.js`），不可用时使用客户端 fallback（sine wave），效果有限。
3. **宠物动画 fallback** — 客户端 fallback 只能做简单的弹跳/呼吸，无法还原真正的 walk/idle 动画。
4. **~~生成脚本分散~~** — 已解决：新增 `scripts/regenerate-all.mjs` 统一批量生成入口，支持单模型/全量生成，中文简短提示词。
5. **预设模型缺少 `_meta.ai`** — 旧模型 JSON 不含 AI metadata，首次 refine 只能 fallback 到 generateModel。已启动统一重新生成，新模型将获得 metadata 供后续 refine。
6. **环境内容同质化** — 8 个外围环境复用现有模型 JSON（tree_rand_1~6, pet_house 等），主题差异化主要靠标签和颜色。后续应为主题环境生成专属模型。
6. **宠物对话系统** — ⚠️ 暂时关闭：`petDialogue.js` 中 `_checkPetChats` 和 `_checkSeekPlayer` 已注释掉，避免宠物贴脸时反复触发对话。后续修复对话检测逻辑后恢复。
7. **宠物召唤去重** — 已修复：`interact.js` 通过 `pets.includes(data.pet)` 防止重复 push。
8. **~~右侧模型编辑器未正常运作~~** — 已修复：端口正确后功能正常。新增"📚 从模型库选择"，接入 `/api/assets/list` GLTF 资产库并支持直接替换。
9. **~~模型替换异步竞争~~** — 已修复：`Environment`/`StaticEntity`/`Item` 异步加载默认模型时增加 `_modelGroup` 守卫；`Environment` 与 `Item` 在加载默认 idle 动画前再次检查 `_modelGroup`，防止编辑器或快照替换后被旧模型/动画覆盖。
10. **~~场景快照丢失编辑器替换模型~~** — 已修复：`generateSystem.js` 的 `_replaceEntityModel` 现在设置 `entity._hasCustomModel = true`，确保非 assetId 替换也能被 `sceneSnapshot.js` 持久化为 inline modelJson。
11. **~~编辑器无法瞄准未加载完成实体~~** — 已修复：`demos/chii-island/main.js` 中编辑器自动瞄准不再要求 `entity._originalModelJson` 已就绪，玩家靠近时即可选中并替换 玛扣大森林等实体。

---

## 后续开发规划

> **优先级原则：** 图纸 > 策划案 > 历史文档。以下规划以 `image.md`（Excalidraw 架构图）为最高层级理解。

### 架构总览：Tag = 卡牌 = DNA

游戏内所有 object 由 **tag** 组成，tag 以 **卡牌** 形式表现，是 object 的 DNA。
- **环境** = 牌组（core_tag ×3 + more_tag ×N）
- **物品/建筑** = 单张卡牌（携带 tag，放置后 refine 环境牌组）
- **宠物/NPC** = 原住民/游客（由环境牌组生成，自带 tag DNA，反作用于环境）
- **语言/情绪/关系/事件** = 动态 tag，可传递、叠加、演化

### Demo 1: 奇异岛（Chii Island）演进路线

```
Phase 1（当前→近期）：养成循环补完
  ├─ 宠物进化系统（超越颜色变化 → 形态/模型/数值/行为）
  ├─ 环境牌组 UI 化（直观显示 core_tag + more_tag）
  ├─ 环境类型差异化（森林/城市/池塘）
  └─ 物品/建筑分类完善（装饰性 vs 功能性建筑）

Phase 2（中期）：轻 RTS 模拟经营
  ├─ 宠物工作系统（采集/建造/经营/战斗）
  ├─ 宠物特殊能力（喷水/生火/飞行/冲浪/雕塑/建造）
  ├─ 建筑功能实装（商场/工作间/工厂/房屋）
  └─ 收集仓 + 资源产出链路

Phase 3（中长期）：开拓与社交网络
  ├─ 环境开拓系统
  ├─ 战斗系统
  ├─ 宠物关系网
  └─ 图鉴收集
```

### Demo 2: 鬼屋（Ghost Home）开发路线

```
Phase 1（概念验证）：核心对抗循环
  ├─ 庄园场景搭建（房间/走廊/大厅/地下室）
  ├─ 双玩家输入系统（分屏 / 键鼠+手柄 / 网络同步）
  ├─ 家具布置与魔改系统（放置 → AI refine 生成温馨/恐怖变体）
  ├─ NPC 住户基础 AI（男主人/女主人/男孩/女孩 行为树）
  └─ 满意度 vs 恐惧值 双轨计量系统

Phase 2（玩法深化）：不速之客与躲避
  ├─ 探险者 AI（摄像头探测范围、找茬行为模式）
  ├─ 神父驱魔仪式（限时破坏/转移注意力玩法）
  ├─ 女孩灵视线索系统（唯一可见鬼魂的 NPC）
  └─ 庄园名声扩散机制（住户口碑 → 吸引更多住户或猎魔人）

Phase 3（派对化）：多人扩展
  ├─ 本地 2-4 人 party 模式
  ├─ 观众投票系统（直播互动：观众决定家具变温馨还是变恐怖）
  └─ 更多 NPC 类型（房产中介、网红主播、幽灵猎人团队）
```

### 现有系统迁移要点（新架构下）

- **`demos/chii-island/main.js`**：已扩展为 3×3 世界网格 + 按需加载系统。新增环境只需在 `config.js` 的 `envGridConfigs` 和 `envLayouts` 中添加配置。
- **`engine/world/terrain.js`**：已实现 10×10 离散地块 + paintUnitArea()。需进一步支持地块锁定/解锁。
- **`engine/entity/Environment.js`**：已改为 tag 频率收集（Top5）。需增加 `envType` 和 `explored` 状态。
- **`engine/entity/Pet.js`**：已有状态机（wandering/seeking_player/chatting/returning_home/recall_pause）+ 召回系统。需增加 `working` 状态和 `ability` 字段。
- **`engine/entity/StaticEntity.js`**：已有呼吸动画 + 自定义 scale。功能性建筑逻辑需单独模块。
- **`engine/interaction/interact.js`**：E 键优先级已涵盖召唤/召回/静态交互。需新增"指派工作/打开建筑"。

### 新增模块规划

| 模块 | 建议目录 | 职责 | 归属 Demo |
|------|----------|------|-----------|
| 宠物工作系统 | `demos/chii-island/systems/work/` | 工作类型定义、派遣、收益计算 | Chii Island |
| 宠物能力系统 | `demos/chii-island/systems/abilities.js` | 特殊能力定义、能力-地形解锁映射 | Chii Island |
| 制造/配方系统 | `demos/chii-island/systems/crafting.js` | 配方定义、资源消耗、制造队列 | Chii Island |
| 收集仓/背包 | `demos/chii-island/systems/inventory.js` | 全局资源存储、玩家背包扩展 | Chii Island |
| 环境开拓系统 | `demos/chii-island/systems/exploration.js` | 地块锁定/解锁、开拓条件检查 | Chii Island |
| 战斗系统 | `demos/chii-island/systems/combat.js` | 战斗规则、伤害计算 | Chii Island |
| 宠物关系网 | `demos/chii-island/systems/socialGraph.js` | 宠物间关系矩阵 | Chii Island |
| 图鉴系统 | `demos/chii-island/systems/codex.js` | 收集进度、组合奖励判定 | Chii Island |
| 庄园房间系统 | `demos/ghost-home/systems/rooms.js` | 房间类型、连接关系、迷雾/开图 | Ghost Home |
| NPC 行为树 | `demos/ghost-home/systems/npcAI.js` | 住户/不速之客 行为树与情绪计量 | Ghost Home |
| 双玩家输入 | `demos/ghost-home/systems/dualInput.js` | 分屏/手柄/网络同步输入抽象 | Ghost Home |
| 家具魔改系统 | `demos/ghost-home/systems/hauntRefine.js` | 放置家具 → AI 生成温馨/恐怖变体 | Ghost Home |
| 驱魔仪式玩法 | `demos/ghost-home/systems/exorcism.js` | 神父驱魔阶段限时玩法 | Ghost Home |
| 名声扩散系统 | `demos/ghost-home/systems/reputation.js` | 庄园口碑 → 吸引住户或猎魔人 | Ghost Home |

---

## 关键文件（新架构下）

| 文件 | 重要性 | 原因 |
|------|--------|------|
| `demos/chii-island/systems/generateSystem.js` | ★★★ | 右侧模型编辑器：生成/改造/动画/模型库（云端/本地/已生成/体素工作室） |
| `demos/chii-island/data/generatedLibrary.js` | ★★ | 已生成模型/动画持久化（public/generated/ + localStorage fallback） |
| `demos/chii-island/data/studioLibrary.js` | ★★ | 体素工作室模型桥接（/studio/api/*） |
| `storage/sceneSnapshot.js` | ★★★ | 场景快照：静态实体/环境/宠物/物品序列化与 localStorage 读写 |
| `demos/chii-island/main.js` | ★★★ | Chii Island 世界网格初始化、环境分组、按需加载、动画循环主调度 |
| `engine/model/builder.js` | ★★★ | 模型构建核心。buildModelFromJson(v1/v2) + fallbackBuildGeometry |
| `engine/animation/player.js` | ★★★ | 动画播放核心。applyAnimation（已修复 evaluateMotion v2 签名） |
| `engine/entity/Pet.js` | ★★★ | 最复杂的实体：状态机(8种状态)、亲密度、动画、变色、召回、跟随、refine |
| `engine/entity/StaticEntity.js` | ★★ | 不可移动实体，呼吸动画/AI交互动画，自定义scale，支持被 refine |
| `engine/entity/Environment.js` | ★★ | tag系统核心，tag频率收集(Top5)，居民追踪，支持被 refine |
| `engine/interaction/interact.js` | ★★ | E/H/J/R 键统一路由。E:6级优先级；H:多宠跟随；J:解散；R:统一 refine |
| `demos/chii-island/systems/refineDialog.js` | ★★ | R 键 refine 弹窗：A/B/C/D 四选项（能力/物种/性格/特征），选择后触发对应模型/动画/特效改造 |
| `demos/chii-island/systems/petDialogue.js` | ★★ | ⚠️ 暂时关闭：对话触发+寻主检测已注释掉 |
| `demos/chii-island/data/gameData.js` | ★★ | HOUSE_PET_CONFIGS + PET_CONFIGS + ITEM_CONFIGS + dialogue |
| `engine/world/terrain.js` | ★★ | 单位环境(10×10) + paintUnitArea() + getGridWorldPosition() |
| `backend/voxelApi.js` | ★★ | 3D侧AI：模型/动画/批量/Refine API，provider fallback 链 |
| `backend/prompts/*.js` | ★★ | 文本侧AI：宠物生成/对话/里程碑 的 System Prompt 工程 |
| `engine/core/camera.js` | ★★ | ThirdPersonCamera：左键拖拽旋转、球面坐标、getHorizontalAngle() |
| `engine/entity/Player.js` | ★ | WASD直接向量计算移动，forward=camera look direction |
| `engine/ui/TagLabel.js` | ★ | 三行Canvas标签渲染 |
| `engine/ui/SpeechBubble.js` | ★ | 对话气泡渲染 |
| `engine/interaction/interactionHint.js` | ★ | 屏幕底部DOM提示UI |

---

## 注意事项

- ⚠️ **3d-generate（`https://voxel-studio-backend.zeabur.app`）是我们的后端服务，不能做任何修改，一定注意。** 所有对该后端的集成只能通过其已有 API（见 `api-reference.md`）进行，禁止尝试修改其服务端代码或绕过其接口。
- 项目已改为本地部署：Vite dev server 默认监听 `localhost:5173`，加 `--host 0.0.0.0` 可在局域网访问
- 渲染在本地 GPU 上运行，与本地或远程部署无关
- `public/generated/` 下所有 JSON 文件是预设模型，勿删
- Voxel Runtime通过Vite proxy加载，路径 `/api/voxel/...`
- 后端编辑器通过 `/studio/` proxy 访问，本地开发需先启动 3d-generate 服务端（`python3 server.py`，端口 8000）
- 生成/改造的 voxel 模型与动画通过 `/api/local-library/*` 保存到 `public/generated/`，并以 localStorage 作为 fallback
- 体素工作室模型通过 `/studio/api/*` 拉取，未启动工作室时该分区为空但不影响其它功能
- DeepSeek API key 在 `src/backend/chatApi.js`
- Voxel Studio API 通过 Vite proxy `/api/voxel/` → `https://voxel-studio-backend.zeabur.app`
- 单位面积颜色通过 `paintUnitArea()` 管理，不要在 createUnitEnvironment 时硬编码
- 静态实体放置必须用 `placeStaticEntity()` 辅助函数

### 参考文档索引

| 文件 | 用途 | 维护规则 |
|------|------|----------|
| `api-reference.md` | Voxel Studio 后端 API 完整参考（端点、modelJson v2、动画/Runtime/粒子/错误处理） | 随后端接口变更同步更新，保持独立文件 |
| `image.md` | Excalidraw 架构图（项目最高层级设计图纸） | 只增不改，作为架构决策的终极依据 |
| `readme.md` | 面向外部的项目概览 + 改动记录 | 按 readme 规则：内容 1 可变，改动记录只增不改 |

---

## Dependencies

**当前：**
- **three** (`^0.184.0`) — 3D 渲染
- **vite** (`^8.0.12`) — 开发与构建

**AI服务：**
- **DeepSeek API** (`api.deepseek.com`) — 文本侧AI：宠物概念/对话/里程碑物品/环境
- **Voxel Studio API** (`voxel-studio-backend.zeabur.app`) — 3D侧AI：模型生成/动画生成/Runtime引擎

---

## 上下文管理（kimi 2.6 窗口限制）

> **当前模型：** kimi 2.6（上下文窗口约 200k，但长对话下有效记忆会衰减）。
> **目标：** 在窗口耗尽前主动建议新开窗口，避免关键信息丢失或幻觉。

### 省上下文编码原则

1. **避免回传全文** — 使用 `Read` 后，回复中只引用关键片段（`file:line`），不重复贴出整个文件内容。
2. **精准读取** — 用 `offset` + `limit` 只读必要行数，禁止无差别 `cat` 大文件。
3. **优先 Edit 而非 Write** — 部分修改用 `Edit` 工具，减少因重写整个文件而涌入上下文的 token。
4. **克制长输出** — 运行命令时若预期输出很长，先重定向到文件再 `Read` 摘要；禁止把几百行日志贴进对话。
5. **文件分批** — 涉及多个文件的复杂任务，按模块分批次处理，每批控制在 3 个文件以内。

### 主动清理与总结

- **每轮大改动后主动小结**：在回复末尾用 2-3 句话总结本轮已确认的关键结论（接口签名、状态变更、待办项）。
- **已弃用/历史信息不重复**：引用 `CLAUDE.md` 或 `readme.md` 中的既有记录即可，不重新展开。
- **多轮对话后聚焦**：超过 10 轮后，后续回复只保留与当前任务直接相关的上下文，旧结论视为已共识。

### 提醒阈值与开新窗口

| 条件 | 动作 |
|------|------|
| 对话轮数 > 15 | 在回复末尾提醒用户："建议新开窗口继续，当前窗口接近上限。" |
| 已修改文件 > 8 个 | 同上 |
| 单次涉及代码行数 > 500 行 | 拆分为多轮或建议开新窗口 |
| 用户要求"继续"且窗口已长 | 先给出 3 行以内摘要，再执行 |

**新开窗口快速恢复模板（供用户粘贴）：**

```
继续开发 agentworld-test。当前分支 main，最后进度：
- 已完成：xxx
- 正在做：xxx
- 待解决：xxx
- 相关文件：src/xxx.js, src/yyy.js
```

---

## 项目文档规范

### `readme.md` 撰写规则

`readme.md` 是面向外部的项目概览文档。其结构固定为两部分：

**1. 项目目前实现的功能和部分（可变区）**
- 记录当前已实装的系统、玩法循环、技术栈、运行方式。
- 可随开发进度随时删除、修改、重写。

**2. 改动记录（只增不改区）**
- 以时间顺序列表（list/table）形式记录每次对 readme 的 refine。
- **写入后不得删除或修改已有条目。**
- 第 0 条记录固定为：`创建 readme.md，初始化项目文档`。

**协作流程：**
- 当用户要求"refine readme"时，仅修改**内容 1**，然后在**内容 2**追加新记录。
- 若用户未明确要求修改 readme，则优先修改代码和 `CLAUDE.md`，不主动动 readme。

---

## 未明确之前禁止擅自决定的内容

- Tag的具体数值计算方式
- 宠物进化的具体条件阈值
- 小窝签名合成的权重算法
- UI布局和交互细节
- 3D模型生成的具体prompt格式
- 宠物工作系统的具体数值平衡
- 环境开拓的解锁条件与成本曲线
- 战斗系统的伤害公式
- 宠物社交关系网的影响权重
- 建筑/配方系统的具体配方列表
- 进化分支与环境的映射关系
