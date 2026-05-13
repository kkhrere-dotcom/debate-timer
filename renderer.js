// ============ 기본 시나리오 빌더 ============
const TEAM_COUNT = 4;

// 모든 단계에 적용되는 기본 알람: 30초 경고 + 0초 종료
function defaultAlerts() {
  return [
    { remainingSec: 30, soundPreset: null },
    { remainingSec: 0,  soundPreset: null },
  ];
}

function buildDefaultPhases() {
  const phases = [];
  for (let team = 1; team <= TEAM_COUNT; team++) {
    phases.push({ stage: '자기주장 발표', detail: team + '팀 발표', sec: 5 * 60, kind: 'present', bellPreset: null, alerts: defaultAlerts() });
    if (team < TEAM_COUNT) {
      phases.push({ stage: '준비 시간', detail: (team + 1) + '팀 발표 준비', sec: 3 * 60, kind: 'prep', bellPreset: null, alerts: defaultAlerts() });
    }
  }
  phases.push({ stage: '전체 준비 시간', detail: '질의응답 준비 (전체)', sec: 11 * 60, kind: 'prep', bellPreset: null, alerts: defaultAlerts() });
  for (let answering = 1; answering <= TEAM_COUNT; answering++) {
    for (let i = 1; i <= TEAM_COUNT - 1; i++) {
      const asking = ((answering - 1 + i) % TEAM_COUNT) + 1;
      phases.push({
        stage: '질의응답',
        detail: answering + '팀 답변 ← ' + asking + '팀 질의',
        sec: 5 * 60,
        kind: 'qa',
        bellPreset: null,
        alerts: defaultAlerts(),
      });
    }
  }
  phases.push({ stage: '주장다지기 준비', detail: '주장다지기 준비 (전체)', sec: 10 * 60, kind: 'prep', bellPreset: null, alerts: defaultAlerts() });
  for (let team = TEAM_COUNT; team >= 1; team--) {
    phases.push({ stage: '주장다지기', detail: team + '팀 주장다지기', sec: 3 * 60, kind: 'closing', bellPreset: null, alerts: defaultAlerts() });
  }
  return phases;
}

// 기존 데이터에 alerts 필드가 없으면 기본값 주입 (마이그레이션)
function ensurePhasesHaveAlerts(phases) {
  return phases.map((p) => ({
    ...p,
    alerts: (Array.isArray(p.alerts) && p.alerts.length >= 0) ? p.alerts : defaultAlerts(),
    bellPreset: p.bellPreset === undefined ? null : p.bellPreset,
  }));
}

// ============ 설정 ============
const SETTINGS_KEY = 'debateTimer.settings.v1';
const DEFAULT_SETTINGS = {
  theme: 'light',
  title: '과학토론대회',
  bellPreset: 'classic',
  volume: 0.7,
  phases: buildDefaultPhases(),
  scenarioPresets: [],
  customSounds: [],
};

function parseSettings(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme || DEFAULT_SETTINGS.theme,
      title: parsed.title || DEFAULT_SETTINGS.title,
      bellPreset: parsed.bellPreset || DEFAULT_SETTINGS.bellPreset,
      volume: typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_SETTINGS.volume,
      phases: Array.isArray(parsed.phases) && parsed.phases.length > 0
        ? ensurePhasesHaveAlerts(parsed.phases)
        : buildDefaultPhases(),
      scenarioPresets: (Array.isArray(parsed.scenarioPresets) ? parsed.scenarioPresets : [])
        .map((p) => ({ ...p, phases: ensurePhasesHaveAlerts(p.phases || []) })),
      customSounds: Array.isArray(parsed.customSounds) ? parsed.customSounds : [],
    };
  } catch (e) {
    console.error('parseSettings:', e);
    return null;
  }
}

// localStorage는 빠른 동기 read를 위한 캐시. 권위 있는 저장소는 main process의 settings.json 파일.
function loadSettings() {
  // 1차: localStorage (빠른 동기). 2차 비동기 복원은 init()에서.
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = parseSettings(raw);
    if (parsed) return parsed;
  } catch (e) {}
  return { ...DEFAULT_SETTINGS, phases: buildDefaultPhases() };
}

// 비동기 복원: localStorage가 비어있으면 파일에서 복구. 파일도 비어있으면 그대로.
async function recoverSettingsFromFileIfNeeded() {
  if (!window.api || !window.api.loadSettingsFile) return false;
  // localStorage에 데이터가 이미 있으면 복구 불필요
  const ls = localStorage.getItem(SETTINGS_KEY);
  if (ls) return false;
  const raw = await window.api.loadSettingsFile();
  if (!raw) return false;
  const parsed = parseSettings(raw);
  if (!parsed) return false;
  // 복원 → localStorage에도 캐시
  try { localStorage.setItem(SETTINGS_KEY, raw); } catch (e) {}
  settings = parsed;
  PHASES = settings.phases;
  applyTheme(settings.theme);
  applyTitle(settings.title);
  currentIndex = 0;
  resetPhaseState();
  refresh();
  console.log('Recovered settings from file backup at', new Date().toISOString());
  return true;
}

function saveSettings(s) {
  const json = JSON.stringify(s);
  // 1) localStorage 즉시 (빠른 캐시)
  let lsOk = true;
  try {
    localStorage.setItem(SETTINGS_KEY, json);
  } catch (e) {
    lsOk = false;
  }
  // 2) 파일에도 비동기 백업 (권위)
  if (window.api && window.api.saveSettingsFile) {
    window.api.saveSettingsFile(json).then((res) => {
      if (!res || !res.ok) {
        console.error('File save failed:', res && res.error);
      }
    }).catch((e) => {
      console.error('File save error:', e);
    });
  }
  if (!lsOk) {
    // localStorage 실패 (보통 quota). 파일 저장은 계속 시도되지만 사용자에게 알림.
    alert('빠른 캐시 저장 공간이 부족합니다. 음성 파일이 많으면 일부 정리하세요. (디스크의 settings.json은 별도로 보관됩니다.)');
    return false;
  }
  return true;
}

function genId() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function applyTitle(title) {
  document.title = title ? '콘솔 - ' + title : '콘솔 - 과학토론타이머';
}

let settings = loadSettings();
applyTheme(settings.theme);
applyTitle(settings.title);

// ============ 타이머 상태 ============
let PHASES = settings.phases;
let currentIndex = 0;
let remaining = PHASES[0] ? PHASES[0].sec : 300;
let running = false;
let timerId = null;
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

// ============ 종소리 프리셋 ============
function bellClassic(t0, vol) {
  const dur = 1.5;
  const o1 = audioCtx.createOscillator();
  const g1 = audioCtx.createGain();
  o1.type = 'sine'; o1.frequency.value = 880;
  g1.gain.setValueAtTime(0.5 * vol, t0);
  g1.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o1.connect(g1).connect(audioCtx.destination);
  o1.start(t0); o1.stop(t0 + dur);

  const o2 = audioCtx.createOscillator();
  const g2 = audioCtx.createGain();
  o2.type = 'sine'; o2.frequency.value = 1760;
  g2.gain.setValueAtTime(0.2 * vol, t0);
  g2.gain.exponentialRampToValueAtTime(0.001, t0 + dur * 0.6);
  o2.connect(g2).connect(audioCtx.destination);
  o2.start(t0); o2.stop(t0 + dur);
}

function bellChime(t0, vol) {
  const notes = [659.25, 783.99, 987.77]; // E5, G5, B5
  const noteDur = 0.35;
  const total = 0.9;
  notes.forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    const start = t0 + i * 0.18;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.4 * vol, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + noteDur);
    o.connect(g).connect(audioCtx.destination);
    o.start(start); o.stop(start + noteDur);
  });
}

function bellBuzz(t0, vol) {
  const dur = 0.4;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square'; o.frequency.value = 440;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.25 * vol, t0 + 0.01);
  g.gain.setValueAtTime(0.25 * vol, t0 + dur - 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + dur);
}

function bellGong(t0, vol) {
  const dur = 2.5;
  // 저음 베이스
  const o1 = audioCtx.createOscillator();
  const g1 = audioCtx.createGain();
  o1.type = 'triangle'; o1.frequency.value = 150;
  g1.gain.setValueAtTime(0.6 * vol, t0);
  g1.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o1.connect(g1).connect(audioCtx.destination);
  o1.start(t0); o1.stop(t0 + dur);
  // 중음
  const o2 = audioCtx.createOscillator();
  const g2 = audioCtx.createGain();
  o2.type = 'triangle'; o2.frequency.value = 300;
  g2.gain.setValueAtTime(0.3 * vol, t0);
  g2.gain.exponentialRampToValueAtTime(0.001, t0 + dur * 0.7);
  o2.connect(g2).connect(audioCtx.destination);
  o2.start(t0); o2.stop(t0 + dur);
}

function playCustomSound(id, vol) {
  const sound = settings.customSounds.find((s) => s.id === id);
  if (!sound) return;
  const audio = new Audio(sound.dataUrl);
  audio.volume = Math.max(0, Math.min(1, vol));
  audio.play().catch((e) => console.error('Custom sound play failed:', e));
}

function ringBellSynth(offset, preset) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + (offset || 0);
  const vol = Math.max(0, Math.min(1, settings.volume));
  switch (preset) {
    case 'chime':          bellChime(t0, vol); break;
    case 'buzz':           bellBuzz(t0, vol);  break;
    case 'gong':           bellGong(t0, vol);  break;
    case 'classic-double': bellClassic(t0, vol); bellClassic(t0 + 0.7, vol); break;
    case 'chime-double':   bellChime(t0, vol);   bellChime(t0 + 1.1, vol); break;
    default:               bellClassic(t0, vol);
  }
}

function resolveBellPreset(alertPreset) {
  // alertPreset > phase.bellPreset > settings.bellPreset
  if (alertPreset) return alertPreset;
  const p = PHASES[currentIndex];
  if (p && p.bellPreset) return p.bellPreset;
  return settings.bellPreset;
}

function ringBellWithPreset(preset, offset) {
  if (preset && preset.startsWith('custom:')) {
    const id = preset.slice('custom:'.length);
    setTimeout(() => playCustomSound(id, settings.volume), (offset || 0) * 1000);
  } else {
    ringBellSynth(offset, preset);
  }
}

function playAlert(alertPreset) {
  const preset = resolveBellPreset(alertPreset);
  ringBellWithPreset(preset, 0);
}

function previewSound(preset) {
  ensureAudio();
  // 모달 열려있으면 modalSettings의 볼륨과 커스텀 사운드 사용
  const src = modalSettings || settings;
  const vol = Math.max(0, Math.min(1, src.volume));
  if (preset && preset.startsWith('custom:')) {
    const id = preset.slice('custom:'.length);
    const sound = src.customSounds.find((s) => s.id === id);
    if (!sound) return;
    const audio = new Audio(sound.dataUrl);
    audio.volume = vol;
    audio.play().catch((e) => console.error('Preview failed:', e));
    return;
  }
  const t0 = audioCtx.currentTime;
  switch (preset) {
    case 'chime':          bellChime(t0, vol); break;
    case 'buzz':           bellBuzz(t0, vol); break;
    case 'gong':           bellGong(t0, vol); break;
    case 'classic-double': bellClassic(t0, vol); bellClassic(t0 + 0.7, vol); break;
    case 'chime-double':   bellChime(t0, vol);   bellChime(t0 + 1.1, vol); break;
    default:               bellClassic(t0, vol);
  }
}

// ============ DOM 헬퍼 ============
function $(id) { return document.getElementById(id); }

// ============ 상태 스냅샷 → 자식 윈도우 ============
function snapshot() {
  const p = PHASES[currentIndex];
  const next = PHASES[currentIndex + 1] || null;
  return {
    theme: settings.theme,
    title: settings.title,
    stage: p ? p.stage : '',
    detail: p ? p.detail : '',
    kind: p ? p.kind : 'present',
    index: currentIndex,
    total: PHASES.length,
    remaining,
    totalSec: p ? p.sec : 0,
    running,
    nextStage: next ? next.stage : null,
    nextDetail: next ? next.detail : null,
  };
}

function pushState() {
  if (window.api) window.api.broadcastState(snapshot());
}

function refresh() {
  const p = PHASES[currentIndex];
  if (!p) return;
  const stageEl = $('stage');
  stageEl.textContent = p.stage;
  stageEl.dataset.kind = p.kind;
  $('detail').textContent = p.detail;
  $('count').textContent = '단계 ' + (currentIndex + 1) + ' / ' + PHASES.length;

  const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
  const secs = String(remaining % 60).padStart(2, '0');
  const timerEl = $('timer');
  timerEl.textContent = mins + ':' + secs;
  timerEl.classList.remove('warning', 'danger');
  if (remaining <= 30) timerEl.classList.add('danger');
  else if (remaining <= 60) timerEl.classList.add('warning');

  const pct = p.sec > 0 ? ((p.sec - remaining) / p.sec) * 100 : 0;
  $('progressFill').style.width = pct + '%';

  if (currentIndex + 1 < PHASES.length) {
    const n = PHASES[currentIndex + 1];
    $('next').textContent = '다음 ▶  ' + n.stage + ' · ' + n.detail;
  } else {
    $('next').textContent = '🏁 마지막 단계입니다';
  }
  $('btnStart').textContent = running ? '⏸ 일시정지' : '▶ 시작';

  pushState();
}

function tick() {
  if (!running) return;
  if (remaining > 0) {
    remaining -= 1;
    refresh();

    const p = PHASES[currentIndex];
    const alerts = (p && Array.isArray(p.alerts) && p.alerts.length > 0)
      ? p.alerts
      : defaultAlerts();
    alerts.forEach((a) => {
      if (a.remainingSec === remaining) playAlert(a.soundPreset);
    });

    if (remaining === 0) {
      // 시나리오의 마지막 단계 종료 시 종을 한 번 더 (대회 종료 효과)
      const isLastPhase = currentIndex === PHASES.length - 1;
      if (isLastPhase) {
        const zeroAlert = alerts.find((a) => a.remainingSec === 0);
        const secondPreset = zeroAlert ? zeroAlert.soundPreset : null;
        setTimeout(() => playAlert(secondPreset), 700);
      }
      running = false;
      refresh();
      setTimeout(() => { if (currentIndex + 1 < PHASES.length) nextPhase(); }, 2500);
      return;
    }
  }
  timerId = setTimeout(tick, 1000);
}

function toggleRun() {
  if (remaining <= 0) return;
  ensureAudio();
  running = !running;
  refresh();
  if (running) tick();
  else if (timerId) { clearTimeout(timerId); timerId = null; }
}

function resetPhaseState() {
  remaining = PHASES[currentIndex] ? PHASES[currentIndex].sec : 0;
}

function nextPhase() {
  if (currentIndex + 1 < PHASES.length) {
    running = false;
    if (timerId) clearTimeout(timerId);
    currentIndex += 1;
    resetPhaseState();
    refresh();
  } else {
    alert('모든 단계가 끝났습니다. 수고하셨습니다!');
  }
}

function prevPhase() {
  if (currentIndex > 0) {
    running = false;
    if (timerId) clearTimeout(timerId);
    currentIndex -= 1;
    resetPhaseState();
    refresh();
  }
}

function resetCurrent() {
  running = false;
  if (timerId) clearTimeout(timerId);
  resetPhaseState();
  refresh();
}

function resetAll() {
  if (confirm('처음부터 다시 시작하시겠습니까?')) {
    running = false;
    if (timerId) clearTimeout(timerId);
    currentIndex = 0;
    resetPhaseState();
    refresh();
  }
}

function adjustTime(delta) {
  const maxSec = PHASES[currentIndex] ? PHASES[currentIndex].sec : 0;
  remaining = Math.max(0, Math.min(maxSec, remaining + delta));
  refresh();
}

function jumpTo(sec) {
  const maxSec = PHASES[currentIndex] ? PHASES[currentIndex].sec : 0;
  remaining = Math.max(0, Math.min(maxSec, sec));
  refresh();
}

async function toggleClockFullscreen() {
  if (!window.api) return;
  await window.api.fullscreenClock();
}

async function openClock() {
  if (!window.api) return;
  const isOpen = await window.api.isClockOpen();
  if (isOpen) await window.api.closeClock();
  else await window.api.openClock();
  setTimeout(pushState, 200);
}

async function togglePopup() {
  if (!window.api) return;
  const isOpen = await window.api.isPopupOpen();
  if (isOpen) await window.api.closePopup();
  else await window.api.openPopup();
  setTimeout(pushState, 200);
}

// ============ 설정 모달 ============
let modalSettings = null; // 모달 내에서 임시 편집 중인 상태

function openSettings() {
  modalSettings = JSON.parse(JSON.stringify(settings));
  renderSettingsUI();
  $('settingsModal').hidden = false;
  switchTab('theme');
}

function closeSettings() {
  $('settingsModal').hidden = true;
  modalSettings = null;
}

function switchTab(name) {
  document.querySelectorAll('.modal-tabs .tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-pane').forEach((p) => {
    p.classList.toggle('active', p.dataset.pane === name);
  });
}

function renderSettingsUI() {
  // 테마
  document.querySelectorAll('.theme-card').forEach((c) => {
    c.classList.toggle('selected', c.dataset.theme === modalSettings.theme);
  });
  // 시나리오 프리셋
  hidePresetNameForm();
  renderPresetList();
  // 시나리오 단계
  renderPhaseRows();
  // 종소리 빌트인 선택 표시
  updateSoundSelection();
  // 커스텀 종소리 리스트
  renderCustomSounds();
  $('volumeSlider').value = Math.round(modalSettings.volume * 100);
  $('volumeValue').textContent = Math.round(modalSettings.volume * 100) + '%';
  // 제목
  $('titleInput').value = modalSettings.title;
  // 데이터 탭 상태
  renderDataStatus();
}

function fmtBytes(b) {
  if (!b && b !== 0) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
}

function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

async function renderDataStatus() {
  if (!window.api || !window.api.getSettingsMeta) return;
  try {
    const meta = await window.api.getSettingsMeta();
    $('dataPath').textContent = meta.path || '—';
    $('dataSize').textContent = meta.exists ? fmtBytes(meta.size) : '(파일 없음 — 아직 저장 안 됨)';
    $('dataModified').textContent = meta.exists ? fmtDate(meta.modified) : '—';
  } catch (e) {
    $('dataPath').textContent = '경로 조회 실패: ' + e.message;
  }
  $('dataPresets').textContent = modalSettings.scenarioPresets.length + '개';
  $('dataSounds').textContent = modalSettings.customSounds.length + '개';
}

async function exportSettingsAction() {
  if (!window.api || !window.api.exportSettings) return;
  // 저장되지 않은 모달 편집이 있을 수 있으므로 settings 기준으로 내보내기
  const json = JSON.stringify(settings, null, 2);
  const res = await window.api.exportSettings(json);
  if (res && res.ok) {
    alert('백업 파일로 내보냈습니다:\n' + res.path);
  } else if (res && res.error) {
    alert('내보내기 실패: ' + res.error);
  }
}

async function importSettingsAction() {
  if (!window.api || !window.api.importSettings) return;
  const res = await window.api.importSettings();
  if (!res || !res.ok) {
    if (res && res.error) alert('가져오기 실패: ' + res.error);
    return;
  }
  if (!confirm('현재 설정을 가져온 백업으로 덮어쓰시겠습니까?\n(현재 시나리오·프리셋·음성·테마 등 모두 교체됨)')) return;
  const parsed = parseSettings(res.data);
  if (!parsed) { alert('백업 파일이 유효하지 않습니다.'); return; }
  settings = parsed;
  saveSettings(settings);
  // modalSettings도 갱신
  modalSettings = JSON.parse(JSON.stringify(settings));
  applyTheme(settings.theme);
  applyTitle(settings.title);
  PHASES = settings.phases;
  currentIndex = 0;
  resetPhaseState();
  refresh();
  renderSettingsUI();
  alert('백업에서 복원했습니다.');
}

async function openSettingsFolderAction() {
  if (window.api && window.api.openSettingsFolder) await window.api.openSettingsFolder();
}

function updateSoundSelection() {
  document.querySelectorAll('.sound-option').forEach((o) => {
    o.classList.toggle('selected', o.dataset.sound === modalSettings.bellPreset);
  });
}

function renderPresetList() {
  const list = $('presetList');
  list.innerHTML = '';
  if (!modalSettings.scenarioPresets.length) {
    const empty = document.createElement('div');
    empty.className = 'preset-empty';
    empty.textContent = '아직 저장된 프리셋이 없습니다. 아래에서 시나리오를 편집한 뒤 저장하세요.';
    list.appendChild(empty);
    return;
  }
  modalSettings.scenarioPresets.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `
      <div class="preset-item-name">${escapeHtml(p.name)}</div>
      <div class="preset-item-meta">${p.phases.length}단계</div>
      <button class="btn-load" data-action="load">불러오기</button>
      <button class="btn-delete" data-action="delete">✕</button>
    `;
    item.querySelector('[data-action="load"]').addEventListener('click', () => loadPreset(p.id));
    item.querySelector('[data-action="delete"]').addEventListener('click', () => deletePreset(p.id));
    list.appendChild(item);
  });
}

function showPresetNameForm() {
  const form = $('presetNameForm');
  const input = $('presetNameInput');
  const btn = $('btnSavePreset');
  if (!form || !input) return;
  btn.hidden = true;
  form.hidden = false;
  input.value = '내 시나리오 ' + (modalSettings.scenarioPresets.length + 1);
  setTimeout(() => { input.focus(); input.select(); }, 30);
}

function hidePresetNameForm() {
  const form = $('presetNameForm');
  const btn = $('btnSavePreset');
  if (form) form.hidden = true;
  if (btn) btn.hidden = false;
}

function confirmSavePreset() {
  const input = $('presetNameInput');
  const name = (input.value || '').trim();
  if (!name) {
    alert('프리셋 이름을 입력해주세요.');
    input.focus();
    return;
  }
  const preset = {
    id: genId(),
    name,
    phases: JSON.parse(JSON.stringify(modalSettings.phases)),
  };
  modalSettings.scenarioPresets.push(preset);
  settings.scenarioPresets = JSON.parse(JSON.stringify(modalSettings.scenarioPresets));
  if (!saveSettings(settings)) {
    // 저장 실패 → 롤백
    modalSettings.scenarioPresets.pop();
    settings.scenarioPresets = JSON.parse(JSON.stringify(modalSettings.scenarioPresets));
    return;
  }
  renderPresetList();
  hidePresetNameForm();
}

function loadPreset(id) {
  const p = modalSettings.scenarioPresets.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`"${p.name}" 시나리오를 불러옵니다. 현재 편집 중인 내용은 사라집니다. 계속할까요?`)) return;
  modalSettings.phases = JSON.parse(JSON.stringify(p.phases));
  renderPhaseRows();
}

function deletePreset(id) {
  const p = modalSettings.scenarioPresets.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`"${p.name}" 프리셋을 삭제하시겠습니까?`)) return;
  modalSettings.scenarioPresets = modalSettings.scenarioPresets.filter((x) => x.id !== id);
  // 즉시 영속화
  settings.scenarioPresets = JSON.parse(JSON.stringify(modalSettings.scenarioPresets));
  saveSettings(settings);
  renderPresetList();
}

function renderCustomSounds() {
  const grid = $('customSoundGrid');
  grid.innerHTML = '';
  if (!modalSettings.customSounds.length) return;
  modalSettings.customSounds.forEach((sound) => {
    const id = 'custom:' + sound.id;
    const opt = document.createElement('div');
    opt.className = 'sound-option';
    opt.dataset.sound = id;
    if (modalSettings.bellPreset === id) opt.classList.add('selected');
    opt.innerHTML = `
      <span>🎵 ${escapeHtml(sound.name)} <span style="color:var(--fg-faint);font-weight:500;font-size:11px;">${formatBytes(sound.size || 0)}</span></span>
      <span style="display:flex;gap:4px;">
        <button class="preview-btn" data-preview="${id}">미리듣기</button>
        <button class="btn-delete" data-action="delete-sound" style="padding:4px 10px;font-size:11px;border-radius:6px;background:var(--accent-red);">✕</button>
      </span>
    `;
    opt.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      modalSettings.bellPreset = id;
      updateSoundSelection();
    });
    opt.querySelector('.preview-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      previewSoundFromModal(id);
    });
    opt.querySelector('[data-action="delete-sound"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`"${sound.name}" 종소리를 삭제하시겠습니까?`)) return;
      modalSettings.customSounds = modalSettings.customSounds.filter((s) => s.id !== sound.id);
      if (modalSettings.bellPreset === id) modalSettings.bellPreset = 'classic';
      // 이 사운드를 가리키던 단계들의 bellPreset도 비움
      modalSettings.phases.forEach((p) => { if (p.bellPreset === id) p.bellPreset = null; });
      // 즉시 영속화
      settings.customSounds = JSON.parse(JSON.stringify(modalSettings.customSounds));
      saveSettings(settings);
      renderCustomSounds();
      updateSoundSelection();
      renderPhaseRows();
    });
    grid.appendChild(opt);
  });
}

function previewSoundFromModal(preset) {
  // 모달에서 미리듣기는 modalSettings 기준으로 (저장 전이라도 동작)
  const saved = settings;
  settings = modalSettings;
  previewSound(preset);
  settings = saved;
}

function formatBytes(b) {
  if (!b) return '';
  if (b < 1024) return b + 'B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + 'KB';
  return (b / 1024 / 1024).toFixed(2) + 'MB';
}

const MAX_SOUND_BYTES = 1.5 * 1024 * 1024; // ~1.5MB

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function addSoundFiles(files) {
  const before = JSON.parse(JSON.stringify(modalSettings.customSounds));
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith('audio/')) {
      alert(`"${file.name}"은 오디오 파일이 아닙니다. 건너뜁니다.`);
      continue;
    }
    if (file.size > MAX_SOUND_BYTES) {
      alert(`"${file.name}"이 너무 큽니다 (${formatBytes(file.size)}). ${formatBytes(MAX_SOUND_BYTES)} 이하만 추가 가능합니다.`);
      continue;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      const id = genId();
      modalSettings.customSounds.push({
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        size: file.size,
        type: file.type,
        dataUrl,
      });
      added++;
    } catch (e) {
      alert(`"${file.name}" 읽기 실패: ${e.message}`);
    }
  }
  if (added > 0) {
    // 즉시 영속화 (모달 "저장" 안 눌러도 유지)
    settings.customSounds = JSON.parse(JSON.stringify(modalSettings.customSounds));
    if (!saveSettings(settings)) {
      // 저장 실패 (보통 용량 초과) → 추가한 분량 롤백
      modalSettings.customSounds = before;
      settings.customSounds = JSON.parse(JSON.stringify(before));
    }
  }
  renderCustomSounds();
  renderPhaseRows();
}

function buildBellOptions(currentValue) {
  const opts = [
    { val: '',                label: '⚙ 기본값' },
    { val: 'classic',         label: '🔔 종 (기본)' },
    { val: 'classic-double',  label: '🔔🔔 종 두 번' },
    { val: 'chime',           label: '🎐 차임' },
    { val: 'chime-double',    label: '🎐🎐 차임 두 번' },
    { val: 'buzz',            label: '🔊 부저' },
    { val: 'gong',            label: '🥢 종(저음)' },
  ];
  modalSettings.customSounds.forEach((s) => {
    opts.push({ val: 'custom:' + s.id, label: '🎵 ' + s.name });
  });
  return opts
    .map((o) => `<option value="${o.val}" ${o.val === (currentValue || '') ? 'selected' : ''}>${escapeHtml(o.label)}</option>`)
    .join('');
}

function renderPhaseRows() {
  const container = $('phaseRows');
  container.innerHTML = '';
  modalSettings.phases.forEach((ph, i) => {
    if (!Array.isArray(ph.alerts)) ph.alerts = defaultAlerts();
    const alertCount = ph.alerts.length;
    const row = document.createElement('div');
    row.className = 'phase-row';
    row.innerHTML = `
      <span class="phase-num">${i + 1}</span>
      <input data-field="stage" type="text" value="${escapeHtml(ph.stage)}" />
      <input data-field="detail" type="text" value="${escapeHtml(ph.detail)}" />
      <input data-field="min" type="number" min="0" max="99" value="${Math.floor(ph.sec / 60)}" />
      <input data-field="sec" type="number" min="0" max="59" value="${ph.sec % 60}" />
      <select data-field="kind">
        <option value="present" ${ph.kind === 'present' ? 'selected' : ''}>발표 (파랑)</option>
        <option value="prep" ${ph.kind === 'prep' ? 'selected' : ''}>준비 (주황)</option>
        <option value="qa" ${ph.kind === 'qa' ? 'selected' : ''}>질의응답 (초록)</option>
        <option value="closing" ${ph.kind === 'closing' ? 'selected' : ''}>마무리 (빨강)</option>
      </select>
      <select data-field="bellPreset" title="이 단계의 기본 종소리/음성">${buildBellOptions(ph.bellPreset)}</select>
      <button class="phase-alert-btn" data-action="edit-alerts" title="알람 시점 편집">🔔<span class="alert-badge">${alertCount}</span></button>
      <button class="phase-del" data-action="delete">✕</button>
    `;
    row.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('input', () => {
        const field = el.dataset.field;
        if (field === 'min') {
          const m = parseInt(el.value, 10) || 0;
          const s = ph.sec % 60;
          ph.sec = m * 60 + s;
        } else if (field === 'sec') {
          const s = Math.max(0, Math.min(59, parseInt(el.value, 10) || 0));
          const m = Math.floor(ph.sec / 60);
          ph.sec = m * 60 + s;
        } else if (field === 'stage' || field === 'detail') {
          ph[field] = el.value;
        } else if (field === 'kind') {
          ph.kind = el.value;
        } else if (field === 'bellPreset') {
          ph.bellPreset = el.value || null;
        }
      });
    });
    row.querySelector('[data-action="edit-alerts"]').addEventListener('click', () => openAlertEditor(i));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (modalSettings.phases.length <= 1) {
        alert('최소 한 개의 단계는 필요합니다.');
        return;
      }
      modalSettings.phases.splice(i, 1);
      renderPhaseRows();
    });
    container.appendChild(row);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function addPhase() {
  modalSettings.phases.push({
    stage: '새 단계',
    detail: '',
    sec: 60,
    kind: 'present',
    bellPreset: null,
    alerts: defaultAlerts(),
  });
  renderPhaseRows();
}

// ============ 알람 편집 서브모달 ============
let editingPhaseIndex = -1;

function openAlertEditor(phaseIndex) {
  editingPhaseIndex = phaseIndex;
  const ph = modalSettings.phases[phaseIndex];
  if (!ph) return;
  if (!Array.isArray(ph.alerts)) ph.alerts = defaultAlerts();
  $('alertEditorPhaseLabel').textContent = `${phaseIndex + 1}단계: ${ph.stage} · ${ph.detail || ''} (총 ${fmtMMSS(ph.sec)})`;
  renderAlertRows();
  $('alertEditorModal').hidden = false;
}

function closeAlertEditor() {
  $('alertEditorModal').hidden = true;
  editingPhaseIndex = -1;
  renderPhaseRows(); // 알람 개수 배지 갱신
}

function fmtMMSS(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function renderAlertRows() {
  const ph = modalSettings.phases[editingPhaseIndex];
  if (!ph) return;
  // remainingSec 내림차순(가장 많이 남은 시점부터)
  ph.alerts.sort((a, b) => b.remainingSec - a.remainingSec);
  const container = $('alertRows');
  container.innerHTML = '';
  ph.alerts.forEach((alert, idx) => {
    const row = document.createElement('div');
    row.className = 'alert-row';
    const m = Math.floor(alert.remainingSec / 60);
    const s = alert.remainingSec % 60;
    row.innerHTML = `
      <input data-field="min" type="number" min="0" max="99" value="${m}" />
      <input data-field="sec" type="number" min="0" max="59" value="${s}" />
      <select data-field="soundPreset">${buildBellOptions(alert.soundPreset)}</select>
      <button class="alert-del" data-action="delete">✕</button>
    `;
    row.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('input', () => {
        const f = el.dataset.field;
        if (f === 'min') {
          const mm = Math.max(0, parseInt(el.value, 10) || 0);
          alert.remainingSec = mm * 60 + (alert.remainingSec % 60);
        } else if (f === 'sec') {
          const ss = Math.max(0, Math.min(59, parseInt(el.value, 10) || 0));
          const mm = Math.floor(alert.remainingSec / 60);
          alert.remainingSec = mm * 60 + ss;
        } else if (f === 'soundPreset') {
          alert.soundPreset = el.value || null;
        }
      });
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      ph.alerts.splice(idx, 1);
      renderAlertRows();
    });
    container.appendChild(row);
  });
  if (ph.alerts.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:14px;text-align:center;color:var(--fg-faint);font-size:12px;';
    empty.textContent = '알람이 없습니다. 아래 + 알람 추가 버튼으로 시점을 등록하세요.';
    container.appendChild(empty);
  }
}

function addAlert() {
  const ph = modalSettings.phases[editingPhaseIndex];
  if (!ph) return;
  // 사용 중인 시점을 피해서 적당히 골라줌
  const usedSecs = new Set(ph.alerts.map((a) => a.remainingSec));
  let candidate = Math.max(0, Math.floor(ph.sec / 2));
  while (usedSecs.has(candidate) && candidate > 0) candidate -= 10;
  if (candidate < 0) candidate = 0;
  ph.alerts.push({ remainingSec: candidate, soundPreset: null });
  renderAlertRows();
}

function resetPhasesDefault() {
  if (confirm('시나리오를 기본 4팀 토론대회 25단계로 되돌리시겠습니까?')) {
    modalSettings.phases = buildDefaultPhases();
    renderPhaseRows();
  }
}

function applySettingsAndSave() {
  // 시나리오 유효성
  if (!modalSettings.phases.length) {
    alert('최소 한 개의 단계는 필요합니다.');
    return;
  }
  const phasesChanged = JSON.stringify(modalSettings.phases) !== JSON.stringify(settings.phases);
  settings = JSON.parse(JSON.stringify(modalSettings));
  saveSettings(settings);
  applyTheme(settings.theme);
  applyTitle(settings.title);

  if (phasesChanged) {
    PHASES = settings.phases;
    running = false;
    if (timerId) clearTimeout(timerId);
    currentIndex = 0;
    resetPhaseState();
  } else {
    PHASES = settings.phases;
  }
  refresh();

  // 자식 윈도우에 settings 변경 알리기
  if (window.api && window.api.broadcastSettings) {
    window.api.broadcastSettings({
      theme: settings.theme,
      title: settings.title,
    });
  }
  closeSettings();
}

// ============ 이벤트 바인딩 ============
function bindButtons() {
  const map = {
    btnStart: toggleRun,
    btnPrev: prevPhase,
    btnNext: nextPhase,
    btnReset: resetCurrent,
    btnResetAll: resetAll,
    btnMinus60: () => adjustTime(-60),
    btnMinus10: () => adjustTime(-10),
    btnPlus10:  () => adjustTime(10),
    btnPlus60:  () => adjustTime(60),
    btnTestWarning: () => { ensureAudio(); jumpTo(35); },
    btnTestEnd:     () => { ensureAudio(); jumpTo(5); },
    btnOpenClock: openClock,
    btnFullscreenClock: toggleClockFullscreen,
    btnTogglePopup: togglePopup,
    btnSettings: openSettings,
    btnSettingsClose: closeSettings,
    btnSettingsCancel: closeSettings,
    btnSettingsSave: applySettingsAndSave,
    btnAddPhase: addPhase,
    btnResetPhases: resetPhasesDefault,
    btnSavePreset: showPresetNameForm,
    btnConfirmSavePreset: confirmSavePreset,
    btnCancelSavePreset: hidePresetNameForm,
    btnAlertEditorClose: closeAlertEditor,
    btnAlertEditorDone: closeAlertEditor,
    btnAddAlert: addAlert,
    btnOpenSettingsFolder: openSettingsFolderAction,
    btnExportSettings: exportSettingsAction,
    btnImportSettings: importSettingsAction,
  };
  for (const [id, fn] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // 드래그앤드롭 영역
  const dropZone = $('soundDropZone');
  const fileInput = $('soundFileInput');
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) addSoundFiles(Array.from(fileInput.files));
      fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach((ev) => {
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragging');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragging');
      });
    });
    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) addSoundFiles(Array.from(files));
    });
  }

  // 윈도우 전체 드롭은 무시 (브라우저가 파일을 열지 않도록)
  ['dragover', 'drop'].forEach((ev) => {
    window.addEventListener(ev, (e) => {
      if (!dropZone || !dropZone.contains(e.target)) e.preventDefault();
    });
  });

  // 프리셋 이름 입력에서 Enter/Escape
  const presetInput = $('presetNameInput');
  if (presetInput) {
    presetInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmSavePreset(); }
      else if (e.key === 'Escape') { e.preventDefault(); hidePresetNameForm(); }
      e.stopPropagation();
    });
  }

  // 탭
  document.querySelectorAll('.modal-tabs .tab').forEach((t) => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  // 테마 카드
  document.querySelectorAll('.theme-card').forEach((c) => {
    c.addEventListener('click', () => {
      if (!modalSettings) return;
      modalSettings.theme = c.dataset.theme;
      applyTheme(modalSettings.theme); // 즉시 미리보기
      document.querySelectorAll('.theme-card').forEach((cc) => {
        cc.classList.toggle('selected', cc.dataset.theme === modalSettings.theme);
      });
    });
  });

  // 종소리 선택
  document.querySelectorAll('.sound-option').forEach((o) => {
    o.addEventListener('click', (e) => {
      if (e.target.classList.contains('preview-btn')) return;
      if (!modalSettings) return;
      modalSettings.bellPreset = o.dataset.sound;
      document.querySelectorAll('.sound-option').forEach((oo) => {
        oo.classList.toggle('selected', oo.dataset.sound === modalSettings.bellPreset);
      });
    });
  });
  document.querySelectorAll('.preview-btn').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      previewSound(b.dataset.preview);
    });
  });

  // 볼륨
  const vol = $('volumeSlider');
  if (vol) {
    vol.addEventListener('input', () => {
      const v = parseInt(vol.value, 10) / 100;
      if (modalSettings) modalSettings.volume = v;
      $('volumeValue').textContent = vol.value + '%';
    });
  }

  // 제목
  const titleInput = $('titleInput');
  if (titleInput) {
    titleInput.addEventListener('input', () => {
      if (modalSettings) modalSettings.title = titleInput.value;
    });
  }

  // 모달 배경 클릭 닫기 (취소와 동일)
  const backdrop = $('settingsModal');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        // 테마 미리보기를 되돌림
        applyTheme(settings.theme);
        closeSettings();
      }
    });
  }
}

function handleKey(e) {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
  if (!$('alertEditorModal').hidden) {
    if (e.key === 'Escape') closeAlertEditor();
    return;
  }
  if (!$('settingsModal').hidden) {
    if (e.key === 'Escape') { applyTheme(settings.theme); closeSettings(); }
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); toggleRun(); }
  else if (e.code === 'ArrowRight') nextPhase();
  else if (e.code === 'ArrowLeft') prevPhase();
  else if (e.key === 'r' || e.key === 'R') resetCurrent();
}

document.addEventListener('keydown', handleKey);
bindButtons();
refresh();

// 비동기 복원: localStorage가 비어있는 경우 파일에서 복구
recoverSettingsFromFileIfNeeded().catch((e) => console.error('Recovery failed:', e));

// ============ 자식 윈도우 통신 ============
if (window.api) {
  window.api.onChildCommand((cmd) => {
    if (cmd === 'toggle') toggleRun();
    else if (cmd === 'next') nextPhase();
    else if (cmd === 'prev') prevPhase();
    else if (cmd === 'reset') resetCurrent();
  });
  window.api.onChildNeedsState(() => pushState());
  window.api.onClockClosed(() => {/* nothing */});
  window.api.onPopupClosed(() => {/* nothing */});
  window.api.onShowShortcuts(() => {
    alert([
      '단축키',
      '',
      'Space  : 시작/정지',
      '← / → : 이전/다음 단계',
      'R     : 현재 단계 초기화',
      'F11   : 시계 창 전체화면 (메뉴)',
      'Cmd/Ctrl+P : 팝업 토글 (메뉴)',
    ].join('\n'));
  });
}
