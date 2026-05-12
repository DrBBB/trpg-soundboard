# TRPG Soundboard

Electron 桌面音效按钮板，供跑团 (TRPG) 时播放背景音效。支持点击播放、长按循环、拖拽排序、自定义绑定音频文件。

## 技术栈

- Electron 35 + vanilla JS（无框架）
- 主进程：`main.js` — IPC handlers、配置文件管理、文件选择对话框
- Preload：`preload.js` — contextBridge 暴露安全 API
- 渲染进程：`renderer.js` — 全部 UI 逻辑
- 样式：`styles.css` — 深色主题，金色/青色强调色

## 项目结构

| 文件 | 用途 |
|------|------|
| `main.js` | Electron 主进程，窗口创建、IPC、配置读写 |
| `preload.js` | 桥接层，暴露 `window.soundboardApi` |
| `renderer.js` | 按钮渲染、播放控制（单击/长按循环）、拖拽排序、音量切换、动态名称滚动 |
| `styles.css` | 完整样式，CSS 变量驱动主题 |
| `index.html` | 入口 HTML |
| `package.json` | 打包配置（electron-builder, portable win） |

## 核心机制

- **配置持久化**：保存在 `app.getPath("userData")/soundboard-config.json`
- **音频状态管理**：`state` 对象管理 `activeLoops`（循环）和 `activeShots`（单次播放）
- **长按检测**：1000ms 长按触发循环，200ms 后显示进度条动画
- **音量档位**：右键循环切换 100% → 60% → 30%
- **名字滚动**：超长名称 hover 1s 后触发 marquee 动画
- **3 个内置音频**：advanture.mp3、Carriage.mp3、Dooropen.mp3（不可删除）

## 常用命令

```bash
npm start              # 启动应用
npm run pack:win       # 打包 Windows portable 版到 dist/
```

或双击 `启动音效板.bat`（自动检测 Node.js 并安装依赖后启动）。

## 需求追踪

| 日期 | 需求 | 状态 |
|------|------|------|
| 2026-05-07 | 搜索今日运势 | ✅ 已完成 — 用 WebFetch + DuckDuckGo HTML 搜索 |
| 2026-05-07 | 解决没法联网搜索的问题 | ✅ 已完成 — 诊断：DeepSeek API 不支持 WebSearch 的 tool_choice，Tavily MCP 有内部 bug。改用 WebFetch + DuckDuckGo |
| 2026-05-07 | 删除 Tavily，禁用 WebSearch，只用 WebFetch + DuckDuckGo | ✅ 已完成 — 已从项目 settings.local.json 移除权限，全局 .claude.json 卸载 Tavily MCP Server |
| 2026-05-11 | 更新版本号至 0.2.0，新增折叠分组功能 | ✅ 已完成 — 按钮可归入可折叠分组，自由拖拽跨组/未分组移动，分组默认名「分组N」可重命名 |
| 2026-05-12 | 重写拖拽排序逻辑（纯插入模式） | ✅ 已完成 — 删除交换逻辑，统一纯插入排序。moveSlot 统一数据操作，setupContainerDropZone 统一间隙处理，CSS 插入指示器（边条+虚线轮廓）。修复 off-by-one、闪烁、X+Y 坐标判定 |
| 2026-05-12 | 下载 TabletopAudio 全站音效 | ✅ 已完成 — 927 个 OGG 音效文件，33 个 SoundPad，含 Patreon 付费内容。446 个简笔画图标 + 33 个封面图 |
| 2026-05-12 | 构建 AI 音效匹配系统 | ✅ 已完成 — sound_tags.json 标签数据库（Setting/Scene/Emotion/Type 四维标签），ai_matcher.js 自然语言匹配引擎，icon_sound_map.json 图标映射 |
| 2026-05-07 | 统一所有音频响度（含用户链接音频） | ✅ 已完成 — 采样前 1MB 算 RMS，自动增益补偿。3 个内置音频预硬编码增益。零依赖。 |
