# Chii Island Skill 使用手册

在任务开头写 `$技能名` 即可调用。默认只选一个主技能；只有任务确实跨越职责边界时，才组合第二个或第三个技能。

## 一、技能架构

```text
工作台
status / dev / debug / verify / handoff

AI 与资产
prompts / ai / assets

产品实现
gameplay / scene / ui / story

技术美术
visuals
```

这套划分的核心不是按页面或区域拆技能，而是按“谁拥有这份状态”拆分：

- 游戏规则和长期状态归 `$chii-gameplay`。
- 屏幕界面和输入锁归 `$chii-ui`。
- 固定编排的剧情、镜头和转场归 `$chii-story`。
- 地图上的位置、地块、占位和碰撞归 `$chii-scene`。
- 材质、水、天空、灯光和渲染表现归 `$chii-visuals`。
- 后端提示词与后端调用分成 `$chii-prompts` 和 `$chii-ai`。

## 二、完整技能表

| Skill | 什么时候使用 | 不负责什么 | 调用示例 |
|---|---|---|---|
| `$chii-status` | 想快速了解 Git、服务、资产、测试和当前架构 | 不修改功能 | `$chii-status 总结当前项目状态` |
| `$chii-dev` | 启动、停止、重启或检查 5173/8000 | 不诊断游戏逻辑 | `$chii-dev 启动奇异岛与体素工作室` |
| `$chii-debug` | 出现 bug，需要找到第一份错误数据或第一个错误状态 | 不在没有证据时重构 | `$chii-debug 调查宠物工作后又开始跟随` |
| `$chii-verify` | 修改后运行测试、构建和浏览器验证 | 不代替实现技能 | `$chii-verify 完整验证这次修改` |
| `$chii-handoff` | 组会汇报、里程碑总结、交给下一个 Agent | 不改变项目 | `$chii-handoff 整理本周组会汇报` |
| `$chii-prompts` | 编写或检查生成、refine、mount、动画、活动策划提示词 | 不直接调用后端 | `$chii-prompts 为3x4田园小屋写生成提示词` |
| `$chii-ai` | 调用 generate、refine、mount、动画、VFX 或规划 API | 不负责 Studio 手工资产同步 | `$chii-ai 生成并保存一座Pro石桥` |
| `$chii-assets` | 同步你在体素工作室手工修改并保存的模型与动画 | 不自主重生成资产 | `$chii-assets 同步岛上使用的全部模型与动画` |
| `$chii-gameplay` | 宠物、交互、背包、装备、任务、日记、成长、社交、建造和区域玩法规则 | 不把规则状态放进 UI | `$chii-gameplay 新增岛屿日记任务系统` |
| `$chii-scene` | 地形、道路、河流占位、植被、模型布置、占地、寻路和静态碰撞 | 不负责 shader 或剧情节拍 | `$chii-scene 调整森林海滩与树林过渡` |
| `$chii-ui` | HUD、面板、对话框、冒泡、加载页、响应式布局、可访问性和输入锁 | 不拥有任务、背包或剧情状态 | `$chii-ui 设计岛屿日记面板` |
| `$chii-story` | storyline、幕、固定事件、台词表演、演员走位、镜头、转场和控制权交接 | 不负责可重复的系统玩法 | `$chii-story 实现第一幕海滩苏醒演出` |
| `$chii-visuals` | Material Tags、模型特效、水、天空、灯光、天气表现、VFX、画风、画质和后处理 | 不改变地块占位或玩法规则 | `$chii-visuals 接入新版云层和天空能力` |

## 三、常见使用流程

### 1. 新增背包、任务或岛屿日记

```text
$chii-gameplay 设计状态、规则、入口、完成条件和存储
→ $chii-ui 实现面板、HUD、按键和输入锁
→ $chii-verify
```

这里 `$chii-gameplay` 是主技能。UI 只读取规则系统给出的投影数据，不能自己记录任务进度。

### 2. 制作一幕固定剧情演出

```text
$chii-story 编排节拍、台词、走位、镜头、转场和退出状态
→ $chii-ui 实现字幕、黑场、输入框或跳过按钮
→ $chii-gameplay 仅在剧情永久改变任务或世界规则时加入
→ $chii-verify
```

例如第 0 幕坠机、第一幕海滩苏醒都以 `$chii-story` 为主。普通宠物派对属于可重复玩法，应使用 `$chii-gameplay`。

### 3. 宠物创造、修改或装配世界物件

```text
$chii-gameplay 定义行为入口、宠物状态和成功/失败流程
→ $chii-prompts 编写短而具体的中文提示词
→ $chii-ai 调用后端并处理结果
→ $chii-scene 处理占位、落点或碰撞
→ $chii-ui 仅在新增确认框或进度提示时加入
→ $chii-verify
```

### 4. 使用体素工作室里手工修改的模型

```text
$chii-assets 从 Studio 已保存版本同步指定资产
→ $chii-scene 调整它在岛上的位置、占地和碰撞
→ $chii-verify
```

这条流程不能换成 `$chii-ai`。Studio 手工作品与游戏内自主生成是两条独立资产路径。

### 5. 接入 3d-generate 新的渲染能力

```text
$chii-visuals 审计上游导出并在现有 Port/Adapter 后接入
→ $chii-ai 仅在 API 或 JSON Schema 同时变化时加入
→ $chii-verify 执行 render compatibility 和浏览器验证
```

例如天空、云、水材质、毛发、植被摆动属于 `$chii-visuals`。把一棵树放到森林哪里属于 `$chii-scene`。

### 6. 修复一个表现不正确的 bug

```text
$chii-debug 先找到第一处差异
→ 根据证据转交真正的拥有者技能
→ $chii-verify
```

例如：

- 宠物状态错误：转 `$chii-gameplay`。
- 面板关闭后仍锁住键盘：转 `$chii-ui`。
- 剧情镜头在错误时间释放：转 `$chii-story`。
- 模型位置、占地或碰撞错误：转 `$chii-scene`。
- 材质、天空或特效错误：转 `$chii-visuals`。
- 后端请求、模式或结果错误：转 `$chii-ai`。

## 四、快速判断

```text
现在是什么情况？                           → chii-status
需要启动或关闭本地服务？                   → chii-dev
不知道错误在哪一层？                       → chii-debug
游戏规则或状态发生变化？                   → chii-gameplay
只改变屏幕界面和输入体验？                 → chii-ui
改变固定剧情、镜头或转场？                 → chii-story
改变地图布置、占位、寻路或碰撞？           → chii-scene
改变材质、水、天空、灯光或渲染表现？       → chii-visuals
要写后端提示词？                           → chii-prompts
要自主调用后端？                           → chii-ai
要同步你在 Studio 保存的内容？             → chii-assets
修改结束需要确认工程可用？                 → chii-verify
需要整理成汇报或交接？                     → chii-handoff
```

不要因为任务很大就一次调用所有技能。先用 `$chii-status` 获取上下文，再确定一个主技能，只增加真正跨界的辅助技能。
