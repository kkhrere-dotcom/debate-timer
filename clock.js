const $ = (id) => document.getElementById(id);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || 'ppt';
}

function applyTitle(title) {
  document.title = title || '⏱ 과학토론타이머';
}

function render(state) {
  if (!state) return;
  if (state.theme) applyTheme(state.theme);
  if (state.title) applyTitle(state.title);
  if (typeof state.clockOpacity === 'number') {
    document.documentElement.style.setProperty('--clock-opacity', String(state.clockOpacity));
    document.body.classList.toggle('with-clock-opacity', state.clockOpacity < 100);
  }
  if (typeof state.clockTitleScale === 'number') {
    document.documentElement.style.setProperty('--clock-title-scale', String(state.clockTitleScale / 100));
  }
  if (typeof state.clockTimerScale === 'number') {
    document.documentElement.style.setProperty('--clock-timer-scale', String(state.clockTimerScale / 100));
  }

  const stageEl = $('stage');
  stageEl.textContent = state.stage;
  stageEl.dataset.kind = state.kind;
  $('detail').textContent = state.detail;
  $('count').textContent = '단계 ' + (state.index + 1) + ' / ' + state.total;

  const mins = String(Math.floor(state.remaining / 60)).padStart(2, '0');
  const secs = String(state.remaining % 60).padStart(2, '0');
  const timerEl = $('timer');
  timerEl.textContent = mins + ':' + secs;
  timerEl.classList.remove('warning', 'danger');
  if (state.remaining <= 30) timerEl.classList.add('danger');
  else if (state.remaining <= 60) timerEl.classList.add('warning');

  const pct = state.totalSec > 0 ? ((state.totalSec - state.remaining) / state.totalSec) * 100 : 0;
  $('progressFill').style.width = pct + '%';

  if (state.nextStage) {
    $('next').textContent = '다음 ▶  ' + state.nextStage + ' · ' + state.nextDetail;
  } else {
    $('next').textContent = '🏁 마지막 단계입니다';
  }
}

function setFsClass(isFs) {
  document.body.classList.toggle('is-fullscreen', isFs);
  $('btnClose').title = isFs ? '전체화면 해제 (Esc 또는 Enter)' : '닫기 (Esc)';
}

if (window.api) {
  window.api.onStateUpdate(render);
  window.api.requestState();
  window.api.onClockFullscreenChanged((isFs) => setFsClass(isFs));
}

// ✕ 버튼: 전체화면 중엔 전체화면 해제, 평소엔 창 닫기
$('btnClose').addEventListener('click', async () => {
  if (!window.api) return;
  if (document.body.classList.contains('is-fullscreen')) {
    await window.api.fullscreenClock();
  } else {
    await window.api.closeClock();
  }
});

document.addEventListener('keydown', (e) => {
  if (!window.api) return;
  const isFs = document.body.classList.contains('is-fullscreen');
  // 전체화면 시 Enter/Esc는 해제용
  if (isFs && (e.code === 'Enter' || e.key === 'Escape')) {
    e.preventDefault();
    window.api.fullscreenClock();
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); window.api.sendCommand('toggle'); }
  else if (e.code === 'ArrowRight') window.api.sendCommand('next');
  else if (e.code === 'ArrowLeft') window.api.sendCommand('prev');
  else if (e.key === 'r' || e.key === 'R') window.api.sendCommand('reset');
  else if (e.key === 'F11') { e.preventDefault(); window.api.fullscreenClock(); }
});
