# Voxel Studio Backend — API Reference

> **适用场景**：用 AI 生成低多边形 3D 模型和动画。后端处理所有 AI 调用，前端只需发 HTTP 请求。

---

## 目录

1. [快速开始](#1-快速开始)
2. [端点总览](#2-端点总览)
3. [模型生成](#3-模型生成)
4. [动画生成](#4-动画生成)
5. [模板模块 (Runtime)](#5-模板模块-runtime)
6. [简单 LLM 对话](#6-简单-llm-对话)
7. [完整集成示例](#7-完整集成示例)
8. [错误处理](#8-错误处理)
9. [注意事项](#9-注意事项)

---

## 1. 快速开始

```js
const API = 'https://voxel-studio-backend.zeabur.app';

// 生成一个模型
const resp = await fetch(`${API}/api/generate/model`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ description: 'a lowpoly knight', provider: 'fireworks' }),
});
const text = await resp.text();
// 解析 SSE 取 modelJson
```

---

## 2. 端点总览

| 端点 | 方法 | 返回 | 用途 |
|------|------|------|------|
| `/health` | GET | `{"ok":true}` | 健康检查 |
| `/api/generate/model` | POST | SSE 流 | 生成单个模型 |
| `/api/generate/batch` | POST | JSON | 批量生成多个模型 |
| `/api/generate/animation` | POST | JSON | 生成 Motion Plan 动画 |
| `/api/chat` | POST | JSON | 简单 LLM 对话 |
| `/api/templates/module.js` | GET | ES Module | 获取模板和几何构建运行时 |

---

## 3. 模型生成

### 3.1 单个模型 — `POST /api/generate/model`

### Provider 和 Model

3 个可用 provider（所有生成端点通用，推荐使用fireworks）：

| `fireworks` | 
| `glm` | 
| `gpt` | 


**请求**
```json
{
  "description": "a lowpoly knight with a sword and shield",
  "provider": "fireworks"
}
```



**返回：SSE 流**

```
event: blockout
data: {"stage":"blockout","text":"Analyzing description..."}

event: code
data: {"stage":"code","text":"function"}

event: result
data: {"stage":"result","done":true,"modelJson":{...},"rawCode":"...","timing":{...}}

event: error
data: {"error":"Router failed: ..."}
```

SSE 事件类型：
- `blockout` — 结构分析阶段（可选使用）
- `code` — 代码生成中，text 字段是增量代码
- `result` — 完成，`modelJson` 是 Three.js 兼容的模型数据
- `error` — 错误，`error` 字段是原因

**前端解析示例**（简单版，等完整响应）：
```js
async function generateModel(description) {
  const resp = await fetch(`${API}/api/generate/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, provider: 'fireworks' }),
  });
  const text = await resp.text();
  const lines = text.split(/\r?\n/);
  let modelJson = null, rawCode = '';
  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const event = JSON.parse(line.slice(5).trim());
    if (event.stage === 'error') throw new Error(event.error);
    if (event.done || event.stage === 'result') {
      modelJson = event.modelJson;
      rawCode = event.rawCode || '';
    }
  }
  return { modelJson, rawCode };
}
```

### 3.2 modelJson 格式

```json
{
  "name": "Knight",
  "type": "lowpoly",
  "meshes": [
    {
      "id": "body",
      "name": "Body",
      "group": true,
      "position": { "x": 0, "y": 2.5, "z": 0 }
    },
    {
      "id": "m0",
      "type": "box",
      "geometry": { "width": 2, "height": 3, "depth": 1.4 },
      "position": { "x": 0, "y": 2, "z": 0 },
      "color": 10066329,
      "parent": "body"
    }
  ],
  "_skipAutoCenter": true
}
```

- `meshes` 是扁平数组，通过 `group:true` / `parent` 属性表达层级
- `type` 决定几何形状：`box`, `sphere`, `cylinder`, `cone`, `torus`, `wedge`, `tri`, `patch`, `icosahedron`, `dodecahedron`, `octahedron`
- `geometry` 字段名因 type 而异。**不要硬编码参数名，用 runtime 构建几何**

### 3.3 批量生成 — `POST /api/generate/batch`

**请求**
```json
{
  "descriptions": ["a knight", "a dragon", "a castle"],
  "provider": "fireworks"
}
```

**返回：JSON**
```json
{
  "total": 3,
  "succeeded": 3,
  "failed": 0,
  "results": [
    { "success": true, "index": 0, "modelJson": {...}, "rawCode": "...", "name": "Knight", "meshCount": 85 },
    { "success": false, "index": 2, "error": "Router failed: 429" }
  ]
}
```

> 一次请求，内部全部并行。失败项不阻塞其他项。

---

## 4. 动画生成

### `POST /api/generate/animation`

**请求**
```json
{
  "modelJson": { ... },
  "description": "running cycle, arms swinging",
  "duration": 2.0,
  "provider": "fireworks"
}
```

**返回：JSON**
```json
{
  "ok": true,
  "plan": {
    "_duration": 2.0,
    "_loop": true,
    "body": { "bounce": { "amplitude": 0.15, "frequency": 2 } },
    "leftArm": { "swing": { "axis": "x", "amplitude": 0.4, "frequency": 1 } },
    "rightArm": { "swing": { "axis": "x", "amplitude": 0.4, "frequency": 1, "phase": 0.5 } }
  }
}
```

Motion Plan 结构：
- `_duration`（秒）、`_loop`（是否循环）是元数据
- 其他 key 是 group ID，值是一个或多个动画模板 + `_attach` 父级跟随
- 后端解析 LLM 输出，验证 group 存在性，限幅参数

**前端播放**（60fps）：
```js
// 每帧调用 runtime.evaluateMotion
function onAnimationFrame(t) {
  const pose = runtime.evaluateMotion(plan, duration, model, t);
  // pose = { body: { position:[0,0.15,0], rotation:[0,0,0], scale:null }, ... }
  for (const [partId, delta] of Object.entries(pose)) {
    applyDelta(partId, delta); // 叠加到基础姿态
  }
}
```

---

## 5. 模板模块 (Runtime)

### `GET /api/templates/module.js`

返回一个 ES Module，是前端的运行时核心。前端通过 `import()` 动态加载：

```js
const mod = await import('https://voxel-studio-backend.zeabur.app/api/templates/module.js');
const runtime = mod.voxelStudioRuntime;
```

**注意**：此模块使用全局 `THREE`。确保 `window.THREE` 在 import 前就绪：
```js
import * as THREE from 'three';
window.THREE = THREE;
// 然后 import('https://...')
```

### Runtime API

```js
const rt = window.__voxelRuntime; // 或 mod.voxelStudioRuntime

// ═══ 动画 ═══

// 列出所有动画模板（slider UI 用）
rt.listAnimationTemplates()
// → [{ key:'bounce', label:'Bounce', params:[{key:'amplitude',type:'float',min:-1,max:1,default:0.2,curve:2.5},...], isLooping:true }, ...]

// 评估完整 Motion Plan（每帧播放用）
rt.evaluateMotion(plan, duration, model, t)
// → { groupId: { position:[x,y,z], rotation:[rx,ry,rz], scale:[sx,sy,sz], _attachMap:{...} } }

// 评估单个模板（Canvas 曲线预览用）
rt.evaluateTemplate(name, params, t, duration)
// → { position:[x,y,z] } 或 { rotation:[rx,ry,rz] } 或 { scale:[sx,sy,sz] }

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

每个 group 的 delta 格式：
```js
{
  position: [dx, dy, dz],  // 位移增量
  rotation: [rx, ry, rz],  // 旋转增量（弧度）
  scale: null | [sx,sy,sz] // 缩放，null 表示不变
}
```

### `buildGeometry` 参数

参数名取决于 type。常见映射：
```
box:     { width, height, depth }
sphere:  { radius, widthSegments(8), heightSegments(6) }
cylinder:{ radiusTop(1), radiusBottom(1), height, radialSegments(8) }
cone:    { radius, height, radialSegments(8) }
torus:   { radius, tube(0.3), radialSegments(8), tubularSegments(12) }
icosahedron/dodecahedron/octahedron: { radius, detail(0) }
wedge:   { width, height, depth }
tri:     { a:[x,y,z], b:[x,y,z], c:[x,y,z], d(0) }
patch:   { vertices:[x1,y1,z1,...], d(0) }
```

---

## 6. 简单 LLM 对话

### `POST /api/chat`

用于标题生成、剧情创作等——前端提供提示词，后端转发 LLM 调用。

**请求**
```json
{
  "messages": [
    { "role": "system", "content": "you are a game writer" },
    { "role": "user", "content": "generate a quest title" }
  ],
  "temperature": 0.7,
  "maxTokens": 1024,
  "provider": "fireworks"
}
```

**返回**
```json
{ "ok": true, "content": "The Dragon's Awakening" }
```

---

## 7. 完整集成示例

### 最小化的前端应用

```js
import * as THREE from 'three';
window.THREE = THREE; // runtime 需要

const API = 'https://voxel-studio-backend.zeabur.app';

// 1. 加载 runtime
const mod = await import(`${API}/api/templates/module.js`);
const runtime = mod.voxelStudioRuntime;

// 2. 生成模型
async function genModel(desc) {
  const resp = await fetch(`${API}/api/generate/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: desc, provider: 'fireworks' }),
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

// 3. 构建 Three.js 场景
function buildScene(modelJson) {
  const scene = new THREE.Scene();
  const meshes = {}; // id → group/mesh

  for (const m of modelJson.meshes) {
    if (m.group) {
      const g = new THREE.Group();
      g.position.set(m.position?.x||0, m.position?.y||0, m.position?.z||0);
      g.name = m.name;
      meshes[m.id] = g;
    } else {
      const geo = runtime.buildGeometry(m.type, m.geometry || {});
      const mat = new THREE.MeshStandardMaterial({ color: m.color || 0x888888, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(m.position?.x||0, m.position?.y||0, m.position?.z||0);
      meshes[m.id] = mesh;
    }
  }

  // 建立层级
  for (const m of modelJson.meshes) {
    if (!m.parent) scene.add(meshes[m.id]);
    else if (meshes[m.parent]) meshes[m.parent].add(meshes[m.id]);
  }

  return scene;
}

// 4. 生成动画
async function genAnimation(modelJson, desc) {
  const resp = await fetch(`${API}/api/generate/animation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelJson, description: desc, duration: 2.0, provider: 'fireworks' }),
  });
  const { plan } = await resp.json();
  return plan;
}

// 5. 播放动画
function playAnimation(plan, scene, duration) {
  const start = performance.now();
  function loop() {
    const t = (performance.now() - start) / 1000;
    const ct = plan._loop ? t % duration : Math.min(t, duration);
    const pose = runtime.evaluateMotion(plan, duration, scene, ct);
    for (const [partId, delta] of Object.entries(pose)) {
      if (partId.startsWith('_')) continue;
      const obj = scene.getObjectByName(partId); // 需要先通过 name 映射
      if (obj && delta.rotation) {
        obj.rotation.set(delta.rotation[0], delta.rotation[1], delta.rotation[2]);
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ═══ 启动 ═══
const modelJson = await genModel('a lowpoly dragon');
const scene = buildScene(modelJson);
const plan = await genAnimation(modelJson, 'flying loop');
playAnimation(plan, scene, plan._duration);
```

---

## 8. 错误处理

| HTTP 状态 | 含义 | 处理 |
|-----------|------|------|
| `200` SSE 含 `error` | AI 流水线中某步失败 | 展示 `event.error` |
| `429` | 该 provider 被限速 | 换一个 provider 重试 |
| `500` | 服务器内部错误 | 检查 `error` 字段 |

**Provider 可用列表**：
```js
const PROVIDERS = ['fireworks', 'glm', 'gpt', 'deepseek'];
```
建议实现 fallback chain：fireworks → glm → gpt → deepseek。

---

## 9. 注意事项

1. **不要在前端硬编码动画模板名或几何类型名**。所有类型信息从 `runtime.listAnimationTemplates()` 和 `runtime.listGeometryTypes()` 动态获取。

2. **不要硬编码 geometry 参数名**。用 `runtime.buildGeometry(type, params)` 构建几何——参数名由后端模板定义，前端只负责传递 modelJson 中的 `geometry` 字段。

3. **播放动画用 `runtime.evaluateMotion`**。每帧调用，传入 `plan`、`duration`、`model`、当前时间 `t`。返回每个 group 的位移/旋转/缩放增量。

4. **动画 Canvas 预览用 `runtime.evaluateTemplate`**。传入单个模板名、参数、时间、duration，得到 pose 增量。

5. **模型生成是 SSE 流式**。`POST /api/generate/model` 返回 `text/event-stream`。事件由 `\n\n` 分隔，每行以 `data:` 开头为 JSON。

6. **批量生成是 JSON**。`POST /api/generate/batch` 返回普通 JSON，包含所有结果（成功 + 失败）。适合需要大量模型但不想要流式复杂度的场景。

7. **Health check**：`GET /health` 返回 `{"ok":true}`。可用于启动时验证后端可用。

8. **CORS**：后端已配置 `Access-Control-Allow-Origin`，本地开发不需要代理。
