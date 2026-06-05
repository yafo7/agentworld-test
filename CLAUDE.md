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

## 操作说明

| 操作 | 按键 | 条件 |
|------|------|------|
| 移动 | WASD | 始终 |
| 旋转视角 | 鼠标左键拖拽 | 始终 |
| 缩放 | 滚轮 | 始终 |
| 捡起/放下物品 | E | 不靠近宠物时 |
| 与宠物互动(亲密度+1) | E | 靠近宠物(3m内) |
| 与寻主宠物对话 | E | 宠物气泡可见时 |
| AI生成宠物 | F | 靠近任何环境(4m内) |
| 点击查看数据 | 鼠标点击 | 任意物体 |

---

## 后续开发目标（预估）

### 短期
- **模型替换**: 玩家/宠物/物品用实际3D模型替换方块/锥体
- **动画系统**: 宠物idle/walk/interact动画（需AnimationMixer）
- **物品旋转/摆放优化**: 放置物品时预览位置，支持旋转
- **音效**: 环境音、互动音效

### 中期
- **小窝签名系统**: 环境tag组合→小窝气质→提示"吸引什么类型的生命"
- **宠物进化**: 长期环境tag累积→形态分支进化→调用AI生成进化体
- **社交网络**: 宠物间关系图(喜欢/讨厌/守护)，影响对话和行为
- **2D小剧场**: 对话不再只是气泡，增加立绘/表情

### 长期
- **3D模型生成管线**: 接入实验室文本→3D API
- **多小窝系统**: 多个独立环境区域，各自吸引不同生态
- **生态图鉴**: 记录发现过的宠物/物品/环境/进化路径
- **持久化存档**: 保存/加载玩家庭院

---

## Dependencies

**当前：**
- **three** (`^0.184.0`) — 3D 渲染
- **vite** (`^8.0.12`) — 开发与构建

**后续将用到（Three.js官方模块）：**
- `GLTFLoader` / `DRACOLoader` — 模型加载
- `AnimationMixer` — 动画播放

**AI服务：**
- DeepSeek API (`api.deepseek.com`) — 宠物生成/对话/里程碑

---

## 未明确之前禁止擅自决定的内容

- Tag的具体数值计算方式
- 宠物进化的具体条件阈值
- 小窝签名合成的权重算法
- UI布局和交互细节
- 3D模型生成的具体prompt格式
