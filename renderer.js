let files = [];
let currentIndex = 0;
let statusTimer;

const editor = document.getElementById("editor");
const tabs = document.getElementById("tabs");
const fileName = document.getElementById("fileName");
const status = document.getElementById("status");

async function loadSession() {
  const startup = await window.zenAPI.getStartupFile();

  if (startup) {
    files = [startup];
    currentIndex = 0;
    render();
    return;
  }

  const session = await window.zenAPI.loadSession();

  if (session && session.files && session.files.length) {
    files = session.files;
    currentIndex = session.currentIndex || 0;

    files.forEach((file) => {
      if (file.lastSavedContent === undefined) {
        file.lastSavedContent = file.path ? file.content : "";
      }
    });
  } else {
    files = [{
      path: null,
      name: "Untitled",
      content: "",
      lastSavedContent: ""
    }];
    currentIndex = 0;
  }

  render();
}

function saveCurrentToMemory() {
  if (files[currentIndex]) {
    files[currentIndex].content = editor.value;
  }
}

function updateUntitledName() {
  const current = files[currentIndex];
  if (!current || current.path) return;

  const firstLine = editor.value.split("\n")[0].trim();

  if (firstLine.length > 0) {
    current.name = firstLine.substring(0, 30);
  } else {
    current.name = "Untitled";
  }
}

async function saveSession() {
  saveCurrentToMemory();
  updateUntitledName();

  await window.zenAPI.saveSession({
    files,
    currentIndex
  });
}

function render() {
  tabs.innerHTML = "";

  files.forEach((file, index) => {
    const tab = document.createElement("div");
    tab.className = "tab" + (index === currentIndex ? " active" : "");

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = file.name || "Untitled";

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "✕";
    closeBtn.title = "Close tab";

    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeTab(index);
    };

    tab.onclick = () => switchTab(index);

    tab.appendChild(title);
    tab.appendChild(closeBtn);
    tabs.appendChild(tab);
  });

  const current = files[currentIndex];
  fileName.textContent = current.name || "Untitled";
  editor.value = current.content || "";
  updateStatus();
}

function refreshTitlesOnly() {
  const current = files[currentIndex];
  if (!current) return;

  fileName.textContent = current.name || "Untitled";

  const activeTitle = tabs.querySelector(".tab.active .tab-title");
  if (activeTitle) {
    activeTitle.textContent = current.name || "Untitled";
  }
}

function closeTab(index) {
  saveCurrentToMemory();
  updateUntitledName();

  const current = files[index];

  const proceedClose = () => {
    files.splice(index, 1);

    if (files.length === 0) {
      files.push({
        path: null,
        name: "Untitled",
        content: "",
        lastSavedContent: ""
      });
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

function switchTab(index) {
  saveCurrentToMemory();
  updateUntitledName();

  currentIndex = index;
  render();
  saveSession();
}

function newFile() {
  saveCurrentToMemory();
  updateUntitledName();

  files.push({
    path: null,
    name: "Untitled",
    content: "",
    lastSavedContent: ""
  });

  currentIndex = files.length - 1;
  render();
  saveSession();
}

async function openFile() {
  saveCurrentToMemory();
  updateUntitledName();

  const file = await window.zenAPI.openFile();
  if (!file) return;

  file.lastSavedContent = file.content;

  files.push(file);
  currentIndex = files.length - 1;

  render();
  saveSession();
}

async function saveFile() {
  saveCurrentToMemory();
  updateUntitledName();

  const saved = await window.zenAPI.saveFile(files[currentIndex]);
  if (!saved) return;

  files[currentIndex].path = saved.path;
  files[currentIndex].name = saved.name;
  files[currentIndex].lastSavedContent = files[currentIndex].content;

  render();
  saveSession();
}

function updateStatus() {
  const pos = editor.selectionStart;
  const textBefore = editor.value.substring(0, pos);
  const lines = textBefore.split("\n");
  const line = lines.length;
  const col = lines[lines.length - 1].length;

  status.textContent = `Line ${line}, Col ${col} • Tab ${currentIndex + 1}/${files.length} • Auto-save ON`;

  status.classList.remove("hidden");

  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.classList.add("hidden");
  }, 3000);
}

editor.addEventListener("input", () => {
  saveCurrentToMemory();
  updateUntitledName();
  refreshTitlesOnly();
  updateStatus();
});

editor.addEventListener("keyup", updateStatus);
editor.addEventListener("click", updateStatus);

setInterval(saveSession, 2000);

loadSession();

/* ---------------- PIN SIDEBAR ADD-ON ---------------- */

const pinBtn = document.getElementById("pinSidebar");
const sidebar = document.getElementById("sidebar");

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

document.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

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

    // Ctrl + F = Find
    if (ctrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openFind();

        const replaceRow = document.getElementById("replaceRow");
        if (replaceRow) replaceRow.classList.add("hidden");

        findInput.focus();
        findInput.select();
    }

    // Ctrl + H = Open Find + Replace UI
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
    if (e.shiftKey && e.key === "Enter" && document.activeElement === replaceInput) {
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

  const currentText = normalizeText(current.content);
  const savedText = normalizeText(current.lastSavedContent);

  return currentText !== savedText;
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

function handleClose() {
  if (hasUnsaved()) {
    showConfirm(() => window.zenAPI.close());
  } else {
    window.zenAPI.close();
  }
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

  let index = text.toLowerCase().indexOf(query.toLowerCase(), lastFindIndex + 1);

  if (index === -1) {
    index = text.toLowerCase().indexOf(query.toLowerCase(), 0);
  }

  if (index !== -1) {
    editor.focus();
    editor.setSelectionRange(index, index + query.length);
    lastFindIndex = index;
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

  let index = text.toLowerCase().lastIndexOf(query.toLowerCase(), lastFindIndex - 1);

  if (index === -1) {
    index = text.toLowerCase().lastIndexOf(query.toLowerCase());
  }

  if (index !== -1) {
    editor.focus();
    editor.setSelectionRange(index, index + query.length);
    lastFindIndex = index;
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
  findNext();
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
}

// restore on load
const wrapBtn = document.getElementById("wrapBtn");

wrapEnabled = localStorage.getItem("wrapEnabled") !== "false";

if (wrapEnabled) {
  wrapBtn.classList.add("active");
} else {
  editor.classList.add("no-wrap");
}

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