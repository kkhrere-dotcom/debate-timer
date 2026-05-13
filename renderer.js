// ============ 기본 시나리오 빌더 ============
const TEAM_COUNT = 4;
function buildDefaultPhases() {
  const phases = [];
  for (let team = 1; team <= TEAM_COUNT; team++) {
    phases.push({ stage: '자기주장 발표', detail: team + '팀 발표', sec: 5 * 60, kind: 'present' });
    if (team < TEAM_COUNT) {
      phases.push({ stage: '준비 시간', detail: (team + 1) + '팀 발표 준비', sec: 3 * 60, kind: 'prep' });
    }
  }
  phases.push({ stage: '전체 준비 시간', detail: '질의응답 준비 (전체)', sec: 11 * 60, kind: 'prep' });
  for (let answering = 1; answering <= TEAM_COUNT; answering++) {
    for (let i = 1; i <= TEAM_COUNT - 1; i++) {
      const asking = ((answering - 1 + i) % TEAM_COUNT) + 1;
      phases.push({
        stage: '질의응답',
        detail: answering + '팀 답변 ← ' + asking + '팀 질의',
        sec: 5 * 60,
        kind: 'qa',
      });
    }
  }
  phases.push({ stage: '주장다지기 준비', detail: '주장다지기 준비 (전체)', sec: 10 * 60, kind: 'prep' });
  for (let team = TEAM_COUNT; team >= 1; team--) {
    phases.push({ stage: '주장다지기', detail: team + '팀 주장다지기', sec: 3 * 60, kind: 'closing' });
  }
  return phases;
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

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, phases: buildDefaultPhases() };
    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme || DEFAULT_SETTINGS.theme,
      title: parsed.title || DEFAULT_SETTINGS.title,
      bellPreset: parsed.bellPreset || DEFAULT_SETTINGS.bellPreset,
      volume: typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_SETTINGS.volume,
      phases: Array.isArray(parsed.phases) && parsed.phases.length > 0
        ? parsed.phases
        : buildDefaultPhases(),
      scenarioPresets: Array.isArray(parsed.scenarioPresets) ? parsed.scenarioPresets : [],
      customSounds: Array.isArray(parsed.customSounds) ? parsed.customSounds : [],
    };
  } catch (e) {
    return { ...DEFAULT_SETTINGS, phases: buildDefaultPhases() };
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch (e) {
    alert('저장 공간이 부족합니다. 종소리 파일을 줄이거나 시나리오 프리셋을 정리해주세요.\n\n' + e.message);
    return false;
  }
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
let warned = false;
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
    case 'chime': bellChime(t0, vol); break;
    case 'buzz':  bellBuzz(t0, vol);  break;
    case 'gong':  bellGong(t0, vol);  break;
    default:      bellClassic(t0, vol);
  }
}

function getActiveBellPreset() {
  const p = PHASES[currentIndex];
  if (p && p.bellPreset) return p.bellPreset;
  return settings.bellPreset;
}

function ringBell(offset) {
  const preset = getActiveBellPreset();
  if (preset && preset.startsWith('custom:')) {
    const id = preset.slice('custom:'.length);
    setTimeout(() => playCustomSound(id, settings.volume), (offset || 0) * 1000);
  } else {
    ringBellSynth(offset, preset);
  }
}

function playWarning() { ringBell(0); }
function playEnd() {
  ringBell(0);
  // 빌트인 단순 종은 두 번 울리는 게 익숙해서 유지 (커스텀 음성/gong은 1번만)
  const active = getActiveBellPreset();
  if (active === 'classic' || active === 'chime' || active === 'buzz') {
    ringBell(0.7);
  }
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
    case 'chime': bellChime(t0, vol); break;
    case 'buzz':  bellBuzz(t0, vol); break;
    case 'gong':  bellGong(t0, vol); break;
    default:      bellClassic(t0, vol);
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
    if (remaining === 30 && !warned) { warned = true; playWarning(); }
    refresh();
    if (remaining === 0) {
      playEnd();
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
  warned = false;
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
  if (remaining > 30) warned = false;
  refresh();
}

function jumpTo(sec) {
  const maxSec = PHASES[currentIndex] ? PHASES[currentIndex].sec : 0;
  remaining = Math.max(0, Math.min(maxSec, sec));
  if (remaining > 30) warned = false;
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

function saveCurrentAsPreset() {
  const name = prompt('프리셋 이름을 입력하세요:', '내 시나리오 ' + (modalSettings.scenarioPresets.length + 1));
  if (!name) return;
  const preset = {
    id: genId(),
    name: name.trim(),
    phases: JSON.parse(JSON.stringify(modalSettings.phases)),
  };
  modalSettings.scenarioPresets.push(preset);
  // 프리셋 목록은 즉시 영속화 (모달 "저장" 안 눌러도 유지되도록)
  settings.scenarioPresets = JSON.parse(JSON.stringify(modalSettings.scenarioPresets));
  saveSettings(settings);
  renderPresetList();
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
        name: file.name.replace(/\.[^.]+$/, ''), // 확장자 제거
        size: file.size,
        type: file.type,
        dataUrl,
      });
    } catch (e) {
      alert(`"${file.name}" 읽기 실패: ${e.message}`);
    }
  }
  renderCustomSounds();
  // 시나리오 행의 음성 드롭다운도 갱신
  renderPhaseRows();
}

function buildBellOptions(currentValue) {
  const opts = [
    { val: '',        label: '⚙ 기본값' },
    { val: 'classic', label: '🔔 종 (기본)' },
    { val: 'chime',   label: '🎐 차임' },
    { val: 'buzz',    label: '🔊 부저' },
    { val: 'gong',    label: '🥢 종(저음)' },
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
      <select data-field="bellPreset" title="이 단계에서 사용할 종소리/음성">${buildBellOptions(ph.bellPreset)}</select>
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
  });
  renderPhaseRows();
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
    btnSavePreset: saveCurrentAsPreset,
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
  if (!$('settingsModal').hidden) {
    // 모달 열려있으면 ESC만
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
