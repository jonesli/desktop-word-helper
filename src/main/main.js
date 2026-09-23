// 主进程：浮动条窗口、设置窗口、托盘、全局快捷键、IPC
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('./store');
const Engine = require('./engine');
const { getIndex } = require('./dicts');

const ICON = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.png');
const TRAY_ICON = path.join(__dirname, '..', '..', 'assets', 'icons', 'tray.png');

const BAR_H = 46;          // 浮动条高度
const CARD_H = 300;        // 悬停展开后的窗口高度
const DEFAULT_W = 460;

let store, engine;
let floatWin = null;
let settingsWin = null;
let tray = null;
let barWidth = DEFAULT_W;
let paused = false;

function createFloatWindow() {
  const saved = store.settings.pos || {};
  const bounds = screen.getPrimaryDisplay().workArea;
  floatWin = new BrowserWindow({
    x: saved.x,
    y: saved.y != null ? saved.y : bounds.y + 8,
    width: saved.width || DEFAULT_W,
    height: BAR_H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,   // 不抢焦点，鼠标仍可交互
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  barWidth = saved.width || DEFAULT_W;
  floatWin.setVisibleOnAllWorkspaces(true);
  floatWin.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[float:${level}]`, message, sourceId + ':' + line);
  });
  floatWin.webContents.on('did-fail-load', (_e, code, desc) => console.log('[float] fail-load', code, desc));
  floatWin.loadFile(path.join(__dirname, '..', 'renderer', 'float.html'));
  floatWin.once('ready-to-show', () => {
    floatWin.show();
    floatWin.setAlwaysOnTop(true, 'screen-saver');
    floatWin.moveTop();
  });
  floatWin.on('moved', savePosSoon);
  // focusable:false 时 setBounds 仍有效
}

function savePosSoon() {
  if (!floatWin) return;
  clearTimeout(savePosSoon._t);
  savePosSoon._t = setTimeout(() => {
    if (!floatWin || floatWin.isDestroyed()) return;
    const [x, y] = floatWin.getPosition();
    store.updateSettings({ pos: { x, y, width: barWidth } });
  }, 400);
}

function setFloatHeight(tall) {
  if (!floatWin || floatWin.isDestroyed()) return;
  const b = floatWin.getBounds();
  floatWin.setBounds({ x: b.x, y: b.y, width: b.width, height: tall ? BAR_H + CARD_H : BAR_H });
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 720,
    height: 640,
    minWidth: 620,
    minHeight: 560,
    title: '桌面背单词助手 - 设置',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function buildTray() {
  tray = new Tray(trayImage());
  const menu = Menu.buildFromTemplate([
    { label: '显示/隐藏 浮动条', click: () => toggleFloat() },
    { label: '暂停/继续 滚动', click: () => togglePause() },
    { type: 'separator' },
    { label: '设置', click: () => createSettingsWindow() },
    { label: '退出', click: () => { app.quit(); } },
  ]);
  tray.setToolTip('桌面背单词助手');
  tray.setContextMenu(menu);
  tray.on('click', () => toggleFloat());
}

function trayImage() {
  try {
    return nativeImage.createFromPath(TRAY_ICON);
  } catch {
    return nativeImage.createEmpty();
  }
}

function toggleFloat() {
  if (!floatWin) return;
  if (floatWin.isVisible()) floatWin.hide();
  else { floatWin.show(); floatWin.webContents.send('float:shown'); }
}

function togglePause() {
  paused = !paused;
  if (floatWin && !floatWin.isDestroyed()) floatWin.webContents.send('settings:changed', { ...store.settings, __paused: paused });
}

function pushWord() {
  if (floatWin && !floatWin.isDestroyed()) floatWin.webContents.send('word:update', engine.info());
}

function applySettingsSideEffects(oldS, newS) {
  if (newS.autoStart !== oldS.autoStart) {
    app.setLoginItemSettings({ openAtLogin: !!newS.autoStart });
  }
}

function registerShortcuts() {
  globalShortcut.register('Ctrl+Alt+H', toggleFloat);
  globalShortcut.register('Ctrl+Alt+P', togglePause);
  globalShortcut.register('Ctrl+Alt+Right', () => { pushWordAfter(engine.next()); });
  globalShortcut.register('Ctrl+Alt+Left', () => { pushWordAfter(engine.prev()); });
}

function pushWordAfter() { pushWord(); }

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => createSettingsWindow());

  app.whenReady().then(() => {
    store = new Store();
    engine = new Engine(store);
    engine.setDict(store.settings.dict);

    createFloatWindow();
    buildTray();
    registerShortcuts();
    if (process.argv.includes('--settings')) createSettingsWindow();

    ipcMain.handle('app:init', () => ({
      settings: store.settings,
      paused,
      wordInfo: engine.info(),
    }));
    ipcMain.handle('dict:list', () => getIndex());
    ipcMain.handle('settings:update', (_e, patch) => {
      const old = { ...store.settings };
      const s = store.updateSettings(patch);
      applySettingsSideEffects(old, s);
      if (patch.dict && patch.dict !== old.dict) engine.setDict(patch.dict);
      if ((patch.order != null && patch.order !== old.order) ||
          (patch.skipKnown != null && patch.skipKnown !== old.skipKnown)) engine.rebuild();
      if (floatWin && !floatWin.isDestroyed()) {
        floatWin.webContents.send('settings:changed', { ...s, __paused: paused });
      }
      pushWord();
      return s;
    });
    ipcMain.handle('stats:get', () => {
      const idx = getIndex();
      const cur = idx.find((d) => d.key === store.settings.dict);
      return { ...store.getStats(), dictName: cur ? `${cur.name}（${cur.count.toLocaleString()} 词）` : '—' };
    });
    ipcMain.handle('progress:reset', () => {
      store.resetProgress();
      engine.rebuild();
      pushWord();
      return true;
    });
    ipcMain.handle('word:next', () => { engine.next(); pushWord(); return engine.info(); });
    ipcMain.handle('word:prev', () => { engine.prev(); pushWord(); return engine.info(); });
    ipcMain.handle('word:mark', (_e, word, status) => {
      const s = store.markWord(word, status);
      return s;
    });
    ipcMain.handle('float:savePos', (_e, pos, width) => {
      if (width) barWidth = Math.max(320, Math.min(1000, Math.round(width)));
      const prev = store.settings.pos || {};
      store.updateSettings({ pos: { x: pos && pos.x != null ? pos.x : prev.x, y: pos && pos.y != null ? pos.y : prev.y, width: barWidth } });
      return true;
    });
    ipcMain.handle('float:resize', (_e, width) => {
      if (!floatWin || floatWin.isDestroyed()) return false;
      barWidth = Math.max(320, Math.min(1000, Math.round(width)));
      const b = floatWin.getBounds();
      floatWin.setBounds({ x: b.x, y: b.y, width: barWidth, height: b.height }, false);
      return true;
    });
    ipcMain.handle('float:expand', (_e, tall) => { setFloatHeight(tall); return true; });
    ipcMain.handle('app:autoStart', (_e, v) => {
      app.setLoginItemSettings({ openAtLogin: !!v });
      return true;
    });
    ipcMain.on('open:settings', () => createSettingsWindow());
    ipcMain.on('float:hide', () => floatWin && floatWin.hide());

    app.on('window-all-closed', (e) => { /* 托盘常驻，不退出 */ });
    app.on('before-quit', () => globalShortcut.unregisterAll());
  });
}
