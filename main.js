const { app, BrowserWindow, Menu, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('node:fs');

// userData 경로를 dev/packaged 동일하게 고정 (~/Library/Application Support/debate-timer)
app.setName('debate-timer');

let consoleWindow = null;
let clockWindow = null;
let popupWindow = null;

function getSettingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettingsFromFile() {
  try {
    const f = getSettingsFilePath();
    if (fs.existsSync(f)) {
      return fs.readFileSync(f, 'utf8');
    }
  } catch (e) {
    console.error('[settings] load failed:', e);
  }
  return null;
}

function saveSettingsToFile(json) {
  try {
    const f = getSettingsFilePath();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, f);
    return { ok: true, path: f, bytes: Buffer.byteLength(json, 'utf8') };
  } catch (e) {
    console.error('[settings] save failed:', e);
    return { ok: false, error: e.message };
  }
}

function createConsoleWindow() {
  const display = screen.getPrimaryDisplay();
  const { height } = display.workAreaSize;
  consoleWindow = new BrowserWindow({
    width: 520,
    height: Math.min(900, height - 40),
    x: 40,
    y: 40,
    minWidth: 420,
    minHeight: 600,
    backgroundColor: '#ffffff',
    title: '콘솔 - 과학토론타이머',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  consoleWindow.loadFile('index.html');
  consoleWindow.on('closed', () => {
    consoleWindow = null;
    if (clockWindow && !clockWindow.isDestroyed()) clockWindow.close();
    if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();
  });
}

function createClockWindow() {
  if (clockWindow && !clockWindow.isDestroyed()) {
    clockWindow.focus();
    return;
  }
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const clockW = Math.min(1100, width - 600);
  clockWindow = new BrowserWindow({
    width: Math.max(800, clockW),
    height: Math.min(720, height - 80),
    x: Math.max(580, width - clockW - 40),
    y: 40,
    minWidth: 600,
    minHeight: 400,
    transparent: true,
    backgroundColor: '#00000000',
    title: '⏱ 과학토론타이머',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  clockWindow.loadFile('clock.html');
  clockWindow.on('closed', () => {
    clockWindow = null;
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.webContents.send('clock-closed');
    }
  });
}

function createPopupWindow() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.focus();
    return;
  }
  const display = screen.getPrimaryDisplay();
  const { width } = display.workAreaSize;
  popupWindow = new BrowserWindow({
    width: 240,
    height: 150,
    x: width - 260,
    y: 30,
    minWidth: 180,
    minHeight: 110,
    maxWidth: 600,
    maxHeight: 400,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    title: '⏱',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // PPT/PDF 전체화면 위에도 뜨도록 강력한 always-on-top 설정
  popupWindow.setAlwaysOnTop(true, 'screen-saver');
  popupWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  popupWindow.loadFile('popup.html');
  popupWindow.on('closed', () => {
    popupWindow = null;
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.webContents.send('popup-closed');
    }
  });
}

function broadcastState(state) {
  if (clockWindow && !clockWindow.isDestroyed()) {
    clockWindow.webContents.send('state-update', state);
  }
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('state-update', state);
  }
}

function sendToConsole(channel, payload) {
  if (consoleWindow && !consoleWindow.isDestroyed()) {
    consoleWindow.webContents.send(channel, payload);
  }
}

function buildMenu() {
  const template = [
    {
      label: '파일',
      submenu: [{ role: 'quit', label: '종료' }],
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
      ],
    },
    {
      label: '보기',
      submenu: [
        {
          label: '시계 창 열기',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => createClockWindow(),
        },
        {
          label: '시계 창 전체화면 토글',
          accelerator: 'F11',
          click: () => {
            if (clockWindow && !clockWindow.isDestroyed()) {
              clockWindow.setFullScreen(!clockWindow.isFullScreen());
            }
          },
        },
        {
          label: '팝업 모드 토글',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();
            else createPopupWindow();
          },
        },
        { type: 'separator' },
        { role: 'reload', label: '새로고침' },
        { role: 'toggleDevTools', label: '개발자 도구' },
      ],
    },
    {
      label: '도움말',
      submenu: [
        {
          label: '단축키',
          click: () => sendToConsole('show-shortcuts'),
        },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about', label: app.name + ' 정보' },
        { type: 'separator' },
        { role: 'hide', label: '숨기기' },
        { role: 'hideOthers', label: '다른 항목 숨기기' },
        { role: 'unhide', label: '모두 보기' },
        { type: 'separator' },
        { role: 'quit', label: '종료' },
      ],
    });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 콘솔 → 시계/팝업
ipcMain.on('state:broadcast', (_, state) => broadcastState(state));

// 콘솔 → 시계/팝업: 설정 변경 (제목 등 윈도우 메타 업데이트용)
ipcMain.on('settings:broadcast', (_, s) => {
  if (s && s.title) {
    const t = s.title;
    if (consoleWindow && !consoleWindow.isDestroyed()) consoleWindow.setTitle('콘솔 - ' + t);
    if (clockWindow && !clockWindow.isDestroyed()) clockWindow.setTitle('⏱ ' + t);
  }
});

// 시계/팝업 → 콘솔
ipcMain.on('child:request-state', () => sendToConsole('child-needs-state'));
ipcMain.on('child:command', (_, cmd) => sendToConsole('child-command', cmd));

// 시계 창 제어
ipcMain.handle('clock:open', () => createClockWindow());
ipcMain.handle('clock:close', () => {
  if (clockWindow && !clockWindow.isDestroyed()) clockWindow.close();
});
ipcMain.handle('clock:is-open', () => !!(clockWindow && !clockWindow.isDestroyed()));
ipcMain.handle('clock:fullscreen', () => {
  if (clockWindow && !clockWindow.isDestroyed()) {
    clockWindow.setFullScreen(!clockWindow.isFullScreen());
    return clockWindow.isFullScreen();
  }
  return false;
});

// 팝업 창 제어
ipcMain.handle('popup:open', () => createPopupWindow());
ipcMain.handle('popup:close', () => {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();
});
ipcMain.handle('popup:is-open', () => !!(popupWindow && !popupWindow.isDestroyed()));

// 설정 파일 I/O
ipcMain.handle('settings:load', () => loadSettingsFromFile());
ipcMain.handle('settings:save', (_, json) => saveSettingsToFile(json));
ipcMain.handle('settings:path', () => getSettingsFilePath());
ipcMain.handle('settings:exists', () => {
  try { return fs.existsSync(getSettingsFilePath()); } catch (e) { return false; }
});
ipcMain.handle('settings:meta', () => {
  try {
    const f = getSettingsFilePath();
    if (!fs.existsSync(f)) return { exists: false, path: f };
    const stat = fs.statSync(f);
    return { exists: true, path: f, size: stat.size, modified: stat.mtimeMs };
  } catch (e) {
    return { exists: false, error: e.message };
  }
});

ipcMain.handle('settings:export', async (e, json) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const defaultName = 'debate-timer-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  const result = await dialog.showSaveDialog(win, {
    title: '설정 내보내기 (백업)',
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, json, 'utf8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('settings:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win, {
    title: '설정 가져오기 (복원)',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  try {
    const data = fs.readFileSync(result.filePaths[0], 'utf8');
    JSON.parse(data); // 유효성 체크
    return { ok: true, data, path: result.filePaths[0] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('settings:open-folder', () => {
  const { shell } = require('electron');
  return shell.showItemInFolder(getSettingsFilePath());
});

app.whenReady().then(() => {
  buildMenu();
  createConsoleWindow();
  createClockWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createConsoleWindow();
      createClockWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
