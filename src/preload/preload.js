// 预加载：向渲染进程暴露安全的 IPC 接口
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('app:init'),
  dictList: () => ipcRenderer.invoke('dict:list'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  getStats: () => ipcRenderer.invoke('stats:get'),
  resetProgress: () => ipcRenderer.invoke('progress:reset'),
  nextWord: () => ipcRenderer.invoke('word:next'),
  prevWord: () => ipcRenderer.invoke('word:prev'),
  markWord: (word, status) => ipcRenderer.invoke('word:mark', word, status),
  saveFloatPos: (pos, width) => ipcRenderer.invoke('float:savePos', pos, width),
  resizeFloat: (width) => ipcRenderer.invoke('float:resize', width),
  expandFloat: (tall) => ipcRenderer.invoke('float:expand', tall),
  openSettings: () => ipcRenderer.send('open:settings'),
  hideFloat: () => ipcRenderer.send('float:hide'),
  setAutoStart: (v) => ipcRenderer.invoke('app:autoStart', v),
  onWordUpdate: (cb) => ipcRenderer.on('word:update', (_e, info) => cb(info)),
  onSettingsChanged: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  onFloatShown: (cb) => ipcRenderer.on('float:shown', () => cb()),
});
