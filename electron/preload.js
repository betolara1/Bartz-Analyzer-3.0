// preload.js  (CommonJS)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  analyzer: {
    start: (cfg) => ipcRenderer.invoke('analyzer:start', cfg || {}),
    stop:  () => ipcRenderer.invoke('analyzer:stop'),
    scanOnce: () => ipcRenderer.invoke('analyzer:scanOnce'),
    onEvent: (cb) => {
      ipcRenderer.removeAllListeners('analyzer:event');
      ipcRenderer.on('analyzer:event', (_e, data) => cb?.(data));
    },
    openDrawing: (drawingCode) => ipcRenderer.invoke('analyzer:openDrawing', { drawingCode }),
    openDrawingFolder: (drawingCode) => ipcRenderer.invoke('analyzer:openDrawingFolder', { drawingCode }),
    openMuxarabiDrawing: (sizeCode) => ipcRenderer.invoke('analyzer:openMuxarabiDrawing', { sizeCode })
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (data) => ipcRenderer.invoke('settings:save', data),
    testPaths: (data) => ipcRenderer.invoke('settings:testPaths', data),
    pickFolder: (initial) => ipcRenderer.invoke('settings:pickFolder', initial || '')
  }
});
