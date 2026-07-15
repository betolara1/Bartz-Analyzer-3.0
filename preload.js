// preload.js  (CJS)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  analyzer: {
    start: (cfg) => ipcRenderer.invoke('analyzer:start', cfg || {}),
    stop: () => ipcRenderer.invoke('analyzer:stop'),
    scanOnce: () => ipcRenderer.invoke('analyzer:scanOnce'),
    onEvent: (cb) => {
      ipcRenderer.removeAllListeners('analyzer:event');
      ipcRenderer.on('analyzer:event', (_e, msg) => cb && cb(msg));
    },
    openInFolder: (p) => ipcRenderer.invoke('analyzer:openInFolder', p),
    reprocessOne: (p) => ipcRenderer.invoke('analyzer:reprocessOne', p),
    replaceCoringa: (filePath, from, to) => ipcRenderer.invoke('analyzer:replaceCoringa', { filePath, from, to }),
    undoReplace: (filePath) => ipcRenderer.invoke('analyzer:undoReplace', { filePath }),
    replaceCgGroups: (filePath, map) => ipcRenderer.invoke('analyzer:replaceCgGroups', { filePath, map }),
    fillReferencia: (filePath, value) => ipcRenderer.invoke('analyzer:fillReferencia', { filePath, value }),
    fillReferenciaByIds: (filePath, replacements) => ipcRenderer.invoke('analyzer:fillReferenciaByIds', { filePath, replacements }),
    replaceItemDescription: (filePath, ids, newDescription, desenho) => ipcRenderer.invoke('analyzer:replaceItemDescription', { filePath, ids, newDescription, desenho }),
    findDrawingFile: (drawingCode, xmlFilePath) => ipcRenderer.invoke('analyzer:findDrawingFile', { drawingCode, xmlFilePath }),
    openDrawing: (drawingCode) => ipcRenderer.invoke('analyzer:openDrawing', { drawingCode }),
    openDrawingFolder: (drawingCode) => ipcRenderer.invoke('analyzer:openDrawingFolder', { drawingCode }),
    openMuxarabiDrawing: (sizeCode) => ipcRenderer.invoke('analyzer:openMuxarabiDrawing', { sizeCode }),
    injectMuxarabi: (drawingCode, sizeCode, thickness) => ipcRenderer.invoke('analyzer:injectMuxarabi', { drawingCode, sizeCode, thickness }),
    fixFresa37to18: (dxfFilePath) => ipcRenderer.invoke('analyzer:fixFresa37to18', dxfFilePath),
    exportReport: (reportData) => ipcRenderer.invoke('analyzer:exportReport', reportData),
    searchCsvProduct: (colorName, productType) => ipcRenderer.invoke('analyzer:searchCsvProduct', { colorName, productType }),
    searchErpProduct: (params) => ipcRenderer.invoke('analyzer:searchErpProduct', params),
    getOrderComments: (numPedido) => ipcRenderer.invoke('analyzer:getOrderComments', numPedido),
    moveToOk: (filePath) => ipcRenderer.invoke('analyzer:moveToOk', filePath),
    clearTargetFolders: () => ipcRenderer.invoke('analyzer:clearTargetFolders'),
    loadHistory: () => ipcRenderer.invoke('analyzer:loadHistory'),
    saveHistory: (rows) => ipcRenderer.invoke('analyzer:saveHistory', rows),
  },

  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (data) => ipcRenderer.invoke('settings:save', data),
    testPaths: (data) => ipcRenderer.invoke('settings:testPaths', data),
    pickFolder: (initial) => ipcRenderer.invoke('settings:pickFolder', initial || ''),
  },

  updater: {
    onUpdateAvailable: (cb) => {
      ipcRenderer.removeAllListeners('updater:available');
      ipcRenderer.on('updater:available', (_e, info) => cb && cb(info));
    },
    onUpdateProgress: (cb) => {
      ipcRenderer.removeAllListeners('updater:progress');
      ipcRenderer.on('updater:progress', (_e, progressObj) => cb && cb(progressObj));
    },
    onUpdateDownloaded: (cb) => {
      ipcRenderer.removeAllListeners('updater:downloaded');
      ipcRenderer.on('updater:downloaded', (_e, info) => cb && cb(info));
    },
    onUpdateNotAvailable: (cb) => {
      ipcRenderer.removeAllListeners('updater:not-available');
      ipcRenderer.on('updater:not-available', (_e, info) => cb && cb(info));
    },
    onUpdateError: (cb) => {
      ipcRenderer.removeAllListeners('updater:error');
      ipcRenderer.on('updater:error', (_e, err) => cb && cb(err));
    },
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    startDownload: () => ipcRenderer.invoke('updater:start-download'),
    installUpdate: () => ipcRenderer.invoke('updater:install'),
  },
});

// Capturar erros do renderer (React/JS) e enviar para o processo principal (terminal)
window.onerror = (msg, url, line, col, error) => {
  ipcRenderer.send('renderer-error', {
    msg,
    url,
    line,
    col,
    stack: error ? error.stack : 'No stack trace'
  });
};

window.addEventListener('unhandledrejection', (event) => {
  ipcRenderer.send('renderer-error', {
    msg: `Unhandled Promise Rejection: ${event.reason}`,
    stack: event.reason?.stack || 'No stack trace'
  });
});
