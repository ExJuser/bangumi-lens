const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getStatus: () => ipcRenderer.invoke("controller:getStatus"),
  startServer: () => ipcRenderer.invoke("controller:startServer"),
  stopServer: () => ipcRenderer.invoke("controller:stopServer"),
  restartServer: () => ipcRenderer.invoke("controller:restartServer"),
  openApp: () => ipcRenderer.invoke("controller:openApp"),
  openLogsFolder: () => ipcRenderer.invoke("controller:openLogsFolder"),
  readLogs: () => ipcRenderer.invoke("controller:readLogs")
};

contextBridge.exposeInMainWorld("bangumiLensController", api);
