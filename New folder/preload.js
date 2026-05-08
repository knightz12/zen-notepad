const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("zenAPI", {
  openTabInNewWindow: (file) => ipcRenderer.invoke("open-tab-new-window", file),

  openEmptyWindow: () => ipcRenderer.invoke("open-empty-window"),

  onOpenEmptyWindow: (callback) =>
  ipcRenderer.on("open-empty-window", () => callback()),

  getWindowCount: () => ipcRenderer.invoke("get-window-count"),

  startTabDrag: (file) => ipcRenderer.invoke("start-tab-drag", file),
  takeDraggedTab: () => ipcRenderer.invoke("take-dragged-tab"),

  readDroppedFile: (filePath) =>
  ipcRenderer.invoke("read-dropped-file", filePath),

  getDroppedFilePath: (file) => webUtils.getPathForFile(file),

  onFileUpdated: (callback) =>
  ipcRenderer.on("file-updated", (_, file) => callback(file)),
  
  minimize: () => ipcRenderer.send("window-minimize"),

  maximize: () => ipcRenderer.send("window-maximize"),

  close: () => ipcRenderer.send("window-close"),

  openFile: () => ipcRenderer.invoke("open-file"),

  saveFile: (file) => ipcRenderer.invoke("save-file", file),

  saveSession: (data) =>
    ipcRenderer.invoke("save-session", data),

  loadSession: () =>
    ipcRenderer.invoke("load-session"),

  getStartupFile: () =>
    ipcRenderer.invoke("get-startup-file"),

  onOpenDetachedTab: (callback) =>
  ipcRenderer.on("open-detached-tab", (_, file) => callback(file)),

  onOpenFileInTab: (callback) =>
    ipcRenderer.on("open-file-in-tab", (_, file) =>
      callback(file)
    )
});