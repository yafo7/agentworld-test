# 奇异岛（Chii Island）— 体素创造游戏

基于 Three.js + Vite，体素工作室（3d-generate）→ 奇异岛 流水线。玩家在六生态世界中建造、养成、探索。

> **工作流：** 体素工作室生成模型 → 导入奇异岛 → 交互与玩法。以 tag 为底层 DNA 驱动生成与演化。

---

## 当前完成状态（2026-07-02）

### 主角（奶龙）
- 高度 3.0，6 个动画（idle/walk/run/jump/wave_left/fan_spark）
- 操控：WASD + 鼠标 Pointer Lock，Space 飞行，Shift 加速
- 速度：walk=8, run=12, fly=8, flyVertical=5

### 地形
- 50×50 网格，4 种纯色地块（grass/dirt/rock/water）= 4 InstancedMesh
- 程序化河流 + 泥土道路 + 岩石点缀
- 建筑底座岩石散落（内部+1圈 100%岩石，外围概率递减）

### 场景内容（7 个工作室模型，运行时拉取）
- **建筑**：风车（4×4 格）、哥特教堂（8×11）、古老神殿（11×8），均 3x 缩放
- **植被**：橡树/普通树/苹果树 ~170 棵 + 荧光草 ~73 丛
- **布局**：河左风车群系（树木繁茂）/ 河右教堂+神殿 / 边缘密植 / 主干道

### 渲染优化
- Draw calls ~222（合并前 ~1600–3400+）
- MeshLambertMaterial + 材质缓存 + 几何体合并（`mergeMeshGroup`）
- 2048² 阴影贴图 + 收紧平截体 + ResizeObserver 替代轮询

### 碰撞系统
- 模型贴合 AABB（`getWorldBBox()`）+ 圆-vs-AABB 检测
- 步行：阻挡树木/建筑/水格；飞行：全部穿透
- ESC 管理面板 + 碰撞体积可视化开关
- 计划升级：Rapier3D 物理引擎

---

## 开发路线

```
Phase 0 ✅ 基础管线（主角/地形/管线对齐）
Phase 1 进行中 → 场景搭建
  ✅ 植被 + 建筑导入（工作室实时拉取）
  ✅ 场景布局算法（河流群系/道路/植被密度）
  ✅ 渲染优化（几何合并/材质缓存/阴影）
  ✅ 碰撞系统（AABB + 水格阻挡）
  🔲 地块 voxel 模型替换纯色方块
  🔲 多生态地形配比
Phase 2 🔲 宠物与交互
Phase 3 🔲 玩法深化
```

---

## 宠物世界设定

| 生态 | 宠物 | 能力 | 种类 | 性格 |
|------|------|------|------|------|
| 🌲 森林 | momo / fuyao | 伐木 / 飞行 | 熊 / 麻雀 | 可爱 / 调皮 |
| 🌊 池塘 | fangke / lingq | 建造 / 引水 | 工程师 / 大包子 | 和蔼 / 活泼 |
| 🌿 草原 | mako | 疾跑 | 马 | 沉稳 |
| ⛰️ 高山 | mok | 耕地 | 鳄鱼 | 凶狠 |
| 🌋 火山 | _(待设计)_ | | | |
| ❄️ 雪山 | _(待设计)_ | | | |

---

## 技术栈

- **Three.js** `^0.184.0` — 3D 渲染
- **Vite** `^8.0.12` — 开发与构建
- **体素工作室（3d-generate）** — 模型生成后端（Python），端口 8000
- **Playwright** — 浏览器自动化验证

## 运行

```bash
npm install
npm run dev          # 开发模式（同时启动工作室）
npm run build        # 生产构建
```

- **奇异岛：** `http://localhost:5173/src/demos/chii-island/`
- **鬼屋：** `http://localhost:5173/src/demos/ghost-home/index.html`
- **体素工作室：** `http://localhost:8000/`

## 操控

| 按键 | 功能 |
|------|------|
| WASD | 移动（W=相机前方，A/D=转向） |
| 鼠标 | 旋转视角（Pointer Lock） |
| Space | 切换飞行模式 |
| Q/E | 飞行上升/下降 |
| Shift | 加速 |
| H | 挥舞左手 |
| J | 挥舞扇子+粒子特效 |
| ESC | 释放鼠标 → 再按打开管理面板 |

---

## 改动记录

| 序号 | 时间 | 改动内容 |
|------|------|----------|
| 0 | 2026-06-11 | 创建 readme.md，初始化项目文档 |
| 1 | 2026-06-12 | 重构世界系统：引入单位面积/单位环境(10×10)替代平面地面；新增 StaticEntity 不可移动实体；环境"玛扣大森林"替代森林；宠物系统改为房屋召唤/召回模式；新增 3 只宠物(马扣/扶摇/momo)含模型动画；E键交互提示UI；WASD 直接向量计算；Voxel Runtime fallback 机制 |
| 2 | 2026-06-12 | 修复宠物 walk 动画卡死：移除导致 Voxel Runtime `evaluateMotion` 异常的 `tilt` 类型；momo 恢复行走动画，扶摇 walk 改为飞翔动画（大振幅翅膀扇动+身体浮动）；`applyAnimation` 添加 try-catch 防护。修复召唤/召回穿模：宠物改为在房屋旁边一格的单位面积上生成/返回，不再与房屋模型重合；更新 readme.md 文档 |
| 3 | 2026-06-12 | 3×3 世界网格系统：以玛扣大森林为中心，周围新增 8 个差异化环境（待售空地/繁华城市/农村池塘/暗黑森林/田园牧场/危险区域/另一片森林/干旱沙地）。按需加载优化：外围环境默认隐藏，`P` 键单环境切换，`O` 键全局切换显隐。修复宠物召唤 double bug：召回后再次召唤不再重复 push。更新 CLAUDE.md 上下文管理规则（kimi 2.6 窗口限制） |
| 4 | 2026-06-13 | 宠物交互逻辑：新增 5秒行走判断（45%行走/45%idle/10%去隔壁环境）+ 30秒动作判断（20%回家/50%与装饰交互/30%找其他宠物聊天）。新增 H 键呼喊跟随（支持多宠）、J 键解散全部、R 键指使 refine。万物皆可 refine 系统：宠物/树木/环境/建筑/装饰/物品均可被 refine，多宠同时 refine 时共享一次后端调用并合并所有参与宠物的 tag。StaticEntity 被 refine 后获得 AI 生成交互动画，按 E 播放。重新生成田园商店模型（country_shop.json）。暂时关闭宠物对话系统（避免贴脸反复触发）。更新 CLAUDE.md 和 readme.md |
| 5 | 2026-06-22 | 架构重构为 multi-demo：建立 backend/ + storage/ + engine/ 分层，迁移全部旧文件归位；新增 Ghost Home 概念策划；全局重命名"宠物庭院师"为"奇异岛"；删除空 assets/ 目录；修复 `evaluateMotion` v2 签名错位；补齐 fallback 几何类型（torus/tri/patch 等） |
| 6 | 2026-06-24 | R 键 refine 改为调用后端 refineModel API（fallback generateModel），改进 prompt 保留原特征新增特色；各实体加载时保存原始 modelJson（`loader.js` userData.modelJson）；新增统一重新生成脚本 `regenerate-all.mjs`（中文简短提示词 10-20 词），已重生成 forest、tree_marko 及其 idle 动画 |
| 7 | 2026-06-24 | 新增右侧常驻模型编辑器：左右分栏布局（`index.html` + `generateSystem.js` + `main.js`），左侧游戏画面、右侧编辑器面板、中间可拖动边界线。编辑器自动加载靠近的实体模型，支持预览旋转、重新生成、改造、确认替换。`StaticEntity.js` 扩展 `replaceModel()` 和 idle 动画循环支持。该功能已编码但尚未完全正常运作，待后续调试。 |
| 8 | 2026-06-25 | G 键改为在玩家脚下直接放置橙色 box 占位符（简化自原 Edit Mode 草案）；分屏编辑器新增"📚 从模型库选择"按钮，接入 `/api/assets/list` 获取 GLTF 资产列表，支持 GLTFLoader 预览并直接确认替换到场景；根目录 index.html 改为自动跳转到 `/src/demos/chii-island/`；修复 `generateSystem is not defined` 顺序 bug；移除未使用的 `src/engine/editor/` 模块及测试文件。 |
| 9 | 2026-06-25 | 模型编辑器能力补完：对接后端 4 大功能（AI 生成模型 / Refine 改造 / 模型库 / 新建动画）；模型库合并云端 GLTF + 本地 `public/generated/` 全部体素模型，解决模型库为空问题；预览画布支持鼠标拖拽自由旋转（水平+垂直）与滚轮缩放；G 键占位符升级为正式 `StaticEntity` 装饰，坐落于单位面积并染黄，占用网格，重复放置屏幕中央提示"不可重复放置"，且可被右侧模型编辑器修改。新增 `worldToGridCoordinates()` 网格坐标转换辅助函数。更新 `CLAUDE.md` 与 `readme.md`。 |
| 10 | 2026-06-25 | Ghost Home 最小可运行框架落地：复用 Chii Island 的 3×3 世界网格场景与完整交互逻辑，移除环境中心模型、树木、房屋、宠物、物品等全部非玩家模型，仅保留玩家角色（哪吒模型+动画）。`src/demos/ghost-home/main.js` 与 `index.html` 完成分屏布局、模型编辑器、G/O/P 键交互、raycast 检查。`CLAUDE.md` 与 `readme.md` 记录两个 Demo 的固定访问地址。Ghost Home 在本地 Playwright 与生产构建中均正常打开。 |
| 11 | 2026-06-26 | 模型库双向打通：① 生成/改造的 voxel 模型与动画在确认替换后自动保存到 `public/generated/`（Vite dev 端点）并镜像 localStorage，形成"已生成模型"分区；② 游戏模型库新增"体素工作室"分区，通过 `/studio/api/*` 直接读取本地 3d-generate 工作室保存的模型与动画，选择后即可应用到场景实体。仅修改本地工程文件，未改动 3d-generate 后端。更新 `CLAUDE.md` 与 `readme.md`。 |
| 12 | 2026-06-26 | 右侧模型编辑器动画库：生成动画可选择应用为 "E 交互"（默认）或 "idle 循环"；动画以模型为单位保存到 🎬 动画库，支持预览、切换、应用、删除；Environment 实体也支持 setInteractionAnimation/playInteractionAnimation。修复 G 键放置的占位符无法被模型编辑器识别的问题：`StaticEntity` 支持传入 `modelJson` 同步设置 `_originalModelJson`，`placePlaceholder` 预加载 `placeholder.json`。新增 F 键清除附近装饰类实体（不作用于房屋/树木），清除后释放网格并恢复地块灰色。更新 `CLAUDE.md` 与 `readme.md`。 |
| 13 | 2026-06-26 | 实现 Chii Island 场景本地持久化：新增 `src/storage/sceneSnapshot.js`，所有场景修改（G/F、编辑器模型/动画替换、O/P 环境显隐、宠物召唤/亲密度、物品位置）实时写入 `localStorage`，刷新后自动恢复；实体类新增 `_instanceId`、`_hasCustomModel` 与快照方法；`main.js`/`generateSystem.js`/`interact.js` 在关键变更后触发保存。确立文档管理规则：`CLAUDE.md` 为核心知识库，所有 Markdown 文档优先集中于此，超大/专用文档独立成文件但须在 `CLAUDE.md` 中索引。更新 `CLAUDE.md` 与 `readme.md`。 |
| 14 | 2026-06-29 | 修复 玛扣大森林 等实体模型替换后原始模型仍残留的问题：① `Environment`/`Item` 在异步加载默认模型与 idle 动画前增加 `_modelGroup` 双重守卫，避免替换后被旧模型/动画覆盖；② `generateSystem.js` 的 `_replaceEntityModel` 设置 `_hasCustomModel = true`，保证编辑器替换能正确写入场景快照；③ `demos/chii-island/main.js` 移除编辑器自动瞄准对 `_originalModelJson` 的非空限制，模型未加载完成时也能被选中替换。同步更新 `CLAUDE.md` 与 `readme.md`。 |
| 15 | 2026-07-01 | ⚠️ 记录丢失（未入库的本地修改被 Write 覆盖）。大规模简化重构：移除全部旧实体/交互/场景快照/编辑器/染色系统；旧模型归档至 `public/generated/_archive/`；对齐 3d-generate 模型解析/动画播放/粒子特效管线；奶龙替换哪吒为主角（walk/idle/jump/招手/挥扇粒子）；飞行模式替代跳跃；50×50 程序化森林地形（4 种纯色方块 + InstancedMesh + 河流/道路/岩石）；地块无缝拼接 + 顶面描边。 |
| 16 | 2026-07-01 | 移除 api key（commit: 91a15c5）。 |
| 17 | 2026-07-02 | 场景布局系统：7 个工作室模型导入，3 栋建筑 + ~240 植被，河流群系/道路/边缘密植 |
| 18 | 2026-07-02 | 渲染优化：几何体合并/材质缓存/阴影优化，draw calls ~1600→222 |
| 19 | 2026-07-02 | 碰撞系统：模型贴合 AABB + 水格阻挡 + ESC 管理面板 + 碰撞可视化 |
| 20 | 2026-07-02 | 参数调整：奶龙 1/2 大小+速度，建筑 3x 缩放，随机植被大小/朝向，底座岩石散落 |
