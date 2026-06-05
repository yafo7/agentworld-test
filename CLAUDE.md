# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 项目定位

**宠物庭院师** — 3D 模拟养成类游戏，基于 Three.js + Vite。

**一句话定义：** 玩家不是"抓宠物然后养"，而是"先创造一个值得生命到来的地方，然后观察什么样的生命愿意住进来"。

**背景故事：** 玩家作为一名待业青年画家，偶然在求职 app 上看到"宠物庭院师"的招聘，决定前往试试。

**关键词：** 筑巢、等待、邂逅、观察、照顾、共生、变化、收藏、产生故事。

**核心技术：** 文字产生 objects → 围绕 3D 自由创造构建以"创造"为核心的玩法系统。

---

## Commands

```
npm run dev      # Start Vite dev server (add --host 0.0.0.0 for LAN/public access)
npm run build    # Production build to dist/
npm run preview  # Preview production build locally
```

---

## 文件架构（所有修改必须遵守）

### 目录树

```
agentworld-test/
├── index.html                  # 浏览器入口，<div id="app"> + <script type="module" src="/src/main.js">
├── package.json                # vite + three
├── public/                     # 静态资源（favicon, icons）
└── src/
    ├── main.js                 # 启动器 + 调度器，只做模块组合和动画循环
    ├── style.css               # 全屏 canvas 样式
    ├── input/                  # 原始输入捕捉（纯数据，无 THREE 依赖）
    │   └── keyboard.js         # 按键状态追踪
    ├── core/                   # Three.js 基础设施
    │   ├── scene.js            # THREE.Scene 工厂
    │   ├── camera.js           # ThirdPersonCamera 类（第三人称跟随 + 鼠标轨道）
    │   ├── renderer.js         # WebGLRenderer 工厂，挂载到 #app
    │   ├── controls.js         # ⚠️ 已弃用，不被任何文件 import
    │   └── lights.js           # 环境光 + 方向光
    ├── world/                  # 世界与地形
    │   └── terrain.js          # 灰色地面 PlaneGeometry
    ├── entities/               # 游戏实体（mesh + 数据 + 行为）
    │   ├── Player.js           # 玩家（蓝色圆锥），WASD 移动
    │   └── Pet.js              # 宠物类 + PET_CONFIGS demo 数据
    ├── interaction/            # 玩家 ↔ 游戏对象 交互
    │   └── raycast.js          # 点击检测，区分 click/drag，多宠物支持
    └── assets/                 # 静态测试资源（当前为空）
```

### 每个文件的确切职责与接口

#### `src/input/keyboard.js`

- **无外部依赖**（不依赖 THREE）
- 模块顶层 keydown/keyup listener，维护 `keys` 状态对象
- 导出：`isKeyDown(key: string): boolean` — 每帧轮询，大小写不敏感
- 仅为 `Player.js` 提供输入源

#### `src/entities/Player.js`

- **依赖：** `THREE`、`input/keyboard.js → isKeyDown`
- 导出：`class Player`
- 构造：`ConeGeometry(0.5, 1.5, 8)`，蓝色 `0x4488ff`，位置 `(0, 0.75, 0)`
- 公开接口：
  - `player.mesh: THREE.Mesh` — 供 scene.add 和摄像机跟随
  - `player.update(dt: number, cameraAngle: number)` — 每帧调用，WASD 方向由 cameraAngle 旋转
- 私有：`_speed = 5` units/s

#### `src/core/camera.js`

- **依赖：** `THREE`
- 导出：`class ThirdPersonCamera`
- 构造时自动在 `<canvas>` 上绑定 mousedown/mousemove/mouseup/wheel
- 球坐标系统：`distance`(3–20), `theta`(垂直 0.1~~PI/2), `phi`(水平自由)
- 公开接口：
  - `camera.camera: THREE.PerspectiveCamera` — main.js 取引用用于渲染和 resize
  - `camera.update(targetPos: THREE.Vector3)` — 每帧调用，跟随 targetPos + lookOffset(0, 1.5, 0)
  - `camera.getHorizontalAngle(): number` — 返回 phi，供 Player 计算移动方向
  - `camera.wasDragging: boolean` — 当前帧是否在拖拽
- 鼠标灵敏度：orbit 0.005，zoom 0.01

#### `src/core/scene.js`

- **依赖：** `THREE`
- 导出：`createScene(): THREE.Scene`
- 创建 Scene，背景色 `0xa0a0a0`

#### `src/core/renderer.js`

- **依赖：** `THREE`
- 导出：`createRenderer(): THREE.WebGLRenderer`
- 创建 WebGLRenderer(antialias)，setSize 为窗口尺寸，appendChild 到 `#app`

#### `src/core/lights.js`

- **依赖：** `THREE`
- 导出：`createLights(scene: THREE.Scene): void`
- 添加 AmbientLight(0xffffff, 0.5) + DirectionalLight(0xffffff, 1) 到 scene
- **注意：** 副作用函数，直接修改传入的 scene

#### `src/core/controls.js`

- **⚠️ 已弃用。** 原来的 OrbitControls 已被 ThirdPersonCamera 替代
- 不被任何文件 import，可以安全删除

#### `src/entities/Pet.js`

- **依赖：** `THREE`
- 导出：
  - `PET_CONFIGS: Array<PetConfig>` — 三只 demo 宠物的静态数据
  - `class Pet` — 宠物实体
- Pet 构造参数 `PetConfig`：
  ```
  name: string, color: number(hex), tags: string[], personality: string,
  likes: string[], dislikes: string[], habits: string[], originSignature: string[]
  ```
- 构造时创建：`BoxGeometry(1,1,1)` + `MeshStandardMaterial({color})`，mesh.name = name
- 运行时状态：`mood`(neutral|happy|curious|scared), `trust`(0–100), `affection`(0–100), `memories[]`
- 公开接口：
  - `pet.mesh: THREE.Mesh` — 供 scene.add 和 raycast
  - `pet.move(): void` — 每帧调用，随机游走（speed 0.02）
  - `pet.getInfo(): object` — 返回 identity + state 摘要供 console/UI 展示
- PET_CONFIGS 是临时的 demo 数据，后续由 AI 生成管线替代

#### `src/world/terrain.js`

- **依赖：** `THREE`
- 导出：`createTerrain(): THREE.Mesh`
- PlaneGeometry(20, 20)，灰色 `0x808080`，DoubleSide，rotation.x = -PI/2

#### `src/interaction/raycast.js`

- **依赖：** `THREE`
- 导出：`setupRaycast(camera: THREE.Camera, pets: Pet[]): void`
- 内部绑定 mousedown/mouseup，拖拽检测阈值 5px（区分 click 与 camera drag）
- 命中检测：`raycaster.intersectObjects(pets.map(p => p.mesh))`
- 命中后：变色 + 弹跳动画 + `console.log(pet.getInfo())`
- **注意：** 这是交互路由的雏形。后续扩展时：
  - raycast 只负责命中检测 + 对象类型判断
  - 具体行为分发到 `petInteraction.js` / `environmentInteraction.js` / `itemInteraction.js`

#### `src/main.js`

- **依赖：** `THREE`、所有上述模块
- 职责：**只做模块组合和动画循环，禁止放入任何业务逻辑**
- 初始化顺序：
  1. 创建 scene、renderer、camera(ThirdPersonCamera)、lights
  2. 创建 terrain、player、pets（从 PET_CONFIGS 批量 new Pet）
  3. setupRaycast(camera, pets)
  4. 启动动画循环
- 动画循环（每帧）：
  1. `clock.getDelta()` → dt（cap 0.1s）
  2. `player.update(dt, camera.getHorizontalAngle())`
  3. `pets.forEach(p => p.move())`
  4. `camera.update(player.mesh.position)`
  5. `renderer.render(scene, camera.camera)`
- resize listener：更新 camera aspect + renderer size

#### `src/style.css`

- 无 margin、无滚动条、`#app` 满视口、canvas block 显示

#### `index.html`

- `<div id="app">` 挂载容器 + `<script type="module" src="/src/main.js">`

### 模块依赖图

```
main.js
  ├── style.css
  ├── THREE
  ├── core/scene.js        → THREE
  ├── core/renderer.js     → THREE
  ├── core/camera.js       → THREE (self-binds mouse/wheel on canvas)
  ├── core/lights.js       → THREE
  ├── world/terrain.js     → THREE
  ├── entities/Player.js   → THREE, input/keyboard.js
  ├── entities/Pet.js      → THREE
  └── interaction/raycast.js → THREE
```

**关键约束：`input/` 层不依赖 THREE，`entities/` 不依赖 `core/`，`interaction/` 是 entities 和 core 之间的桥。**

### 添加新功能时必须遵守的规则

1. **`main.js`** 是启动器 + 调度器。禁止放入 AI 请求、进化逻辑、动画状态机、地形生成、业务数据。
2. **`core/`** 每个文件只负责一个 Three.js 概念（场景/相机/渲染/光照）。纯基础设施，不含游戏逻辑。
3. **`input/`** 原始输入捕捉层。只追踪硬件状态，不对输入做语义解释。不含 THREE 依赖。
4. **`entities/`** 游戏实体类。每个类包含 mesh + 数据 + update 方法。对外暴露 `.mesh` 供 scene.add 和 raycast。
5. **`interaction/`** 负责"检测玩家对什么做了什么"。命中检测和业务响应需要分离：raycast 只做命中，具体行为分发到对应的 interaction 子模块。
6. **`world/`** 负责地形和环境。后续 Environment 对象记录世界语义特征（type, temperature, humidity, keywords），影响宠物生成。
7. **AI 生成资源** 放 `public/generated/`（pets/, terrains/, animations/, textures/），不放 `src/assets/`。
8. **所有 AI 输出必须结构化**。自由文本可以自由，状态变化（tag 变更、关系变化、记忆）必须落入系统 schema。
9. **PET_CONFIGS 是临时 demo 数据。** 不要在 PET_CONFIGS 上构建正式功能，它会在 Phase 2 被 AI 生成管线替代。

---

## 架构扩展模式（每层如何从当前状态演进）

### 核心哲学

架构的**"不变"**与**"变"**：

| 不变的 | 变的 |
|--------|------|
| 分层隔离（input / core / entities / world / interaction 互不越界） | 每层内部文件数量可以随复杂度增长 |
| main.js 永远是启动器+调度器，不写业务 | 动画循环内部可以从直接调用演进为 Manager 统一调度 |
| 每个实体对外暴露 `.mesh` | 实体内部可以拆成 Factory / Loader / Animator / Behavior / State |
| interaction 层只做检测+分发 | 分发目标可以从 1 个文件拆成 3 个（pet / environment / item） |
| AI 资源放 `public/generated/` | 子目录随资源类型增加 |

### `core/` 层扩展模式

**原则：** 每个文件承担一个 Three.js 概念。概念独立就文件独立。

**当前 → 未来：**

| 文件 | 当前 | 扩展方向 |
|------|------|----------|
| `scene.js` | 灰色背景 | 天空盒、雾效、环境贴图、主题背景（森林/荒漠/海岛）。但始终只负责 Scene 对象 |
| `camera.js` | 第三人称跟随 | 宠物特写镜头、生成展示镜头、多宠物自动构图。如果摄像机类型超过 2 种，拆 `cameras/` 子目录 |
| `renderer.js` | 基础 WebGLRenderer | **性能控制入口：** pixelRatio、阴影、色彩空间、后处理、移动端降级。AI 模型加载后压力会增大，这里是优化关键 |
| `lights.js` | 环境光+方向光 | 主题光照（火山偏红、雪地偏蓝）、日夜系统、进化特效光。如果光照逻辑超过 3 种主题，可拆 `lights/` 子目录或合并到 `Environment` |

### `entities/` 层扩展模式

**原则：** Pet = 模型 + 动画 + 状态 + 行为 + 成长 + 交互。每个维度最终都有独立文件。

**当前状态：** `Pet.js` 一个文件同时包含数据、视觉、移动逻辑。

**拆分信号（当满足任一条件时立即拆分）：**
- 模型加载逻辑超过 10 行 → 拆出 `PetModelLoader.js`
- 动画状态超过 2 种 → 拆出 `PetAnimator.js`
- 行为规则超过 3 种 → 拆出 `PetBehavior.js`
- 运行时状态字段超过 5 个 → 拆出 `PetState.js`

**拆分后的职责链：**
```
PetFactory（根据 AI 数据 new Pet）→ PetModelLoader（加载 GLB）→ Pet（核心类）
  ├── PetAnimator（idle/walk/jump/interact）
  ├── PetBehavior（游走/跟随/探索/休息）
  ├── PetEvolution（环境驱动分支进化）
  └── PetState（mood/hunger/trust/memories）
```

**PetState 未来字段参考（不走等级/攻击/防御）：**
```
element: string       # 元素倾向
size: string          # 体型
speed: number         # 移动速度
mood: string          # 当前心情
hunger: number        # 饥饿度
energy: number        # 精力
trust: number         # 对玩家的信任
affection: number     # 亲密度
environmentAdaptability: string[]  # 适应的环境类型
```

### `world/` 层扩展模式

**原则：** world 不只是地形 mesh，更是"世界的语义层"。

**当前状态：** `terrain.js` 是固定灰色平面。

**扩展模式：** 地形从固定 mesh → 可加载模型 → 附带语义数据。

```
world/
├── terrain.js            # 地形创建（已有，逐渐变为工厂入口）
├── TerrainLoader.js      # 加载 AI 生成的地形 GLB/高度图
├── TerrainGenerator.js   # 根据 prompt 生成地形参数
├── Environment.js        # ★ 核心新增：世界的语义描述
└── worldState.js         # 全局世界状态（当前时间、天气、事件）
```

**Environment 数据结构（影响宠物生成和进化）：**
```js
{
  type: 'forest',           // 地形类型
  temperature: 22,          // 温度
  humidity: 0.8,            // 湿度
  brightness: 0.6,          // 亮度
  keywords: ['moss', 'tree', 'soft light'],
  mood: 'peaceful',         // 氛围
  aiPrompt: 'a peaceful glowing forest terrain'
}
```

Environment 的语义特征直接参与小窝签名计算，是 tag 系统中"环境 tag"的数据来源。

### `interaction/` 层扩展模式

**原则：** 命中检测和业务响应严格分离。

**当前状态：** `raycast.js` 同时做检测和响应（变色+弹跳+log）。

**扩展模式：**
```
interaction/
├── raycast.js              # ★ 只做命中检测：对谁、在哪个点、什么对象类型
├── petInteraction.js       # 点击宠物 → 信息面板、对话、投喂
├── environmentInteraction.js # 点击地形 → 采集环境特征
├── itemInteraction.js      # 点击物品 → 拖拽、触发宠物反应
├── selection.js            # 框选多宠物
└── input.js                # 统一输入管理（键盘+鼠标+触控）
```

**raycast.js 的未来形态：** 检测到 hit 后，根据 `hit.object.userData.type` 判断对象类型，然后调用对应的 interaction 模块。不在 raycast 里写任何具体响应逻辑。

### `main.js` 动画循环的演进

**Phase 1-2（当前）：** 直接迭代
```js
pets.forEach(p => p.move());
```

**Phase 3-5（多宠物 + 系统层）：** 通过 Manager 统一调度
```js
petManager.update(dt);           // 批量更新所有宠物
interactionSystem.update(dt);    // 处理四方互动事件
evolutionSystem.update(dt);      // 检查进化条件
```

**PetManager 职责：** 保存所有宠物、批量 update、查找最近宠物、管理宠物间距离和关系、控制生成/销毁。

**过渡条件：** 当宠物数量 > 5 或需要宠物间互动时，引入 PetManager。

### UI 层策略

**当前：** 无 UI，仅 console.log。

**当需要 UI 时：**
- **轻量 UI**（按钮、状态条、prompt 输入框）→ `src/ui/` 目录，原生 DOM 操作
- **复杂 UI**（面板、列表、图鉴、小剧场）→ 引入 React/Vue/Svelte，Three.js 只管 3D

```
ui/
├── Hud.js              # 状态条
├── PromptPanel.js      # 输入框
├── PetPanel.js         # 宠物信息面板
├── NestPanel.js        # 小窝状态面板
└── styles.css
```

**原则：** Three.js 渲染 3D 世界，UI 框架管理 2D 面板。两者不混合。

### 资源管理策略

```
src/assets/              # 开发期静态资源（测试模型、贴图、图标）
public/generated/        # AI 运行时生成的资源
├── pets/               # 宠物 GLB/GLTF
├── terrains/           # 地形模型
├── animations/         # 动画文件
└── textures/           # 贴图
```

如果 AI 生成量大，资源由后端/对象存储管理，前端只拿 URL 加载。

---

## 核心设计原则

### 游戏循环（绝对核心）

```
布置环境 → 吸引宠物 → 生成宠物 → 照顾宠物、建立关系 → 获得新能力/新线索 → 布置更复杂环境
```

**三层循环：**

| 层级 | 循环内容 | 时间尺度 |
|------|----------|----------|
| 短期 | 放置物品 → 小窝 tag 变化 → 已有宠物产生反应 → 继续微调 | 几分钟 |
| 中期 | 设计主题小窝 → 吸引未知宠物 → AI 生成 → 新宠物出现 → 观察交互 | 一次游戏会话 |
| 长期 | 多次生成 → 宠物与环境相互影响 → 宠物之间形成社交网络 → 解锁新 tag → 打造更棒的主题小窝 | 多日/多次游玩 |

### 游戏目标

1. **创造目标环境** — 用 tag 组合调配小窝生态
2. **吸引想要的宠物** — 看懂 tag 线索，设计主题吸引特定类型
3. **培养特定宠物** — 照顾、互动、观察成长
4. **与宠物互动** — 对话、投喂、环境调整
5. **观察宠物之间的关系** — 社交网络、喜欢/讨厌、共同事件
6. **发展壮大庭院** — 更多种类宠物形成生态群落

---

## Tag 系统（游戏底层 DNA）

Tag 决定一个 object 的特性以及它如何影响世界。

### Tag 的七种来源

| 类型 | 说明 | 示例 |
|------|------|------|
| **环境 tag** | 地形、天气、时间、氛围 | 潮湿、温暖、夜晚、森林 |
| **物品 tag** | 可放置物件自带 | 微光（苔藓灯）、柔软（叶床） |
| **宠物 tag** | 宠物自身特征和向外散发的属性 | 发光、胆小、夜行 |
| **语言 tag** | 玩家自由输入的描述 | 温柔、安全、神秘 |
| **情绪 tag** | 玩家和宠物共同营造 | 安心、好奇、孤独 |
| **关系 tag** | 宠物之间的社交状态 | 信任、依赖、竞争 |
| **事件 tag** | 游戏内发生的事件遗留 | 被安慰、被守护 |

### Tag 的组合与传递

必须符合玩家第一直觉。组合示例：

```
潮湿 + 发光 + 夜晚    → 吸引夜行/水系/发光特征生物
柔软 + 安全感 + 安静  → 吸引胆小/幼体/治愈系生物
金属 + 雷雨 + 高能量  → 吸引电系/机械感/活跃生物
花香 + 阳光 + 热闹    → 吸引社交型/草系/飞舞型生物
```

**因果链（玩家必须可理解）：**
```
因为我这样布置 → 所以它来了
因为我这样说话 → 所以它信任我
因为它喜欢这里 → 所以它学会了这个动作
因为这个动作改变环境 → 所以新生命被吸引
因为它们一起生活 → 所以产生了新故事
```

---

## 核心玩法系统

### 1. 小窝系统（游戏主战场）

小窝是一个"生态容器"，由以下元素组成：
- **物品** — 石头、花、灯、枕头、风铃、水池、树洞等
- **环境** — 雨天、雾气、阳光、夜晚、微风、温度、湿度
- **语言** — 玩家输入的一句话描述
- **情绪** — 温暖、孤独、神秘、热闹、危险、安全
- **已有宠物** — 当前居住者也影响小窝气质

这些共同形成**小窝签名（Nest Signature）**，用于三件事：
1. 判断吸引什么宠物
2. 生成宠物外观和性格
3. 影响宠物后续行为和进化

### 2. 宠物生成系统

```
小窝签名 → AI 生成宠物概念草案 → 校验生态一致性
→ 生成 3D 模型 prompt → 调用生成服务 → 生成动作 → 生成性格/喜好/习惯 → 宠物作为访客进入
```

**生成内容必须包含：** 模型/动作、特征（基本行为逻辑）、性格、喜好、互动 tag。
**等待生成必须游戏化：** 预兆 → 剪影 → 叫声 → 试探 → 正式登场。不能是 loading。

### 3. 宠物养成系统

养成不走数值（不搞等级/攻击/防御），走：
- **形态成长** — 幼体、成熟体、环境变体、情绪变体
- **动作成长** — 学会蹭人、唱歌、挖洞、发光、筑巢、跳舞
- **关系成长** — 亲近、信任、依赖、守护、竞争、共鸣
- **记忆成长** — 宠物记住玩家做过的事，在行为里体现
- **生态成长** — 小窝从单一房间变成复杂生态群落

进化不是"变强"，而是"它被你的照顾塑造成了某种样子"。

### 4. 四方互动系统

```
环境  ←→  宠物    （环境影响宠物，宠物动作改变环境）
宠物  ←→  宠物    （对话、互相影响 tag、喜欢/讨厌）
玩家  ←→  宠物    （语言、动作、投喂、环境改变）
tag类 ←→  宠物    （物品/情绪/文字对宠物的影响）
```

### 5. 宠物自由互动系统

系统周期性检查同窝宠物的 tag 相合度、共享偏好、冲突、共同记忆 → 生成小事件（2D 小剧场形式展示）。

---

## 开发阶段

### Phase 1 ✅ 当前阶段 — demo 基础框架
- Three.js 场景 + 第三人称摄像机 + WASD 玩家移动
- 三个占位方块宠物（不同颜色），含完整 tag/性格/喜好数据
- 点击宠物反馈（变色弹跳 + console.log 数据）
- 宠物随机游走

### Phase 2 — AI 生成宠物
```
ai/
├── petGenerationApi.js   # 调用 AI 生成服务
└── generationTask.js     # 任务队列与轮询

entities/ 扩展：
├── Pet.js                # 核心类（已有）
├── PetFactory.js         # 根据 AI 返回数据创建宠物
├── PetModelLoader.js     # 加载 GLB/GLTF
├── PetAnimator.js        # idle, walk, jump, interact
├── PetBehavior.js        # 游走、跟随、探索、休息
├── PetEvolution.js       # 环境驱动的分支进化
└── PetState.js           # 心情、喜好、记忆、信任
```

### Phase 3 — AI 生成地形 + 环境系统
```
world/
├── terrain.js            # 已有
├── TerrainLoader.js
├── TerrainGenerator.js
├── Environment.js        # 环境 type, temperature, humidity, keywords, aiPrompt
└── worldState.js
```

### Phase 4 — 系统层
```
systems/
├── tagSystem.js          # Tag 组合计算与传递
├── nestSystem.js         # 小窝签名合成
├── evolutionSystem.js    # 进化条件判断
├── interactionSystem.js  # 四方互动事件管理
├── behaviorSystem.js     # 宠物行为调度
└── environmentSystem.js  # 环境特征读取与更新
```

### Phase 5 — 多宠物管理
```
entities/
├── PetManager.js         # 批量更新、关系管理、生成/销毁
└── SocialNetwork.js      # 宠物间关系图
```

---

## Dependencies

**当前：**
- **three** (`^0.184.0`) — 3D 渲染
- **vite** (`^8.0.12`) — 开发与构建

**后续将用到（Three.js 官方模块，无需额外安装）：**
- `GLTFLoader` — 加载 AI 生成的 GLB/GLTF 宠物模型
- `DRACOLoader` — 压缩模型解码
- `AnimationMixer` — 宠物动画播放
- `KTX2Loader` — 纹理压缩（可选）

**后续可能新增（npm install）：**
- API client（对接 AI 生成服务）
- 状态管理库（如 zustand 或 pinia）
- UI 框架（如 React/Vue/Svelte，当 2D 面板复杂到一定程度时）

---

## 未明确之前禁止擅自决定的内容

- Tag 的具体数值计算方式
- 宠物进化的具体条件阈值
- 小窝签名合成的权重算法
- UI 布局和交互细节
- 后端 API 接口设计
- 3D 模型生成的具体 prompt 格式
- PET_CONFIGS 之外的宠物数据（Phase 2 才由 AI 管线接管）
