const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zenAPI", {
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),

  openFile: () => ipcRenderer.invoke("open-file"),
  saveFile: (file) => ipcRenderer.invoke("save-file", file),
  saveSession: (data) => ipcRenderer.invoke("save-session", data),
  loadSession: () => ipcRenderer.invoke("load-session"),

  getStartupFile: () => ipcRenderer.invoke("get-startup-file")
});