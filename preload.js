const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("soundboardApi", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  pickAudio: () => ipcRenderer.invoke("dialog:pick-audio")
});
