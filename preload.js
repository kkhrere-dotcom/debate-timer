const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 콘솔 → 메인
  broadcastState: (state) => ipcRenderer.send('state:broadcast', state),
  broadcastSettings: (settings) => ipcRenderer.send('settings:broadcast', settings),

  openClock: () => ipcRenderer.invoke('clock:open'),
  closeClock: () => ipcRenderer.invoke('clock:close'),
  isClockOpen: () => ipcRenderer.invoke('clock:is-open'),
  fullscreenClock: () => ipcRenderer.invoke('clock:fullscreen'),

  openPopup: () => ipcRenderer.invoke('popup:open'),
  closePopup: () => ipcRenderer.invoke('popup:close'),
  isPopupOpen: () => ipcRenderer.invoke('popup:is-open'),

  // 설정 파일 I/O
  loadSettingsFile: () => ipcRenderer.invoke('settings:load'),
  saveSettingsFile: (json) => ipcRenderer.invoke('settings:save', json),
  getSettingsPath: () => ipcRenderer.invoke('settings:path'),
  getSettingsMeta: () => ipcRenderer.invoke('settings:meta'),
  exportSettings: (json) => ipcRenderer.invoke('settings:export', json),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  openSettingsFolder: () => ipcRenderer.invoke('settings:open-folder'),

  // 시계/팝업 → 메인
  requestState: () => ipcRenderer.send('child:request-state'),
  sendCommand: (cmd) => ipcRenderer.send('child:command', cmd),

  // 시계/팝업이 받는 이벤트
  onStateUpdate: (cb) => ipcRenderer.on('state-update', (_, state) => cb(state)),
  onClockFullscreenChanged: (cb) => ipcRenderer.on('clock-fullscreen-changed', (_, isFs) => cb(isFs)),

  // 콘솔이 받는 이벤트
  onClockClosed: (cb) => ipcRenderer.on('clock-closed', cb),
  onPopupClosed: (cb) => ipcRenderer.on('popup-closed', cb),
  onChildCommand: (cb) => ipcRenderer.on('child-command', (_, cmd) => cb(cmd)),
  onChildNeedsState: (cb) => ipcRenderer.on('child-needs-state', cb),
  onShowShortcuts: (cb) => ipcRenderer.on('show-shortcuts', cb),
});
