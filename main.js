const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

let win;
let startupFile = null;

const sessionPath = path.join(app.getPath("userData"), "session.json");

function getStartupFile() {
  return process.argv.find(arg => {
    const lower = arg.toLowerCase();
    return (
      lower.endsWith(".txt") ||
      lower.endsWith(".md") ||
      lower.endsWith(".json") ||
      lower.endsWith(".js") ||
      lower.endsWith(".py") ||
      lower.endsWith(".html") ||
      lower.endsWith(".css")
    );
  });
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
  if (!startupFile) return null;
  if (!fs.existsSync(startupFile)) return null;

  const content = fs.readFileSync(startupFile, "utf8");

  return {
    path: startupFile,
    name: path.basename(startupFile),
    content,
    lastSavedContent: content
  };
});

ipcMain.handle("open-file", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      { name: "Text Files", extensions: ["txt", "md", "json", "js", "py", "html", "css"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled) return null;

  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, "utf8");

  return {
    path: filePath,
    name: path.basename(filePath),
    content,
    lastSavedContent: content
  };
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

  fs.writeFileSync(filePath, file.content, "utf8");

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