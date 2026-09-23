# 桌面背单词助手

参考经典桌面背单词软件《不知不觉背单词》复刻的 Electron 桌面应用：在屏幕上常驻一条半透明浮动条，循环展示单词和释义，让你在日常工作、上网的间隙**不知不觉**记住单词。

## 功能

- **桌面浮动条**：置顶、半透明、可拖动、可拖边调宽、不抢焦点；两种展示模式——**滚动展示**（跑马灯循环滚过）和**直接展示**（静止显示，停留数秒自动切下一个，悬停/暂停时计时冻结）
- **悬停看详情**：鼠标移入展开卡片——完整释义、英音/美音音标（点击朗读）、例句与真题例句
- **一键发音**：点击浮动条或音标图标朗读（Windows TTS，可设自动发音、美音/英音，也可整体隐藏发音）
- **标记与记忆**：「认识 / 不熟悉 / 收藏」，可自动跳过已认识的词
- **七套真实词库**：大学英语四级(4544)、六级(3991)、考研(5047)、托福(10367)、托业(9697)、雅思(5275)、GRE(9984)，含音标/释义/例句（托业含商务场景例句）
- **学习统计**：今日展示、连续打卡、近 7 天柱状图、认识/不熟悉/收藏计数
- **个性化**：5 种主题色、字号、滚动速度、背景不透明度、随机/顺序、每日目标
- **全局快捷键**：`Ctrl+Alt+H` 显示/隐藏，`Ctrl+Alt+P` 暂停/继续，`Ctrl+Alt+←/→` 上/下一个词
- **托盘常驻**：关窗不退出，托盘右键可退出；支持开机自启；数据本地保存

## 运行

```bat
npm install
npm start          # 仅浮动条 + 托盘
npm run dev        # 同时打开设置窗口
```

或双击 `启动背单词.bat`（需先完成 npm install）。

## 打包

```bat
npm run dist
```

生成到 `release/` 目录：

- `桌面背单词助手 Setup 1.0.0.exe` — NSIS 安装包（可选安装目录、创建桌面快捷方式）
- `桌面背单词助手-便携版.exe` — 免安装单文件版

> 国内网络请在环境变量中设置镜像后再打包：
> `set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 与 `set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`

## 项目结构

```
src/main/main.js      主进程：浮动条窗口、设置窗口、托盘、快捷键、IPC
src/main/store.js     设置/进度/统计的本地持久化
src/main/engine.js    学习队列（随机/顺序、跳过已认识、循环轮换）
src/main/dicts.js     词库加载
src/preload           contextBridge 安全接口
src/renderer/float.html    浮动条 UI（跑马灯、详情卡、发音、标记）
src/renderer/settings.html 设置窗口 UI（词库/学习/外观/统计/通用）
assets/dict/*.json    六套词库（来自开源项目 kajweb/dict）
tools/build-dicts.js  词库下载与格式转换脚本
tools/gen-icon.js     图标生成脚本（纯 Node，无依赖）
```

## 词库数据

来自开源数据：四级～GRE 取自 [kajweb/dict](https://github.com/kajweb/dict)（有道词典数据，`tools/build-dicts.js`）；托业取自 HuggingFace [toeic-vocab-tw](https://huggingface.co/datasets/kknono668/toeic-vocab-tw) 数据集（opencc-js 繁转简，ECDICT 补音标，`tools/build-toeic.js`），仅用于个人学习。

```bat
node tools/build-dicts.js
node tools/build-toeic.js
```
