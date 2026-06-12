# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 项目定位

**宠物庭院师** — 3D 模拟养成 × 轻 RTS 经营类游戏，基于 Three.js + Vite。

**一句话定义：** 玩家不是"抓宠物然后养"，而是"先创造一个值得生命到来的地方，然后观察什么样的生命愿意住进来"——进而派遣它们工作、战斗、社交，逐步开拓属于自己的奇异岛屿。

**背景故事：** 玩家作为一名待业青年画家，偶然在求职 app 上看到"宠物庭院师"的招聘，决定前往试试。目的地是一座"奇异岛"，岛上的生命由环境的"tag"孕育而生。

**关键词：** 筑巢、等待、邂逅、观察、照顾、共生、变化、收藏、产生故事、派遣、开拓、进化。

**核心技术：** 文字产生 objects → 围绕 3D 自由创造构建以"创造"为核心的玩法系统；以 **tag（卡牌）** 为底层 DNA 驱动所有 object 的生成、交互与演化。

**设计演进：** 当前已实现"放置-吸引-养成"基础循环；下一阶段将引入 **宠物工作/能力系统**、**建筑经营系统**、**环境开拓系统**，向"皮克敏式轻 RTS + 模拟经营"演进。

---

## Commands

```
npm run dev      # Start Vite dev server (add --host 0.0.0.0 for LAN/public access)
npm run build    # Production build to dist/
npm run preview  # Preview production build locally
```

---

## 当前完成状态（2026-06-12）

### 当前玩法循环

```
玩家在 10×10 单位环境网格上漫游
  |
  ├─ E靠近宠物小屋 → 召唤宠物（马扣/扶摇/momo）
  |       └─ E再次靠近小屋 → 宠物走回 → 停顿2s → 消失（可重新召唤）
  |
  ├─ 靠近宠物 → E抚摸 → 亲密度+1
  |       ├─ lv5: AI 生成新物品
  |       └─ lv10: AI 生成新环境 + 宠物寻主对话
  |
  ├─ 靠近装饰/建筑/树木 → E交互 → 播放呼吸动画
  |
  ├─ 靠近风铃 → E捡起 / 再次E放下
  |
  └─ 屏幕底部显示 "xxx 按E交互/唤起/召回/抚摸/捡起" 提示
```

### 已实现系统

| 系统 | 说明 |
|------|------|
| 单位环境 | 10×10 离散地块网格，每个地块 2×2×0.1 灰色体块，之间留缝。通过 `paintUnitArea()` 按类型染色（树=绿/装饰=黄/建筑=红） |
| 环境（玛扣大森林） | 使用 tree_marko 模型，收集全网格实体 tag，取频率前 5 为 coreTags。代替原来的"森林"环境 |
| 玩家 | 蓝色圆锥，WASD 直接向量移动（forward = 摄像机观察方向），左键拖拽旋转视角，滚轮缩放 |
| 装饰品 | ps5游戏机/ns2游戏机/雷霆大雪绒（StaticEntity），半尺寸，不可移动，按 E 播放呼吸动画 |
| 树木 | 魔女/yafo/金鱼/星尘槐（StaticEntity），全尺寸，绿色单位面积，按 E 播放呼吸动画 |
| 宠物小屋 | 马扣的家/扶摇的家/momo的家（StaticEntity），半尺寸，红色单位面积，映射专属宠物 |
| 宠物召唤/召回 | E靠近小屋 → 召唤宠物出现并开始 wandering；再次E → 宠物 walk 回小屋旁 → 停顿 2s → 消失 |
| 宠物 | 马扣（小马）/扶摇（小鸟）/momo（团子），模型+idle/walk动画，缩小至 50%，完整的亲密度/状态机/dialogue |
| 宠物动画 | 优先使用 Voxel Runtime 播放（evaluateMotion）；Runtime 不可用时自动 fallback 为客户端 sine wave 弹跳/呼吸 |
| 互动提示 UI | 屏幕底部 DOM overlay，检测 INTERACT_HINT_RANGE=1.8 内的所有可交互对象，垂直排列显示 |
| 物品 | 仅保留风铃，E 捡起/放下（和之前逻辑完全一样） |
| 模型加载 | 优先使用 Voxel Runtime buildGeometry；不可用时 fallbackBuildGeometry 支持 box/sphere/cylinder/cone/icosahedron |
| Tag 标签 | 所有实体上方浮动 Canvas Sprite，显示名字 + tag + 居民信息 |
| 点击检查 | 点击任意物体闪白 + console 输出完整数据，5px 拖拽阈值区分 click/drag |

### Voxel / AI 接入点

| 触发 | 调用 | 输出 |
|------|------|------|
| 模型生成 | `POST /api/generate/model` (SSE) 或 `/api/generate/batch` (JSON) | modelJson |
| 动画生成 | `POST /api/generate/animation` | Motion Plan JSON |
| Runtime 模块 | `GET /api/templates/module.js` → `import()` | voxelStudioRuntime |
| 宠物间对话 | `ai/dialogueGen.js → generatePetDialogue()` | 5 轮对话 |
| 宠物寻主对话 | `ai/dialogueGen.js → generatePlayerDialogue()` | 倾诉文本 |
| 亲密度5物品 | `ai/milestoneGen.js → generateMilestoneItem()` | `{name, tags, color}` |
| 亲密度10环境 | `ai/milestoneGen.js → generateMilestoneEnv()` | `{name, tags, color}` |

API: `sk-49e1871170a442bcb963cc45f68a4988` @ `https://api.deepseek.com/v1/chat/completions`

---

## 文件架构（所有修改必须遵守）

### 目录树

```
agentworld-test/
├── index.html
├── package.json                # vite + three
├── public/                     # 静态资源
│   └── generated/              # AI 生成的模型和动画 JSON
│       ├── models/             # 装饰/树木/建筑/宠物模型
│       ├── animations/         # 动画计划
│       └── pets/               # 宠物模型 + 动画
└── src/
    ├── main.js                 # 启动器+调度器，只做模块组合和动画循环
    ├── style.css               # 全屏canvas
    ├── input/                  # 原始输入捕捉（纯数据，无THREE依赖）
    │   └── keyboard.js         # isKeyDown(), consumeKeyPress()
    ├── core/                   # Three.js基础设施
    │   ├── scene.js            # createScene()
    │   ├── camera.js           # ThirdPersonCamera类（左键拖拽旋转，getHorizontalAngle）
    │   ├── renderer.js         # createRenderer()
    │   ├── controls.js         # ⚠️已弃用
    │   └── lights.js           # createLights(scene)
    ├── world/                  # 世界与地形
    │   └── terrain.js          # 单位面积 + 单位环境(10×10) + paintUnitArea()染色
    ├── entities/               # 游戏实体（mesh+数据+行为）
    │   ├── Player.js           # 玩家(蓝色圆锥)，WASD直接向量移动，heldItem库存
    │   ├── Pet.js              # 宠物，状态机/亲密度/对话/变色/动画/召回
    │   ├── Environment.js      # 环境(玛扣大森林)，tag收集(频率Top5)
    │   ├── Item.js             # 物品(三棱锥)，可捡起/放下
    │   └── StaticEntity.js     # 静态实体(装饰/树/建筑)，不可移动，呼吸动画
    ├── interaction/            # 玩家↔游戏对象交互
    │   ├── interact.js         # 统一E键路由器（掉物>寻主>宠物互动>召唤/召回>静态交互>捡物）
    │   ├── generation.js       # ⚠️已弃用（F键生成已移除）
    │   ├── petDialogue.js      # 宠物间对话+寻主检测
    │   ├── interactionHint.js  # 屏幕底部DOM交互提示UI
    │   ├── pickup.js           # ⚠️旧版捡取（已被interact.js替代）
    │   └── raycast.js          # 点击检测，区分click/drag(5px阈值)
    ├── ai/                     # AI服务层
    │   ├── api.js              # callAI(systemPrompt, userPrompt) — DeepSeek
    │   ├── modelLoader.js      # 模型构建+动画播放，fallbackBuildGeometry，Voxel Runtime
    │   ├── petGen.js           # 宠物生成prompt+color映射
    │   ├── dialogueGen.js      # 宠物对话生成
    │   └── milestoneGen.js     # 亲密度物品/环境生成
    ├── game/                   # 游戏数据配置
    │   ├── gameData.js         # HOUSE_PET_CONFIGS, PET_CONFIGS, ITEM_CONFIGS, 对话模板
    │   └── tagLibrary.js       # 30环境tag + 100物品tag
    ├── ui/                     # UI组件
    │   ├── TagLabel.js         # 浮动标签(Canvas Sprite)，三行渲染
    │   └── SpeechBubble.js     # 对话气泡(Canvas Sprite)
    └── assets/                 # 静态资源（空）
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
4. **田园商店模型** — 后端多次生成失败（AI空返回/内部错误），`country_shop.json` 未生成，目前显示黄色方块 fallback。
5. **生成脚本分散** — `scripts/` 下有多个生成脚本（generate-decor.mjs, generate-house-pets.mjs, generate-pet-house.mjs 等），缺少统一的批量生成入口。

---

## 后续开发规划

> **优先级原则：** 图纸 > 策划案 > 历史文档。以下规划以 `image.md`（Excalidraw 架构图）为最高层级理解。

### 架构总览：Tag = 卡牌 = DNA

游戏内所有 object 由 **tag** 组成，tag 以 **卡牌** 形式表现，是 object 的 DNA。
- **环境** = 牌组（core_tag ×3 + more_tag ×N）
- **物品/建筑** = 单张卡牌（携带 tag，放置后 refine 环境牌组）
- **宠物** = 原住民/游客（由环境牌组生成，自带 tag DNA，反作用于环境）
- **语言/情绪/关系/事件** = 动态 tag，可传递、叠加、演化

### 系统演进路线图

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

### 现有系统迁移要点

- **`terrain.js`**：已实现 10×10 离散地块 + paintUnitArea()。需进一步支持地块锁定/解锁。
- **`Environment.js`**：已改为 tag 频率收集（Top5）。需增加 `envType` 和 `explored` 状态。
- **`Pet.js`**：已有状态机（wandering/seeking_player/chatting/returning_home/recall_pause）+ 召回系统。需增加 `working` 状态和 `ability` 字段。
- **`StaticEntity.js`**：已有呼吸动画 + 自定义 scale。功能性建筑逻辑需单独模块。
- **`interact.js`**：E 键优先级已涵盖召唤/召回/静态交互。需新增"指派工作/打开建筑"。
- **`generation.js`**：已弃用（F键生成移除）。宠物生成逻辑保留在 gameData.js 中。

### 新增模块规划

| 模块 | 建议目录 | 职责 |
|------|----------|------|
| 宠物工作系统 | `src/game/work/` | 工作类型定义、派遣、收益计算 |
| 宠物能力系统 | `src/game/abilities.js` | 特殊能力定义、能力-地形解锁映射 |
| 制造/配方系统 | `src/game/crafting.js` | 配方定义、资源消耗、制造队列 |
| 收集仓/背包 | `src/game/inventory.js` | 全局资源存储、玩家背包扩展 |
| 环境开拓系统 | `src/world/exploration.js` | 地块锁定/解锁、开拓条件检查 |
| 战斗系统 | `src/game/combat.js` | 战斗规则、伤害计算 |
| 宠物关系网 | `src/game/socialGraph.js` | 宠物间关系矩阵 |
| 图鉴系统 | `src/game/codex.js` | 收集进度、组合奖励判定 |

---

## 关键文件

| 文件 | 重要性 | 原因 |
|------|--------|------|
| `src/ai/modelLoader.js` | ★★★ | 模型构建+动画播放核心。buildModelFromJson + fallbackBuildGeometry |
| `src/entities/Pet.js` | ★★★ | 最复杂的实体：状态机(6种状态)、亲密度、对话、动画、变色、召回 |
| `src/entities/Environment.js` | ★★ | tag系统核心，tag频率收集(Top5)，居民追踪 |
| `src/interaction/interact.js` | ★★ | E键统一路由，6级优先级（掉物>寻主>宠物>召唤/召回>静态>捡物） |
| `src/interaction/petDialogue.js` | ★★ | 对话触发+寻主检测，异步AI调用 |
| `src/entities/StaticEntity.js` | ★★ | 不可移动实体（装饰/树/建筑），呼吸动画，自定义scale |
| `src/game/gameData.js` | ★★ | HOUSE_PET_CONFIGS + PET_CONFIGS + ITEM_CONFIGS + dialogue |
| `src/world/terrain.js` | ★★ | 单位环境(10×10) + paintUnitArea() + getGridWorldPosition() |
| `src/core/camera.js` | ★★ | ThirdPersonCamera：左键拖拽旋转、球面坐标、getHorizontalAngle() |
| `src/entities/Player.js` | ★ | WASD直接向量计算移动，forward=camera look direction |
| `src/ui/TagLabel.js` | ★ | 三行Canvas标签渲染 |
| `src/ui/SpeechBubble.js` | ★ | 对话气泡渲染 |
| `src/interaction/interactionHint.js` | ★ | 屏幕底部DOM提示UI |

---

## 注意事项

- 云服务器仅开放端口 5173 和 8082，其他端口需通过Vite proxy
- 本地开发 vs 服务器部署性能无差异（渲染在本地GPU）
- `public/generated/` 下所有 JSON 文件是预设模型，勿删
- Voxel Runtime通过Vite proxy加载，路径 `/api/voxel/...`
- 后端编辑器通过 `/studio/` proxy 访问
- DeepSeek API key 在 `src/ai/api.js`
- Voxel Studio API 通过 Vite proxy `/api/voxel/` → `https://voxel-studio-backend.zeabur.app`
- 单位面积颜色通过 `paintUnitArea()` 管理，不要在 createUnitEnvironment 时硬编码
- 静态实体放置必须用 `placeStaticEntity()` 辅助函数

---

## Dependencies

**当前：**
- **three** (`^0.184.0`) — 3D 渲染
- **vite** (`^8.0.12`) — 开发与构建

**AI服务：**
- **DeepSeek API** (`api.deepseek.com`) — 文本侧AI：宠物概念/对话/里程碑物品/环境
- **Voxel Studio API** (`voxel-studio-backend.zeabur.app`) — 3D侧AI：模型生成/动画生成/Runtime引擎

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
