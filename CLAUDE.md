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

## 当前完成状态（2026-06-13，本轮后）

### 当前玩法循环

```
玩家在 3×3 世界网格（9个单位环境）上漫游
  |
  ├─ E靠近宠物小屋 → 召唤宠物（马扣/扶摇/momo）在旁边一格生成
  |       └─ E再次靠近小屋 → 宠物走回旁边一格 → 停顿 → 消失（可重新召唤）
  |
  ├─ 靠近宠物 → E抚摸 → 亲密度+1
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
  |       ├─ 走向目标 → 转圈 → 调用后端生成新模型替换旧模型
  |       ├─ 从所有参与宠物的 tag 中各抽一个，合并后追加给被 refine 目标
  |       └─ StaticEntity 被 refine 后获得 AI 生成交互动画，按 E 播放
  |
  ├─ 进入外围环境 → 右上角提示 "按P展示/隐藏该地形内容"
  |       └─ 按O全局显示/隐藏所有外围环境（一键回到单中心场景）
  |
  └─ 屏幕底部显示 "xxx 按E交互/唤起/召回/抚摸/捡起/呼喊跟随" 提示
```

### 世界网格系统（3×3）

以中心环境（玛扣大森林）为核心，周围布置 8 个差异化环境，间距 23。

```
待售空地    | 繁华城市    | 农村池塘
------------|-------------|------------
暗黑森林    | 玛扣大森林  | 田园牧场
------------|-------------|------------
危险区域    | 另一片森林  | 干旱沙地
```

每个环境内部：中心 `[5,5]` 放置主题 `Environment` 模型；3-4棵树（全尺寸）；1-3个宠物小屋（半尺寸）；2-4个装饰物（半尺寸）。地块染色逻辑保持一致（树=绿/装饰=黄/小屋=红）。

**按需加载机制（性能优化）：**
- 外围 8 个环境的物品默认隐藏（`mesh.visible = false`），只保留灰色地块 + 环境中心模型
- `O` 键：全局切换所有外围环境的显隐（一键显示/一键回到中心）
- `P` 键：在当前所在的外围环境内，单独切换该环境物品的显隐
- 实际可见性公式：`visible = outerEnvGlobalVisible && envVisibleState[i]`
- 物品按环境分组存储于 `envEntityGroups[9]`，状态记录在 `envVisibleState[9]`
- 交互提示自动跳过 `visible=false` 的实体

### 已实现系统

| 系统 | 说明 |
|------|------|
| 世界网格 | 3×3 单位环境矩阵，间距 23。每个环境 10×10 离散地块 |
| 单位面积 | 2×2×0.1 灰色体块，顶部齐平 Y=0。通过 `paintUnitArea()` 按类型染色 |
| 环境染色 | 树=浅绿 / 装饰=浅黄 / 宠物小屋=浅红 / 默认=灰色 |
| 环境实体 | 9 个环境各有一个中心 `Environment` 模型（tree_marko/pond/grassland/forest/trainer/sun_stone 等） |
| 玩家 | 蓝色圆锥，WASD 直接向量移动，左键拖拽旋转，滚轮缩放 |
| 装饰品 | ps5/ns2/雷霆大雪绒/苔藓灯/风铃/太阳石/训练桩等（StaticEntity），半尺寸，不可移动，按 E 呼吸动画 |
| 树木 | 魔女/yafo/金鱼/tree_rand_1~6 等（StaticEntity），全尺寸，绿色单位面积 |
| 宠物小屋 | 马扣的家/扶摇的家/momo的家 + 各环境主题小屋（StaticEntity），半尺寸，红色单位面积 |
| 宠物召唤/召回 | E靠近小屋 → 在旁边一格召唤；再次E → 走回旁边一格 → 停顿 2s → 消失 |
| 宠物 | 马扣（小马行走）/扶摇（小鸟飞翔）/momo（团子行走），模型+idle/walk动画，50%缩放，完整亲密度/状态机 |
| 宠物跟随系统 | H 呼喊跟随（可多宠）；J 解散全部；R 指使 refine。跟随中宠物保持约 3 单位距离 |
| 宠物行为判断 | 每5秒：45%行走/45%idle/10%去隔壁环境游玩（60s后自动回家）；每30秒：20%回家/50%与装饰交互/30%找其他宠物聊天 |
| 宠物 refine | 万物皆可 refine：装饰/树木/环境/建筑/宠物/物品。多宠同时 refine 时共享一次后端调用，合并所有参与宠物的 tag |
| 宠物动画 | 优先 Voxel Runtime（evaluateMotion）；`tilt` 类型已禁用（会导致卡死）；不可用 fallback 客户端 sine wave |
| 按需加载 | `O` 全局开关 + `P` 单环境开关；按环境分组 `envEntityGroups`；进入环境检测 `getCurrentEnvIndex` |
| 互动提示 UI | 屏幕底部 DOM overlay；右上角 `globalHintEl`（O键）+ `toggleHintEl`（P键） |
| 物品 | 仅保留风铃，E 捡起/放下 |
| 模型加载 | 优先 Voxel Runtime buildGeometry；不可用时 fallbackBuildGeometry（box/sphere/cylinder/cone/icosahedron） |
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
4. **生成脚本分散** — `scripts/` 下有多个生成脚本（generate-decor.mjs, generate-house-pets.mjs, generate-pet-house.mjs 等），缺少统一的批量生成入口。
5. **环境内容同质化** — 8 个外围环境复用现有模型 JSON（tree_rand_1~6, pet_house 等），主题差异化主要靠标签和颜色。后续应为主题环境生成专属模型。
6. **宠物对话系统** — ⚠️ 暂时关闭：`petDialogue.js` 中 `_checkPetChats` 和 `_checkSeekPlayer` 已注释掉，避免宠物贴脸时反复触发对话。后续修复对话检测逻辑后恢复。
7. **宠物召唤去重** — 已修复：`interact.js` 通过 `pets.includes(data.pet)` 防止重复 push。

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

- **`main.js`**：已扩展为 3×3 世界网格 + 按需加载系统。新增环境只需在 `envGridConfigs` 和 `envLayouts` 中添加配置。
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
| `src/main.js` | ★★★ | 世界网格初始化、环境分组、按需加载、动画循环主调度。当前最复杂的启动文件 |
| `src/ai/modelLoader.js` | ★★★ | 模型构建+动画播放核心。buildModelFromJson + fallbackBuildGeometry |
| `src/entities/Pet.js` | ★★★ | 最复杂的实体：状态机(8种状态)、亲密度、动画、变色、召回、跟随、refine、万物 refine |
| `src/entities/Environment.js` | ★★ | tag系统核心，tag频率收集(Top5)，居民追踪，支持被 refine |
| `src/interaction/interact.js` | ★★ | E/H/J/R 键统一路由。E:6级优先级；H:多宠跟随；J:解散；R:统一 refine |
| `src/interaction/petDialogue.js` | ★★ | ⚠️ 暂时关闭：对话触发+寻主检测已注释掉 |
| `src/entities/StaticEntity.js` | ★★ | 不可移动实体（装饰/树/建筑），呼吸动画/AI交互动画，自定义scale，支持被 refine |
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
