# 奇异岛（Chii Island）— 体素创造游戏

基于 Three.js + Vite 的 AI-native 3D 宠物家园原型。玩家与宠物共同改造田园、森林和城镇，模型、动画、特效与局部装配由 3d-generate 后端提供。

> **双工作流：** 用户在体素工作室保存后显式同步精选资产；游戏内自主创造通过 api-reference 后端调用，结果进入生成资产历史与当前场景存档。两条流水线不可混用。

---

## 当前完成状态（2026-08-03）

### 主角与序章
- 岛上主角为弗洛洛，使用空手基础模型与 idle/walk/run/jump/special 动画。
- 第 0 幕包含受损直升机、老大、天使、求救输入、连续坠落与海面转场，结束后在森林海滩醒来。
- 背包支持六种本地道具；手持物通过 mount 装配，并播放举过头顶展示与镜头特写。
- 角色展柜支持角色变体、整套服装 refine、左右手道具 mount，并把外观同步到岛上。

### 世界与地形
- 50×50 网格，包含 grass/dirt/rock/farmland/brick/sand 等地块和独立连续水面。
- 程序化河流负责占位与寻路，`WorldWaterVisualPort` 负责动画水面；河流配有石桥、瀑布与城镇喷泉。
- 森林边缘新增沙滩、岩石和渐进植被，作为序章落水后的正式醒来点。
- 风车田园、森林神殿、教堂城镇三大区域已通过道路、桥梁与宠物活动连成一个共享岛屿。

### 场景与玩法
- **田园**：农田、麦田、花园、宠物跟随/自由活动，以及 create/refine/mount 施工流程。
- **森林**：奖杯召唤新宠物、同行宠物愿望、帐篷露营与新宠物初见。
- **城镇**：日常活动、节庆、生日/新年等群体事件、建造螃蟹、建筑占地与教堂室内。
- **活动反馈**：右上角卡片显示活动阶段、进度和可选准备任务；活动资产成功生成后会缓存复用。
- **Agentland Friends**：独立朋友收集原型，支持本地参考图预览、角色选择、自主活动和小型群体故事。

### 渲染与后端
- 使用 Three.js r184，并固定 `@voxel-studio/render-runtime` 的 `1203a1e` 审计包。
- 已接入材质 tag、火焰/烟雾、fur、foliage、vegetation sway、VFX 词汇、Cel/Current 风格和质量档位。
- Original/Pro/Voxel 各自保留冻结资产目录；游戏内自主 generate/refine/mount/animation 固定走已审计的 Voxel 内容策略，不允许调用方覆盖 provider/model/mode。
- 本地运行资产来自 `public/generated/`，不会在浏览器里直接读取体素工作室当前编辑态。

### 物理与编辑
- Rapier 负责角色运动，`ColliderRegistry` 统一管理重要部件 AABB 和旧整体包围盒两种策略。
- 宠物寻路读取地形阻挡、桥梁通路与可达路径，不以超时传送跨河。
- 非植被物件使用网格占位，支持移动、旋转、缩放、删除；建筑先确认 `N×M` 地块再生成。
- `E` 用于对话/进入建筑，`F` 用于管理附近物件，避免教堂入口冲突。

---

## 当前开发重点

```
P0 ✅ 三大区域 vertical slice 与统一宠物状态
P1 ✅ AI create/refine/mount/animation/VFX 后端边界
P2 ✅ 占地、碰撞、物件管理、桥梁与建筑室内
P3 ✅ 时间天气、材质 runtime、水体与海滩
P4 ✅ 序章、角色展柜、背包和外观系统
P5 ✅ IslandStoryState 串联田园改造、森林召唤、城镇活动与建造里程碑
P6 ✅ 依赖边界、生成资产完整性、统一生命周期与自动验证
```

---

## 当前居民与职责

| 区域 | 居民 | 当前玩法职责 |
|------|------|--------------|
| 田园 | momo / yafo / mok | 跟随、自由活动与 create/refine/mount 协作 |
| 城镇 | fangk / lingq / mako | 主持、邀请并参与日常与节庆活动 |
| 城镇 | 螃蟹（`builder_crab`） | 选择地块并建造新建筑 |
| 森林 | 玩家同行宠物 / 新召唤居民 | 奖杯召唤、初见与露营 |

动物社区仍是后续层，不属于当前原型范围。

---

## 技术栈

- **Three.js** `^0.184.0` — 3D 渲染
- **Vite** `^8.0.12` — 开发与构建
- **Rapier3D** `^0.19.3` — 角色与世界物理
- **体素工作室（3d-generate）** — 模型/动画/VFX 生成后端与 Studio，端口 8000
- **@voxel-studio/render-runtime** — 固定审计版本的渲染能力包
- **Playwright** — 浏览器自动化验证

## 运行

```bash
npm ci --legacy-peer-deps
npm run dev          # 开发模式（同时启动工作室）
npm run build        # 生产构建
npm run verify       # 完整测试、资产审计、渲染兼容与构建
```

- **奇异岛：** `http://localhost:5173/src/demos/chii-island/`
- **Agentland Friends：** `http://localhost:5173/src/demos/agentland-friends/`
- **Ghost Home 兼容地址：** `http://localhost:5173/src/demos/ghost-home/`（自动转到 Agentland Friends）
- **体素工作室：** `http://localhost:8000/`

若 5173 被其他项目占用，可用
`powershell -ExecutionPolicy Bypass -File .agents/skills/chii-dev/scripts/services.ps1 -Action start -Target game -GamePort 5174`
启动本仓库并使用对应端口验收。

## 操控

| 按键 | 功能 |
|------|------|
| WASD | 移动（W=相机前方，A/D=转向） |
| 鼠标 | 旋转视角（Pointer Lock） |
| Space | 跳跃 |
| H | 切换飞行模式 |
| Q/E | 飞行上升/下降 |
| Shift | 加速 |
| J | 弗洛洛特殊动作 |
| B | 打开/关闭背包 |
| F | 管理附近可编辑物件或建筑 |
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
| 21 | 2026-07-26 | 建筑室内系统：教堂大门支持 E 键进入/退出，新增程序化哥特教堂中殿与本地 GPT Pro 长椅、祭坛、神像；风车、神殿和新建建筑暂用通用空房间。 |
| 22 | 2026-07-28 | 综合升级：同步审计 3d-generate `1203a1e` 并固定 runtime 包；重建可通行石桥与 GPT 5.6 分类资产；修复 Mako 摘苹果寻路；落地服装 refine/道具 mount 与举高展示；新增连续河流、瀑布、喷泉、森林海滩、城镇活动阶段卡和 Agentland Friends 独立原型；Ghost Home 退役为兼容跳转。 |
| 23 | 2026-08-03 | 架构整理：移除旧入口、legacy、游戏内 Studio 与过期生成脚本；统一居民、宠物、剧情、控制锁、气候和跨区域预约所有权；修复场景恢复重复登记并将旧内联资产存档迁移为 asset ID；补齐生成资产 manifest、系统 dispose、管理面板/田园/城镇职责拆分、依赖/循环/孤儿模块/密钥/CI 验证。 |
| 24 | 2026-08-03 | 生命周期收口：启动 await 具备 HMR/pagehide 代际保护，旧外观存档缺失时回退基础模型，交互会话独立管理对话/相机/玩家锁；开发服务识别端口归属，浏览器验收覆盖桌面与移动 WebGL 像素、模型、WASD、E 和 ESC。 |
