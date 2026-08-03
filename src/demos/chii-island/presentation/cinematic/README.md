# Chii Cinematic Template Library

本目录是奇异岛演出层的可复用镜头模板库。它只负责镜头构图、相机运动、镜头震动和屏幕转场，不拥有剧情状态、角色状态、输入锁或玩法结果。

## 镜头模板

| ID | 常见用途 | 使用原则 |
|---|---|---|
| `pov_wake` | 第一视角苏醒、从昏迷中睁眼 | 先黑场渐亮，再短促眨眼；镜头缓慢稳定 |
| `establishing_wide` | 建立地点、危险和人物位置 | 先交代空间，再进入中近景 |
| `handheld_third_person` | 直升机摇晃、奔跑、混乱环境 | 震动必须有环境动因，人物仍需可读 |
| `dialogue_two_shot` | 两人同框对话 | 展示人物关系，固定对话轴线 |
| `dialogue_over_shoulder` | 越肩拍摄说话者 | 前景保留倾听者，重点落在说话者 |
| `shot_reverse_shot` | 对话正反打 | 使用匹配景别，不跨越 180 度轴线 |
| `entrance_reveal` | 天使或重要人物入场 | 预留负空间，再通过平移或推进完成揭示 |
| `face_close_up` | 台词、表情和决定性瞬间 | 短而明确，不长期挤压空间信息 |
| `reaction_close_up` | 倾听者反应 | 先让反应成立，再切回动作 |
| `action_tracking` | 坠落、奔跑和追踪 | 保持运动方向稳定，给主体留前进空间 |
| `impact_wide` | 撞击、落水和大型结果 | 先展示完整结果，再切细节 |
| `focus_insert` | 水面涟漪、关键道具和转场焦点 | 锁定一个具体细节，不承载长对话 |

## 屏幕转场模板

| ID | 常见用途 | 当前支持 |
|---|---|---|
| `cut` | 连续动作、明确节拍 | 可直接使用 |
| `fade_from_black` | 新场景开场 | 可直接使用 |
| `fade_to_black` | 段落结束 | 可直接使用 |
| `dip_to_black` | 同一段落内的短时间/地点变化 | 可直接使用 |
| `pov_wake_blink` | 第一视角苏醒 | 可直接使用 |
| `iris_focus` | 周围收黑，只保留圆形观察区域 | 可直接使用 |
| `iris_to_black` | 圆形观察区域完全闭合 | 可直接使用 |
| `flash_cut` | 冲击、爆闪或突然失去方向 | 可直接使用 |
| `soft_blur_load` | 很短的异步加载过渡 | 可直接使用 |
| `dissolve` | 回忆、时间流逝、相关意象叠化 | 需要前后两个画面表面 |
| `wipe` | 明确的地点切换或平行动作 | 需要前后两个画面表面 |

## 第 0 幕镜头表

```text
黑场
→ pov_wake + pov_wake_blink
→ pov_wake 看见对面坐着的老大
→ pov_wake 衰减摇头，表达主角清醒
→ dialogue_two_shot 交代主角、老大和破损机舱
→ dialogue_over_shoulder 拍老大警告
→ reaction_close_up 拍主角沉默
→ action_tracking 拍老大被破洞吸走
→ entrance_reveal 拍天使入场
→ dialogue_two_shot / face_close_up 完成对话
→ action_tracking 拍弹出和坠落
→ impact_wide 拍落水
→ focus_insert 拍水面涟漪
→ iris_focus 将周围收黑
→ iris_to_black 闭合画面
→ 下一幕从黑场淡入
```

落水后的圆形效果是屏幕遮罩，不是世界中的实体模型。世界层只生成水面涟漪；转场层负责收拢玩家视野。

## 调用规则

1. 剧情 Director 选择模板并给出进度。
2. Stage 负责提供人物、道具和镜头锚点。
3. `CinematicTemplateLibrary` 计算镜头震动或转场状态。
4. `CinematicScreenEffectPresenter` 只把转场状态显示到屏幕。
5. 模板不得直接修改玩法状态、Pet 状态、世界对象或存档。

主要参考：BBC 的 five essential shots 和对话轴线建议、Adobe 的 fade/iris/dissolve 定义，以及 Unity/Unreal 对事件驱动相机震动和混合的实现术语。
