let files = [];
let currentIndex = 0;
let statusTimer;
let cutTab = null;
let cutTabId = null;
let copiedTab = null;
let selectedTabIndex = 0;

const editor = document.getElementById("editor");
const tabs = document.getElementById("tabs");
const fileName = document.getElementById("fileName");
const status = document.getElementById("status");
const statusLeft = document.getElementById("statusLeft");
const statusRight = document.getElementById("statusRight");
const statusCenter = document.getElementById("statusCenter");
const lineNumbers = document.getElementById("lineNumbers");
// no global needed now
const WINDOW_ID =
  Date.now().toString() + "-" + Math.random().toString(16).slice(2);

fileName.draggable = true;

fileName.addEventListener("dragstart", (e) => {
  const current = files[currentIndex];
  if (!current) return;

  saveCurrentToMemory();

  e.dataTransfer.effectAllowed = "move";

  const fileToDrag = {
    ...current,
    content: editor.value
  };

  window.zenAPI.startTabDrag(fileToDrag);
});

fileName.addEventListener("dragend", async (e) => {
  const outside =
    e.clientX < 0 ||
    e.clientY < 0 ||
    e.clientX > window.innerWidth ||
    e.clientY > window.innerHeight;

  if (!outside) return;

  setTimeout(async () => {
    const stillDragging = await window.zenAPI.takeDraggedTab();

    // moved into another window
    if (!stillDragging) {
      if (files.length === 1) {
        window.zenAPI.close();
        return;
      }

      files.splice(currentIndex, 1);

      currentIndex = Math.max(
        0,
        Math.min(currentIndex, files.length - 1)
      );

      render();
      saveSession();
      return;
    }

    // dropped outside all windows
    if (files.length === 1) return;

    await window.zenAPI.openTabInNewWindow({
      ...stillDragging
    });

    files.splice(currentIndex, 1);

    currentIndex = Math.max(
      0,
      Math.min(currentIndex, files.length - 1)
    );

    render();
    saveSession();
  }, 150);
});

fileName.addEventListener("input", () => {
  const current = files[currentIndex];
  if (!current) return;

  current.name = fileName.value;
  current.customName = true;

  const activeTitle = tabs.querySelector(".tab.active .tab-title");
  if (activeTitle) {
    activeTitle.value = current.name || "Untitled.txt";
  }
  autoSizeTitle();
});

fileName.addEventListener("blur", () => {
  const current = files[currentIndex];
  if (!current) return;

  let value = fileName.value.trim().replace(/[\\/:*?"<>|]/g, "");

  if (value && !/\.[^.\s]+$/.test(value)) {
  value = value.replace(/\.+$/, "") + ".txt";
  }

  current.name = value; // keep empty allowed
  fileName.value = value;

  const activeTitle = tabs.querySelector(".tab.active .tab-title");
  if (activeTitle) {
    activeTitle.value = current.name || "Untitled.txt";
  }

  saveSession();
});

async function loadSession() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("empty") === "1") {
    files = [normalizeFile({
      path: null,
      name: "Untitled.txt",
      content: "",
      lastSavedContent: "",
      customName: false
    })];

    currentIndex = 0;
    render();
    saveSession();
    return;
  }
  
  const startup = await window.zenAPI.getStartupFile();

  if (startup) {
    files = [startup];
    currentIndex = 0;
    render();
    return;
  }

  const session = await window.zenAPI.loadSession();

  if (session && session.files && session.files.length) {
    files = await window.zenAPI.refreshSessionFiles(session.files);
    files = files.map(normalizeFile);
    currentIndex = session.currentIndex || 0;

  } else {
    files = [{
      path: null,
      name: "Untitled.txt",
      content: "",
      lastSavedContent: ""
    }];
    currentIndex = 0;
  }

  render();
}

function updateLineNumbers() {
  const lines = editor.value.split("\n");

  const currentLine =
    editor.value.substring(0, editor.selectionStart).split("\n").length;

  const style = getComputedStyle(editor);

  const lineHeight =
    parseFloat(style.lineHeight);

  const editorWidth =
    editor.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight) - 2;

  // hidden measuring element
  let measure = document.getElementById("lineMeasure");

  if (!measure) {
    measure = document.createElement("div");
    measure.id = "lineMeasure";

    measure.style.position = "absolute";
    measure.style.visibility = "hidden";
    measure.style.pointerEvents = "none";
    measure.style.whiteSpace = "pre-wrap";
    measure.style.wordBreak = "break-word";
    measure.style.overflowWrap = "break-word";

    document.body.appendChild(measure);
  }

  measure.style.width = editorWidth + "px";
  measure.style.font = style.font;
  measure.style.lineHeight = style.lineHeight;
  measure.style.padding = "0";
  measure.style.margin = "0";

  let html = "";

  lines.forEach((lineText, index) => {
    const lineNumber = index + 1;

    let visualLines = 1;

    if (!editor.classList.contains("no-wrap")) {
      measure.textContent = lineText || " ";

      visualLines = Math.max(
        1,
        Math.round(measure.scrollHeight / lineHeight)
      );
    }

    html += `
      <div
        class="line-number ${
          lineNumber === currentLine ? "active" : ""
        }"
        style="height:${visualLines * lineHeight}px"
      >
        ${lineNumber}
      </div>
    `;
  });

  lineNumbers.innerHTML = html;
}

function makeTabId() {
  return Date.now().toString() + "-" + Math.random().toString(16).slice(2);
}

function normalizeFile(file) {
  return {
    id: file.id || makeTabId(),
    path: file.path || null,
    name: file.name || "Untitled.txt",
    content: file.content || "",
    lastSavedContent: file.lastSavedContent ?? file.content ?? "",
    lastSavedAt: file.lastSavedAt || null,
    lastEditedAt: file.lastEditedAt || null,
    customName: file.customName || false,
    renamedUnsaved: file.renamedUnsaved || false
  };
}

function saveCurrentToMemory() {
  if (files[currentIndex]) {
    files[currentIndex].content = editor.value;

    if (files[currentIndex].renamedUnsaved) {
      files[currentIndex].renamedUnsaved = true;
    }
  }
}

function updateUntitledName() {
  const current = files[currentIndex];
  if (!current) return;

  // saved file = don't auto rename
  if (current.path) return;

  // manually renamed tab = don't auto rename
  if (current.customName || current.renamedUnsaved) return;

  const firstLine = editor.value
    .split("\n")[0]
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .substring(0, 40);

  if (!firstLine) {
    current.name = "Untitled.txt";
    current.customName = false;
    return;
  }

  current.name = firstLine + ".txt";
}

async function saveSession() {
  await window.zenAPI.saveSession({
    files,
    currentIndex
  });
}

function render() {
  tabs.innerHTML = "";

  // remove old context menus before re-render
  document.querySelectorAll(".tab-menu").forEach(menu => menu.remove());

  files.forEach((file, index) => {
    const tab = document.createElement("div");
    
    tab.className = "tab" + (index === currentIndex ? " active" : "");
    if (file.id === cutTabId) {
      tab.classList.add("cutting");
    }

    if (index === selectedTabIndex) {
      tab.classList.add("selected");
    }

    const title = document.createElement("input");
    title.className = "tab-title";
    title.value = file.name || "Untitled.txt";
    title.readOnly = true;

    const menu = document.createElement("div");
    menu.className = "tab-menu";

    const cutBtn = document.createElement("button");
    cutBtn.textContent = "Cut";

    cutBtn.onclick = async (e) => {
      e.stopPropagation();

      saveCurrentToMemory();

      cutTab = {
        file: normalizeFile({
          ...files[index],
          content: files[index].content
        }),
        index,
        windowId: WINDOW_ID
      };

      await window.zenAPI.setTabClipboard({
        type: "cut",
        file: cutTab.file,
        windowId: cutTab.windowId,
        index: cutTab.index
      });

      copiedTab = null;
      cutTabId = files[index].id;

      render();

      closeAllTabMenus();
    };

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy";

    copyBtn.onclick = async (e) => {
      e.stopPropagation();

      copiedTab = normalizeFile({
        ...files[index],
        id: makeTabId(),
        name: files[index].name || "Untitled.txt"
      });

      await window.zenAPI.setTabClipboard({
        type: "copy",
        file: copiedTab
      });

      await window.zenAPI.notifyCopyStarted();

      cutTab = null;
      cutTabId = null;
      render();

      closeAllTabMenus();
    };

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "Rename";

    renameBtn.onclick = (e) => {
      e.stopPropagation();
      closeAllTabMenus();

      title.readOnly = false;
      title.style.pointerEvents = "auto";

      setTimeout(() => {
        title.focus();
        title.select();
      }, 0);
    };

    const openNewWindowBtn = document.createElement("button");
    openNewWindowBtn.className = "small-menu-btn";
    openNewWindowBtn.textContent = "Open in new window";

    openNewWindowBtn.onclick = async (e) => {
      e.stopPropagation();

      saveCurrentToMemory();

      const fileToMove = normalizeFile({
        ...files[index],
        content: index === currentIndex ? editor.value : files[index].content
      });

      await window.zenAPI.openTabInNewWindow(fileToMove);

      files.splice(index, 1);

      if (files.length === 0) {
        files.push(normalizeFile({
          path: null,
          name: "Untitled.txt",
          content: "",
          lastSavedContent: "",
          customName: false
        }));
        currentIndex = 0;
      } else {
        currentIndex = Math.max(0, Math.min(currentIndex, files.length - 1));
      }

      closeAllTabMenus();
      render();
      saveSession();
    };

    const openLocationBtn = document.createElement("button");
    openLocationBtn.className = "small-menu-btn";
    openLocationBtn.textContent = "Open file location";
    openLocationBtn.disabled = !file.path;

    openLocationBtn.onclick = async (e) => {
      e.stopPropagation();
      closeAllTabMenus();

      if (!file.path) return;
      await window.zenAPI.openFileLocation(file.path);
    };

    menu.appendChild(cutBtn);
    menu.appendChild(copyBtn);
    menu.appendChild(renameBtn);
    menu.appendChild(openNewWindowBtn);
    menu.appendChild(openLocationBtn);
    document.body.appendChild(menu);

    tab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();

      closeAllTabMenus();

      menu.classList.add("show");
      sidebar.classList.add("menu-open");
      menu.style.left = e.clientX + "px";
      menu.style.top = e.clientY + "px";
    });

    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") title.blur();

      if (e.key === "Escape") {
        title.readOnly = true;
        title.value = file.name || "Untitled.txt";
        editor.focus();
      }
    });

    title.addEventListener("blur", () => {
      if (title.readOnly) return;

      title.readOnly = true;

      let value = title.value
        .trim()
        .replace(/[\\/:*?"<>|]/g, "");

      if (!value) value = "Untitled.txt";
      if (!value.includes(".")) value += ".txt";

      file.name = value;
      file.customName = true;
      title.value = value;

      file.content = index === currentIndex ? editor.value : file.content;
      file.lastEditedAt = new Date().toISOString();
      file.renamedUnsaved = true;

      if (index === currentIndex) {
        fileName.value = value;
        autoSizeTitle();
      }

      saveSession();
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "✕";
    closeBtn.title = "Close tab";

    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeTab(index);
    };

    tab.addEventListener("click", (e) => {
      if (e.target === title && !title.readOnly) return;
      switchTab(index);
    });

    tab.draggable = true;

    tab.addEventListener("dragstart", (e) => {
      saveCurrentToMemory();

      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", index.toString());
      e.dataTransfer.setData("zen-window-id", WINDOW_ID);

      const fileToDrag = { ...files[index] };

      if (index === currentIndex) {
        fileToDrag.content = editor.value;
      }

      window.zenAPI.startTabDrag(fileToDrag);
    });

    tab.addEventListener("dragend", async (e) => {
      const outside =
        e.clientX < 0 ||
        e.clientY < 0 ||
        e.clientX > window.innerWidth ||
        e.clientY > window.innerHeight;

      if (!outside) return;

      setTimeout(async () => {
        const stillDragging = await window.zenAPI.takeDraggedTab();

        if (!stillDragging) {
          if (files.length === 1) {
            window.zenAPI.close();
            return;
          }

          files.splice(index, 1);

          if (index < currentIndex) currentIndex--;
          if (index === currentIndex) {
            currentIndex = Math.max(0, currentIndex - 1);
          }

          currentIndex = Math.max(
            0,
            Math.min(currentIndex, files.length - 1)
          );

          render();
          saveSession();
          return;
        }

        if (files.length === 1) return;

        await window.zenAPI.openTabInNewWindow({ ...stillDragging });

        files.splice(index, 1);

        currentIndex = Math.max(
          0,
          Math.min(currentIndex, files.length - 1)
        );

        render();
        saveSession();
      }, 150);
    });

    tab.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    tab.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const toIndex = index;
      const sourceWindow = e.dataTransfer.getData("zen-window-id");
      const fromIndex = Number(e.dataTransfer.getData("text/plain"));

      if (
        sourceWindow === WINDOW_ID &&
        !Number.isNaN(fromIndex) &&
        files[fromIndex]
      ) {
        if (fromIndex === toIndex) return;

        saveCurrentToMemory();

        const movedFile = files.splice(fromIndex, 1)[0];
        files.splice(toIndex, 0, movedFile);

        currentIndex = toIndex;

        render();
        saveSession();
        return;
      }

      const movedFile = await window.zenAPI.takeDraggedTab();
      if (!movedFile) return;

      const normalized = normalizeFile(movedFile);

      if (files.some(f => f.id === normalized.id)) return;

      files.splice(toIndex, 0, normalized);
      currentIndex = toIndex;

      render();
      saveSession();
    });

    tab.appendChild(title);
    tab.appendChild(closeBtn);

    tabs.appendChild(tab);
  });

  const current = files[currentIndex];

  fileName.value = current?.name ?? "Untitled.txt";
  autoSizeTitle();
  editor.value = current?.content || "";

  updateLineNumbers();
  updateStatus();
}

const sidebar = document.getElementById("sidebar");

sidebar.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".tab")) return;

  e.preventDefault();
  e.stopPropagation();

  closeAllTabMenus();

  document
    .querySelectorAll(".sidebar-paste-menu")
    .forEach(m => m.remove());

  const menu = document.createElement("div");
  menu.className = "tab-menu sidebar-paste-menu show";

  const pasteBtn = document.createElement("button");
  pasteBtn.textContent = "Paste";
  pasteBtn.disabled = false;

  pasteBtn.onclick = async () => {

    const shared = await window.zenAPI.getTabClipboard();

    if (shared?.type === "copy") {
      copiedTab = shared.file;
      cutTab = null;
    }

    if (shared?.type === "cut") {
      cutTab = {
        file: shared.file,
        windowId: shared.windowId,
        index: shared.index
      };

      copiedTab = null;
    }

    // CUT paste
    if (cutTab) {

      const pasted = normalizeFile({
        ...cutTab.file,
        id: makeTabId()
      });

      files.push(pasted);

      // remove original ONLY after paste
      if (cutTab.windowId === WINDOW_ID) {
        files.splice(cutTab.index, 1);

        if (currentIndex >= files.length) {
          currentIndex = files.length - 1;
        }

        if (files.length === 0) {
          files.push(normalizeFile({
            path: null,
            name: "Untitled.txt",
            content: "",
            lastSavedContent: "",
            customName: false
          }));

          currentIndex = 0;
        }
      }

      currentIndex = files.length - 1;
      selectedTabIndex = currentIndex;

      await window.zenAPI.notifyCutPasted(cutTab.file.id);
      await window.zenAPI.clearTabClipboard();

      cutTab = null;
      cutTabId = null;

      closeAllTabMenus();
      render();
      saveSession();
      return;
    }

    // COPY paste
    if (!copiedTab) return;

    const pasted = normalizeFile({
      ...copiedTab,
      id: makeTabId(),
      name: getCopyTabName(copiedTab.name || "Untitled.txt")
    });

    // copied tabs should always be unsaved
    pasted.path = null;
    pasted.lastSavedContent = "";
    pasted.lastSavedAt = null;

    files.push(pasted);

    currentIndex = files.length - 1;
    selectedTabIndex = currentIndex;

    closeAllTabMenus();
    render();
    saveSession();
  };

  menu.appendChild(pasteBtn);
  document.body.appendChild(menu);

  menu.style.left = e.clientX + "px";
  menu.style.top = e.clientY + "px";

  sidebar.classList.add("menu-open");
});

function getCopyTabName(originalName) {
  const existingNames = files.map(f => f.name);

  // first copy
  let name = "Copy - " + originalName;

  if (!existingNames.includes(name)) {
    return name;
  }

  let count = 2;

  while (true) {
    name = `Copy(${count}) - ${originalName}`;

    if (!existingNames.includes(name)) {
      return name;
    }

    count++;
  }
}

function closeAllTabMenus() {
  document
    .querySelectorAll(".tab-menu")
    .forEach(menu => menu.classList.remove("show"));

  sidebar.classList.remove("menu-open");
}

document.addEventListener("click", () => {
  closeAllTabMenus();
});

document.addEventListener("dragover", (e) => {
  e.preventDefault();
});

document.addEventListener("drop", async (e) => {
  e.preventDefault();

  // open real files dragged from Windows Explorer
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    for (const droppedFile of e.dataTransfer.files) {
      const filePath = window.zenAPI.getDroppedFilePath(droppedFile);

      if (!filePath) continue;

      const dropped = await window.zenAPI.readDroppedFile(filePath);

      if (!dropped) continue;

      const alreadyOpenIndex = files.findIndex(f => f.path === dropped.path);

      if (alreadyOpenIndex !== -1) {
        currentIndex = alreadyOpenIndex;
        render();
        saveSession();
        return;
      }

      files.push(normalizeFile({
        path: dropped.path,
        name: dropped.name,
        content: dropped.content,
        lastSavedContent: dropped.content,
        lastSavedAt: dropped.lastSavedAt,
        customName: true
      }));
    }

    currentIndex = files.length - 1;

    render();
    saveSession();
    return;
  }

  // ignore same-window tab reorder
  if (e.target.closest(".tab")) return;

  const file = await window.zenAPI.takeDraggedTab();
  if (!file) return;

  // ignore duplicate
  const exists = files.some(f => f.id === file.id);
  if (exists) return;

  files.push(normalizeFile(file));

  currentIndex = files.length - 1;

  render();
  saveSession();
});

function refreshTitlesOnly() {
  const current = files[currentIndex];
  if (!current) return;

  fileName.value = current.name ?? "Untitled.txt";
  autoSizeTitle();

  const activeTitle = tabs.querySelector(".tab.active .tab-title");
  if (activeTitle) {
    activeTitle.value = current.name || "Untitled.txt";
  }
}

function closeTab(index) {
  saveCurrentToMemory();
  updateUntitledName();

  const current = files[index];

  const proceedClose = () => {
    files.splice(index, 1);

    if (files.length === 0) {
      files.push(normalizeFile({
        path: null,
        name: "Untitled.txt",
        content: "",
        lastSavedContent: "",
        customName: false
      }));
      currentIndex = 0;
    } else if (index === currentIndex) {
      currentIndex = Math.max(0, index - 1);
    } else if (index < currentIndex) {
      currentIndex--;
    }

    render();
    saveSession();
  };

  // 🔥 CHECK UNSAVED BEFORE CLOSING
  if (index === currentIndex && hasUnsaved()) {
    showConfirm(proceedClose);
  } else {
    proceedClose();
  }
}

function saveTabContent(index) {
  if (files[index]) {
    files[index].content = editor.value;
  }
}

function switchTab(index) {
  if (index === currentIndex) return;

  const oldIndex = currentIndex;

  // save ONLY the old/current tab
  saveTabContent(oldIndex);

  currentIndex = index;
  selectedTabIndex = index;

  render();
  saveSession();
}

function newFile() {
  saveCurrentToMemory();

  files.push(normalizeFile({
    path: null,
    name: "Untitled.txt",
    content: "",
    lastSavedContent: "",
    customName: false
  }));

  currentIndex = files.length - 1;
  selectedTabIndex = currentIndex;

  render();
  saveSession();
}

async function openFile() {
  saveCurrentToMemory();
  updateUntitledName();

  const file = await window.zenAPI.openFile();
  if (!file) return;

  const alreadyOpenIndex = files.findIndex(f => f.path === file.path);

  if (alreadyOpenIndex !== -1) {
    files[alreadyOpenIndex].content = file.content;

    files[alreadyOpenIndex].lastSavedAt =
      file.lastSavedAt || files[alreadyOpenIndex].lastSavedAt;

    files[alreadyOpenIndex].lastSavedContent =
      file.lastSavedContent || file.content;

    currentIndex = alreadyOpenIndex;

    render();
    saveSession();
    return;
  }

  file.lastSavedContent = file.content;
  file.lastSavedAt = file.lastSavedAt || new Date().toISOString();

  files.push(normalizeFile(file));
  currentIndex = files.length - 1;

  render();
  saveSession();
}

function getBaseName(filePath) {
  return filePath.split(/[\\/]/).pop();
}

async function saveFile() {
  saveCurrentToMemory();

  const current = files[currentIndex];
  if (!current) return;

  const oldName = current.name;
  const oldPath = current.path;
  const oldCustomName = current.customName;

  let title = fileName.value.trim().replace(/[\\/:*?"<>|]/g, "");

  if (!title) {
    title = editor.value
      .split("\n")[0]
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .substring(0, 40);
  }

  if (!title) {
    title = "Untitled";
  }

  if (!title.includes(".")) {
    title += ".txt";
  }

  const savedFileName = current.path
    ? getBaseName(current.path)
    : null;

  current.name = title;
  fileName.value = title;
  current.customName = true;

  // rename existing saved file automatically
  if (current.path && savedFileName !== title) {
    current.oldPath = current.path;

    const dir = current.path.split(/[\\/]/).slice(0, -1).join("\\");
    current.path = dir + "\\" + title;
  }

  current.sourceWindowId = WINDOW_ID;

  const keepScrollTop = editor.scrollTop;
  const keepSelectionStart = editor.selectionStart;
  const keepSelectionEnd = editor.selectionEnd;

  const saved = await window.zenAPI.saveFile(current);

  // canceled save
  if (!saved) {
    current.name = oldName;
    current.path = oldPath;
    current.customName = oldCustomName;

    refreshTitlesOnly();
    return;
  }

  current.path = saved.path;
  current.name = saved.name;
  current.lastSavedContent = current.content;
  current.lastSavedAt = new Date().toISOString();
  current.renamedUnsaved = false;
  delete current.oldPath;

  refreshTitlesOnly();
  updateLineNumbers();
  updateStatus();

  requestAnimationFrame(() => {
    editor.scrollTop = keepScrollTop;
    lineNumbers.scrollTop = keepScrollTop;
    editor.setSelectionRange(keepSelectionStart, keepSelectionEnd);
  });

  saveSession();
}

function formatStatusTime(type, value) {
  if (!value) return "";

  const date = new Date(value);
  const now = new Date();

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return `${type}: ` + date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return `${type}: ` + date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function updateStatus() {
  const pos = editor.selectionStart;
  const end = editor.selectionEnd;

  const textBefore = editor.value.substring(0, pos);
  const lines = textBefore.split("\n");

  const line = lines.length;
  const col = lines[lines.length - 1].length;

  let selectedLinesText = "";

  if (pos !== end) {
    const start = Math.min(pos, end);
    const finish = Math.max(pos, end);

    const selectedText = editor.value.substring(start, finish);
    const selectedLines = selectedText.split("\n").length;

    selectedLinesText = ` • Sel Ln ${selectedLines}`;
  }

  statusLeft.textContent =
    `Ln ${line}, Col ${col}${selectedLinesText}`;

  statusCenter.textContent =
    `Tab ${currentIndex + 1}/${files.length}`;

  const current = files[currentIndex];

  if (!current) {
    statusRight.textContent = "";
  } else if (
    current.lastSavedAt &&
    normalizeText(current.lastSavedContent) === normalizeText(current.content)
  ) {
    statusRight.textContent =
      formatStatusTime("Saved", current.lastSavedAt);
  } else {
    statusRight.textContent =
      formatStatusTime("Edited", current.lastEditedAt);
  }
}

editor.addEventListener("input", () => {
  if (files[currentIndex]) {
    files[currentIndex].lastEditedAt = new Date().toISOString();
  }

  saveCurrentToMemory();
  updateUntitledName();
  refreshTitlesOnly();
  updateStatus();
});

editor.addEventListener("keyup", updateStatus);
editor.addEventListener("click", updateStatus);

editor.addEventListener("keyup", updateLineNumbers);
editor.addEventListener("click", updateLineNumbers);

editor.addEventListener("scroll", () => {
  lineNumbers.scrollTop = editor.scrollTop;
});

setInterval(saveSession, 2000);

loadSession();

/* ---------------- PIN SIDEBAR ADD-ON ---------------- */

const pinBtn = document.getElementById("pinSidebar");

if (pinBtn && sidebar) {
  let sidebarPinned = localStorage.getItem("sidebarPinned") === "true";

  // ✅ set initial state
  if (sidebarPinned) {
    sidebar.classList.add("pinned");
  }

  // ✅ ALWAYS use your new icon
  pinBtn.textContent = "⧉";
  pinBtn.title = "Toggle sidebar";

  pinBtn.addEventListener("click", () => {
    sidebarPinned = !sidebarPinned;

    if (sidebarPinned) {
      sidebar.classList.add("pinned");
    } else {
      sidebar.classList.remove("pinned");
    }

    localStorage.setItem("sidebarPinned", sidebarPinned);
  });
}

/* ---------------- KEYBOARD SHORTCUTS ---------------- */

document.addEventListener("keydown", async (e) => {
  const ctrl = e.ctrlKey || e.metaKey;

  const typingInEditor =
    document.activeElement === editor ||
    document.activeElement === findInput ||
    document.activeElement === replaceInput;

  // Ctrl + N = New
  if (ctrl && e.key.toLowerCase() === "n") {
    e.preventDefault();
    newFile();
  }

  // Ctrl + O = Open
  if (ctrl && e.key.toLowerCase() === "o") {
    e.preventDefault();
    openFile();
  }

  // Ctrl + S = Save
  if (ctrl && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveFile();
  }

  // Ctrl + C = Copy current tab
  if (ctrl && e.key.toLowerCase() === "c" && !typingInEditor) {
    e.preventDefault();

    saveCurrentToMemory();

    const file = files[currentIndex];
    if (!file) return;

    copiedTab = normalizeFile({
      ...file,
      id: makeTabId(),
      name: file.name || "Untitled.txt",
      content: file.content || ""
    });

    await window.zenAPI.setTabClipboard({
      type: "copy",
      file: copiedTab
    });

    await window.zenAPI.notifyCopyStarted();

    cutTab = null;
    cutTabId = null;
    render();
  }

  // Ctrl + X = Cut current tab
  if (ctrl && e.key.toLowerCase() === "x" && !typingInEditor) {
    e.preventDefault();

    saveCurrentToMemory();

    const file = files[currentIndex];
    if (!file) return;

    cutTab = {
      file: normalizeFile({
        ...file,
        content: file.content || ""
      }),
      index: currentIndex,
      windowId: WINDOW_ID
    };

    await window.zenAPI.setTabClipboard({
      type: "cut",
      file: cutTab.file,
      windowId: cutTab.windowId,
      index: cutTab.index
    });

    copiedTab = null;
    cutTabId = file.id;

    render();
  }

  // Ctrl + V = Paste copied/cut tab
  if (ctrl && e.key.toLowerCase() === "v" && !typingInEditor) {
    e.preventDefault();

    const shared = await window.zenAPI.getTabClipboard();

    if (shared?.type === "copy") {
      copiedTab = shared.file;
      cutTab = null;
      window.zenAPI.clearTabClipboard();
    }

    if (shared?.type === "cut") {
      cutTab = {
        file: shared.file,
        windowId: shared.windowId,
        index: shared.index
      };

      copiedTab = null;
    }

    // CUT paste
    if (cutTab) {

      const pasted = normalizeFile({
        ...cutTab.file,
        id: makeTabId()
      });

      files.push(pasted);

      // remove original ONLY after paste
      if (cutTab.windowId === WINDOW_ID) {
        files.splice(cutTab.index, 1);

        if (currentIndex >= files.length) {
          currentIndex = files.length - 1;
        }

        if (files.length === 0) {
          files.push(normalizeFile({
            path: null,
            name: "Untitled.txt",
            content: "",
            lastSavedContent: "",
            customName: false
          }));

          currentIndex = 0;
        }
      }

      currentIndex = files.length - 1;
      selectedTabIndex = currentIndex;

      await window.zenAPI.notifyCutPasted(cutTab.file.id);

      cutTab = null;
      cutTabId = null;
      window.zenAPI.clearTabClipboard();

      render();
      saveSession();
      return;
    }

    // COPY paste
    if (!copiedTab) return;

    const pasted = normalizeFile({
      ...copiedTab,
      id: makeTabId(),
      name: getCopyTabName(copiedTab.name || "Untitled.txt")
    });

    // copied tabs should always be unsaved
    pasted.path = null;
    pasted.lastSavedContent = "";
    pasted.lastSavedAt = null;

    files.push(pasted);

    currentIndex = files.length - 1;
    selectedTabIndex = currentIndex;

    render();
    saveSession();
  }

  // Ctrl + F = Find
  if (ctrl && e.key.toLowerCase() === "f") {
    e.preventDefault();
    openFind();

    const replaceRow = document.getElementById("replaceRow");
    if (replaceRow) replaceRow.classList.add("hidden");

    findInput.focus();
    findInput.select();
  }

  // Ctrl + H = Find + Replace
  if (ctrl && e.key.toLowerCase() === "h") {
    e.preventDefault();
    openFind();

    const replaceRow = document.getElementById("replaceRow");
    if (replaceRow) replaceRow.classList.remove("hidden");

    replaceInput.focus();
    replaceInput.select();
  }

  // Ctrl + W = Close Tab
  if (ctrl && e.key.toLowerCase() === "w") {
    e.preventDefault();
    closeTab(currentIndex);
  }

  // Ctrl + Tab = Next Tab
  if (ctrl && e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    switchTab((currentIndex + 1) % files.length);
  }

  // Ctrl + Shift + Tab = Previous Tab
  if (ctrl && e.key === "Tab" && e.shiftKey) {
    e.preventDefault();
    switchTab((currentIndex - 1 + files.length) % files.length);
  }

  // Ctrl + P = Pin sidebar
  if (ctrl && e.key.toLowerCase() === "p") {
    e.preventDefault();
    const pinBtn = document.getElementById("pinSidebar");
    if (pinBtn) pinBtn.click();
  }

  // F2 = Rename selected/current tab
  if (e.key === "F2") {
    e.preventDefault();

    const activeTab = tabs.querySelector(".tab.active");
    if (!activeTab) return;

    const title = activeTab.querySelector(".tab-title");
    if (!title) return;

    title.readOnly = false;
    title.style.pointerEvents = "auto";

    setTimeout(() => {
      title.focus();
      title.select();
    }, 0);
  }

  // ESC = close find
  if (e.key === "Escape") {
    closeFind();
  }

  // ENTER behavior inside find/replace
  if (e.key === "Enter") {
    if (document.activeElement === findInput) {
      e.preventDefault();
      findNext();
    }

    if (document.activeElement === replaceInput) {
      e.preventDefault();
      replaceOne();
    }
  }

  // Shift + Enter in replace = replace all
  if (
    e.shiftKey &&
    e.key === "Enter" &&
    document.activeElement === replaceInput
  ) {
    e.preventDefault();
    replaceAll();
  }
});

/* ---------------- UNSAVED CONFIRM ---------------- */

const modal = document.getElementById("confirmModal");
const confirmText = document.getElementById("confirmText");
const btnSave = document.getElementById("confirmSave");
const btnDont = document.getElementById("confirmDont");
const btnCancel = document.getElementById("confirmCancel");

let pendingClose = null;

function normalizeText(text) {
  return (text ?? "").replace(/\r\n/g, "\n");
}

function hasUnsaved() {
  saveCurrentToMemory();

  const current = files[currentIndex];
  if (!current) return false;

  if (current.renamedUnsaved) return true;

  return normalizeText(current.content) !== normalizeText(current.lastSavedContent);
}

function showConfirm(action) {
  const current = files[currentIndex];

  confirmText.textContent =
    `Do you want to save changes to ${current.name || "Untitled"}?`;

  modal.classList.remove("hidden");
  pendingClose = action;
}

function hideConfirm() {
  modal.classList.add("hidden");
}

btnSave.onclick = async () => {
  await saveFile();

  hideConfirm();

  if (pendingClose) {
    const action = pendingClose;
    pendingClose = null;
    action();
  }
};

btnDont.onclick = () => {
  hideConfirm();

  if (pendingClose) {
    const action = pendingClose;
    pendingClose = null;
    action();
  }
};

btnCancel.onclick = () => {
  hideConfirm();
};

async function handleClose() {
  const windowCount = await window.zenAPI.getWindowCount();

  // only 1 window = close directly
  if (windowCount <= 1) {
    window.zenAPI.close();
    return;
  }

  saveCurrentToMemory();

  let index = 0;

  const closeNext = () => {
    if (index >= files.length) {
      window.zenAPI.close();
      return;
    }

    currentIndex = index;
    render();

    if (hasUnsavedAt(index)) {
      showConfirm(() => {
        files.splice(index, 1);
        closeNext();
      });
    } else {
      files.splice(index, 1);
      closeNext();
    }
  };

  closeNext();
}

/* ---------------- FIND FEATURE ---------------- */

const findBar = document.getElementById("findBar");
const findInput = document.getElementById("findInput");
const matchCount = document.getElementById("matchCount");

let lastFindIndex = -1;

function openFind() {
  findBar.classList.remove("hidden");
  findInput.focus();
  findInput.select();
  updateMatchCount();
}

function closeFind() {
  findBar.classList.add("hidden");
  editor.focus();
}

function updateMatchCount() {
  const query = findInput.value;

  if (!query) {
    if (matchCount) matchCount.textContent = "0/0";
    return;
  }

  const text = editor.value.toLowerCase();
  const q = query.toLowerCase();

  let count = 0;
  let pos = 0;
  let current = 0;

  while ((pos = text.indexOf(q, pos)) !== -1) {
    count++;

    if (pos === lastFindIndex) {
      current = count;
    }

    pos += q.length;
  }

  if (matchCount) {
    matchCount.textContent = count ? `${current || 1}/${count}` : "0/0";
  }
}

function findNext() {
  const text = editor.value;
  const query = findInput.value;

  if (!query) {
    updateMatchCount();
    return;
  }

  let index = text
    .toLowerCase()
    .indexOf(query.toLowerCase(), lastFindIndex + 1);

  if (index === -1) {
    index = text
      .toLowerCase()
      .indexOf(query.toLowerCase(), 0);
  }

  if (index !== -1) {
    editor.focus();

    editor.setSelectionRange(
      index,
      index + query.length
    );

    lastFindIndex = index;

    // 🔥 AUTO SCROLL TO MATCH
    requestAnimationFrame(() => {
      const before = text.substring(0, index);
      const line = before.split("\n").length - 1;

      const lineHeight =
        parseInt(getComputedStyle(editor).lineHeight) || 20;

      const targetScroll =
        Math.max(0, (line - 5) * lineHeight);

      editor.scrollTop = targetScroll;
      lineNumbers.scrollTop = targetScroll;
    });
  }

  updateMatchCount();
}

function findPrev() {
  const text = editor.value;
  const query = findInput.value;

  if (!query) {
    updateMatchCount();
    return;
  }

  let index = text
    .toLowerCase()
    .lastIndexOf(query.toLowerCase(), lastFindIndex - 1);

  if (index === -1) {
    index = text
      .toLowerCase()
      .lastIndexOf(query.toLowerCase());
  }

  if (index !== -1) {
    editor.focus();

    editor.setSelectionRange(
      index,
      index + query.length
    );

    lastFindIndex = index;

    // 🔥 AUTO SCROLL TO MATCH
    requestAnimationFrame(() => {
      const before = text.substring(0, index);
      const line = before.split("\n").length - 1;

      const lineHeight =
        parseInt(getComputedStyle(editor).lineHeight) || 20;

      const targetScroll =
        Math.max(0, (line - 5) * lineHeight);

      editor.scrollTop = targetScroll;
      lineNumbers.scrollTop = targetScroll;
    });
  }

  updateMatchCount();
}

function clearFind() {
  findInput.value = "";
  lastFindIndex = -1;
  updateMatchCount();
  findInput.focus();
}

findInput.addEventListener("input", () => {
  lastFindIndex = -1;
  updateMatchCount();
});

/* ---------------- WORD WRAP ---------------- */

let wrapEnabled = true;

function toggleWrap() {
  wrapEnabled = !wrapEnabled;

  if (wrapEnabled) {
    editor.classList.remove("no-wrap");
    wrapBtn.classList.add("active");
  } else {
    editor.classList.add("no-wrap");
    wrapBtn.classList.remove("active");
  }

  localStorage.setItem("wrapEnabled", wrapEnabled);

  updateLineNumbers();
}

// restore on load
const wrapBtn = document.getElementById("wrapBtn");

wrapEnabled = localStorage.getItem("wrapEnabled") !== "false";

if (wrapEnabled) {
  wrapBtn.classList.add("active");
} else {
  editor.classList.add("no-wrap");
}

const lineBtn = document.getElementById("lineBtn");
const editorWrap = document.querySelector(".editor-wrap");

let lineNumbersEnabled =
  localStorage.getItem("lineNumbersEnabled") !== "false";

function applyLineNumbersState() {
  if (lineNumbersEnabled) {
    lineNumbers.style.display = "block";
    lineBtn.classList.add("active");
  } else {
    lineNumbers.style.display = "none";
    lineBtn.classList.remove("active");
  }
}

applyLineNumbersState();

lineBtn.addEventListener("click", () => {
  lineNumbersEnabled = !lineNumbersEnabled;

  localStorage.setItem(
    "lineNumbersEnabled",
    lineNumbersEnabled
  );

  applyLineNumbersState();
});

/* ---------------- REPLACE FEATURE ---------------- */

const replaceInput = document.getElementById("replaceInput");

function replaceOne() {
    const findText = findInput.value;
    const replaceText = replaceInput.value;

    if (!findText) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    const selected = editor.value.substring(start, end);

    if (selected.toLowerCase() === findText.toLowerCase()) {
        const before = editor.value.substring(0, start);
        const after = editor.value.substring(end);

        editor.value = before + replaceText + after;

        editor.setSelectionRange(start, start + replaceText.length);
    }

    findNext();
}

function replaceAll() {
    const findText = findInput.value;
    const replaceText = replaceInput.value;

    if (!findText) return;

    const regex = new RegExp(findText, "gi");
    editor.value = editor.value.replace(regex, replaceText);

    saveCurrentToMemory();
    updateStatus();
}

function toggleReplace() {
    const row = document.getElementById("replaceRow");
    row.classList.toggle("hidden");
  }

  /* ---------------- OPEN FILE ---------------- */

  window.zenAPI.onOpenFileInTab((file) => {
  const alreadyOpen = files.find(f => f.path === file.path);

  if (alreadyOpen) {
    alreadyOpen.lastSavedAt =
      file.lastSavedAt || alreadyOpen.lastSavedAt;

    alreadyOpen.lastSavedContent =
      file.lastSavedContent || file.content;

    alreadyOpen.content = file.content;

    currentIndex = files.indexOf(alreadyOpen);

    render();
    saveSession();
    return;
  }

  files.push(file);
  currentIndex = files.length - 1;

  render();
  saveSession();
});

let titleClickTimer = null;

fileName.readOnly = true;

fileName.addEventListener("mousedown", (e) => {
  if (!fileName.readOnly) return;

  if (e.detail === 2) {
    e.preventDefault();

    fileName.readOnly = false;
    fileName.focus();
    fileName.select();

    return;
  }

  titleClickTimer = setTimeout(() => {
    titleClickTimer = null;
  }, 250);
});

fileName.addEventListener("blur", () => {
  fileName.readOnly = true;
});

fileName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") fileName.blur();

  if (e.key === "Escape") {
    fileName.readOnly = true;
    render();
  }
});

function autoSizeTitle() {
  const topbar = document.querySelector(".topbar");
  const actions = document.querySelector(".topbar-actions");

  if (!topbar || !actions) return;

  fileName.style.width = "10px";

  const maxWidth = Math.max(
    80,
    topbar.clientWidth - actions.offsetWidth - 150
  );

  const newWidth = Math.min(
    fileName.scrollWidth + 20,
    maxWidth
  );

  fileName.style.width = newWidth + "px";
}

window.addEventListener("resize", () => {
  autoSizeTitle();
});

window.zenAPI.onOpenDetachedTab((file) => {
  files = [normalizeFile(file)];
  currentIndex = 0;

  render();
  saveSession();
});

window.zenAPI.onFileUpdated((updatedFile) => {
  if (updatedFile.sourceWindowId === WINDOW_ID) return;
  const index = files.findIndex(f => f.path === updatedFile.path);

  if (index === -1) return;

  const oldText =
    index === currentIndex
      ? editor.value
      : files[index].content || "";

  const newText = updatedFile.content || "";

  files[index].content = newText;
  files[index].lastSavedContent = newText;
  files[index].lastSavedAt = updatedFile.lastSavedAt;
  files[index].name = updatedFile.name;

  if (index === currentIndex) {
    const oldLines = oldText.split(/\r?\n/);
    const newLines = newText.split(/\r?\n/);

    let changedLine = 0;

    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      if (oldLines[i] !== newLines[i]) {
        changedLine = i;
        break;
      }
    }

    let cursorPos = 0;

    for (let i = 0; i < changedLine; i++) {
      cursorPos += newLines[i].length + 1;
    }

    editor.value = newText;
    fileName.value = updatedFile.name;
    autoSizeTitle();

    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(cursorPos, cursorPos);

      const lineHeight =
        parseInt(getComputedStyle(editor).lineHeight) || 20;

      editor.scrollTop =
        Math.max(0, (changedLine - 5) * lineHeight);
    });
  }

  render();
  saveSession();
});

window.zenAPI.onOpenEmptyWindow(() => {
  files = [normalizeFile({
    path: null,
    name: "Untitled.txt",
    content: "",
    lastSavedContent: "",
    customName: false
  })];

  currentIndex = 0;

  render();
  saveSession();
});

function hasUnsavedAt(index) {
  const file = files[index];
  if (!file) return false;

  if (file.renamedUnsaved) return true;

  return normalizeText(file.content) !== normalizeText(file.lastSavedContent);
}

function closeAllTabs() {
  saveCurrentToMemory();

  let index = 0;

  const closeNext = () => {
    if (index >= files.length) {
      files = [normalizeFile({
        path: null,
        name: "Untitled.txt",
        content: "",
        lastSavedContent: "",
        customName: false
      })];

      currentIndex = 0;
      render();
      saveSession();
      return;
    }

    currentIndex = index;
    render();

    if (hasUnsavedAt(index)) {
      showConfirm(() => {
        files.splice(index, 1);
        closeNext();
      });
    } else {
      files.splice(index, 1);
      closeNext();
    }
  };

  closeNext();
}

window.zenAPI.onCutPasted((cutId) => {
  const index = files.findIndex(f => f.id === cutId);

  // remove the original cut tab from the original window
  if (index !== -1) {
    files.splice(index, 1);

    if (files.length === 0) {
      files.push(normalizeFile({
        path: null,
        name: "Untitled.txt",
        content: "",
        lastSavedContent: "",
        customName: false
      }));

      currentIndex = 0;
    } else {
      if (index < currentIndex) currentIndex--;
      if (currentIndex >= files.length) {
        currentIndex = files.length - 1;
      }
    }
  }

  cutTab = null;
  cutTabId = null;

  render();
  saveSession();
});

window.zenAPI.onCopyStarted(() => {
  cutTab = null;
  cutTabId = null;
  render();
});