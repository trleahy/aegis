const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startProcess: (config) => ipcRenderer.invoke('apply-watermark', config),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
});
