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

## 当前完成状态（2026-06-05）

### 完整玩法循环

```
物品散落 → E捡起 → 走到环境旁→ E放下 → 环境tag实时变化
                                              ↓
                                        按F → AI生成宠物（DeepSeek）
                                              ↓
                              靠近宠物 → E互动 → 亲密度+1
                              ↑                    ↓
                    宠物间对话(10%)          亲密度5→AI生成新物品
                    宠物寻主对话(10%)        亲密度10→AI生成新环境
```

### 已实现系统

| 系统 | 说明 |
|------|------|
| 玩家 | 蓝色圆锥，WASD移动，第三人称跟随摄像机+鼠标轨道 |
| 环境 | 方块体，coreTags + moreTags，浮动标签实时显示。物品靠近→吸收tag；物品移走→失去tag |
| 物品 | 三棱锥，可捡起/放下（E），靠近环境时tag被吸收 |
| 宠物生成 | F键→AI(DeepSeek)根据环境+物品tag创造独特宠物（名字/性格/tag/喜好/颜色） |
| 宠物互动 | 靠近宠物→停下→按E增加亲密度(0-10)，每帧一次 |
| 亲密度系统 | lv5: 颜色变暖+AI生成新物品; lv10: 金色+AI生成新环境 |
| 宠物对话 | 两宠物靠近→50%触发→AI生成5轮对话→气泡展示 |
| 宠物寻主 | 亲密度10后→10%/次检查→主动找玩家→按E→AI生成对话 |
| Tag标签 | 所有实体上方浮动Canvas Sprite，两行显示(名字/tag列表)，实时更新 |
| 点击检查 | 点击任意物体→闪白+console输出完整数据 |

### DeepSeek AI 接入点

| 触发 | 调用 | 输出 |
|------|------|------|
| F键生成宠物 | `ai/petGen.js` | `{name, tags, personality, likes, dislikes, habits, color}` |
| 宠物间对话 | `ai/dialogueGen.js → generatePetDialogue()` | 5轮对话 |
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
└── src/
    ├── main.js                 # 启动器+调度器，只做模块组合和动画循环
    ├── style.css               # 全屏canvas
    ├── input/                  # 原始输入捕捉（纯数据，无THREE依赖）
    │   └── keyboard.js         # isKeyDown(), consumeKeyPress()
    ├── core/                   # Three.js基础设施
    │   ├── scene.js            # createScene()
    │   ├── camera.js           # ThirdPersonCamera类
    │   ├── renderer.js         # createRenderer()
    │   ├── controls.js         # ⚠️已弃用
    │   └── lights.js           # createLights(scene)
    ├── world/                  # 世界与地形
    │   └── terrain.js          # 灰色地面
    ├── entities/               # 游戏实体（mesh+数据+行为）
    │   ├── Player.js           # 玩家(蓝色圆锥)，heldItem库存
    │   ├── Pet.js              # 宠物(方块)，状态机/亲密度/对话/变色
    │   ├── Environment.js      # 环境(方块)，coreTags+moreTags
    │   └── Item.js             # 物品(三棱锥)，可捡起/放下
    ├── interaction/            # 玩家↔游戏对象交互
    │   ├── interact.js         # 统一E键路由器（掉物>寻主对话>宠物互动>捡物）
    │   ├── generation.js       # F键AI生成宠物
    │   ├── petDialogue.js      # 宠物间对话+寻主检测
    │   ├── pickup.js           # ⚠️旧版捡取（已被interact.js替代）
    │   └── raycast.js          # 点击检测，区分click/drag
    ├── ai/                     # AI服务层（DeepSeek）
    │   ├── api.js              # callAI(systemPrompt, userPrompt)
    │   ├── petGen.js           # 宠物生成prompt+color映射
    │   ├── dialogueGen.js      # 宠物对话生成
    │   └── milestoneGen.js     # 亲密度物品/环境生成
    ├── game/                   # 游戏数据配置
    │   ├── gameData.js         # PET_CONFIGS, ITEM_CONFIGS, 环境配置, 对话模板(备用)
    │   └── tagLibrary.js       # 30环境tag + 100物品tag
    ├── ui/                     # UI组件
    │   ├── TagLabel.js         # 浮动标签(Canvas Sprite)
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
8. **`ui/`** — Canvas Sprite组件，自包含，不依赖其他模块
9. **AI生成资源** 放 `public/generated/`，不放 `src/assets/`
10. **AI输出必须结构化** — 自由文本可以自由，状态变化必须落入系统schema

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

1. **模型渲染性能** — 每个mesh独立draw call，90+ mesh的模型（如皮卡丘）渲染压力大。需合并同材质mesh。
2. **模型精度** — 父节点推断已修复（对齐VoxelData.js），但部分复杂动画模板（tilt/wave）仍可能有问题。
3. **物品遮挡** — 森林地面厚度问题已通过删除模型内置地面解决，但新生成的环境可能需要同样处理。
4. **WASD移动** — 基于摄像机方向，但部分用户反馈方向感觉不对（可能因为phi初始角度或摄像机旋转问题）。
5. **亲密度重复触发** — milestone环境/物品生成有防重入，但寻主对话的防重入简单（completedPlayerDialogues map），刷新后重置。

---

## 运行方式

### 开发
```bash
cd agentworld-test
npm install
npm run dev -- --host    # 访问 http://localhost:5173
```

### 部署（服务器）
```bash
nohup npx vite --host 0.0.0.0 > /tmp/vite.log 2>&1 &
# 公网: http://111.230.91.60:5173/
```

### 后端编辑器（独立项目）
```bash
cd ../3d-generate
nohup python3 -m http.server 8000 --bind 0.0.0.0 &
# 通过Vite proxy: http://111.230.91.60:5173/studio/
```

### 预设模型生成
```bash
node scripts/generate-presets.mjs   # 调用Voxel API生成所有预设模型+动画
```

---

## 重要文件

| 文件 | 重要性 | 原因 |
|------|--------|------|
| `src/ai/modelLoader.js` | ★★★ | 模型构建+动画播放核心。buildModelFromJson对齐后端VoxelData.js的父节点推断 |
| `src/ai/voxelApi.js` | ★★ | Voxel API客户端（SSE解析+provider fallback） |
| `src/entities/Pet.js` | ★★★ | 最复杂的实体：状态机、亲密度、对话、动画、变色|
| `src/entities/Environment.js` | ★★ | tag系统核心，居民追踪 |
| `src/interaction/interact.js` | ★★ | E键统一路由，优先级逻辑 |
| `src/interaction/generation.js` | ★★ | 预设优先→AI fallback，通知文字 |
| `src/interaction/petDialogue.js` | ★★ | 对话触发+寻主检测，异步AI调用 |
| `src/ui/TagLabel.js` | ★ | 三行Canvas标签渲染 |
| `src/ui/SpeechBubble.js` | ★ | 对话气泡渲染 |
| `src/game/gameData.js` | ★ | 所有预设配置+PIKACHU_CONFIG |
| `src/game/tagLibrary.js` | ★ | 30环境+100物品tag库 |

### 后端源码（参考，不在本仓库）
- `/home/ubuntu/gamedevelop/3d-generate/` — Voxel Studio前端+后端
- `js/core/VoxelData.js` — **模型解析的真相**（父节点推断、auto-lock、坐标系统）
- `js/core/VoxelRenderer.js` — 渲染器实现

---

## 模型解析要点（从后端源码逆向）

```
VoxelData.js 关键逻辑（第135-183行）：
1. currentGroupId 追踪 —— 遍历meshes时记录最后一个group
2. 父节点推断 —— parentId = m.parent || currentGroupId || null
3. 这意味着没有显式parent的mesh自动归属到上一个group
4. auto-lock —— group的子节点默认locked（不可独立移动）
5. pivot已在服务端处理 —— 前端不要修改模型位置
```

---

## 注意事项

- 云服务器仅开放端口 5173 和 8082，其他端口需通过Vite proxy
- 本地开发 vs 服务器部署性能无差异（渲染在本地GPU）
- `public/generated/` 下 27 个 JSON 文件（544KB）是预设模型，勿删
- Voxel Runtime通过Vite proxy加载，路径 `/api/voxel/...`
- 后端编辑器通过 `/studio/` proxy 访问
- DeepSeek API key 在 `src/ai/api.js`

---

## Dependencies

**当前：**
- **three** (`^0.184.0`) — 3D 渲染
- **vite** (`^8.0.12`) — 开发与构建

**后续Three.js官方模块（无需额外安装）：**
- `GLTFLoader` / `DRACOLoader` — 加载外部GLB模型（备用方案）
- `AnimationMixer` — 传统动画播放（备用方案）

**AI服务：**
- **DeepSeek API** (`api.deepseek.com`) — 文本侧AI：宠物概念/对话/里程碑物品/环境
- **Voxel Studio API** (`voxel-studio-backend.zeabur.app`) — 3D侧AI：模型生成/动画生成/Runtime引擎

---

## 未明确之前禁止擅自决定的内容

- Tag的具体数值计算方式
- 宠物进化的具体条件阈值
- 小窝签名合成的权重算法
- UI布局和交互细节
- 3D模型生成的具体prompt格式
