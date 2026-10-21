(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const CFG_KEY = 'circuito:config:v1';
  const MUTE_KEY = 'circuito:mute:v1';
  const DEFAULTS = { exercises: 8, work: 40, rest: 20, rounds: 1, prep: 5 };
  const LIMITS = { exercises: [1, 99], work: [5, 3600], rest: [0, 3600], rounds: [1, 20], prep: [0, 60] };
  const CIRC = 2 * Math.PI * 54;

  const fields = {};
  Object.keys(DEFAULTS).forEach((k) => (fields[k] = $('#' + k)));
  const el = {
    setup: $('#setup'), timer: $('#timer'), form: $('#form'), summary: $('#summary'),
    label: $('#phaseLabel'), info: $('#info'), time: $('#time'), arc: $('#arc'), bar: $('#barFill'),
    pause: $('#pause'), skip: $('#skip'), stop: $('#stop'), again: $('#again'),
    controls: $('#controls'), mute: $('#mute'),
  };

  const state = {
    settings: { ...DEFAULTS }, phases: [], before: [], all: 0,
    i: 0, end: 0, total: 0, lastSec: 0, remaining: 0,
    running: false, active: false, muted: false, timerId: null,
  };

  /* ---------- Utilidades ---------- */
  const clamp = (v, [min, max]) => Math.min(max, Math.max(min, v));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignora */ } },
  };
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* ignora */ } };
  const clock = (s) => (s < 60 ? String(s) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  const long = (s) => {
    const m = Math.floor(s / 60), r = s % 60;
    return m ? (r ? `${m} min ${r} s` : `${m} min`) : `${r} s`;
  };

  /* ---------- Configurações ---------- */
  function readSettings() {
    const s = {};
    for (const k in DEFAULTS) {
      const n = parseInt(fields[k].value, 10);
      s[k] = clamp(Number.isNaN(n) ? DEFAULTS[k] : n, LIMITS[k]);
    }
    return s;
  }
  function writeSettings(s) { for (const k in s) fields[k].value = s[k]; }
  function refreshSummary() {
    const s = readSettings();
    const n = s.exercises * s.rounds;
    const total = s.prep + s.work * n + s.rest * (n - 1);
    el.summary.textContent = `Duração total: ${long(total)}`;
  }
  function persist() { store.set(CFG_KEY, readSettings()); refreshSummary(); }

  /* ---------- Áudio ---------- */
  let ctx = null;
  function unlockAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  function tone(freq, dur, delay = 0, vol = 0.4, type = 'sine') {
    if (!ctx || state.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  const sounds = {
    tick: () => tone(660, 0.12, 0, 0.35),                                   // últimos 3 s
    work: () => { tone(988, 0.14, 0, 0.35, 'square'); tone(988, 0.14, 0.2, 0.35, 'square'); tone(1319, 0.55, 0.4, 0.35, 'square'); }, // início do exercício
    rest: () => { tone(523, 0.25, 0, 0.5); tone(392, 0.6, 0.3, 0.5); },     // fim do exercício
    done: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.22, i * 0.2, 0.45, 'triangle')); tone(1047, 0.9, 0.6, 0.45, 'triangle'); },
  };

  /* ---------- Tela ligada ---------- */
  let lock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && !lock) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      }
    } catch { /* ignora */ }
  }
  function releaseAwake() { if (lock) { lock.release().catch(() => {}); lock = null; } }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.active && state.running) keepAwake();
  });

  /* ---------- Motor do treino ---------- */
  function buildPhases(s) {
    const p = [];
    if (s.prep > 0) p.push({ type: 'prep', dur: s.prep });
    const total = s.exercises * s.rounds;
    let n = 0;
    for (let r = 1; r <= s.rounds; r++) {
      for (let e = 1; e <= s.exercises; e++) {
        n++;
        p.push({ type: 'work', dur: s.work, e, r, n, total });
        if (n < total && s.rest > 0) p.push({ type: 'rest', dur: s.rest, e, r, n, total });
      }
    }
    return p;
  }

  function start() {
    unlockAudio();
    state.settings = readSettings();
    store.set(CFG_KEY, state.settings);
    state.phases = buildPhases(state.settings);
    let acc = 0;
    state.before = state.phases.map((p) => { const b = acc; acc += p.dur * 1000; return b; });
    state.all = acc;
    state.active = true;
    state.running = true;
    el.setup.hidden = true;
    el.timer.hidden = false;
    el.controls.hidden = false;
    el.again.hidden = true;
    el.pause.textContent = 'Pausar';
    document.body.classList.remove('paused');
    keepAwake();
    startPhase(0);
    clearInterval(state.timerId);
    state.timerId = setInterval(tick, 100);
  }

  function startPhase(idx, anchor = Date.now()) {
    const ph = state.phases[idx];
    if (!ph) return finish();
    state.i = idx;
    state.total = ph.dur * 1000;
    state.end = anchor + state.total;
    state.lastSec = ph.dur;
    render(ph, idx);
    if (ph.type === 'work') { sounds.work(); vibrate(200); }
    else if (ph.type === 'rest') { sounds.rest(); vibrate([100, 60, 100]); }
    update(Math.max(0, state.end - Date.now()));
  }

  function render(ph, idx) {
    const s = state.settings;
    document.body.dataset.phase = ph.type;
    if (ph.type === 'prep') {
      el.label.textContent = 'Prepare-se';
      el.info.textContent = `Primeiro: exercício 1 de ${s.exercises}`;
    } else if (ph.type === 'work') {
      el.label.textContent = `Exercício ${ph.e} de ${s.exercises}`;
      el.info.textContent = s.rounds > 1 ? `Volta ${ph.r} de ${s.rounds}` : '';
    } else {
      const next = state.phases[idx + 1];
      el.label.textContent = 'Descanso';
      el.info.textContent = next
        ? `Próximo: exercício ${next.e} de ${s.exercises}` + (s.rounds > 1 ? `, volta ${next.r}` : '')
        : '';
    }
  }

  function update(left) {
    const secs = Math.ceil(left / 1000);
    if (secs !== state.lastSec) {
      state.lastSec = secs;
      if (secs >= 1 && secs <= 3) sounds.tick();
    }
    el.time.textContent = clock(secs);
    el.arc.style.strokeDashoffset = String(CIRC * (1 - left / state.total));
    const done = state.before[state.i] + (state.total - left);
    el.bar.style.width = Math.min(100, (done / state.all) * 100) + '%';
  }

  function tick() {
    if (!state.running) return;
    const left = state.end - Date.now();
    if (left <= 0) startPhase(state.i + 1, state.end);
    else update(left);
  }

  function finish() {
    clearInterval(state.timerId);
    state.running = false;
    document.body.dataset.phase = 'done';
    el.label.textContent = 'Treino concluído';
    el.info.textContent = `${state.settings.exercises * state.settings.rounds} exercícios feitos`;
    el.time.textContent = '✓';
    el.arc.style.strokeDashoffset = '0';
    el.bar.style.width = '100%';
    el.controls.hidden = true;
    el.again.hidden = false;
    sounds.done();
    vibrate([300, 100, 300, 100, 500]);
    releaseAwake();
  }

  function backToSetup() {
    clearInterval(state.timerId);
    state.running = false;
    state.active = false;
    releaseAwake();
    document.body.classList.remove('paused');
    document.body.dataset.phase = 'setup';
    el.timer.hidden = true;
    el.setup.hidden = false;
  }

  function togglePause() {
    if (!state.active || !state.phases[state.i]) return;
    if (state.running) {
      state.running = false;
      state.remaining = state.end - Date.now();
      document.body.classList.add('paused');
      el.pause.textContent = 'Retomar';
    } else {
      unlockAudio();
      state.end = Date.now() + state.remaining;
      state.running = true;
      document.body.classList.remove('paused');
      el.pause.textContent = 'Pausar';
      keepAwake();
    }
  }

  /* ---------- Eventos ---------- */
  document.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.target;
      const cur = parseInt(fields[k].value, 10);
      const base = Number.isNaN(cur) ? DEFAULTS[k] : cur;
      fields[k].value = clamp(base + Number(btn.dataset.step), LIMITS[k]);
      persist();
    });
  });
  Object.values(fields).forEach((f) => {
    f.addEventListener('input', refreshSummary);
    f.addEventListener('change', () => { writeSettings(readSettings()); persist(); });
  });
  el.form.addEventListener('submit', (e) => { e.preventDefault(); start(); });
  el.pause.addEventListener('click', togglePause);
  el.skip.addEventListener('click', () => {
    if (!state.active) return;
    state.running = true;
    document.body.classList.remove('paused');
    el.pause.textContent = 'Pausar';
    startPhase(state.i + 1);
  });
  el.stop.addEventListener('click', () => { if (confirm('Encerrar o treino?')) backToSetup(); });
  el.again.addEventListener('click', backToSetup);
  el.mute.addEventListener('click', () => {
    state.muted = !state.muted;
    store.set(MUTE_KEY, state.muted);
    paintMute();
    if (!state.muted) { unlockAudio(); tone(880, 0.12, 0, 0.3); }
  });
  function paintMute() {
    el.mute.textContent = state.muted ? '🔇' : '🔊';
    el.mute.setAttribute('aria-pressed', String(state.muted));
    el.mute.setAttribute('aria-label', state.muted ? 'Som desligado' : 'Som ligado');
  }

  /* ---------- Início ---------- */
  writeSettings({ ...DEFAULTS, ...(store.get(CFG_KEY) || {}) });
  writeSettings(readSettings());
  state.muted = store.get(MUTE_KEY) === true;
  paintMute();
  refreshSummary();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
