const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startProcess: (config) => ipcRenderer.invoke('apply-watermark', config),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  logMessage: (log) => ipcRenderer.send('log-message', log),
  openAboutWindow: () => ipcRenderer.send('open-about-window'),
  onProcessingProgress: (callback) => ipcRenderer.on('processing-progress', callback),
  removeProgressListener: () => ipcRenderer.removeAllListeners('processing-progress'),
});