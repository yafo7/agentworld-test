# Voxel Studio Backend — API Reference

> **适用场景**：用 AI 生成低多边形 3D 模型和动画。本指南面向第三方前端集成——涵盖所有需要正确渲染的信息。

---

## 目录

1. [快速开始](#1-快速开始)（含 [用自己的 key](#用自己的-keybyok)）
2. [端点总览](#2-端点总览)
3. [模型生成](#3-模型生成)
4. [修改模型 (Refine)](#34-修改已有模型--post-apirefinemodel)
5. [装载配件 (Mount)](#35-装载配件--post-apimount)
6. [拆分部位 (Extract Part)](#36-拆分部位--post-apiextractpart)
7. [精修细节 (Detail)](#37-精修细节--post-apidetailmodel)
8. [高精表面 (Surface)](#38-高精表面--post-apisurfacemodel)
9. [动画生成](#5-动画生成)
10. [任意 GLB 绑骨 + 动画](#56-任意-glb-绑骨--动画)
11. [模板模块 (Runtime)](#6-模板模块-runtime)
12. [粒子系统](#7-粒子系统)
13. [简单 LLM 对话](#8-简单-llm-对话)
14. [完整集成示例](#9-完整集成示例)
15. [错误处理](#10-错误处理)
16. [注意事项](#11-注意事项)

---

## 1. 快速开始

```js
// 两个线上端点互为备份，任选其一：
const API = 'https://voxelstudio.site';                    // 主（自定义域名，Vercel）
// const API = 'https://voxel-studio-backend.zeabur.app';  // 备（Zeabur）

// 生成一个模型
const resp = await fetch(`${API}/api/generate/model`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-VRL-OpenAI-Key': userKey },   // 用户自己的 key，见下面「用自己的 key」
  body: JSON.stringify({ description: 'a lowpoly knight', provider: 'gpt', mode: 'standard' }),
});
const text = await resp.text();
// 解析 SSE 取 modelJson
```

### 用自己的 key（BYOK）

所有 `POST /api/*` 端点都可以带上自己的 LLM key（请求头），这次请求的 AI 调用就用这把 key，按 key 所属账户计费。**集成方请让你的用户填写他们自己的 key**。

| 请求头 | 说明 |
|--------|------|
| `X-VRL-DeepSeek-Key` | `provider: "deepseek"` 用的 key |
| `X-VRL-OpenAI-Key` | `provider: "gpt"` 用的 key |
| `X-VRL-OpenAI-Model` | 可选，OpenAI 的模型名（不填用默认模型） |

```js
const resp = await fetch(`${API}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-VRL-DeepSeek-Key': userKey },
  body: JSON.stringify({ messages, provider: 'deepseek' }),
});
```

- 只带了一种 key、请求的 `provider` 却是另一种 → `400 byok_missing_key`（例如只带 DeepSeek key 却传 `provider: "gpt"`）。
- key 头带了但是空的 → `400 byok_bad_key`（不会当成没带）。
- 只支持 DeepSeek 和 OpenAI 的官方接口（`api.deepseek.com`、`api.openai.com`），不支持中转。
- key 无效、余额不足这类问题会直接返回明确的错误码（见 [§10](#10-错误处理)），生产环境也返回，不会只给通用的 `GENERATION_FAILED`。
- **跨域**：带了 key 头的请求（包括它的 CORS 预检）任何来源都允许，网页可以放在任何网站上直接调用；不带 key 的请求只允许配置的来源。
- key 只用于转发这次请求，不会被记录或保存。

#### 检查 key — `POST /api/byok/check`

不调用模型、不消耗额度。key 放请求头，body：

```json
{ "provider": "deepseek" }
```

`provider`：`"deepseek"` 或 `"openai"`（`"gpt"` 也行）。

**成功**（200）：
```json
{ "ok": true, "provider": "deepseek", "model": "deepseek-flash", "modelListed": true, "balance": { "currency": "CNY", "total": "9.90" } }
```

| 字段 | 说明 |
|------|------|
| `model` | 这把 key 会用的模型名 |
| `modelListed` | 接口的模型列表里有没有这个模型；`false` = 可能用不了（用 `X-VRL-OpenAI-Model` 换一个）；`null` = 接口不提供模型列表 |
| `balance` | 账户余额，只有 DeepSeek 官方地址有，其它为 `null` |

**失败**：HTTP 状态 + `{ "ok": false, "error": "<错误码>", "errorCode": "<错误码>", "message": "<中文说明>" }`，错误码见 [§10](#10-错误处理)；被限速时 `429` + `{ "ok": false, "error": "rate_limited" }`。

---

## 2. 端点总览

| 端点 | 方法 | 返回 | 用途 |
|------|------|------|------|
| `/health` | GET | `{"ok":true}` | 健康检查 |
| `/api/docs/:name` | GET | `text/markdown` | 拉取参考文档，例如 `/api/docs/api-reference` 返回本文件 |
| `/api/generate/model` | POST | SSE 流 | 生成单个模型 |
| `/api/generate/batch` | POST | SSE 流；`stream:false` 时为 JSON | 批量生成多个模型 |
| `/api/generate/replay` | POST | JSON | 多形态重放： seeded 模型换种子重出新形态（见 §3.2） |
| `/api/generate/animation` | POST | JSON | **动画统一入口**，用 `mode` 字段路由到 quick / pro / rig |
| `/api/refine/model` | POST | JSON | AI 修改已有模型 |
| `/api/mount` | POST | JSON | 装载配件（武器/穿戴/配饰）到已有模型 |
| `/api/extract/part` | POST | JSON | 把一个 group 子树从模型中拆分出来（见 §3.6） |
| `/api/detail/model` | POST | JSON | 精修细节：低模 → 中模，group / 骨骼不变（见 §3.7） |
| `/api/surface/info` | POST | JSON | 判断模型能否切换高精表面（见 §3.8） |
| `/api/surface/model` | POST | JSON | standard 模型的高精表面（见 §3.8） |
| `/api/chat` | POST | SSE 流；`stream:false` 时为 JSON | 简单 LLM 对话 |
| `/api/byok/check` | POST | JSON | 检查用户自带的 key 能不能用（不消耗额度，见 §1「用自己的 key」） |
| `/api/templates/module.js` | GET | ES Module | runtime（动画模板 + 几何构建 + 粒子转换） |
| `/api/templates/geometry-schema.js` | GET | ES Module | 几何参数 schema（module.js 相对 import） |
| `/api/templates/mesh-codec.js` | GET | ES Module | `mesh` 几何的解码（module.js 相对 import） |
| `/api/animation/resample` | POST | JSON | 已有 baked 动画按帧段变速重采样（可选 utility，见 §5.2 `_speedSegments` 字段） |
| `/api/transfer/animation` | POST | JSON | 动画迁移：把一个模型的 baked 动画适配到另一个结构不同的模型（见 §5.3） |
| `/api/combine/animations` | POST | JSON | 动画合并：把多个 baked 动画按顺序拼接成一个更长的动画（见 §5.4） |
| `/api/refine/animation` | POST | JSON | 用对话修改一段 rig 动画，返回新的 baked（见 §5.5.1） |
| `/api/rig/plan/bake` | POST | JSON | 按给定的 rig 计划直接烘焙（不调 AI；编辑参数 / 删除子动作后重算，见 §5.5.2） |
| `/api/rig/plan/schema` | GET | JSON | rig 计划每种子动作可调的参数（名称、范围、选项，见 §5.5.2） |
| `/api/rig/glb` | POST | JSON | 给任意 .glb 绑骨（请求体是文件字节，见 §5.6） |
| `/api/rig/glb/animation` | POST | JSON | 给绑好骨的 .glb 生成动画片段（glTF 节点轨道，见 §5.6） |

**向后兼容**：以下 legacy 端点仍可用，新集成推荐直接用 `/api/generate/animation`。

| Legacy 端点 | 等价于 |
|---|---|
| `POST /api/generate/animation-quick` | `/api/generate/animation` + `mode:"quick"` |
| `POST /api/generate/animation-pro` | `/api/generate/animation` + `mode:"pro"` + `description` |
| `POST /api/generate/animation-pro-multiphase` | `/api/generate/animation` + `mode:"pro"` + `phases` |

---

## 3. 模型生成

### 3.1 单个模型 — `POST /api/generate/model`

**Provider 选项**（所有生成端点通用）：

| key | 说明 |
|---|---|
| `gpt` | GPT 模型（默认） |
| `deepseek` | DeepSeek（thinking 固定关闭） |

`provider` 字段可省略，省略时默认 `gpt`。

**deepseek provider 专属**：

- 可用 `model` 字段指定具体模型；一般无需传，省略时由服务端决定。
- **thinking 固定关闭**，请求级开思考入口不提供。
- 生成耗时参考（voxel 模式）：单件 2–6s。

请求示例：

```json
{ "description": "一只戴帽子的柴犬", "provider": "deepseek", "mode": "voxel" }
```

> **旧 provider 值（`glm` / `fireworks` / `deepseek-v4-pro`）已停止维护**：传入不会报错，但可能随时移除。请传 `gpt` / `deepseek` 或省略。

**失败兜底**（gpt 系 provider 默认开启）：`gpt` 请求生成失败（限速、上游错误、生成结果无效等，已含服务端自动重试）时，服务端自动换 `deepseek` 完整重跑一次，以保证有输出。客户端无需任何处理——兜底成功的响应与正常响应格式完全一致，模型元数据 `_meta.ai.provider` 记录实际生成者；`deepseek` 自身的失败不触发兜底。请求体传 `forceProvider: true` 可禁用兜底（失败即原样失败，A/B 对照等场景用）；不传或传 `false` 均为默认兜底行为。适用所有 provider 可选的端点。

`mode`（必填；旧字段 `promptMode` 仍兼容）：

| 值 | 说明 |
|---|---|---|
| `standard`（默认）| 标准生成，质量最高 |
| `pro-preconcept` | 先按描述画一张原画稿，再照着原画搭模型（原画用描述原文生成，只加纯色背景——风格、姿势、视角都可以直接写在描述里）：外形、配色、配件更贴近一张完整的设计图。返回的是 standard 模型（standard 能用的高清表面、修改、动画都照常可用），`result` 事件多一个 `conceptImage`（原画稿，`data:image/jpeg;base64,...`，最长边 768 px、约 60–150 KB，可直接作 `<img src>`）。比 `standard` 多约 40–90 s，总耗时一般 1.5–3 分钟，客户端超时请留到 300 s。原画稿画不出来会自动重画一次，仍失败就不看图、按描述直接建模（此时没有 `conceptImage`） |
| `lite` | 快速生成，适合简单模型 |
| `voxel` | 体素风格（仅 box + group，~20 box 抽象） |
| `voxel-pro` | 体素高细节（仅 box，60-100 mesh，整体感优先） |
| `curve` | 曲线风格（sphere/cyl/torus，偏符号感） |
| `wire` | 金属铁丝勾线风格（极细 cyl + 极少 tri，抽象符号化） |
| `xieyi` | 写意水墨（几块墨 + 几笔线：颜色只用 7 档墨色 + 一点朱红，配前端「写意水墨」渲染风格；默认 deepseek；builder 多了 `stroke` 粗起细收的一笔、`leaf` 一片、`smooth()` 细分高一档） |
| `math` | 数学美学（仅 box，分形/螺旋/黄金比例等数学结构生成形态） |
| `rig` | 蒙皮骨骼动物（四足/两足/鸟/蛇/鱼/昆虫）：每条骨链一根平滑蒙皮躯干管 + 少量刚性小件（眼、角、蹄）。返回的 modelJson 带顶层 `rig`，渲染要做蒙皮（见 §3.2「蒙皮骨骼（rig 模式）」），动画用 §5.5。默认 deepseek |

> **voxel-pro mesh 限制**：所有几何节点 `mesh.type` 均为 `box`，前端按 box 参数（`width`/`height`/`depth`）渲染即可。返回格式与其他 mode 完全一致，无需特殊处理。

**`materialTags`（可选，材质标签系统）**：传入材质词表 JSON 对象时启用材质语义标签。后端按词表规则生成，返回的 `nodes[].tags` 携带标签（见 §3.2）。省略或空对象 → 不启用，输出无任何材质相关字段。与 `mode` 正交，所有 mode 都支持。词表格式参考 `material-tags-v1.json`。

**`refs`（可选，参考模型）**：最多 3 个参考模型，用于"风格类似但按描述生成新模型"的场景（如同一风格的系列机器人）。每个元素为 `{ "model": <modelJson>, "note": "借用说明，≤40字" }`，`note` 可省，也接受直接传裸 modelJson。AI 充分参考各 ref 的设计，生成满足 description 的新模型并从各 ref 借用风格/配色/细节参数；**描述与 ref 冲突时以描述为准，ref 之间冲突时按数组顺序（靠前优先）**。ref 须含 `_meta.ai` 元数据（即 AI 生成的模型），否则该 ref 被忽略。与 `mode` 正交，所有 mode 都支持；`/api/generate/batch` 传入时**所有 description 共享同一组 refs**。

**`style`（可选，仅 `mode: "pro-preconcept"`）**：原画稿的风格参考，`{ "text": "…", "image": "data:image/jpeg;base64,…" }`，两项都可选（只给文字 / 只给图 / 两者都给），也可以直接传字符串（= 文字）。风格只决定原画稿怎么画（画风、材质、配色倾向、光影），不改变要画的内容；参考图里的物体、角色、场景不会被画进去。文字最多 500 字；图片为 png / jpeg / webp 的 data url，解码后不超过 4 MB（建议客户端先压到最长边 ≤1024 px 的 JPEG，一般 100–300 KB），不合法或太大返回 400 `{ "error": "bad_style", "message": "…" }`。`/api/generate/batch` 传入时整批共用。其它 mode 忽略这个字段。

**`seeded`（可选，多形态生成）**：传 `true` 时生成的模型为多形态模型——同一模型用不同种子重放会得到不同的个体形态：结构与数值都可能变化（如分叉数量、部件有无、尺寸颜色），描述对应的整体轮廓、主体比例与色彩主题保持稳定。返回的 `modelJson` 携带 `_meta.seed` 标记（`{ v, seed }`）；重放通过 `POST /api/generate/replay` 完成（毫秒级、无 LLM 调用，见 §3.2「多形态（种子化）模型」）。省略或 `false` → 单一形态生成：不携带 `_meta.seed`，不可种子重放。与 `mode` 正交，所有 mode 都支持；`seed`（可选数字）指定初始种子用于定点复现，省略则随机。

**请求**
```json
{
  "description": "a lowpoly knight with a sword and shield",
  "provider": "gpt",
  "mode": "standard",
  "seeded": true,
  "materialTags": { "README": { "...": "词表 README" }, "tags": { "base": { "...": "..." } } },
  "refs": [
    { "model": { "...": "参考模型 modelJson" }, "note": "借用配色和比例" },
    { "model": { "...": "参考模型 modelJson" } }
  ]
}
```

**返回：SSE 流**

```
event: blockout
data: {"stage":"blockout","text":"Analyzing description..."}

event: thinking_start
data: {"stage":"thinking_start"}

event: thinking_done
data: {"stage":"thinking_done"}

event: result
data: {"stage":"result","done":true,"modelJson":{...}}

event: error
data: {"stage":"error","errorCode":"GENERATION_FAILED"}
```

SSE 事件类型：
- `blockout` — 结构分析阶段
- `thinking_start` / `thinking_done` — AI 思考中，可用于 UI 加载动画。**`provider=deepseek` 时思考固定关闭，这两个事件不会出现**（provider=gpt 时有，且为思考摘要）
- `result` — 完成，`modelJson` 是渲染就绪的模型数据；`mode: "pro-preconcept"` 时另有 `conceptImage`（建模所依据的原画稿，JPEG data url）
- `error` — 生成失败，读取 `errorCode`；当前值为 `GENERATION_FAILED`。

**前端解析示例**：
```js
async function generateModel(description) {
  const resp = await fetch(`${API}/api/generate/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VRL-OpenAI-Key': userKey },
    body: JSON.stringify({ description, provider: 'gpt', mode: 'standard' }),
  });
  const text = await resp.text();
  let modelJson = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const event = JSON.parse(line.slice(5).trim());
    if (event.stage === 'error') throw new Error(event.errorCode || 'GENERATION_FAILED');
    if (event.done || event.stage === 'result') {
      modelJson = event.modelJson;
    }
  }
  return modelJson;
}
```

#### Description 示例（按 mode 选合适风格）

```json
{ "mode": "standard",  "description": "a lowpoly knight with a sword and kite shield, red plume on the helmet" }
{ "mode": "voxel-pro", "description": "a chubby robot with a single dome head, compact body, stubby legs" }
{ "mode": "curve",     "description": "a round chubby cat with small pointed ears and a long tail" }
```

**写法要点**：一句话主体 + 1~2 个识别特征 > 长描述堆细节；想要的颜色/比例直接写进 description（AI 按 60-30-10 配色分配）；不要写"emblem/logo"式描述（所有 mode 都要求立体物体本身）。

### 3.2 modelJson 格式（v2）

生成返回的 modelJson 是 **v2 格式**（`format: 2`）：一个**扁平 `nodes` 数组**，每个 node 的 transform 都是**相对父级的局部坐标**，层级由 `parent` 字段表达。

```json
{
  "name": "Knight",
  "type": "lowpoly",
  "format": 2,
  "nodes": [
    { "id": "body", "transform": { "pos": [0, 2.5, 0] } },
    { "id": "m0", "parent": "body",
      "transform": { "pos": [0, 0, 0] },
      "mesh": { "type": "box", "params": { "width": 2, "height": 3, "depth": 1.4 }, "color": 10066329 } },
    { "id": "m5", "parent": "upperArmR",
      "transform": { "pos": [0.19, -0.32, 0.16], "quat": [0.61, 0, -0.73, 0.33] },
      "mesh": { "type": "cylinder",
                "params": { "radiusTop": 0.18, "radiusBottom": 0.2, "height": 0.9, "radialSegments": 8 },
                "color": 9055202, "boneFrom": "upperArmR_wp0", "boneTo": "upperArmR_wp1" } },
    { "id": "torch_head", "parent": "body",
      "transform": { "pos": [0, 4, 0] },
      "mesh": { "type": "sphere", "params": { "radius": 0.3 }, "color": 16753920 },
      "tags": [ { "tag": "fire", "value": 0.75, "variant": "normal" } ] }
  ],
  "_meta": { "skipAutoCenter": true, "ai": { "v": 1, "data": "<encrypted>", "edits": "" } }
}
```

**group vs mesh**：node 有 `mesh` → 几何叶节点；无 `mesh` → group（= 动画骨骼节点）。动画 `baked.animation` 的 key 是 group id（group 即骨骼）。

#### ⚠️ 朝向（最常见的渲染错误）

`cylinder` / `cone` 的默认轴是 **+Y（竖直）**。斜向件的朝向由 node 的 **`transform.quat`** 给出。**渲染时必须 `obj.quaternion.set(...quat)`**，否则所有圆柱竖直 → 模型朝向全错。

#### node 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一 id |
| `parent` | string | 父 node id（省略则根） |
| `transform.pos` | `[x,y,z]` | **相对父级的局部偏移** |
| `transform.quat` | `[x,y,z,w]` | 朝向（cylinder/cone 必需）。默认轴 +Y，quat 将 +Y 转到目标方向 |
| `transform.scale` | `[sx,sy,sz]` | 可选的非均匀缩放，默认 `[1,1,1]`。应用前建议检查全 > 0 |
| `mesh` | object | 有 → 叶几何节点；无 → group |
| `mesh.type` | string | `box sphere cylinder cone torus wedge tri patch icosahedron dodecahedron octahedron skinTube`（`skinTube` 仅 rig 模式，见下方「蒙皮骨骼」） |
| `mesh.params` | object | 几何参数（完整表见 §6）。用 `runtime.buildGeometry(type, params)` 构建 |
| `mesh.color` | number | `0xRRGGBB` 简写 |
| `mesh.material` | object | 完整材质 `{color, roughness?, metalness?, opacity?, transparent?, flatShading?}`，存在时覆盖 `color` |
| `mesh.boneFrom` / `mesh.boneTo` | string | chain/connect 圆柱的骨骼端点（动画链检测用；静态渲染可忽略） |
| `mesh.skin` | object? | 仅 `skinTube`：`{ bones: [groupId, ...] }`，几何里蒙皮槽位 `k` 对应 group `bones[k]` |
| `tags` | array? | 可选。材质语义标签，仅当请求启用 `materialTags` 时出现。见下方「材质标签渲染约定」 |
| `label` | string? | 可选。mesh 节点的语义名（2~6 字中文，如 `胸甲`/`剑刃`），仅关键 mesh 携带。渲染端忽略；编辑/动画等语义消费方使用 |
| `with` | object? | 可选。与 `label` 配套的批量件序号（如 `{i:3}`），仅批量件携带。渲染端忽略；动画等语义消费方使用 |
| `paint` | array | string? | 可选，仅 `standard` 模型。画在表面颜色上的花纹。mesh 节点上的数组 = 它自己的；group 节点上的数组 = 被组里 mesh 引用；mesh 节点上的字符串 = 引用的 group id（用那个 group 的 paint）。op 带 `f: 1` 时坐标在所有者的坐标系里（group 的 paint = 该 group，mesh 自己的 = 它的父 group），用模型当前变换换到世界坐标；没有 `f` 的是世界坐标。简单渲染可以忽略（显示纯底色）；要画出来见下面的「表面花纹 paint」 |

#### 顶层字段

| 字段 | 说明 |
|------|------|
| `name` / `type` | 模型名 / 固定 `lowpoly` |
| `tags` | 可选。根节点（整个模型）的材质语义标签，格式同节点的 `tags`，仅当请求启用 `materialTags` 时可能出现。继承给所有 mesh，见下方「材质标签渲染约定」 |
| `format` | `2`（版本号，渲染器可 feature-detect） |
| `rig` | 可选，仅 rig 模式。骨骼描述（见下方「蒙皮骨骼」）。渲染端只需据此知道哪些 group 是骨骼；rig 动画（§5.5）请求时须原样带上 |
| `_meta.skipAutoCenter` | 渲染端忽略 |
| `_meta.ai` | 渲染端忽略 |
| `_meta.semanticSnapshot` | 可选。模型语义快照 `{ v, text, stats }`——`text` 为紧凑文本摘要（group 层级/代表 mesh/批量件规律），供动画、组合等下游管线使用。生成、修改（§3.4）、装配（§3.5）返回的 `modelJson` 都会携带最新快照；模型无 group 时该字段不存在。渲染端忽略 |
| `_meta.surfaceRoles` | 可选，按节点 id 的部件标签（表面相关接口复用）。渲染端忽略，回传时原样带上 |
| `_meta.sculpt` | 可选。精修过的模型（§3.7）带此标记。渲染端忽略 |
| `_meta.surfaceMode` | 可选。`"hires"` = 高精表面派生模型（§3.8），只用于显示 / 导出。渲染端忽略 |

#### 表面花纹 paint

`standard` 模型的 mesh 节点可能带 `paint: [op, …]`（最多 12 个，按顺序叠加在该 mesh 的底色上，逐像素算出颜色）。所有坐标 / 方向都是**模型静止姿态的世界坐标**（各 group 动起来时，在该 mesh 自己的静止坐标里算，花纹跟着表面走）。颜色为 0xRRGGBB 整数。

| `kind` | 字段 | 含义 |
|---|---|---|
| `spots` | `size`, `cover`(0–1), `style`(0 圆点 / 1 相邻色块之间露出底色细缝 / 2 空心环), `jitter`, `seed` | 整个表面的 Worley 斑点：坐标 / size 取胞元，style 0 = 最近胞点距离小于半径处着色、1 = 两个最近胞点距离差大于缝宽处着色、2 = 圆点去掉中心 |
| `stripes` | `dir`(单位向量), `spacing`, `width`(0–1), `wobble`, `seed` | t = (p·dir)/spacing（加 wobble 倍的噪声扰动），`abs(fract(t)−0.5)·2 < width` 处着色 |
| `fade` | `dir`, `at`, `width` | (p−at)·dir 从 0 到 width 平滑过渡到 color |
| `spot` | `at`, `r`, `stretch?`(方向 × 拉长倍数) | 以表面点 at 为中心、半径 r 的色斑 |
| `line` | `points`, `width` | 贴表面折线，到折线距离 < width/2 处着色 |

| `stamp` | `mesh: {type, params}` + `transform: {pos, quat?, scale?}`（type = sphere / box / cylinder / cone / torus，参数和变换同普通 mesh，但都是世界坐标、没有父级）**或** `tube: [[x,y,z,r], …]`（一串圆锥台：相邻两站之间的圆滑管） | 图章：表面点落在这个体积里（含一点容差）就染成 color。它不渲染成几何 |

通用可选字段：`soft`(0–1 边缘柔化)、`edge`(0–1 边缘噪声扰动)、`alpha`(0–1，缺省 1)、`side: { dir, at, width? }`（只在 (p−at)·dir > 0 一侧着色，width 内渐入）。忽略 `paint` 时模型显示纯底色，几何不受影响。

#### 材质标签渲染约定

当请求传入非空 `materialTags` 时，`nodes[]` 的任意节点（group 或 mesh）和模型顶层（根节点 = 整个模型）都可能携带可选 `tags` 数组，每条形如：

```json
{ "tag": "base", "value": "gold" }                    // enum 模式:每部件至多一个
{ "tag": "fire", "value": 0.75, "variant": "green" }  // blend 模式:value ∈ {0,0.25,0.5,0.75,1};variant 仅部分 tag 支持
```

渲染端约定：

- **继承**：模型顶层的 tags 传播给所有 mesh，group 节点的 tags 沿 `parent` 链向下传播给所有后代 mesh；近的覆盖远的同名 tag。收集一个 mesh 的有效 tags = 顶层 tags，再依次用父链上从外到内的 group tags、mesh 自身 tags 覆盖同名项。
- **编译**：渲染端用有效 tags 查词表（`material-tags-v1.json`）编译成分层材质（effect layers）+ 可选粒子（companion），完全覆盖节点 `mesh.color` / `mesh.material` 的基础着色。同一个 `(tag, value, variant)` 组合的部件 batch key 相同，可合批。
- **未实现的 tag**：词表中 `status: notImplemented` 的 tag（如 electric/poison/ice/wet 等）渲染端先落默认材质；数据格式已冻结，渲染层补齐后存量模型自动生效，前端不应因遇到未知 tag 报错。
- **无 tags 字段**：请求未传 `materialTags` 时，所有节点和模型顶层都没有 `tags` 字段（不是空数组），渲染端走常规 `mesh.color` / `mesh.material`。

#### 蒙皮骨骼（rig 模式）

`mode: "rig"` 生成的模型仍是普通 v2 节点树，多了两样东西：

- **骨骼 = group**：每节骨头是一个 group，`transform.pos` 是它的关节相对父骨关节的偏移，**静止朝向恒为单位四元数（没有 `transform.quat`）**。躯干、颈、腿、尾、象鼻等每条骨链各带一个 `skinTube` 网格，挂在链的第一节骨头下。关节处另有**辅助 group** `<骨头 id>_half`（同样没有 `transform.quat`），动画里它转那节骨头的一半，让弯曲的关节不塌；蒙皮网格会绑定到它，见 `rig.helpers`。
- **顶层 `rig`**：骨骼描述，坐标是静止姿态的世界坐标，动物朝 +Z、上 +Y、它的左边 = +X。

```json
"rig": {
  "v": 1, "kind": "quadruped", "forward": "+Z", "up": "+Y", "root": "root", "groundY": 0.02,
  "bones": {
    "spine_0":  { "role": "spine", "chain": "spine", "index": 0, "parent": "root", "pos": [0, 1, -0.75], "vec": [0, 0.04, 0.5] },
    "leg_FL_0": { "role": "leg", "chain": "leg_FL", "index": 0, "parent": "spine_2", "pos": [0.2, 1, 0.6], "vec": [0.02, -0.38, -0.12], "side": "L", "end": "F" }
  },
  "chains": {
    "spine": ["spine_0", "spine_1", "spine_2"], "neck": ["neck_0", "neck_1"], "head": ["head"], "tail": ["tail_0", "tail_1", "tail_2"],
    "legs": [{ "id": "leg_FL", "bones": ["leg_FL_0", "leg_FL_1", "leg_FL_2"], "side": "L", "end": "F", "foot": "leg_FL_2" }],
    "ears": [{ "id": "ear_L", "bones": ["ear_L_0"], "side": "L" }]
  },
  "helpers": {
    "leg_FL_1_half": { "of": "leg_FL_1", "parent": "leg_FL_0", "pos": [0.22, 0.62, 0.48] }
  }
}
```

`bones` 的 key 就是 group id；`pos` = 骨头起点（关节），`vec` = 起点指向末端；`side` 左右（L/R），`end` 前后（F/H）。单条骨链（`spine`/`neck`/`head`/`jaw`/`tail`/`trunk`）是 id 数组，成组的（`legs`/`ears`/`arms`/`wings`/`limbs`）是对象数组。`helpers` 的 key 也是 group id：它挂在 `parent` 骨下、位于骨头 `of` 的起点（`pos`），不算骨骼（不出现在 `bones`/`chains` 里），只给蒙皮用；动画轨道照常给出（§5.5）。

**渲染**（three.js）：

1. `skinTube` 用 `runtime.buildGeometry('skinTube', params)` 建几何（带 `skinIndex`/`skinWeight` 属性），建 `THREE.SkinnedMesh(geo, mat)`，像其它 mesh 节点一样挂进树。建议 `frustumCulled = false`（骨骼一动包围盒就变）、平滑着色（`flatShading: false`）。
2. 整棵树建完、**所有骨骼 group 处于静止姿态**（`transform.pos` + 单位四元数）时，`scene.updateMatrixWorld(true)`，再对每个蒙皮网格 `skinned.bind(new THREE.Skeleton(node.mesh.skin.bones.map(id => groupObject(id))))`（`node` 是该网格的 modelJson 节点；`skin.bones` 里可能有辅助 group，同样按 id 找）。只在静止姿态绑定一次；之后转动骨骼 group，蒙皮自动跟着变形。
3. 用普通 `THREE.Mesh` 显示同一几何 = 静止姿态（缩略图、静态预览可以这样省事）。

#### 多形态（种子化）模型

请求带 `seeded: true` 时，返回的 `modelJson` 顶层 `_meta.seed` 为 `{ "v": 1, "seed": <初始种子> }`。这类模型可用不同种子重放出不同的个体形态：

**`POST /api/generate/replay`**（JSON，非流式）

请求：`modelJson` 传要重放的多形态模型（即 `seeded` 生成返回的那个 modelJson，完整传入、不要删减字段——重放所需的信息就记录在它身上）；`seed` 传新种子。

```json
{
  "modelJson": { "...": "要重放的多形态模型 modelJson" },
  "seed": 12345
}
```

返回：**同一模型在新种子下重新计算出的形态**——结构和数值都可能不同于传入的模型（例如分叉数量不同），并非把传入内容原样返回：

```json
{ "ok": true, "seed": 12345, "modelJson": { "...": "新种子下的模型" } }
```

行为约定：

- 重放后的 `modelJson` 与普通模型格式完全一致，直接走既有加载/渲染/动画路径，下游无需任何适配
- 同一模型换种子：**结构与数值都可能变化**（如分叉数量、部件有无、尺寸颜色）；描述对应的整体轮廓、主体比例与色彩主题保持稳定
- 同一 `seed` 永远得到同一形态；`group id` 与首次生成一致、`mesh id` 按确定顺序生成——已有动画/挂载引用保持有效
- 返回的 modelJson 可继续 replay 或 refine
- 错误：`400 no_metadata`（模型缺少重放所需元数据）/ `400 metadata_corrupted` / `422 replay_exec_failed`

### 3.3 批量生成 — `POST /api/generate/batch`

**请求**
```json
{
  "descriptions": ["a knight", "a dragon", "a castle"],
  "provider": "gpt",
  "mode": "standard",
  "materialTags": { "README": {}, "tags": {} },
  "refs": [{ "model": { "...": "参考模型 modelJson" }, "note": "系列风格基准" }]
}
```

> `materialTags`、`refs` 可选，语义同 §3.1。若提供，则应用到批量内的每一个 description——`refs` 共享即"风格一致但功能不同"的系列生成。`seeded: true` 同样适用于批量（每个模型独立随机种子）。`mode: "pro-preconcept"` 时每个描述各画一张原画稿，成功项的 `result` 多一个 `conceptImage`（同 §3.1）。

**返回：SSE 流（默认）**
```text
event: start
data: {"stage":"start","total":3}

event: item
data: {"stage":"item","completed":1,"total":3,"result":{"success":true,"index":0,"modelJson":{...},"name":"Knight","meshCount":85}}

event: item
data: {"stage":"item","completed":2,"total":3,"result":{"success":false,"index":2,"errorCode":"GENERATION_FAILED"}}

event: done
data: {"stage":"done","total":3,"succeeded":2,"failed":1,"results":[...]}
```

> 默认返回 `text/event-stream`，后端仍按现有并发策略启动任务，但每个模型完成后立即发送一个 `item` 事件，失败项不阻塞其他项。

**兼容 JSON 返回**

请求体传入 `"stream": false` 时，返回旧版普通 JSON：

```json
{
  "total": 3,
  "succeeded": 3,
  "failed": 0,
  "results": [
    { "success": true, "index": 0, "modelJson": {...}, "name": "Knight", "meshCount": 85 },
    { "success": false, "index": 2, "errorCode": "GENERATION_FAILED" }
  ]
}
```

### 3.4 修改已有模型 — `POST /api/refine/model`

对已生成的模型进行 AI 修改。需要模型保留 `_meta.ai` 元数据（仅限通过 `/api/generate/model` 生成的模型）。

**请求**
```json
{
  "modelJson": { ... },
  "description": "make the sword bigger, add a cape",
  "provider": "gpt",
  "refModelJson": { ... },
  "materialTags": { "README": {}, "tags": {} }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `modelJson` | object | 完整模型数据（须含 `_meta.ai`） |
| `description` | string | 修改描述 |
| `provider` | string | AI provider，取值同模型生成（`gpt` / `deepseek`）。**省略时默认 `deepseek`** |
| `refModelJson` | object? | 可选参考模型（须含 `_meta.ai`，即 AI 生成的模型）。AI 充分参考 ref 的设计（颜色/形状参数/数量/装饰/组合关系）进行修改（如"穿上 ref 这件衣服"）。**原模型 mode 优先**——不强制采用 ref 的 mode 约束。无 AI 元数据的 ref 会被忽略 |
| `materialTags` | object? | 可选材质词表，语义同 §3.1。提供时 AI 会给部件打/改 `tags`，返回的 `nodes[].tags` 反映新标签；省略则不启用材质系统 |

**返回：JSON**
```json
{
  "ok": true,
  "modelJson": { ... }
}
```

**错误**
| error | 含义 |
|-------|------|
| `no_metadata` | 模型缺少 AI 元数据（非 AI 生成或手动编辑过） |
| `metadata_corrupted` | 元数据损坏，需重新生成模型 |

> **非流式**。Refine 一次返回完整结果，不像模型生成那样走 SSE。返回的 `modelJson` 会按修改后的结构重建 `_meta.semanticSnapshot`（见 §3.2 字段表）；模型无 group 时该字段被移除。

#### Description 示例

```json
{ "description": "make the sword 1.5x longer and add a glowing gem on the hilt" }
{ "description": "wear the ref armor on torso and shoulders", "refModelJson": { ... } }
{ "description": "add a tattered red cape flowing behind the back" }
```

**写法要点**：写**最小修改**（"加一顶帽子" 而非 "重新设计这个角色"）；要改多处 → 分多次调用；用 `refModelJson` 时明确"以 ref 为准、装到主模型 X 部位"；尊重原 mode（voxel 模型别要求"光滑球面"）。

### 3.5 装载配件 — `POST /api/mount`

将配件（武器/穿戴/配饰）装到已有模型上。primary 必须保留 `_meta.ai` 元数据；`secondary` 传文字描述时 AI 直接生成并装配（单次完成，配件与主模型坐标/比例/骨骼对齐），传模型数据时按现有模型装配。

**请求**
```json
{
  "primary": { ... },
  "secondary": "文字描述",
  "description": "右手持枪，枪口朝上",
  "provider": "gpt"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `primary` | object | 完整模型数据（须含 `_meta.ai`） |
| `secondary` | object \| string | 配件模型数据（须含 `_meta.ai`）或文字描述（AI 自动生成并装配） |
| `description` | string | 可选。装配说明，如"戴在头上"、"右手持枪"；也可以直接写进 `secondary` 描述里。缺省时 AI 自动选择合理挂载点 |
| `provider` | string | AI provider，同模型生成 |

**返回：JSON**
```json
{
  "ok": true,
  "modelJson": { ... },
  "mountedGroupId": "mount01_wizard_hat"
}
```
```

**错误**

| error | 含义 |
|-------|------|
| `no_metadata` | primary 或 secondary 缺少 AI 元数据 |
| `metadata_corrupted` | 元数据损坏 |
| `invalid plan` | AI 输出无法解析 |

> **非流式**。返回的 `modelJson` 中，配件 mesh 位于 `mounted: true` 的 group 下，前端可据此识别可拆卸部件；`_meta.semanticSnapshot` 按挂载后的结构重建（文字描述路径的配件 mesh 带 label，模型路径保留 secondary 原 label）。

#### Description 示例

```json
{ "primary": { ... }, "secondary": "a sword", "description": "held in the right hand, blade pointing down" }
{ "primary": { ... }, "secondary": "a wide-brim hat", "description": "worn on the head, brim pointing forward" }
{ "primary": { ... }, "secondary": "a round shield", "description": "attached to the left shoulder, facing outward" }
```

**写法要点**：写**装配意图 + 朝向**（"右手持枪，枪口朝上"），不要写精确坐标；写大小意图（"小一点的背包"）帮助 AI 选 scale；`secondary` 是字符串时用最朴素描述（"a sword"），装配关系写在 `description`；一次只装一个配件。

### 3.6 拆分部位 — `POST /api/extract/part`

把模型的一个部位（group 子树）拆下来，返回**两个独立模型**：拆出的部分（extract）和剩下的部分（rest）。适合"把机器鸟的翅膀拆下来"这类需求——拆出的部位可作为独立资产保存、单独动画、或再 mount 回去。

**`groupId` 与 `description` 二选一**：要么直接指定 group，要么用自然语言描述让 AI 解析。两者都传时以 `groupId` 为准，`description` 被忽略。

方式一 — 直接指定 group（推荐）：
```json
{ "modelJson": { ... }, "groupId": "leftWing" }
```

方式二 — 自然语言描述：
```json
{ "modelJson": { ... }, "description": "左边那个翅膀", "provider": "gpt" }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `modelJson` | object | 必填。要拆分的完整模型（v2 格式，带 `nodes` 数组） |
| `groupId` | string? | 目标 group 的 id；也接受 group 的 name（如 `"左翅膀"`）。与 `description` 二选一 |
| `description` | string? | 部位的自然语言描述（如 `"左边那个翅膀"`），由 AI 从模型结构（含语义快照）中选出最匹配的 group |
| `provider` | string? | AI provider，取值同模型生成（`gpt` / `deepseek`）。**省略时默认 `deepseek`**。需要 AI 的内部步骤使用 |

**返回：JSON**
```json
{
  "ok": true,
  "groupId": "leftWing",
  "groupName": "左翅膀",
  "extract": { "name": "机械鸟·左翅膀", "format": 2, "nodes": [ ... ], "_meta": { ... } },
  "rest":    { "name": "机械鸟",         "format": 2, "nodes": [ ... ], "_meta": { ... } }
}
```

| 字段 | 说明 |
|------|------|
| `groupId` / `groupName` | 实际拆出的 group（`description` 输入时由此得知解析结果） |
| `extract` | 拆出的子树模型。根 group 的 `transform` 已换算成**世界坐标**，其后代节点坐标不变——模型拆下来**原地不动**，渲染时无需任何平移补偿。`name` 为 `原名·部位名` |
| `rest` | 剩余节点的完整模型，各节点坐标与输入完全一致，`name` 沿用原名 |

两个模型都重建了 `_meta.semanticSnapshot` 和 group OBB（`_obb`），可直接用于动画生成。

**渲染与后续使用**

- 两个模型都是标准 v2 modelJson，按 §3.2 渲染即可。`extract` 保留在世界原位；若想居中展示，按其 AABB 自行居中（`_meta.skipAutoCenter` 已置 true，引擎不会自动居中）。
- 可再修改性：输入模型带 AI 元数据时，两个输出通常各自内嵌新的 `_meta.ai`，可直接传给 `/api/refine/model` 或作为 secondary 传给 `/api/mount`。检查 `modelJson._meta?.ai?.data` 是否存在即可判断（缺失时 refine 会报 `no_metadata`）。
- 动画兼容：原模型的动画若引用了被拆走的 group id，在对方模型上已无对应节点——前端加载两侧模型时应按 group id 过滤失效的动画 track。

**边界情况**

- 目标必须是 group（无 `mesh` 的节点），传 mesh id 报 `group_not_found`。
- `rest` 中可能留下**空 group**（其子节点整个被拆走）——这是有意的：保留骨骼节点，动画引用不悬空。渲染时空 group 无几何，不影响显示。
- chain（链体）整体跟随其所属 group：拆 chain 所在的 group 会带走整条 chain（含全部 waypoint group）；拆 chain **中间某个 waypoint** 得到的是从该关节开始的链尾。
- 拆分以输入 modelJson 为准——之前的手动编辑（位移/改色）保留在对应一侧的节点数据里；两侧模型的编辑历史（`_meta.ai.edits`）重置为空。

**错误**

| error | 含义 |
|-------|------|
| `modelJson with nodes required` | 缺少模型 |
| `groupId or description required` | 两个选择器都没传 |
| `group_not_found` | 目标不存在。响应附 `candidates`（现有 group id 列表）供前端提示 |

> **非流式**。`groupId` 直配时通常瞬间返回；`description` 需要一次 AI 解析。

---

### 3.7 精修细节 — `POST /api/detail/model`

把 AI 生成的低模精修成中模：部件换成更细的三角网格（`mesh` 类型，可能带顶点色），group 层级、id 和骨骼不变，动画照常可用。

```json
{ "modelJson": { ... }, "provider": "deepseek", "description": "可选" }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `modelJson` | object | 完整模型数据（须含 `_meta.ai`） |
| `provider` | string? | 默认 `deepseek` |
| `description` | string? | 可选，模型描述；省略时用模型名 |

**响应**：`{ "ok": true, "modelJson": { ... } }`。返回的模型带 `_meta.sculpt` 标记，`mesh` 节点按 §6 `buildGeometry` 构建。

- 精修过的模型传给修改（§3.4）/ 装配（§3.5）/ 拆分（§3.6）时，会先还原成低模再处理，结果是低模；需要的话再精修一次。

**错误**

| error | 含义 |
|-------|------|
| `no_metadata` / `metadata_corrupted` | 模型缺少或损坏 AI 元数据（400） |
| `already_detailed` | 模型已经精修过（400） |
| `detail_llm_failed` | 上游 AI 失败（502），可重试 |
| `restore_failed` | 修改 / 装配 / 拆分时精修模型无法还原成低模（500） |

> **非流式**，通常几秒到十几秒。

---

### 3.8 高精表面 — `POST /api/surface/model`

只对 `standard` 模式生成的模型可用。不调用 AI，通常一秒内返回。按部件实际尺寸统一提高面数，关节处、连续部件之间加过渡，原有节点全部保留（group / id 不变，动画照常可用），另加少量 `label: "过渡"` 的节点。返回的仍是标准 v2 modelJson（只用 §6 已有的几何类型），面数精度写在几何参数里，按 §3.2 渲染即可。

```json
{ "modelJson": { ... }, "mode": "hires" }
```

**响应**：`{ "ok": true, "modelJson": { ... } }`，`_meta.surfaceMode` 为 `"hires"`。

- 这是派生显示：保存、修改、装配、拆分、换种子都用原模型；切回原样直接用原模型，不需要请求。必须传原模型，传入高精或精修结果会返回 `derived_model`。
- 先用 `POST /api/surface/info`（`{ "modelJson": { ... } }` → `{ "ok": true, "standard": true | false }`）判断要不要显示这个切换。

**错误**（都是 400）：`not_standard`（不是 standard 模型）、`no_metadata`（缺少 AI 元数据）、`derived_model`（传的不是原模型）、`bad_mode`。

---

## 5. 动画生成

动画分三种模式：
- **Quick**（数值轨道 baked，适合循环/简单动作）→ §5.1
- **Pro**（逐帧烘焙数据，适合复杂攻击/连招/分阶段变速）→ §5.2
- **Rig**（骨骼动画：rig 模式的蒙皮动物，或任何生成模式带 group 的模型；步态、脚踩地、整条骨链、人形持械 / 用具动作、骑乘）→ §5.5
- **外部 GLB**（用户自己的 .glb，有没有骨骼都行：同样的动作，片段直接播在 GLB 的节点上）→ §5.6

### 5.0 统一入口 — `POST /api/generate/animation`

**推荐入口**，用 `mode` 字段路由到 quick / pro / rig。三个 legacy 端点（`/api/generate/animation-quick` 等）等价于下表的便捷写法，详见 §2。

| `mode` | 必填字段 | 行为 |
|---|---|---|
| `"quick"`（默认）| `description` | Quick 动画 → 返回 baked 逐帧数值轨道（与 Pro 同格式，见 §5.1） |
| `"pro"` | `description` 或 `phases` | Pro 动画 → 返回 baked 逐帧数据。传 `description` 走单阶段；传 `phases` 走多阶段串联 |
| `"rig"` | `description`；`modelJson` 带顶层 `rig`，或带 group 部件 | 骨骼动画 → 返回 baked（同 §5.1 格式），见 §5.5 |

```json
// Quick
{ "mode": "quick", "modelJson": { ... }, "description": "running cycle" }

// Pro 单 description
{ "mode": "pro", "modelJson": { ... }, "description": "wind up and slash..." }

// Pro 多阶段
{ "mode": "pro", "modelJson": { ... }, "phases": [{ "name": "蓄力", "description": "..." }, ...] }

// Rig
{ "mode": "rig", "modelJson": { ... }, "description": "大象用鼻子卷起一根木头" }
```

> **关于 `duration` 字段**：quick / pro 的 `duration` 字段**仍然接受**（向后兼容）但**不再传给 AI**——动画时长由 AI 根据动作内容自动决定（基于 tween/path 终点自动推导）。详见 §11 注意事项。rig 例外：`duration` / `loop` 生效（§5.5）。

> **动画端点的 `provider`**：支持 `gpt` 和 `deepseek`（thinking 固定关闭），省略时默认 `deepseek`。deepseek 下动画生成无思考事件，前端切换 provider 无需其它改动。

### 5.1 Quick 动画（数值轨道 baked）

#### 请求

```json
{
  "mode": "quick",
  "modelJson": { ... },
  "description": "running cycle, arms swinging",
  "provider": "gpt",
  "emitParticles": false
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | string | 统一入口必填 `"quick"`；调用 legacy `/api/generate/animation-quick` 时可省略 |
| `modelJson` | object | 模型数据 |
| `description` | string | 动画描述 |
| `duration` | number? | **已废弃**——AI 自动决定。请求体仍接受但不传给 AI |
| `provider` | string | AI provider，同模型生成 |
| `emitParticles` | boolean | 是否生成粒子特效（见 `baked.emit`），默认 false |
| `vfxTags` | object? | 可选 VFX 词汇表 JSON。提供时启用 VFX 系统（见 `baked.vfx` 与 §7.5）。省略则不启用 |

**返回：JSON**——后端直接返回烘焙好的**逐帧数值轨道**，前端按帧采样播放即可，无需任何动画求值逻辑：

```json
{
  "ok": true,
  "baked": {
    "fps": 60,
    "duration": 1.2,
    "loop": false,
    "animation": {
      "rightArm": {
        "posX": [0, 0, 0, ...],
        "posY": [0, 0.01, 0.03, ...],
        "posZ": [0, 0, 0, ...],
        "rotX": [0, -0.12, -0.45, ...],
        "rotY": [0, 0.02, 0.08, ...],
        "rotZ": [0, -0.31, -1.02, ...]
      }
    }
  }
}
```

##### `baked` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `fps` | number | 帧率（固定 60）。第 `i` 帧的时间 = `i / fps`；总帧数 = `ceil(duration × fps) + 1` |
| `duration` | number | 动画总时长（秒），由 AI 根据动作内容决定 |
| `loop` | bool | 是否循环（循环类动作为 true） |
| `animation` | object | 按 group id 索引的数值轨道（见下）。只包含参与动画的 group |
| `vfx` | object? | 可选，仅请求传 `vfxTags` 且 AI 使用了 VFX 时出现：`{ "continuous": [{ "target": groupId, ...preset参数 }], "events": [] }`（结构同 Pro，见 §7.5） |
| `emit` | object? | 可选，仅 `emitParticles: true` 且 AI 使用了粒子时出现：`{ [groupId]: { "emit": { ...嵌套emit配置 } } }`（emit 配置 schema 见 §7） |

##### `baked.animation[group]` 轨道结构

每个 group 包含 6 条等长数组（长度 = 总帧数），还可能带 4 条可选四元数轨道：

| 轨道 | 含义 |
|------|------|
| `posX/posY/posZ` | position **增量**（叠加到 group 的基础 position） |
| `rotX/rotY/rotZ` | rotation **增量**（弧度，Euler XYZ 序，叠加到基础 rotation） |
| `quatX/quatY/quatZ/quatW` | 可选的**绝对局部四元数**，相对于模型原始父组。存在时优先使用，不能再叠加基础 rotation 或 `rotX/rotY/rotZ` |

**渲染采样**：播放时间 `t` → 帧号 `f = clamp(round(t × fps), 0, 帧数-1)`（循环时先 `t % duration`），逐 group 读取轨道。position 始终叠加到基础位置；四元数轨道存在时直接设置局部 quaternion，否则叠加 Euler 增量。不需要修改模型父链。普通轨道圆整到 4 位小数，四元数轨道保留 8 位小数。

#### 前端播放

```js
function sampleFrame(baked, t) {
  const dur = baked.loop ? ((t % baked.duration) + baked.duration) % baked.duration
    : Math.max(0, Math.min(t, baked.duration));
  const f = Math.max(0, Math.min(baked.animation[Object.keys(baked.animation)[0]].rotX.length - 1,
    Math.round(dur * baked.fps)));
  const pose = {};
  for (const [gid, tr] of Object.entries(baked.animation)) {
    pose[gid] = {
      position: [tr.posX[f], tr.posY[f], tr.posZ[f]],
      rotation: [tr.rotX[f], tr.rotY[f], tr.rotZ[f]],
    };
    if (tr.quatX) {
      pose[gid].quaternion = [tr.quatX[f], tr.quatY[f], tr.quatZ[f], tr.quatW[f]];
      delete pose[gid].rotation;
    }
  }
  return pose;  // position/rotation 是增量，quaternion 是绝对局部朝向
}
```

#### Description 示例

```json
{ "mode": "quick", "modelJson": { ... }, "description": "running cycle" }
{ "mode": "quick", "modelJson": { ... }, "description": "idle breathing with subtle body sway" }
{ "mode": "quick", "modelJson": { ... }, "description": "slash sword diagonally from upper right to lower left" }
```

**写法要点**：
- **关键词决定 loop / one-shot**（后端自动路由）：含 `attack/hit/strike/slash/stab/jump/throw/launch/shoot/dash/charge/砍/刺/劈/砸/跳/扔/冲撞` → one-shot（启用 envelope 三段曲线：蓄力→爆发→收招）；其他（`idle/walk/run/fly/breathe/swim/挥手/风吹`）→ loop
- Loop 类用状态词，一句话够（`"running cycle"` 比 "双腿交替摆动，身体上下起伏" 更有效）
- One-shot 类用动词，描述完整动作流程
- 模型 group 命名质量影响动画质量：`rightArm` / `head` / `leftLeg` 远好于 `m0` / `g1`

---

### 5.2 Pro 动画（逐帧烘焙）

Pro 模式由后端生成精确的**逐帧动画数据**（baked animation），前端只需按帧采样播放。Pro 模式有两种调用形式——**单 description（推荐日常用法）** 和 **phases 数组（需要分阶段 UI 标签时用）**。

**适用场景**：复杂攻击/技能/连招、需要精确节奏控制、需要分阶段变速播放。

后端会**自动检测**单阶段动画里的"攻击核心"帧段（基于武器 quaternion 角速度峰值），通过 `_speedSegments` 字段返回变速建议——前端可直接用它做"蓄力慢、攻击快"播放，无需手动配置 phases。

#### 端点

| 端点 | 用途 |
|------|------|
| `POST /api/generate/animation` | **推荐**统一入口。`mode:"pro"` + `description` 走单阶段；`mode:"pro"` + `phases` 走多阶段 |
| `POST /api/generate/animation-pro` | legacy 简写——等价于 unified + 单 `description` |
| `POST /api/generate/animation-pro-multiphase` | legacy 简写——等价于 unified + `phases` |

#### 单 description 请求（推荐）

```json
{
  "mode": "pro",
  "modelJson": { ... },
  "description": "wind up the sword behind the right shoulder, then slash diagonally from upper right to lower left, recover to guard stance",
  "provider": "gpt",
  "vfxTags": { ... }
}
```

#### 多阶段请求（phases 数组）

```json
{
  "mode": "pro",
  "modelJson": { ... },
  "phases": [
    { "name": "蓄力", "description": "身体下蹲蓄力，双臂后摆" },
    { "name": "攻击", "description": "挥剑前劈" },
    { "name": "收招", "description": "回到待机姿态" }
  ],
  "provider": "gpt",
  "vfxTags": { ... }
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | string | 统一入口必填 `"pro"`；调用 legacy 端点时可省略 |
| `modelJson` | object | 模型数据（含 group 节点结构） |
| `description` | string? | 单阶段形式必填（与 `phases` 二选一）。自然语言描述完整动作流程 |
| `phases` | array? | 多阶段形式必填（与 `description` 二选一）。1~N 个阶段按数组顺序串联 |
| `phases[].name` | string? | 阶段名（用于前端 UI 显示）。省略时为 `"阶段 N"` |
| `phases[].description` | string | 该阶段的自然语言动作描述 |
| `phases[].duration` | number? | **已废弃**——AI 自动决定。请求体仍接受但不传给 AI |
| `provider` | string? | AI provider（同模型生成） |
| `vfxTags` | object? | 可选 VFX 词表（语义同 Quick 模式，见 §7.5） |

#### 响应

```json
{
  "ok": true,
  "mode": "pro",
  "baked": {
    "fps": 60,
    "duration": 1.4,
    "loop": false,
    "animation": {
      "body":     { "posX": [0,0,0,...], "posY": [0,0.05,0.1,...], "posZ": [0,0,0,...], "rotX": [0,0,0,...], "rotY": [0,0,0,...], "rotZ": [0,0,0,...] },
      "rightArm": { "posX": [...], "posY": [...], "posZ": [...], "rotX": [...], "rotY": [...], "rotZ": [...] }
    },
    "vfx": { "continuous": [...], "events": [...] }
  },
  "phases": [
    { "index": 0, "name": "蓄力", "description": "...", "duration": 0.8, "startSec": 0.0, "endSec": 0.8 },
    { "index": 1, "name": "攻击", "description": "...", "duration": 0.6, "startSec": 0.8, "endSec": 1.4 }
  ],
  "_phaseCount": 2,
  "_phaseBoundaries": [
    { "index": 0, "startFrame": 0,   "endFrame": 47 },
    { "index": 1, "startFrame": 48,  "endFrame": 83 }
  ],
  "_suggestedSpeeds": [0.8, 2.0],
  "_speedSegments": [
    { "startFrame": 0,  "endFrame": 47,  "speed": 0.8 },
    { "startFrame": 48, "endFrame": 83,  "speed": 2.0 }
  ]
}
```

> `_phaseBoundaries` / `_suggestedSpeeds` / `_speedSegments` 是后端**赠送给前端的变速建议**——前端想用就用、不想用就忽略，详见下方字段说明。

##### `baked` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `fps` | number | 帧率（固定 60）。帧间隔 = `1 / fps` |
| `duration` | number | 动画总时长（秒）= 各 phase 时长之和 |
| `loop` | bool | 是否循环。多阶段通常 `false` |
| `animation` | object | 按 group id 索引的逐帧数据（见下） |
| `vfx` | object? | 可选，仅在请求传 `vfxTags` 且 AI 使用了 VFX 时出现：`{ continuous: [{ target, ...preset参数 }], events: [] }`（见 §7.5） |

##### `baked.animation[group]` 轨道结构

每个 group 是 6 条等长数组（结构同 Quick §5.1）：`posX/posY/posZ`（position 增量）、`rotX/rotY/rotZ`（rotation 增量，弧度，Euler XYZ 序），全部叠加到基础姿态。

**渲染采样**：帧号 `f = clamp(round(t × fps), 0, 帧数-1)`，直接读第 `f` 个数组元素（无需插值——帧已按 60fps 密集烘焙）。

##### `phases[]` 元数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `index` | number | 阶段序号（0-based） |
| `name` | string | 阶段名（来自请求或默认 `"阶段 N"`） |
| `description` | string | 原始描述（来自请求） |
| `duration` | number | 该阶段时长（秒） |
| `startSec` | number | 阶段在总时间轴上的起始时间 |
| `endSec` | number | 阶段在总时间轴上的结束时间 |

阶段时间窗口连续且覆盖整段动画：`phases[0].startSec == 0`，`phases[N-1].endSec == baked.duration`，相邻阶段 `prev.endSec == next.startSec`。

##### `_speedSegments` / `_suggestedSpeeds` / `_phaseBoundaries`

后端响应的**可选变速建议字段**——不是请求参数，前端想用就用、不想用就忽略。

| 字段 | 类型 | 说明 |
|------|------|------|
| `_phaseBoundaries` | array? | 每个 phase 在 baked 帧数轴上的起止帧（fps=60，帧 i 时间 = `i / 60`）|
| `_suggestedSpeeds` | array? | 与 `phases` 等长的播放倍率建议。`1.0` = 正常，`2.0` = 加速一倍，`0.5` = 慢放一倍 |
| `_speedSegments` | array? | 实际可应用的帧段变速列表。结构 `{ startFrame, endFrame, speed }`。**没检测到合适节奏时为 `undefined`** |

**生成规则**：
- **多阶段 + 含攻击阶段**：按 phase 边界分速。攻击阶段（`description` 含 `attack/strike/slash/stab/chop/slash/砍/刺/劈/砸/挥` 等关键词）`2.0×`，其他 `0.8×`
- **单阶段攻击动画**：自动检测武器 quaternion 角速度峰值找出"攻击核心"段 → `2.0×`；如果蓄力段 >25% 总时长也加速 → `1.5×`；收招段保持正常
- **非攻击动画 / 节奏均匀**：返回 `undefined`，前端按线性时间播放即可

**前端三种用法**：
- **A（推荐）**：播放循环里读 `_speedSegments`，根据当前帧落在哪个 segment 调整时间步进——零额外请求
- **B**：完全忽略，按线性时间播放——动画照常工作，只是没节奏感
- **C**：把 segments 传给 `/api/animation/resample`（§5.3）让后端重采样，多一次 HTTP

#### 前端播放（分阶段变速）

`phases[]` 的核心用途是**让前端独立控制每个阶段的播放速率**，无需重新请求后端。例：

```js
// 1) 按时间 t 在 baked.animation 上采样（线性插值）
function sampleAt(baked, t) {
  const out = {};
  for (const [gid, frames] of Object.entries(baked.animation)) {
    const times = Object.keys(frames).map(Number).sort((a, b) => a - b);
    let prevT = times[0], nextT = times.at(-1);
    for (const tk of times) {
      if (tk <= t) prevT = tk;
      if (tk >= t) { nextT = tk; break; }
    }
    const alpha = nextT === prevT ? 0 : (t - prevT) / (nextT - prevT);
    const a = frames[prevT.toFixed(3)], b = frames[nextT.toFixed(3)];
    out[gid] = a.map((v, i) => (v == null || b[i] == null) ? null : v + (b[i] - v) * alpha);
  }
  return out;
}

// 2) 播放循环：根据 t 落在哪个 phase 应用对应速率
function playProAnimation(baked, phases) {
  const rateByName = { '蓄力': 0.5, '攻击': 1.5, '收招': 1.0 }; // 用户配置
  let t = 0;
  let lastTs = performance.now();
  function frame(now) {
    const dt = (now - lastTs) / 1000; lastTs = now;
    const ph = phases.find(p => t >= p.startSec && t < p.endSec);
    const rate = ph ? (rateByName[ph.name] ?? 1.0) : 1.0;
    t += dt * rate;
    if (t >= baked.duration) {
      if (baked.loop) t %= baked.duration;
      else return; // 停止
    }
    const pose = sampleAt(baked, t);
    // 把 pose 的 position/rotation/scale 增量叠加到 group 的基础姿态，applyToScene(pose);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
```

> **增量叠加**：`baked.animation` 存的是**相对基础姿态的增量**（不是绝对值）。每帧渲染时 = group 的 rest pose + frame delta。停止播放时清除增量即恢复 rest pose。

#### Description 示例

**单 description 形式（推荐日常用法）**：

```json
{ "mode": "pro", "modelJson": { ... },
  "description": "wind up the sword behind the right shoulder, then slash diagonally from upper right to lower left, recover to guard stance" }

{ "mode": "pro", "modelJson": { ... },
  "description": "crouch and leap forward, midair bring the sword down in a heavy overhead chop, land with one hand on the ground" }

{ "mode": "pro", "modelJson": { ... },
  "description": "gather fire energy between both palms, then thrust hands forward to release a fireball" }
```

**多阶段形式（需要分阶段 UI 标签时用）**：

```json
{ "mode": "pro", "modelJson": { ... },
  "phases": [
    { "name": "蓄力", "description": "下蹲蓄力，剑收到肩后" },
    { "name": "挥砍", "description": "右下到左上斜劈，剑刃冒火焰" },
    { "name": "收招", "description": "回到持剑警戒姿态" }
  ] }
```

**写法要点**：
- **单 description 是日常用法**——AI 在沙箱里自己编排"蓄力→攻击→收招"整段动作，后端 `_speedSegments` 自动检测攻击核心并加速，无需手动配 phases
- **phases 数组是高级用法**——只在需要前端给每阶段起 UI 标签、用户单独调每阶段速度时用
- description 写**完整动作流程**（含起势、爆发、收尾），用动词（slash/thrust/cast/jump/leap）而非状态词
- multiphase 推荐 2~4 阶段，每阶段聚焦一个核心动作

#### 错误

| HTTP | 含义 |
|------|------|
| 400 | `phases must be an array with at least 1 entry` — phases 缺失或为空 |
| 500 | `Phase N failed: <原因>` — 第 N 阶段生成失败，message 含具体原因（429/rate_limited 等） |

---

### 5.3 动画迁移 — `POST /api/transfer/animation`

把一个模型的**已烘焙动画**迁移到另一个结构不同的模型上：动作意图与节奏被重新适配到目标模型的关节上；若目标模型缺少实现该动作所需的结构（如源动画靠挥臂而目标无任何肢体），返回业务错误而非硬凑结果。

**请求**

```json
{
  "sourceModel": { ... },
  "sourceAnimation": { "fps": 60, "duration": 1.2, "loop": false, "animation": { ... } },
  "targetModel": { ... },
  "provider": "gpt"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `sourceModel` | object | 动画原宿主模型（完整 modelJson） |
| `sourceAnimation` | object | 该模型的 baked animation（§5.2 的 `baked` 字段原样传入） |
| `targetModel` | object | 迁移目标模型（完整 modelJson，须含至少一个 group 节点） |
| `provider` | string? | AI provider（同模型生成，默认 `gpt`） |

**响应（成功 — 动作已适配到目标模型）**

```json
{
  "ok": true,
  "mode": "transfer",
  "baked": { "fps": 60, "duration": 1.2, "loop": false, "animation": { "torso_root": { ... }, "limb_R": { ... } } }
}
```

`baked` 结构与 §5.2 完全一致（逐帧数据、按目标模型的 group id 索引），前端用同一套采样/播放逻辑渲染。

**响应（业务拒绝 — 模型差异过大，无法迁移）**

```json
{ "ok": false, "error": "MODELS_TOO_DIFFERENT", "reason": "目标模型缺少…（人类可读说明）" }
```

HTTP 仍为 200 —— 这是业务结果而非服务器错误，前端应把 `reason` 展示给用户。

**错误**

| HTTP | 含义 |
|------|------|
| 400 | `sourceModel is required` / `targetModel is required` / `sourceAnimation (baked animation or Quick motionPlan object) is required` — 参数缺失 |
| 400 | `Invalid provider: ...` — provider 不合法 |
| 429 | `rate_limited` — 该 provider 被限速 |
| 500 | 迁移烘焙失败（如 LLM 输出无法执行） |

**注意事项**
- 适配是语义级的：源动画的"双臂挥剑斜斩"迁移到持斧模型会变成"持斧斜斩"；骨骼 id、身体比例、武器类型均可不同。
- `{ ok: false, error: "EMPTY_ANIMATION" }` 表示源动画没有任何运动数据（所有 group 静止），同样返回 200。
- 耗时与 Pro 动画生成同级（一次 LLM 调用 + 烘焙），前端按 Pro 动画的加载体验处理即可。

---

### 5.4 动画合并 `/api/combine/animations`

把多个**同一模型**的 baked 动画按顺序拼接成一个更长的动画。纯几何/数值运算，不调用 LLM。

**请求**：

```json
POST /api/combine/animations
Content-Type: application/json

{
  "animations": [ baked, baked, ... ],
  "loop": true,
  "crossfade": 0.2,
  "tailBlend": 0.5,
  "fps": 60
}
```

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `animations` | `baked[]` | 必填 | 按播放顺序排列（≥1 个）。接受三种包装：bare baked `{fps,duration,loop,animation}`、编辑器动画 `{codeAnim}`、游戏剪辑 `{_baked}` |
| `loop` | `boolean` | `true` | 结果是否循环。循环时自动把结尾 `tailBlend` 秒平滑过渡回首帧姿态（无缝循环） |
| `crossfade` | `number` | `0.2` | 段落接缝两侧的平滑过渡秒数：上一段结尾朝下一段开场姿态过渡、下一段开头从上一段结尾姿态淡入 |
| `tailBlend` | `number` | `0.5` | 循环闭合的尾部过渡秒数（仅 `loop:true`） |
| `fps` | `number` | `60` | 输出帧率。各段按此帧率线性重采样（quaternion 用 slerp） |
| `smooth` | `boolean` | `true` | 逐帧平滑：限制相邻帧角速度（上限 0.45 rad/帧），把旧片段自带的单帧瞬移拉平成连续快动作 |

**行为细节**：

- **总时长 = 各段时长之和**（接缝过渡不缩短时长）。
- **组取并集**：某段没有的组在该段时间里保持 rest（单位四元数/零欧拉），并在接缝处平滑进出——"这段没驱动这个部位"。
- **四元数轨道一致性**：某组只在部分片段带 quat 轨道时，该组整体降级为欧拉轨道（保证帧数对齐），并在 `warnings` 里说明。
- `warnings` 数组列出接缝/旧片段残留的逐帧跳变与降级行为；为空即完全平滑。

**响应**：

```json
{ "ok": true, "baked": { "fps": 60, "duration": 14.83, "loop": true, "animation": { ... } }, "warnings": [] }
```

`baked` 格式与 `/api/generate/animation`、`/api/transfer/animation` 的输出一致，可直接用于播放、编辑器保存或再迁移。

---

### 5.5 Rig 动画（蒙皮骨骼）— `mode: "rig"`

用于 rig 模式（§3.1）生成、带顶层 `rig` 的模型，以及**任何生成模式**（standard、lite、voxel、voxel-pro、curve、wire、math）生成、带 group 部件的模型（动物、人物、机械都可以）。走/跑时每只脚有自己的落脚、抬脚、屈膝、脚踝和脚趾动作，站立的脚踩实地面不打滑；脊柱、颈、头、尾、象鼻、耳朵按整条骨链动作。一次请求一个动画，非流式。

**没有顶层 `rig` 的模型**：按模型自己的 group 绑骨，动画轨道直接写在模型自己的 group id 上，播放方式与其他 baked 动画相同。整段刚性的手臂 / 腿（voxel、curve 等）整体转动，没有肘和膝。第一次请求会多花几秒识别各部件和手里拿着的东西（怎么拿、怎么用），响应里带 `rigRoles`：前端把它原样存进模型的 `_meta.rigRoles`，以后的请求带上就不再识别。早先存下的 `rigRoles` 缺少手持物信息时，下一次请求会补上并在响应里返回新的 `rigRoles`，同样存回即可。没有 group 的模型返回 400。

**人形角色**（有手臂的模型）：还支持持械 / 用具 / 手势类动作——挥砍、劈、刺、格挡、射击、投掷（含抛起再接住）、踢、反复使用工具（锤、锯、扫、搅、织毛衣……）、喝 / 吃 / 看 / 吹、演奏乐器、抱在怀里、各种手势等。手里的东西按它自己的结构拿和用（弩端平、枪托抵肩、拐杖着地、灯笼下垂），双手物品两只手都握住。描述里写清力度、方向、次数即可（"轻轻""用力""双手""连砍三下"）。

**对某个东西做的动作**（搅锅、在案板上擀面、给人剪头发、刷鞋、敲门、递东西给别人）：模型里自带的东西（柜台、灶台、凳子等不属于角色身体的部件）在动画里保持不动，在角色身后或身侧时角色会先转身走到它前面再做；模型里没有的东西就照着比划，不会加到模型里。剪刀开合、钳子夹这类要用到物品活动部分的动作，如果模型里活动部分没有单独成组，响应会带回改好的模型（见下面响应里的 `modelJson`）。

**物品换位置**：动画可以把物品从原来的位置拿下来、放到别处——从背上 / 腰间拔剑、收剑入鞘、背回背上、换到另一只手、放到地上（"从背上拔剑然后劈砍""把剑背到背上"）。只移动物品，身体部件不变；轨道写在物品自己的 group 上，模型的层级不变，播放方式不变。手里的、背着的、挂在腰间的物品都可以。

**骑乘模型**（骑马的人、乌龟骑大象、骨龙骑士、骑摩托车 / 自行车的人……）：坐骑和骑手一起动——坐骑走、跑、人立（车开、转弯压弯），骑手跟着坐骑移动并做自己的上身动作（挥剑、举枪、张望；骑自行车会踩踏板）。返回的 `plan.layers` 里骑手的层带 `"who": "rider"`；轨道仍然写在模型自己的 group 上，播放方式不变。

**机械**（汽车、卡车、巴士、摩托车、自行车、坦克 / 推土机 / 挖掘机等履带车、火车、飞机、火箭、直升机、无人机、船、风车 / 风扇 / 塔吊等原地机器、有腿的机甲）：按机械的方式动——车轮按开过的路程滚动，前轮 / 车把按弯道转向，车身随起步刹车俯仰、随转弯侧倾、随路面颠簸，两轮车转弯压弯，可以倒车、掉头（履带车原地转）、漂移；飞机滑跑抬头起飞、降落、滑行、爬升、俯冲、横滚、翻筋斗，副翼 / 升降舵 / 方向舵跟着偏转；直升机 / 无人机旋翼加速后离地、悬停、机头下压向前飞、降落；船随浪起伏航行；车门、舱门、推土铲、动臂、斗杆、铲斗、车斗、云梯开合升降，炮塔转向、开炮后坐，螺旋桨、风车、风扇转动。开出去 / 飞出去时整个模型在场景里真的移动。轨道写在模型自己的 group 上，播放方式不变。

#### 请求

```json
{
  "mode": "rig",
  "modelJson": { "...": "rig 模式生成的模型，原样传入" },
  "description": "大象用鼻子卷起一根木头",
  "provider": "deepseek",
  "duration": 3.5,
  "loop": false
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | string | 固定 `"rig"` |
| `modelJson` | object | 要动画的模型，原样传入：rig 模式生成的（带顶层 `rig`），或任何生成模式、带 group 部件的模型（之前返回过的 `rigRoles` 存在 `_meta.rigRoles` 里一起带上） |
| `description` | string | 动作描述，中英文均可 |
| `duration` | number? | 可选，固定时长（秒，0.5–12）。省略时按动作决定 |
| `loop` | boolean? | 可选，强制循环 / 一次性。省略时按动作判断：走、跑、摇尾、待机循环；抽打、卷起、坐下、跳跃一次性 |
| `provider` | string? | 同其它动画端点，省略默认 `deepseek` |

#### 响应

```json
{
  "ok": true,
  "mode": "rig",
  "baked": { "fps": 60, "duration": 3.5, "loop": false, "animation": { "root": { ... }, "trunk_0": { ... } } },
  "plan": { "duration": 3.5, "loop": false, "layers": [{ "op": "idle", "start": 0, "end": 3.5 }, { "op": "grab", "start": 0.2, "end": 3.3 }] },
  "rigRoles": { "...": "只在没有顶层 rig 的模型第一次请求（或补全）时出现" },
  "modelJson": { "...": "只在模型被改动时出现（见下）" }
}
```

- **`baked`**：格式同 §5.1，按骨骼 group id 索引（辅助 group `<骨头 id>_half` 也有轨道，当骨骼一样播放）。每个参与动画的骨骼都有完整的 10 条轨道：`quatX..W` 是绝对局部朝向（优先使用）；`rotX..Z` 是同一朝向的 Euler XYZ（骨骼静止朝向是单位四元数，所以只认 Euler 的播放器也能正确播放）；`posX..Z` 是位移增量（身体的起伏、前进在根骨骼上，其余骨骼多为 0）。没出现的骨骼保持静止姿态。`loop: true` 时最后一帧与第一帧完全相同。
- **`plan`**：这段动画的分层摘要，每层一个动作名 `op` 和起止时间（秒），可用来在 UI 上标时间轴；播放不需要。骑乘模型里骑手的层带 `"who": "rider"`。
- **`rigRoles`**：可选。没有顶层 `rig` 的模型在第一次请求（或旧的 `rigRoles` 被补全）时返回，内容不透明；原样存进模型的 `_meta.rigRoles`，之后的请求带上，省去重新识别。
- **`modelJson`**：可选。动作要用到手里物品的活动部分（剪刀的两片刃开合、钳口夹紧）、而模型里这部分没有单独成组时返回：还是同一个模型，只是活动部分各自成了一个子 group（枢轴在铰链处），所有网格的位置、大小、颜色都不变。`baked` 的轨道写在这个模型的 group 上——**先用它替换当前模型，再播放**（建议像一次修改那样可以撤销）；同时返回的 `rigRoles` 属于这个新模型，存进它的 `_meta.rigRoles`。模型没有改动时不出现。

**播放**：按 §5.1 逐帧采样，只驱动骨骼和辅助 group（四元数直接设到 group 上，位移叠加到 group 的 `transform.pos`）；蒙皮网格按 §3.2 绑定后会自动跟着变形。停止播放时把它们恢复成单位四元数 + 原 `transform.pos`。合并（§5.4）同样适用于 rig 动画。

#### Description 示例

```json
{ "mode": "rig", "modelJson": { ... }, "description": "小狗开心地摇尾巴" }
{ "mode": "rig", "modelJson": { ... }, "description": "马小跑", "loop": true }
{ "mode": "rig", "modelJson": { ... }, "description": "小狗走过来打招呼" }
{ "mode": "rig", "modelJson": { ... }, "description": "老虎甩尾巴抽打" }
{ "mode": "rig", "modelJson": { ... }, "description": "狗坐下歪头看你" }
{ "mode": "rig", "modelJson": { ... }, "description": "小狗直立，同时一只前爪指向斜前方" }
{ "mode": "rig", "modelJson": { ... }, "description": "九尾狐只摇第三条尾巴" }
{ "mode": "rig", "modelJson": { ... }, "description": "三头犬左边的头看左边，中间的头叫" }
{ "mode": "rig", "modelJson": { ... }, "description": "消防员双手抡斧，用力劈门三下" }
{ "mode": "rig", "modelJson": { ... }, "description": "弩手端起十字弩瞄准左前方射击" }
{ "mode": "rig", "modelJson": { ... }, "description": "妈妈轻轻摇晃怀里的婴儿" }
{ "mode": "rig", "modelJson": { ... }, "description": "骑士策马小跑，举起长枪" }
{ "mode": "rig", "modelJson": { ... }, "description": "老奶奶在案板上擀面" }
{ "mode": "rig", "modelJson": { ... }, "description": "园丁用大剪刀修剪灌木" }
{ "mode": "rig", "modelJson": { ... }, "description": "汽车起步，开一段后左转" }
{ "mode": "rig", "modelJson": { ... }, "description": "坦克炮塔转向右边，连开两炮" }
{ "mode": "rig", "modelJson": { ... }, "description": "直升机起飞后向前飞" }
{ "mode": "rig", "modelJson": { ... }, "description": "推土机放下铲子往前推" }
```

**能做的动作**：步态（走、小跑、对侧步、慢跑、飞奔、跃奔、四脚弹跳；两足：走、跑、蹦），原地或真的走出去；待机呼吸、坐下、人立、悬停飞行、跳起；原地转身、空翻（前 / 后 / 侧）、趴下 / 侧躺 / 仰躺 / 翻身；摇头、点头、转头看、张嘴（吠叫、咀嚼、喘气、吼叫）；摇尾、甩尾抽打、卷尾；象鼻卷起东西、送到嘴边、甩鼻子；扇耳朵 / 扇翅膀；抬一只脚、跺脚；打招呼（自动选手臂、象鼻、翅膀、前爪或尾巴）；让某个部位指向一个方向并保持（"前爪指向斜前方""尾巴指向天空""头看向右上方"，方向按动物自己的前后左右）。几个动作可以同时做，也可以先后做（"走过来再打招呼"）。模型上没有的部位（狗没有象鼻和翅膀）对应的动作会被跳过；没有腿的体型（蛇、鱼）"走"会变成身体摆动。

**多条尾巴 / 多个头**（九尾狐、三头犬）：不指定时全部一起动（摆动自动错开）；描述里可以只点其中一个或一侧（"第三条尾巴""左边的尾巴""中间的头"），左右按动物自己的左右。

**写法要点**：一句话说清动作和情绪（"开心地""慢慢地""猛地"会影响幅度和快慢）；需要固定时长或强制循环时用 `duration` / `loop`，不用写进描述。

#### 错误

| HTTP | 含义 |
|------|------|
| 400 | `description is required` / `model has no rig and no parts to rig`（模型没有 group 部件）/ `could not rig this model: ...` / `bad rig: ...`（rig 字段损坏）/ `Invalid provider: ...` |
| 429 | `rate_limited` — 该 provider 被限速 |
| 500 | 生成失败（上游模型调用出错） |

### 5.5.1 对话修改 Rig 动画 — `POST /api/refine/animation`

在一段已有的 rig 动画（§5.5 返回的）上按用户说的话修改，不必重新描述整段动作。可以连续对话：把之前几轮（用户的话和返回的 `changes`）放进 `history`，并传入**当前**的 `plan`（包含之前的修改和用户自己调过的参数）。

#### 请求

| 字段 | 类型 | 说明 |
|------|------|------|
| `modelJson` | object | 这段动画所属的模型，原样传入（`_meta.rigRoles` 一起带上：生成这段动画时返回过） |
| `plan` | object | 这段动画当前的 `plan` |
| `description` | string | 可选。这段动画原来的动作描述 |
| `request` | string | 用户这次说的话（≤ 1000 字） |
| `history` | array | 可选。之前几轮 `[{ role: "user" \| "assistant", text }]`，最多取最后 12 轮 |
| `provider` | string | 可选，同 §5.5 |

#### 响应

```json
{ "ok": true, "mode": "rig", "baked": { "...": "同 §5.5" }, "plan": { "...": "新的 plan" }, "changes": "把斜劈的幅度和力度都加大了……" }
```

- **`baked`** / **`plan`**：修改后的动画，格式与 §5.5 相同；`plan` 存下来，下次修改时传入。
- **`changes`**：给用户看的回复（几行中文）。用户只是提问、没要求修改时，`plan` 不变。

#### 错误

| 状态 | 说明 |
|------|------|
| 400 | 缺 `plan` / `request`、模型还没有 `rigRoles`（先用 §5.5 生成一段动画）、骑乘模型（暂不支持对话修改） |
| 429 | 限流，稍后重试 |
| 502 | `REFINE_PLAN_UNUSABLE`：这次没能得到可用的修改，可以重试或换个说法 |

### 5.5.2 编辑 Rig 计划 — `POST /api/rig/plan/bake`、`GET /api/rig/plan/schema`

rig 动画的 `plan.layers` 是一串子动作（每层一个 `op`、起止时间 `start` / `end`、淡入淡出 `fade` 和这个动作的参数）。前端可以让用户直接改某一层的参数、删掉某一层，然后用 `/api/rig/plan/bake` 重新算出动画（不调 AI，通常 0.1–0.5 秒）。

- **`GET /api/rig/plan/schema`** → `{ ok, ops, timing, plan }`：`ops[op] = { label, params: [{ key, label, type, min?, max?, step?, unit?, options? }] }`，`type` 是 `num` / `int`（带范围）、`enum`（`options: [{ v, label }]`）、`bool`；`timing` 是每层都有的 `start` / `end` / `fade`；`plan` 是整段的 `duration` / `loop`。范围之内的值烘焙时原样保留。不在列表里的参数（部件 id、目标名等）保持计划原样即可。
- **`POST /api/rig/plan/bake`** `{ modelJson, plan }` → `{ ok, mode: "rig", baked, plan }`：返回的 `plan` 是校验后的版本（超出范围的值、做不到的层已调整），以它为准。错误同 §5.5.1 的 400。

### 5.6 任意 GLB 绑骨 + 动画

用户上传任意 .glb（动物、角色、外星生物；自带骨骼、骨骼命名 / 绑法不一样、完全没骨骼都行），先绑骨，再用一句话生成动画片段，片段直接播在这个 GLB 的节点上。动作能力同 §5.5。后端不保存模型：两次请求之间由前端拿着第一步返回的 `rig`。

#### 第一步：绑骨 — `POST /api/rig/glb`

请求体是 .glb 文件的**原始字节**（不是 JSON，不是 multipart）。不调用 AI，不消耗额度。

```js
const res = await fetch(`${API}/api/rig/glb?name=${encodeURIComponent('狐狸')}`, {
  method: 'POST',
  headers: { 'Content-Type': 'model/gltf-binary' },   // 或 application/octet-stream
  body: file,                                          // File / Blob / ArrayBuffer
});
const r = await res.json();
```

查询参数（都可选）：

| 参数 | 说明 |
|------|------|
| `name` | 这是什么（"狐狸""九尾狐""外星虫"），生成动画时用来理解动作，最多 60 字 |
| `forward` | 模型在 GLB 里面朝的方向：`+z` / `-z` / `+x` / `-x`。省略时自动判断；判断错了（走路倒着走）再传 |
| `kind` | 体型：`quadruped` / `biped` / `insect` / `bird` / `fish` / `snake` / `other`。省略时按腿判断 |
| `meters` | 真实身高（米），影响步幅和速度 |
| `autorig` | `1` = 不用自带骨骼，按形状重新绑（自带骨骼动起来不对时用） |

响应：

```json
{
  "ok": true,
  "rigging": "auto",
  "glb": "<base64>",
  "rig": "r1.eJy…",
  "summary": {
    "kind": "quadruped", "legs": 4, "joints": 24,
    "chains": [
      { "id": "leg_FL", "role": "leg", "side": "L", "joints": ["LeftUpperArm", "LeftForeArm", "LeftHand"] },
      { "id": "tail", "role": "tail", "joints": ["Tail01", "Tail02", "Tail03"] }
    ],
    "warnings": []
  }
}
```

| 字段 | 说明 |
|------|------|
| `rigging` | `own` = 用 GLB 自带的骨骼（节点、命名、朝向都不变）；`auto` = GLB 没有可用的骨骼，按形状绑了一套 |
| `glb` | 只在 `rigging: "auto"` 时有：绑好骨的 GLB（base64）。**之后加载、播放、导出都必须用这个 GLB**——片段的节点编号指的是它 |
| `rig` | 传给第二步。不透明字符串（几 KB 到几百 KB），不要修改；可以跟模型一起存下来，以后接着生成动画 |
| `summary` | 给 UI 展示：体型、腿数、关节数、识别出的骨链（`role`：`spine` / `neck` / `head` / `jaw` / `tail` / `leg` / `arm` / `wing` / `ear` / `trunk` …；`joints` 是 GLB 里的节点名）、`warnings`（例如没找到腿：走路、站立类动作做不了） |

#### 第二步：生成动画 — `POST /api/rig/glb/animation`

```json
{ "rig": "r1.eJy…", "description": "小狐狸开心地摇尾巴", "duration": 3, "loop": true, "provider": "deepseek" }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `rig` | string | 第一步返回的 `rig` |
| `description` | string | 动作描述，中英文均可（最多 2000 字），写法和示例见 §5.5 |
| `duration` / `loop` / `provider` | | 同 §5.5 |

一次一个动画；要多个动画就用同一个 `rig` 并行发多个请求。

响应：

```json
{
  "ok": true,
  "clip": {
    "fps": 30, "duration": 3, "loop": true,
    "times": [0, 0.033333, 0.066667],
    "tracks": [
      { "node": 2, "path": "rotation", "values": [0.0089, -0.0151, 0.0095, 0.9998] },
      { "node": 2, "path": "translation", "values": [0.5466, -3.9792, -0.7709] }
    ]
  },
  "plan": { "duration": 3, "loop": true, "layers": [{ "op": "wag", "start": 0, "end": 3 }] }
}
```

- **`clip`** 就是一段 glTF 动画：`node` = GLB 的节点编号（`nodes` 数组下标）；`path` 只有 `rotation`（局部四元数 xyzw）和 `translation`（局部位置，绝对值不是增量）；所有轨道共用 `times`，线性插值。没有轨道的节点保持原姿态。`loop: true` 时最后一帧与第一帧相同。
- **`plan`** 同 §5.5，可在时间轴上标出动作；播放不需要。
- 要导出带动画的 GLB：每个片段写成一个 glTF `animation`，每条轨道一个 channel（`target: {node, path}`，sampler `LINEAR`，input = `times`，output = `values`）。

**用 three.js 播放**：

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const bytes = r.glb ? Uint8Array.from(atob(r.glb), (c) => c.charCodeAt(0)).buffer : await file.arrayBuffer();
const gltf = await new GLTFLoader().parseAsync(bytes, '');
scene.add(gltf.scene);

// 节点编号 → three.js 对象
const byNode = new Map();
for (const [obj, a] of gltf.parser.associations) if (obj.isObject3D && a?.nodes !== undefined) byNode.set(a.nodes, obj);

function toThreeClip(clip, name) {
  const tracks = clip.tracks.filter((t) => byNode.has(t.node)).map((t) => {
    const o = byNode.get(t.node);
    return t.path === 'rotation'
      ? new THREE.QuaternionKeyframeTrack(`${o.uuid}.quaternion`, clip.times, t.values)
      : new THREE.VectorKeyframeTrack(`${o.uuid}.position`, clip.times, t.values);
  });
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

const mixer = new THREE.AnimationMixer(gltf.scene);
const action = mixer.clipAction(toThreeClip(anim.clip, '摇尾巴'));
if (!anim.clip.loop) { action.setLoop(THREE.LoopOnce); action.clampWhenFinished = true; }
action.play();
// 每帧：mixer.update(dt)
```

#### 限制

- 不支持压缩过的几何（Draco、meshopt）和引用外部文件的 glTF——导出时关掉压缩、导出成单个 .glb。
- 文件最大 64 MB。`voxelstudio.site` 上请求和响应都不能超过约 4.5 MB（`rigging: "auto"` 的响应里有 base64 的 GLB，约为文件的 1.4 倍），大文件改用开头的备用地址（Zeabur）。
- 顶点特别多的模型可能处理不了（`glb_too_complex`），换一个面数少些的版本。
- 没有腿的模型（鱼、蛇、虫子身体）"走"会变成身体摆动。

#### 错误

body：`{ "ok": false, "error": "<码>", "errorCode": "<码>", "message": "<说明>" }`

| HTTP | 错误码 | 含义 |
|------|--------|------|
| 400 | `glb_invalid` | 不是 .glb，或请求体不是文件字节 |
| 400 | `glb_compressed` | 用了 Draco / meshopt 压缩 |
| 400 | `glb_external_data` | 引用了外部文件（.gltf + .bin） |
| 400 | `glb_no_mesh` | GLB 里没有网格 |
| 400 | `rig_token_invalid` | `rig` 不对（被改过、截断了），重新走第一步 |
| 400 | `bad_request` | 参数不对，`message` 说明是哪个 |
| 413 | — | 文件太大 |
| 422 | `glb_unriggable` | 认不出这个模型的形状，绑不了骨 |
| 422 | `glb_too_complex` | 模型太复杂，处理不了 |
| 429 | `rate_limited` | 被限速，稍等重试 |
| 503 | `rig_busy` | 同时处理的模型太多，稍等重试 |
| 500 | `rig_failed` / `animation_failed` | 失败，可以重试 |

---

## 6. 模板模块 (Runtime)

### `GET /api/templates/module.js`

返回一个 ES Module，是前端的运行时核心。几何参数 schema 单独 serve 在 `GET /api/templates/geometry-schema.js`，module.js 会相对 import 它——无需 bundler，浏览器原生 ESM。

**THREE 注入（推荐）**——不必污染全局 `window.THREE`：
```js
import * as THREE from 'three';
const mod = await import(`${API}/api/templates/module.js`);
const runtime = mod.create({ THREE });   // 绑定 THREE 实例
```

**向后兼容**：不调 `create()` 时回退到全局 `THREE`；`mod.voxelStudioRuntime` 也仍导出。

### Runtime API

```js
const rt = mod.create({ THREE });

// ═══ 动画 ═══

// 列出所有动画模板（slider UI 用）
rt.listAnimationTemplates()
// → [{ key:'bounce', label:'Bounce', params:[{key:'amplitude',type:'float',min:-1,max:1,default:0.2,curve:2.5},...], isLooping:true }, ...]

// ⚠️ emit 模板的 params 使用扁平 key（如 velDirX, colorStartR），与 plan 中的嵌套 emit config 不同。
// 用下面的 flattenEmitConfig / unflattenEmitConfig 在 flat ↔ nested 之间转换。

// 评估完整 Motion Plan（仅旧版 plan 存档回放/编辑器用；新响应为 baked 数值轨道）— v2: (plan, duration, t, lookups?)
//   lookups = { getPart(id), getChildren(id) }，解耦具体 model 表示；
//   wave/tilt 等需要结构信息的模板从 lookups 取，无则安全降级。
rt.evaluateMotion(plan, duration, t, lookups)
// → { groupId: { position:[dx,dy,dz], rotation:[rx,ry,rz], scale:[sx,sy,sz]|null } }
//   ⚠️ 返回值是增量（delta），需叠加到基础姿态

// 评估单个模板（Canvas 曲线预览用）
rt.evaluateTemplate(name, params, t, duration)
// → { position:[x,y,z] } 或 { rotation:[rx,ry,rz] } 或 { scale:[sx,sy,sz] }

// ═══ 粒子 ═══

// 将 plan 中的嵌套 emit config 转为扁平 key（slider UI 用）
rt.flattenEmitConfig(nestedConfig)
// nested:  { rate:20, velocity:{dir:[0,1,0],speed:[1,3],spread:0.3}, acceleration:[0,-2,0], ... }
// flat:    { rate:20, velDirX:0, velDirY:1, velDirZ:0, velSpeedMin:1, velSpeedMax:3, ... }

// 将扁平 slider key 还原为嵌套 emit config（写入 plan / 传给粒子系统）
rt.unflattenEmitConfig(flatConfig)
// flat → nested（结构与上面相反）

// ═══ 几何 ═══

// 列出所有已知几何类型
rt.listGeometryTypes()
// → ['box','sphere','cylinder','cone','torus','wedge','tri','patch','icosahedron','dodecahedron','octahedron']

// 构建 Three.js geometry
rt.buildGeometry(type, params)
// → THREE.BoxGeometry / THREE.BufferGeometry / ...
// 类型不存在时 throw Error
```

### `evaluateMotion` 返回值

每个 group 返回的是**增量（delta）**，不是绝对位姿：

```js
{
  position: [dx, dy, dz],  // 位移增量
  rotation: [rx, ry, rz],  // 旋转增量（弧度）
  scale: null | [sx,sy,sz] // 缩放，null 表示不变
}
```

> **⚠️ 关键**：必须将 delta **叠加**到 group 的基础姿态上（加/乘），不可直接赋值替换。见 §8 集成示例。

### 身体姿态模板 `poseSeq`

旧版 Motion Plan 的整体验证/回放可通过 `rt.evaluateMotion` 求值此模板（单独 `evaluateTemplate` 不执行世界姿态约束）。Quick 响应仍为 baked 数值轨道，播放器不需新增模板逻辑。

```js
const plan = {
  _loop: false,
  character: {
    poseSeq: {
      pivot: [0, 1, 0],
      pin: [],
      groundY: 0,
      keys: [
        { t: 0, rot: [0, 0, 0], ground: 0 },
        { t: 1.5, rot: [-90, 0, 0], ground: 1, ease: 'easeInOut' }
      ]
    }
  }
};
```

| 参数 | 语义 |
|------|------|
| `pivot` | 世界支点 `[x,y,z]`，或随当前姿态求值的 `{group:'id',offset:[x,y,z]}`（offset 为组局部坐标） |
| `keys[].t` / `rot` | 相对模板起点的秒数 / 世界 XYZ 旋转增量（度）；四元数插值，末 key 后保持 |
| `keys[].offset` | 可选世界平移增量 `[x,y,z]`，默认零 |
| `keys[].ease` | 可选缓动（如 `easeInOut`），作用于到达该 key 的段 |
| `pin` | 可选后代 group id 数组，保持这些子树在姿态应用前的世界位置和方向；非后代忽略，嵌套重复合并 |
| `groundY` / `keys[].ground` | 可选地面世界高度 / 贴地进度 `[0,1]`；始终阻止穿地，进度为 1 时整个目标子树的最低网格顶点贴地 |
| `_t0` / `_t1` | 可选模板生效时间窗；keys 时间相对 `_t0` |

弯腰在上半身组使用腰部 pivot 和腿根 pin；躺卧在包含双腿的角色根使用 `groundY`，pin 留空。地面修正会平移整个目标子树，因此固定腿与地面修正应分开使用。同组避免再叠加 `aimSeq` / `sweep` 等旋转约束；后代可单独调整。Y 向上、+Z 向前时，前倾/俯卧使用 +X，仰躺使用 -X 90 度，侧卧使用 ±Z 90 度。求值需提供完整 `getPart` / `getChildren`、基础姿态及网格定义，并注入 THREE；叶网格须保留原始 quaternion 和正数 `scale`，防闪烁应使用材质深度偏移，不能移动网格。不支持动态缩放祖先或顶点变形后的接触约束。

### `buildGeometry` 参数

每种 type 的 `geometry` 参数（括号内为默认值）：

| type | geometry 参数 |
|------|---------------|
| `box` | `width`(1), `height`(1), `depth`(1) |
| `sphere` | `radius`(1), `widthSegments`(8), `heightSegments`(6) |
| `cylinder` | `radiusTop`(1), `radiusBottom`(1), `height`(1), `radialSegments`(8) |
| `cone` | `radius`(1), `height`(1), `radialSegments`(8) |
| `torus` | `radius`(1), `tube`(0.3), `radialSegments`(8), `tubularSegments`(12) |
| `icosahedron` / `dodecahedron` / `octahedron` | `radius`(1), `detail`(0) |
| `wedge` | `width`(1), `height`(1), `depth`(1) |
| `tri` | `a`[x,y,z], `b`[x,y,z], `c`[x,y,z], `d`(0；>0 时为有厚度的三角棱柱) |
| `patch` | `vertices`[x1,y1,z1,...]（每 3 顶点一个三角形）, `d`(0；>0 时双面偏移成带厚薄片) |
| `loft` | `path`[x1,y1,z1,...]（截面中心，mesh 局部坐标）, `rw`[...]（每个截面的半宽）, `rh`[...]（每个截面的半高，省略同 `rw`）, `up`([0,1,0]；截面“高”方向), `sides`(8；截面边数), `caps`("round,round"；首,尾 各为 `round` / `point` / `flat`)。有机管状体（躯干 / 脖子 / 口鼻 / 尾 / 角）用它 |
| `mesh` | `data`（base64 编码的三角网格，由精修 §3.7 产生；`buildGeometry` 负责解码）。几何可能带 `color` 顶点色属性（乘在材质颜色上）：有就设 `vertexColors: true`；平滑 / 硬边已经由网格拓扑表达，材质用 `flatShading: false` |
| `skinTube` | `path`[x1,y1,z1,...]（环中心，mesh 局部坐标）, `radii`[...]（每环半宽）, `aspect`(1；环高/宽), `sides`(8), `skinIndex`[...]、`skinWeight`[...]（每环 4 个骨骼槽位/权重）。返回的几何带 `skinIndex`/`skinWeight` 属性，用法见 §3.2「蒙皮骨骼」 |

> **朝向提醒**：`cylinder`/`cone` 默认轴是 +Y，斜向件的朝向由 mesh 的 `quaternion` 给出（见 §3.2）。`buildGeometry` 只返回裸几何，**不应用 `quaternion`**——前端创建 Mesh 后自行 `mesh.quaternion.set(...)`。
>
> **精度提醒**：`widthSegments` / `heightSegments` / `radialSegments` / `tubularSegments` / `sides` 就是 mesh 的面数精度，写在 model.json 里；同一份 model.json 无论谁来建，三角面都一样。
>
> **导出 GLB**：接口只返回 model.json，不返回 GLB。需要 GLB 时在前端按 model.json 建场景（group = `THREE.Group`，叶节点 = `buildGeometry` + 材质，按 `transform` 设 position / quaternion / scale，按 `parent` 组装），再用 three.js 的 `GLTFExporter`（`binary: true`）导出。

> **材质提醒**：`buildGeometry` 不含材质。用 mesh 的 `color` 或 `material` 字段创建 `MeshStandardMaterial`，lowpoly 风格建议 `flatShading:true`。`tri`/`patch` 当 `d==0`（零厚度薄片）时材质需 `side: THREE.DoubleSide` 才能双面可见。

---

## 7. 粒子系统

当 `emitParticles: true` 时，响应 `baked.emit` 可能携带粒子配置：`{ [groupId]: { emit: { ... } } }`。emit 不产生 transform 增量，而是配置一个粒子发射器——前端需自行实现粒子渲染。

### 6.1 emit 配置格式

每个 group 的 emit 以**嵌套结构**存储在 `baked.emit[gid].emit` 中：

```json
{
  "rightHand": {
    "swing": { "axis": "y", "amplitude": 0.8, "frequency": 1.5 },
    "emit": {
      "emitMode": "point",
      "mesh": "sphere",
      "meshSize": 0.4,
      "rate": 25,
      "lifetime": [0.4, 0.8],
      "velocity": { "dir": [0, 1, 0], "speed": [1, 2], "spread": 0.4 },
      "acceleration": [0, -3, 0],
      "offset": [0, 0, 0],
      "colorStart": [1, 0.8, 0.2],
      "colorEnd": [0.5, 0, 0],
      "scaleStart": 1.0,
      "scaleEnd": 0.3
    }
  }
}
```

> **注意**：emit 使用嵌套结构。UI slider 开发时，用 `rt.flattenEmitConfig()` / `rt.unflattenEmitConfig()` 在 flat ↔ nested 之间转换。粒子渲染时直接读取嵌套格式。

### 6.2 参数说明

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `emitMode` | string | `"point"` | 发射模式：`"point"`—从 group 世界坐标中心 + offset 发射；`"volume"`—从 group 的 AABB 体积内随机点发射 |
| `mesh` | string | `"sphere"` | 粒子形状：`"box"` 或 `"sphere"` |
| `meshSize` | number | 0.4 | 粒子基础尺寸（世界单位），乘以 scaleStart/scaleEnd 得实际大小 |
| `rate` | number | 15 | 每秒发射粒子数 |
| `lifetime` | [min, max] | [0.5, 1.5] | 粒子寿命范围（秒），每个粒子在范围内随机取值 |
| `velocity.dir` | [x,y,z] | [0,1,0] | 发射主方向（无需归一化，内部会归一化） |
| `velocity.speed` | [min,max] | [1,3] | 初速范围（世界单位/秒），每个粒子在范围内随机取值 |
| `velocity.spread` | number | 0.3 | 散布角度（0=平行发射，1=半球散布） |
| `acceleration` | [x,y,z] | [0,0,0] | 加速度（世界单位/s²）。重力效果用负 Y：`[0,-5,0]`；上升烟雾用正 Y |
| `offset` | [x,y,z] | [0,0,0] | 发射点偏移（相对 group 世界坐标，仅 `emitMode:"point"` 有效） |
| `colorStart` | [r,g,b] | [1,0.8,0.2] | 粒子出生颜色（0~1 RGB） |
| `colorEnd` | [r,g,b] | [0.5,0,0] | 粒子死亡颜色（0~1 RGB） |
| `scaleStart` | number | 1.0 | 出生时尺寸倍数（× meshSize） |
| `scaleEnd` | number | 0.3 | 死亡时尺寸倍数（× meshSize） |

### 6.3 渲染实现指南

粒子渲染核心流程：**spawn → simulate → interpolate → render**。

#### 1. 发射器初始化

遍历 `baked.emit` 的所有 group，为每个创建发射器。推荐使用 **THREE.InstancedMesh**（单 draw call 高效渲染数百粒子）：

```js
// 最大粒子数 = rate × maxLifetime（向上取整，建议上限 500）
const maxCount = Math.min(500, Math.ceil(rate * maxLifetime + 5));
const geometry = mesh === 'box'
  ? new THREE.BoxGeometry(1, 1, 1)
  : new THREE.IcosahedronGeometry(0.5, 0); // sphere
const material = new THREE.MeshStandardMaterial({
  flatShading: true, transparent: true, opacity: 0.9,
});
const im = new THREE.InstancedMesh(geometry, material, maxCount);
im.count = 0;
im.castShadow = false;
im.frustumCulled = false;  // 粒子可能飞离视锥边界
scene.add(im);
```

#### 2. 每帧更新

```
for each emitter:
  1. 获取 group 的世界位置 (group.getWorldPosition)
  2. 若 emitMode === 'volume'：计算 group 的世界 AABB
     - 遍历 group 所有子 mesh
     - geometry.computeBoundingBox() → applyMatrix4(mesh.matrixWorld)
     - Box3.union() 合并所有子 mesh 的包围盒
     - 若 AABB 为空，回退为 point 模式
  3. 按 rate 生成新粒子 (accumulator += rate × dt)
     - point 模式：pos = worldPos + offset
     - volume 模式：pos = randomPointInAABB(min, max)
  4. 模拟已有粒子：pos += vel × dt; vel += accel × dt; life -= dt
  5. 移除死亡粒子 (life ≤ 0)
  6. 同步 InstancedMesh：为每个存活粒子设置 matrix + color
```

#### 3. 颜色/尺寸插值

每个粒子在 lifetime 内从起始值线性过渡到终止值。使用 `t = 1 - life / maxLife`（0=出生, 1=死亡）：

```js
// 尺寸插值
const s = meshSize * (scaleStart + (scaleEnd - scaleStart) * t);
// 颜色插值
const r = colorStart[0] + (colorEnd[0] - colorStart[0]) * t;
const g = colorStart[1] + (colorEnd[1] - colorStart[1]) * t;
const b = colorStart[2] + (colorEnd[2] - colorStart[2]) * t;

// 更新 InstancedMesh
dummy.position.set(px, py, pz);
dummy.scale.set(s, s, s);
dummy.updateMatrix();
im.setMatrixAt(i, dummy.matrix);
im.setColorAt(i, new THREE.Color(r, g, b));
im.instanceMatrix.needsUpdate = true;
im.instanceColor.needsUpdate = true;
```

#### 4. 速度生成

```js
// 方向 + 随机散布
let vx = dir[0] + (Math.random() - 0.5) * spread * 2;
let vy = dir[1] + (Math.random() - 0.5) * spread * 2;
let vz = dir[2] + (Math.random() - 0.5) * spread * 2;
const len = Math.sqrt(vx*vx + vy*vy + vz*vz) || 1;
// 随机速度
const speed = speedMin + Math.random() * (speedMax - speedMin);
// 最终速度 = 归一化方向 × 速度标量
vel = [(vx/len)*speed, (vy/len)*speed, (vz/len)*speed];
```

#### 5. AABB 体积发射

```js
// 计算 group 的世界 AABB
const aabb = new THREE.Box3().makeEmpty();
group.traverse(child => {
  if (child.isMesh && child.geometry) {
    child.geometry.computeBoundingBox();
    const childBox = child.geometry.boundingBox.clone();
    childBox.applyMatrix4(child.matrixWorld);
    aabb.union(childBox);
  }
});
// 体积模式：在 AABB 中随机取点
const pos = new THREE.Vector3(
  aabb.min.x + Math.random() * (aabb.max.x - aabb.min.x),
  aabb.min.y + Math.random() * (aabb.max.y - aabb.min.y),
  aabb.min.z + Math.random() * (aabb.max.z - aabb.min.z)
);
```

#### 6. 生命周期管理

- **播放开始**：为每个 emit group 创建发射器
- **动画自然结束**（非循环，t ≥ duration）：销毁所有发射器，移除 InstancedMesh
- **动画停止/切换**：销毁所有发射器
- **循环动画**：粒子持续运行，无需处理

### 6.4 UI 开发注意事项

- `listAnimationTemplates()` 中 emit 的 `params` 使用**扁平 key**（如 `velDirX`、`colorStartR`）；`baked.emit[gid].emit` 为嵌套格式
- Slider 读取 emit 参数：`rt.flattenEmitConfig(baked.emit[gid].emit)` → 得扁平对象
- Slider 写入 emit 参数：从 slider 收集扁平值 → `rt.unflattenEmitConfig(flat)` → 写回 emit 配置
- 粒子效果在 slider 调整时需实时重建发射器以预览变化

---

## 7.5 动画触发 VFX（词汇表驱动）

> 新系统（与 §7 legacy emit 并存）。前端在动画请求里传 `vfxTags` 词表 JSON，启用词汇表驱动的粒子效果。

### 启用方式

Quick / Pro / Multiphase 端点都接受可选 `vfxTags` 字段（结构同 `materialTags`）。省略 → 不启用，AI 输出零 VFX 字样。

### Quick / Pro 模式：`baked.vfx` 字段

Quick 与 Pro 的 VFX 统一经 `baked.vfx` 返回（Quick 的持续效果转换为目标 group 列表）：

```json
{
  "continuous": [
    { "target": "rightFoot", "preset": "hit_debris", "params": { "power": 0.6 } },
    { "target": "head", "preset": "flame", "anchor": { "offset": [0, -0.4, 0.6] }, "dir": [0, 0, 1], "params": { "scale": 1.0 } }
  ],
  "events": []
}
```

### Pro 模式：api.vfx / api.emit

```js
// 持续效果（动画开始挂上，结束销毁）
api.vfx('head', {
  preset: 'flame',
  anchor: { offset: [0, -0.4, 0.6] },
  dir: [0, 0, 1],
  params: { scale: 1.0 }
});

// 事件触发（按帧检测）
if (footJustLand) api.emit('footstep', { target: 'rightFoot', power: 0.6 });
if (swingAtPeak)  api.emit('attack_peak', { target: 'sword_tip', power: 1.0 });
```

### Pro 烘焙响应（baked.vfx 字段）

Pro 模式返回的 `baked` 对象在有 VFX 声明时多一个 `vfx` 字段：

```json
{
  "fps": 60,
  "duration": 1.5,
  "loop": false,
  "animation": { ... },
  "vfx": {
    "continuous": [
      {
        "target": "head",
        "preset": "flame",
        "anchor": { "offset": [0, -0.4, 0.6] },
        "dir": [0, 0, 1],
        "params": { "scale": 1.0 }
      }
    ],
    "events": [
      { "t": 0.12, "name": "footstep", "target": "rightFoot", "payload": {"power": 0.6} },
      { "t": 0.35, "name": "attack_peak", "target": "sword_tip", "payload": {"power": 1.0} }
    ]
  }
}
```

省略 `vfxTags` 的请求 → `baked.vfx` 不存在（向后兼容）。

### 锚点与朝向（anchor / dir）

| 字段 | 写法 | 含义 |
|------|------|------|
| `anchor` 省略 | — | 用 group 原点（适合末端 group：手、脚、剑尖） |
| `anchor.offset` | `[x,y,z]` | 相对 group 局部坐标的偏移（推荐：嘴/胸口/眼） |
| `anchor.worldPos` | `[x,y,z]` | 世界绝对坐标（Pro 用 `api.groupPos()` 算） |
| `dir` 省略 | — | 用 group 的 `worldFacing` |
| `dir` 数组 | `[x,y,z]` | 世界方向向量（+Z 前 / +Y 上 / +X 是模型自己的左边、-X 是它的右边） |
| `dir.meshId` | `{ "meshId": "mXX" }` | 用某 mesh 的主轴（武器刃方向） |

### 前端词表（前端职责）

词表 JSON 结构同后端 `vfx-tags-v1.json`，前端持有并发送。词表内容：
- `README`：AI 输出格式 + 规则 + 预算
- `presets`：封闭预设集（`flame`/`smoke`/`hit_spark`/`hit_debris`/`charge_motes`/`sparkle`/`slash_trail`/`embers`），每条带 `description` / `params` schema / `trigger` (`continuous` \| `event`) / `runtime.particlePreset`（指向 `ParticlePresets.js` 真实预设名）
- `events`：封闭事件集（`footstep`/`land`/`attack_peak`/`impact`/`cast`），每条带 `payload_schema` 和 `default_preset`

前端运行时按 `baked.vfx.continuous` 挂持续效果、按 `baked.vfx.events` 在对应帧触发一次性效果。`runtime.particlePreset` 字段映射到 `ParticleCompanion.createParticleEffect({ attachTo }, { preset, overrides })` 的入口。

---

## 8. 简单 LLM 对话

### `POST /api/chat`

用于标题生成、剧情创作等辅助功能。默认 SSE 流式返回（`text/event-stream`）。可以带用户自己的 key（请求头，见 §1「用自己的 key」）。

**请求**
```json
{
  "messages": [
    { "role": "system", "content": "you are a game writer" },
    { "role": "user", "content": "generate a quest title" }
  ],
  "temperature": 0.7,
  "maxTokens": 1024,
  "provider": "gpt",
  "stream": true,
  "thinking": true
}
```

| 字段 | 默认 | 说明 |
|------|------|------|
| `provider` | `gpt` | AI provider：`gpt`（默认）或 `deepseek`（thinking 固定关闭）。省略时默认 `gpt`；旧值 `glm`/`fireworks` 已停止维护，勿传 |
| `stream` | `true` | SSE 流式；传 `false` 走旧版一次性 JSON（见本节末尾） |
| `thinking` | `true` | 是否回传思考数据。开启后会有 `thinking_start`/`thinking_done` 事件、`done.reasoning` 携带思考内容；关闭则只有正文。注意：provider=gpt 时返回的是**思考摘要**（模型自己生成的推理概要），不是完整思维链；简单问题可能没有摘要（`reasoning` 为空串）。关闭可降低延迟。`provider=deepseek` 时思考固定关闭，`done.reasoning` 恒为空字符串，`thinking` 字段不生效 |

**SSE 事件类型**：
- `thinking_start` / `thinking_done` — 模型思考中 / 思考结束，可用于 UI 加载动画
- `text` — 正文增量片段，`text` 字段是本次追加的文本（按序拼接即完整回复）
- `done` — 流结束。`content` 是完整回复（后端已拼接好），`reasoning` 是思考内容（provider=gpt 时为思考摘要；未产生则为空字符串）
- `error` — 失败（如限速时 `error` 为 `"429"`），事件后流即关闭；用户 key 的问题时为 `{"stage":"error","ok":false,"error":"byok_invalid_key","errorCode":"byok_invalid_key","message":"DeepSeek key 无效或已失效"}`（错误码见 §10）

```jsonc
event: thinking_start
data: {"stage":"thinking_start"}

event: text
data: {"stage":"text","text":"The Dragon"}

event: text
data: {"stage":"text","text":"'s Awakening"}

event: done
data: {"stage":"done","content":"The Dragon's Awakening","reasoning":""}
```

**前端解析示例**：
```js
async function llmChat(messages, { temperature, maxTokens, provider } = {}) {
  const resp = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [provider === 'gpt' ? 'X-VRL-OpenAI-Key' : 'X-VRL-DeepSeek-Key']: userKey },
    body: JSON.stringify({ messages, temperature, maxTokens, provider }),
  });
  const text = await resp.text();
  let content = '';
  for (const block of text.trim().split(/\n\n/)) {
    const lines = block.split(/\r?\n/);
    const event = lines.find(l => l.startsWith('event:'))?.slice(6).trim();
    const data = JSON.parse(lines.find(l => l.startsWith('data:')).slice(5).trim());
    if (event === 'error') throw new Error(data.error);
    if (event === 'text') content += data.text;          // 增量拼接
    if (event === 'done') content = data.content;         // 或直接用后端拼好的完整回复
  }
  return content;
}
```

**旧版一次性 JSON**（`stream:false` 时返回）：
```json
{
  "ok": true,
  "content": "The Dragon's Awakening",
  "reasoning": ""
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `string` | 模型正式回复内容 |
| `reasoning` | `string` | 模型的思考过程（thinking）。模型未输出思考内容时为空字符串 |

---

## 9. 完整集成示例

### 最小化的前端应用

```js
import * as THREE from 'three';

// 两个线上端点互为备份，任选其一：
const API = 'https://voxelstudio.site';                    // 主（自定义域名，Vercel）
// const API = 'https://voxel-studio-backend.zeabur.app';  // 备（Zeabur）

// 1. 加载 runtime（THREE 注入）
const mod = await import(`${API}/api/templates/module.js`);
const runtime = mod.create({ THREE });

// 2. 生成模型
async function genModel(desc) {
  const resp = await fetch(`${API}/api/generate/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VRL-OpenAI-Key': userKey },
    body: JSON.stringify({ description: desc, provider: 'gpt', mode: 'standard' }),
  });
  const text = await resp.text();
  let modelJson = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const e = JSON.parse(line.slice(5).trim());
    if (e.done) { modelJson = e.modelJson; break; }
    if (e.stage === 'error') throw new Error(e.error);
  }
  return modelJson;
}

// 3. 构建 Three.js 场景 — v2 扁平 nodes（局部坐标，parent 表达层级）
function buildScene(modelJson) {
  const scene = new THREE.Scene();

  function makeMaterial(mesh) {
    const mat = mesh.material || {};
    const color = mat.color ?? mesh.color ?? 0x888888;
    const zeroThick = (mesh.type === 'tri' || mesh.type === 'patch') && ((mesh.params?.d ?? 0) <= 0);
    return new THREE.MeshStandardMaterial({
      color,
      roughness: mat.roughness ?? 0.5,
      metalness: mat.metalness ?? 0.05,
      transparent: mat.transparent === true,
      opacity: mat.opacity ?? 1,
      flatShading: mat.flatShading !== false,
      side: zeroThick ? THREE.DoubleSide : THREE.FrontSide,
    });
  }

  // 两遍式：先按 node 建 Object3D，再按 parent 挂载
  const objs = new Map();
  for (const n of (modelJson.nodes || [])) {
    const obj = n.mesh
      ? new THREE.Mesh(runtime.buildGeometry(n.mesh.type, n.mesh.params || {}), makeMaterial(n.mesh))
      : new THREE.Group();
    obj.name = n.id;
    const t = n.transform || {};
    const p = t.pos || [0, 0, 0];
    obj.position.set(p[0], p[1], p[2]);
    if (t.quat) obj.quaternion.set(t.quat[0], t.quat[1], t.quat[2], t.quat[3]);
    if (t.scale && t.scale[0] > 0 && t.scale[1] > 0 && t.scale[2] > 0) {
      obj.scale.set(t.scale[0], t.scale[1], t.scale[2]);
    }
    objs.set(n.id, obj);
  }
  for (const n of (modelJson.nodes || [])) {
    const obj = objs.get(n.id);
    if (n.parent && objs.has(n.parent)) objs.get(n.parent).add(obj);
    else scene.add(obj);
  }
  return { scene, objs };
}

// 4. 存储基础姿态（动画停止时恢复用）
function saveBasePose(objs) {
  const base = new Map();
  for (const [id, obj] of objs) {
    base.set(id, {
      position: obj.position.clone(),
      rotation: obj.rotation.clone().toArray(),
      scale: obj.scale.clone(),
    });
  }
  return base;
}

// 5. 生成动画 — 返回 baked 数值轨道（60fps 逐帧增量）
async function genAnimation(modelJson, desc, emitParticles = false) {
  const resp = await fetch(`${API}/api/generate/animation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VRL-OpenAI-Key': userKey },
    body: JSON.stringify({ mode: 'quick', modelJson, description: desc, provider: 'gpt', emitParticles }),
  });
  const { baked } = await resp.json();
  return baked;
}

// 6. 播放动画 — ⚠️ 轨道值是增量（delta），必须叠加到基础姿态
function playAnimation(baked, objs) {
  const frameCount = Math.max(...Object.values(baked.animation).map(tr => tr.rotX.length));
  const basePose = saveBasePose(objs);
  const start = performance.now();
  let done = false;

  function loop() {
    const t = (performance.now() - start) / 1000;
    const ct = baked.loop ? t % baked.duration : Math.min(t, baked.duration);
    const f = Math.max(0, Math.min(frameCount - 1, Math.round(ct * baked.fps)));

    // 叠加增量到每个 group
    for (const [gid, tr] of Object.entries(baked.animation)) {
      const obj = objs.get(gid);
      const base = basePose.get(gid);
      if (!obj || !base) continue;
      // 位置 = 基础 + 增量
      obj.position.set(
        base.position.x + tr.posX[f],
        base.position.y + tr.posY[f],
        base.position.z + tr.posZ[f]
      );
      // 旋转 = 基础 + 增量（Euler XYZ；生产环境建议转 Quaternion）
      obj.rotation.set(
        base.rotation[0] + tr.rotX[f],
        base.rotation[1] + tr.rotY[f],
        base.rotation[2] + tr.rotZ[f]
      );
    }

    if (!baked.loop && ct >= baked.duration && !done) {
      done = true;
      for (const [partId, base] of basePose) {
        const obj = objs.get(partId);
        if (obj) {
          obj.position.copy(base.position);
          obj.rotation.set(base.rotation[0], base.rotation[1], base.rotation[2]);
        }
      }
      return; // 停止循环
    }
    if (!done) requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ═══ 启动 ═══
const modelJson = await genModel('a lowpoly dragon');
const { scene, objs } = buildScene(modelJson);
const baked = await genAnimation(modelJson, 'flying loop');
playAnimation(baked, objs);
```

---

## 10. 错误处理

| HTTP 状态 | 含义 | 处理 |
|-----------|------|------|
| `200` SSE 含 `errorCode=GENERATION_FAILED` | AI 生成失败 | 展示通用失败提示，可安全重试 |
| `429` | 请求被限速 | 稍等后重试 |
| `500` | 请求未完成 | 展示通用失败提示 |

**用自己的 key 时**的错误码（生产环境也返回）。出现在哪里：

| 位置 | 形状 |
|------|------|
| JSON 端点（refine / mount / extract / animation / `stream:false` 的 chat …） | HTTP 状态 = 下表，body `{ "ok": false, "error": "<码>", "errorCode": "<码>", "message": "<中文说明>" }` |
| `/api/chat` 的 SSE `error` 事件 | `{ "stage": "error", "ok": false, "error": "<码>", "errorCode": "<码>", "message": "…" }` |
| `/api/generate/model` 的 SSE `error` 事件 | `{ "stage": "error", "errorCode": "<码>", "error": "<中文说明>" }` |
| `/api/generate/batch` 每一项 | `{ "success": false, "index": 0, "errorCode": "<码>", "error": "<中文说明>", "name": "…" }` |
| 请求一开始就不对（key 头 / 接口地址格式） | 任何端点直接 HTTP 400，body 同 JSON 端点 |

key 无效、余额不足、地址不可用这类错误不会自动重试——提示用户去改 key 就行。错误码：

| 错误码 | HTTP | 含义 |
|--------|------|------|
| `byok_missing_key` | 400 | 没带这个 provider 的 key |
| `byok_bad_key` | 400 | key 格式不对 |
| `byok_bad_base` | 400 | 接口地址不对（只支持官方接口） |
| `byok_invalid_key` | 401 | key 无效或已失效 |
| `byok_insufficient_balance` | 402 | 余额不足 |
| `byok_forbidden` | 403 | key 没有权限 / 地区不支持 |
| `byok_not_found` | 404 | 接口地址或模型不存在 |
| `byok_unreachable` | 502 | 连不上接口地址 |
| `byok_upstream_error` | 502 | 模型服务出错（可以稍后重试） |
| `key_required` | 401 | 这个请求需要带自己的 key |

用自己的 key 被模型服务限速时照旧是 `429`（`error: "429"` / `rate_limited`），稍等重试。

GLB 绑骨端点（`/api/rig/glb*`）的错误码见 §5.6。

**Provider**：当前提供 `gpt`（默认）和 `deepseek`（thinking 固定关闭）两个 provider，所有端点通用，前端无需实现 provider 选择逻辑。

---

## 11. 注意事项

1. **不要硬编码模板名或几何类型名**。所有类型信息从 `runtime.listAnimationTemplates()` 和 `runtime.listGeometryTypes()` 动态获取。

2. **不要硬编码 geometry 参数名**。用 `runtime.buildGeometry(type, params)` 构建几何——参数名由模板定义，前端只负责传递 modelJson 中的 `mesh.params`。

3. **播放动画必须叠加增量**。动画端点返回的 `baked` 轨道值是**增量（delta）**，不是绝对位姿。必须叠加到基础姿态上——见 §8 完整示例的 `playAnimation` 函数。（`runtime.evaluateMotion` 仅用于旧版 plan 存档的回放/编辑，新响应不含 plan。）

4. **动画 Canvas 预览用 `runtime.evaluateTemplate`**。传入单个模板名、参数、时间、duration，得到单个模板的增量。

5. **模型生成是 SSE 流式**。`POST /api/generate/model` 返回 `text/event-stream`，按 `\n\n` 分隔事件。

6. **批量生成默认是 SSE 流式**。`POST /api/generate/batch` 会先返回 `start`，随后逐条返回 `item`，最后返回 `done`；需要旧版普通 JSON 时传 `stream:false`。

7. **粒子需独立渲染**。`baked.emit` 不产生 transform 轨道。前端需自行实现 InstancedMesh 粒子系统——见 §7 完整指南。

8. **粒子 slider UI 需要 flat ↔ nested 转换**。`listAnimationTemplates()` 中 emit 的 params 是**扁平 key**。从 `baked.emit` 读取 emit 参数时用 `rt.flattenEmitConfig()`，写回时用 `rt.unflattenEmitConfig()`。

9. **Health check**：`GET /health` 返回 `{"ok":true}`，可用于启动时验证后端可用。

10. **CORS**：后端已配置 `Access-Control-Allow-Origin`，本地开发不需要代理。不带 key 的请求只允许配置的来源；带了用户自己的 key（`X-VRL-*-Key` 请求头）的请求任何来源都允许，网页放在任何网站上都能直接调（见 §1「用自己的 key」）。

11. **`duration` 字段已废弃**（2026-08）。所有动画端点的 `duration` 仍接受（向后兼容），但**不再传给 AI**——动画时长由 AI 根据动作内容自动决定。前端可保留 `duration` 字段以兼容旧后端，新前端无需提供。

12. **Pro 动画推荐用 unified 入口** `/api/generate/animation` + `mode:"pro"`。单 `description` 是日常用法（后端自动检测攻击核心并给 `_speedSegments` 建议），`phases` 数组是高级用法（前端要分阶段 UI 标签时用）。

13. **`_speedSegments` 是赠品字段**。后端响应里包含变速建议，前端可选实现；不实现就按线性时间播放，动画照常工作。

14. **API 文档可通过 `GET /api/docs/api-reference` 拉取**。后端从 `docs/api-reference.md` 实时读取（无缓存），第三方前端可在运行时拉取最新版。