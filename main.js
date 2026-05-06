const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

let win;
let startupFile = null;

const sessionPath = path.join(app.getPath("userData"), "session.json");

const supportedExtensions = [
  ".txt",
  ".log",
  ".md",
  ".json",
  ".js",
  ".ts",
  ".html",
  ".css",
  ".xml",
  ".csv",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".ini",
  ".bat",
  ".cmd",
  ".ps1",
  ".yaml",
  ".yml"
];

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
}

function isSupportedFile(filePath) {
  if (!filePath) return false;

  const lower = filePath.toLowerCase();
  return supportedExtensions.some(ext => lower.endsWith(ext));
}

function getStartupFile() {
  return process.argv.find(arg => isSupportedFile(arg));
}

function readFileForTab(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, "utf8");

  return {
    path: filePath,
    name: path.basename(filePath),
    content,
    lastSavedContent: content
  };
}

function createWindow() {
  startupFile = getStartupFile();

  win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    backgroundColor: "#0f0f13",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile("index.html");
}

app.on("second-instance", (_, commandLine) => {
  const filePath = commandLine.find(arg => isSupportedFile(arg));
  const file = readFileForTab(filePath);

  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();

    if (file) {
      win.webContents.send("open-file-in-tab", file);
    }
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("window-minimize", () => win.minimize());

ipcMain.on("window-maximize", () => {
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on("window-close", () => win.close());

ipcMain.handle("get-startup-file", async () => {
  return readFileForTab(startupFile);
});

ipcMain.handle("open-file", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      {
        name: "Text Files",
        extensions: [
          "txt",
          "log",
          "md",
          "json",
          "js",
          "ts",
          "html",
          "css",
          "xml",
          "csv",
          "py",
          "java",
          "c",
          "cpp",
          "h",
          "hpp",
          "ini",
          "bat",
          "cmd",
          "ps1",
          "yaml",
          "yml"
        ]
      },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled) return null;

  return readFileForTab(result.filePaths[0]);
});

ipcMain.handle("save-file", async (_, file) => {
  let filePath = file.path;

  if (!filePath) {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: "Untitled.txt",
      filters: [
        { name: "Text Files", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (result.canceled) return null;
    filePath = result.filePath;
  }

  const windowsText = file.content.replace(/\n/g, "\r\n");

  fs.writeFileSync(filePath, windowsText, "utf8");

  return {
    path: filePath,
    name: path.basename(filePath)
  };
});

ipcMain.handle("save-session", async (_, data) => {
  fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2), "utf8");
  return true;
});

ipcMain.handle("load-session", async () => {
  if (!fs.existsSync(sessionPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  } catch {
    return null;
  }
});