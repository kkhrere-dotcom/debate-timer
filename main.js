const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const path = require('path');

let consoleWindow = null;
let clockWindow = null;
let popupWindow = null;

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
    backgroundColor: '#ffffff',
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
    transparent: false,
    resizable: true,
    movable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    backgroundColor: '#ffffff',
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
