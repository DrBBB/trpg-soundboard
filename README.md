# TRPG 音效板

Electron 桌面音效按钮板，跑团时一键播放背景音效。

## 功能

- 单击播放 / 长按循环（1 秒触发）
- 拖拽排序按钮
- 右键切换音量（100% → 60% → 30%）
- 自定义绑定本地音频文件
- 长文件名自动滚动显示
- 内置 3 个示范音效

## 快速开始

双击 `启动音效板.bat`，首次运行自动安装依赖。

或手动：

```bash
npm install
npm start
```

## 技术栈

Electron 35 + vanilla JS，零框架依赖。

| 文件 | 用途 |
|------|------|
| `main.js` | 主进程，窗口创建、IPC、配置读写 |
| `preload.js` | contextBridge 安全桥接 |
| `renderer.js` | 全部 UI 逻辑 |
| `styles.css` | 深色主题样式 |
| `index.html` | 入口页面 |

## 打包

```bash
npm run pack:win
```

输出 `dist/` 目录下的 portable exe。
