const $ = (id) => document.getElementById(id);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || 'light';
}

function render(state) {
  if (!state) return;
  if (state.theme) applyTheme(state.theme);

  const mins = String(Math.floor(state.remaining / 60)).padStart(2, '0');
  const secs = String(state.remaining % 60).padStart(2, '0');
  const timerEl = $('timer');
  timerEl.textContent = mins + ':' + secs;
  timerEl.classList.remove('warning', 'danger');
  if (state.remaining <= 30) timerEl.classList.add('danger');
  else if (state.remaining <= 60) timerEl.classList.add('warning');

  $('popupStage').textContent = state.stage + ' · ' + state.detail;
  $('popupStage').dataset.kind = state.kind;
  $('btnStart').textContent = state.running ? '⏸' : '▶';
}

if (window.api) {
  window.api.onStateUpdate(render);
  window.api.requestState();
}

const send = (cmd) => window.api && window.api.sendCommand(cmd);

$('btnStart').addEventListener('click', () => send('toggle'));

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); send('toggle'); }
  else if (e.code === 'ArrowRight') send('next');
  else if (e.code === 'ArrowLeft') send('prev');
  else if (e.key === 'r' || e.key === 'R') send('reset');
});
