# AI Context

本文档供 AI 助手阅读，描述项目当前状态和设计思路。

## 项目概览

TRPG Soundboard 是一个 Windows 桌面音效按钮板，供跑团（TRPG）主持人播放背景音效。基于 Electron 35，纯 vanilla JS，零运行时依赖。

### 当前版本

0.1.0 — 核心功能完备，已可打包为便携版使用。

### 功能清单

| 功能 | 实现 |
|------|------|
| 点击播放音效 | ✅ |
| 长按循环播放 | ✅ (1000ms 触发) |
| 长按进度条动画 | ✅ (200ms 后显示，800ms 填满) |
| 拖拽排序 | ✅ (HTML5 Drag and Drop) |
| 右键切换音量 | ✅ (100% → 60% → 30% 循环) |
| 超长名称滚动 | ✅ (hover 1s 后触发 marquee) |
| 自定义绑定音频 | ✅ (文件选择对话框) |
| 删除按钮 | ✅ (内置 3 个不可删除) |
| 停止所有音频 | ✅ |
| 新增空按钮 | ✅ |
| 响度统一 | ✅ (RMS 分析，自动增益补偿) |
| 音频时长显示 | ✅ |
| 媒体丢失检测 | ✅ |
| 响应式布局 | ✅ (5列/4列/2列) |

## 架构设计

```
main.js  ←→  preload.js (contextBridge)  ←→  renderer.js
  ↑                                               ↑
  IPC handlers                              DOM + Audio API
  配置文件读写                                全部 UI 逻辑
```

**三层结构**，遵循 Electron 安全最佳实践：
- `contextIsolation: true`，`nodeIntegration: false`
- preload 仅暴露 3 个 API：`loadConfig`、`saveConfig`、`pickAudio`
- 渲染进程完全沙盒化，无法访问 Node.js 或文件系统

## 核心设计思路

### 1. 零依赖原则

除了 Electron 本身和 electron-builder（打包），不引入任何第三方库。理由：
- 项目功能简单，不需要 React/Vue 等框架
- 避免供应链攻击面
- 便携版体积小（单 exe）
- 代码完全可控，无升级兼容性问题

### 2. 配置即状态

所有持久化数据保存在单个 JSON 文件 `soundboard-config.json`（位于 `userData` 目录）。每个 slot 的结构：

```js
{
  id: string,          // 唯一标识
  label: string,       // 按钮显示名
  sourceType: string,  // "bundled" | "file" | "empty"
  filePath: string,    // 音频绝对路径
  missing: boolean,    // 文件是否存在
  durationSec: number, // 音频时长（秒）
  volumeLevel: number, // 1 | 0.6 | 0.3
  normGain: number     // 响度增益系数
}
```

`normalizeConfig()` 在每次读写时运行，确保配置文件向后兼容——新的字段有默认值，旧格式自动补全。

### 3. 响度统一机制

问题：不同来源的音频（内置、用户绑定）响度差异很大，用户在按钮间切换时音量忽大忽小。

方案：类 ReplayGain 的离线 RMS 分析：
- 通过 HTTP Range 请求只下载文件前 1MB（避免加载整个大文件）
- 用 `OfflineAudioContext` 解码音频数据
- 计算多声道 RMS dB 值
- 目标响度 -23 dBFS，算出增益系数 `gain = 10^((target - measured) / 20)`
- 增益上限 4.0（防止极端安静的音频被过度放大）
- 3 个内置音频的增益值预硬编码在 `getDefaultConfig()` 中，启动时无需重新分析
- 新绑定音频在绑定时同步分析（用户可见进度）
- 启动时对未分析的音频并发分析（3 个并发，`Promise.race` 驱动队列）

### 4. 长按检测

不使用 `setTimeout` 的单次判断，而是三阶段设计：

```
pointerdown
  → 0ms: 重置状态，清除上次残留
  → 200ms: 开始进度条动画（requestAnimationFrame 驱动 fill）
  → 1000ms: 触发循环播放，进度条直接跳到 100%
pointerup (在 1000ms 内)
  → 点击播放
pointerup (超过 1000ms)
  → 不做任何事（循环已启动）
```

关键细节：
- 进度条从 0 到 100% 的实际填充时间是 800ms（1000ms - 200ms），避免进度条跳变
- 使用 `requestAnimationFrame` 驱动进度，性能优于 CSS animation（与 React 渲染周期无关，因为这里是 vanilla JS）
- `pointer` 事件而非 `mouse/touch` 事件，统一处理鼠标和触屏
- 进度条 `transform: scaleX()` 配合 `transform-origin: left`，比修改 `width` 性能更好（不触发 layout）

### 5. 渲染策略

`render()` 不是整体重绘，而是 DOM diff：
- 遍历现有 DOM 中的 `.slot-tile`，按 `data-slot-id` 建立 Map
- 遍历新 config，对已存在的 tile 调用 `updateTile()`（仅更新文本、类名、进度条状态）
- 新增的 tile 才创建 DOM 元素
- 移除的 tile 直接删除

这样播放中的 `<audio>` 元素不受 render 影响（不在 DOM 树中，由 JS 持有引用）。

### 6. 音频状态管理

两个独立的集合管理播放状态：
- `activeLoops: Map<slotId, Audio>` — 循环中的音频
- `activeShots: Set<Audio>` + `activeShotsBySlot: Map<slotId, Audio>` — 单次播放中的音频

单次播放用两个数据结构的原因：`ended` 事件清理时需要从 Set 中删除 `Audio` 对象（O(1)），同时需要从 slotId 查找时用 Map（O(1)）。

### 7. CSS 变量驱动主题

所有颜色通过 CSS custom properties 定义，深色基底 + 三种语义色：
- 金色 (`--accent`) — 播放状态
- 青色 (`--loop`) — 循环/长按状态
- 橙色 (`--missing`) — 媒体丢失状态

按钮在不同状态下通过切换 class（`.playing`、`.looping`、`.missing`）改变边框、背景、芯片颜色，不需要 inline style。

### 8. 安全设计

- 音频文件路径通过 `file:///` URL 加载，但渲染进程无法直接构造路径（必须通过 preload API）
- 文件选择对话框在主进程中打开，渲染进程只拿到结果对象
- 配置文件读写完全在主进程，通过 IPC 通信
- 即使攻击者修改了配置文件中的 `filePath`，也只能指向已有文件（`fs.existsSync` 校验）

## 文件说明

| 文件 | 角色 |
|------|------|
| `main.js` | Electron 主进程：窗口、IPC、配置 CRUD、文件对话框 |
| `preload.js` | contextBridge 暴露 3 个安全 API |
| `renderer.js` | 全部 UI：按钮渲染、播放控制、拖拽、音量、进度条、响度分析 |
| `styles.css` | 深色主题样式，CSS 变量，响应式 |
| `index.html` | 入口 HTML，最小化结构 |
| `package.json` | electron-builder portable 打包配置 |
| `启动音效板.bat` | 一键启动脚本（自动检测 Node.js 并安装依赖） |

## 后续可扩展方向

- 音效分类/标签页
- 快捷键绑定
- 多语言支持
- 音量淡入淡出
- 同时播放多个音效的混音控制
