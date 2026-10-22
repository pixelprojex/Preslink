/* PresLink Arcade: front-end logic. No framework, no build step. */
(() => {
  'use strict';

  const CONFIG = window.PRESLINK_CONFIG || {};
  const DEMO = !CONFIG.SUPABASE_URL;
  const STORAGE_KEY = 'preslink.player';
  const PENDING_KEY = 'preslink.pendingScore';
  const SWEEP_GUARD_MS = 150;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const euro = (cents) => '€' + Math.round((cents || 0) / 100).toLocaleString('en-IE');
  const vibrate = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* ignore */ } };

  const MESSAGES = {
    NETWORK: "No connection. Check your signal and try again.",
    NO_CREDITS: "No credits left. Insert a coin to play.",
    BAD_INITIALS: "Pick three letters, A to Z. That one isn't allowed.",
    BAD_ROLE: "Choose student or teacher.",
    STRIPE_NOT_CONFIGURED: "Payments aren't switched on yet. Try again soon.",
    NO_SITE_URL: "Payments aren't set up for this address yet.",
    PLAYER_NOT_FOUND: "We couldn't find your player. Please pick your initials again.",
    SCORE_MISMATCH: "That score didn't check out, so it wasn't saved.",
    ALREADY_SCORED: "That play was already scored.",
    PLAY_NOT_FOUND: "That play couldn't be found.",
    STRIPE_ERROR: "Stripe had a problem. Please try again.",
    SERVER_ERROR: "Something went wrong on our side. Please try again.",
  };
  const msg = (e) => MESSAGES[e && e.code] || MESSAGES.SERVER_ERROR;

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } },
  };

  let player = store.get(STORAGE_KEY);
  let credits = 0;
  let openPlay = null; // a play already paid for but not yet scored (survives refresh)
  let stats = null;
  let boardRole = 'student';

  const savePlayer = () => store.set(STORAGE_KEY, player);
  const clearPlayer = () => { player = null; credits = 0; store.del(STORAGE_KEY); };

  // ---------------------------------------------------------------------------
  // Backend
  // ---------------------------------------------------------------------------
  class ApiError extends Error {
    constructor(code, status) { super(code); this.code = code; this.status = status; }
  }
  function headers() {
    const h = { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY || '' };
    if ((CONFIG.SUPABASE_KEY || '').startsWith('eyJ')) h.Authorization = 'Bearer ' + CONFIG.SUPABASE_KEY;
    return h;
  }
  async function api(action, payload = {}) {
    if (DEMO) return window.PRESLINK_MOCK.api(action, payload);
    let res;
    try {
      res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/api', {
        method: 'POST', headers: headers(), body: JSON.stringify({ action, ...payload }),
      });
    } catch (_) { throw new ApiError('NETWORK', 0); }
    let data = null;
    try { data = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) throw new ApiError((data && data.error) || 'SERVER_ERROR', res.status);
    return data;
  }
  async function rpc(name, args = {}) {
    if (DEMO) return window.PRESLINK_MOCK.rpc(name, args);
    let res;
    try {
      res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/' + name, {
        method: 'POST', headers: headers(), body: JSON.stringify(args),
      });
    } catch (_) { throw new ApiError('NETWORK', 0); }
    if (!res.ok) throw new ApiError('SERVER_ERROR', res.status);
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------
  let toastTimer = 0;
  function toast(text, isError = false, ms = 3200) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.toggle('error', isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }
  function overlay(text) {
    const o = $('#overlay');
    if (!text) { o.hidden = true; return; }
    $('#overlay-text').textContent = text;
    o.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------
  const screens = $$('.screen');
  function go(name) {
    if (location.hash === '#' + name) render(name);
    else location.hash = name;
  }
  function render(name) {
    if (!['home', 'join', 'arcade', 'play', 'board'].includes(name)) name = 'home';
    if ((name === 'arcade' || name === 'play') && !player) { go('join'); return; }
    if (name === 'join' && player) { go('arcade'); return; }
    screens.forEach((s) => { s.hidden = s.dataset.screen !== name; });
    window.scrollTo(0, 0);
    if (name === 'home') { refreshStats(); $('#home-resume').hidden = !player; }
    if (name === 'join') { setTimeout(() => $('#join-initials').focus(), 50); }
    if (name === 'arcade') { refreshMe(); refreshStats(); }
    if (name === 'play') { startGame(); }
    if (name === 'board') { loadBoard(); }
    if (name !== 'play' && game.state !== 'idle' && game.state !== 'done') { abandonGame(); }
  }
  window.addEventListener('hashchange', () => render(location.hash.slice(1) || 'home'));
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go]');
    if (!t) return;
    e.preventDefault();
    go(t.dataset.go);
  });

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------
  async function refreshStats() {
    try {
      stats = await rpc('stats');
    } catch (_) { return; }
    const amount = euro(stats.total_raised_cents);
    $('#home-raised').textContent = amount;
    $('#arcade-raised').textContent = amount;
    const plays = Number(stats.plays || 0);
    $('#home-raised-sub').textContent = plays > 0
      ? `${Number(stats.payments).toLocaleString('en-IE')} coins in, ${plays.toLocaleString('en-IE')} plays so far`
      : 'Be the first to play';
    renderWeekChip();
  }
  function renderWeekChip() {
    if (!stats || !stats.week_end) return;
    const end = new Date(stats.week_end + 'T23:59:59');
    const left = end - Date.now();
    let text = 'Ends Sunday';
    if (left > 0) {
      const d = Math.floor(left / 86400000), h = Math.floor((left % 86400000) / 3600000), m = Math.floor((left % 3600000) / 60000);
      text = d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
    }
    $('#board-week').textContent = 'This week · ' + text;
  }

  // ---------------------------------------------------------------------------
  // Join
  // ---------------------------------------------------------------------------
  const joinInput = $('#join-initials');
  const boxes = $$('.initials .box');
  function syncBoxes() {
    const v = joinInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (v !== joinInput.value) joinInput.value = v;
    boxes.forEach((b, i) => {
      b.textContent = v[i] || '';
      b.classList.toggle('filled', !!v[i]);
      b.classList.toggle('active', i === Math.min(v.length, 2));
    });
    $('#join-error').hidden = true;
  }
  joinInput.addEventListener('input', syncBoxes);
  joinInput.addEventListener('focus', syncBoxes);
  $('.initials').addEventListener('click', () => joinInput.focus());
  syncBoxes();

  $('#join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = joinInput.value.toUpperCase();
    const role = ($('input[name="role"]:checked') || {}).value;
    const err = $('#join-error');
    if (!/^[A-Z]{3}$/.test(initials)) {
      err.textContent = 'Three letters, A to Z.';
      err.hidden = false;
      joinInput.focus();
      return;
    }
    const btn = $('#join-submit');
    btn.disabled = true;
    try {
      const p = await api('register', { initials, role });
      player = { id: p.id, tag: p.tag, initials: p.initials, role: p.role, claim_code: p.claim_code };
      credits = p.credits || 0;
      savePlayer();
      toast(`Welcome, ${player.initials}!`);
      go('arcade');
    } catch (ex) {
      err.textContent = msg(ex);
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------------------------------------------------------------------
  // Arcade
  // ---------------------------------------------------------------------------
  async function refreshMe() {
    if (!player) return;
    try {
      const me = await api('me', { player_id: player.id });
      credits = me.credits;
      openPlay = me.open_play || null;
      player = { ...player, tag: me.tag, initials: me.initials, role: me.role, claim_code: me.claim_code };
      savePlayer();
      renderArcade();
    } catch (ex) {
      if (ex.code === 'PLAYER_NOT_FOUND') { clearPlayer(); toast(MESSAGES.PLAYER_NOT_FOUND, true); go('join'); return; }
      renderArcade();
      toast(msg(ex), true);
    }
  }
  function renderArcade() {
    if (!player) return;
    $('#arcade-player').textContent = `${player.initials} · ${cap(player.role)}`;
    $('#arcade-credits').textContent = credits;
    const play = $('#arcade-play');
    const canPlay = credits > 0 || !!openPlay;
    play.disabled = !canPlay;
    play.classList.toggle('ready', canPlay);
    $('#arcade-hint').textContent = openPlay
      ? 'You have a play waiting. Hit Play!'
      : credits > 0
        ? `${credits} ${credits === 1 ? 'play' : 'plays'} ready. Hit Play!`
        : 'Insert a coin to play';
    $('#slot-text').textContent = canPlay ? 'Ready' : 'Insert coin';
    $('#bundles h2').textContent = credits > 0 ? 'Top up' : 'Insert coin';
  }
  $('#arcade-play').addEventListener('click', () => go('play'));
  $('#arcade-code').addEventListener('click', showCode);
  $('#arcade-player').addEventListener('click', showCode);
  function showCode() {
    if (!player) return;
    $('#dialog-initials').textContent = player.initials;
    $('#dialog-code').textContent = player.claim_code;
    const d = $('#code-dialog');
    if (d.showModal) d.showModal(); else alert(`${player.initials} · ${player.claim_code}`);
  }

  $$('.bundle').forEach((b) => b.addEventListener('click', () => buy(b.dataset.bundle)));
  async function buy(bundle) {
    if (!player) { go('join'); return; }
    overlay('Opening secure checkout…');
    try {
      const r = await api('checkout', { player_id: player.id, bundle });
      location.assign(r.url);
    } catch (ex) {
      overlay(null);
      toast(msg(ex), true);
    }
  }

  async function confirmPayment(sessionId) {
    overlay('Confirming your payment…');
    let result = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        result = await api('confirm', { session_id: sessionId });
        if (result.paid) break;
      } catch (ex) {
        if (ex.code !== 'NETWORK' && ex.code !== 'SERVER_ERROR') { overlay(null); toast(msg(ex), true); return; }
      }
      await wait(1500);
    }
    overlay(null);
    if (!result || !result.paid) {
      toast("We couldn't confirm the payment yet. If you were charged, your credits will appear shortly.", true, 6000);
      return;
    }
    if (result.player && (!player || player.id !== result.player.id)) {
      const p = result.player;
      player = { id: p.id, tag: p.tag, initials: p.initials, role: p.role, claim_code: p.claim_code };
      savePlayer();
    }
    credits = result.player ? result.player.credits : credits;
    if (location.hash !== '#arcade') location.hash = 'arcade';
    screens.forEach((s) => { s.hidden = s.dataset.screen !== 'arcade'; });
    renderArcade();
    refreshStats();
    await coinDrop(result.credits_added || 1);
  }

  async function coinDrop(n) {
    const coin = $('#coin'), slot = $('#slot'), val = $('#arcade-credits'), play = $('#arcade-play');
    const target = credits;
    const from = Math.max(0, target - n);
    play.classList.remove('ready');
    val.textContent = from;
    $('#slot-text').textContent = 'Coin in!';
    const step = n > 3 ? 420 : 650;
    for (let i = 0; i < n; i++) {
      coin.classList.remove('drop');
      void coin.offsetWidth;
      coin.classList.add('drop');
      await wait(step);
      slot.classList.add('glow');
      val.textContent = from + i + 1;
      val.classList.remove('bump');
      void val.offsetWidth;
      val.classList.add('bump');
      vibrate(25);
      await wait(220);
      slot.classList.remove('glow');
    }
    await wait(250);
    coin.classList.remove('drop');
    renderArcade();
    toast(`${n} ${n === 1 ? 'play' : 'plays'} added. Thank you!`);
  }

  // ---------------------------------------------------------------------------
  // Game: Stop the Light
  // ---------------------------------------------------------------------------
  const game = { state: 'idle', play: null, sweepStart: 0, raf: 0, trackW: 0, pending: null };
  const marker = $('#marker'), track = $('#track');

  function posAt(ms, phase, speed) {
    let x = ms / speed + phase;
    x = x - 2 * Math.floor(x / 2);
    return x < 1 ? x : 2 - x;
  }
  const scoreFor = (pos) => Math.round(1000 * (1 - 2 * Math.abs(pos - 0.5)));
  function verdictFor(s) {
    if (s >= 1000) return 'Perfect!!!';
    if (s >= 990) return 'Perfect!';
    if (s >= 950) return 'So close!';
    if (s >= 850) return 'Nice!';
    if (s >= 600) return 'Not bad';
    return 'Unlucky!';
  }
  function setMarker(pos) { marker.style.transform = `translateX(${pos * game.trackW}px)`; }
  function measure() { game.trackW = track.clientWidth; }
  window.addEventListener('resize', measure);

  function resetGameUI() {
    $('#result').hidden = true;
    $('#game').hidden = false;
    $('#game-msg').textContent = 'Ready?';
    $('#game-msg').classList.remove('go');
    $('#score-value').textContent = '0';
    $('#verdict').textContent = '';
    $('#verdict').classList.remove('miss');
    $('#tap-hint').textContent = 'Tap anywhere to stop';
    $('#tap-hint').classList.remove('live');
    $('#result-note').hidden = true;
    marker.classList.remove('hit', 'miss');
    measure();
    setMarker(0);
  }
  function updatePlayCredits() {
    $('#play-credits').textContent = `${credits} ${credits === 1 ? 'play' : 'plays'} left`;
  }

  async function startGame() {
    if (!player) { go('join'); return; }
    if (game.state === 'countdown' || game.state === 'sweeping') return;
    resetGameUI();
    updatePlayCredits();
    game.state = 'loading';
    let res;
    try {
      res = await api('start', { player_id: player.id });
    } catch (ex) {
      game.state = 'idle';
      toast(ex.code === 'NO_CREDITS' ? MESSAGES.NO_CREDITS : msg(ex), ex.code !== 'NO_CREDITS');
      go('arcade');
      return;
    }
    if (game.state !== 'loading') return; // user left while loading
    game.play = res;
    credits = res.credits;
    openPlay = null;
    updatePlayCredits();
    game.state = 'countdown';
    const m = $('#game-msg');
    m.textContent = 'Ready?';
    await wait(900);
    if (game.state !== 'countdown') return;
    m.textContent = 'Set…';
    await wait(700);
    if (game.state !== 'countdown') return;
    m.textContent = 'Go!';
    m.classList.add('go');
    $('#tap-hint').classList.add('live');
    measure();
    game.state = 'sweeping';
    game.sweepStart = performance.now();
    game.raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    if (game.state !== 'sweeping') return;
    setMarker(posAt(now - game.sweepStart, game.play.phase, game.play.speed_ms));
    game.raf = requestAnimationFrame(loop);
  }
  function abandonGame() {
    cancelAnimationFrame(game.raf);
    game.state = 'idle';
  }

  function onTap(e) {
    if (game.state !== 'sweeping') return;
    const ms = Math.round(performance.now() - game.sweepStart);
    if (ms < SWEEP_GUARD_MS) return;
    if (e.cancelable) e.preventDefault();
    game.state = 'done';
    cancelAnimationFrame(game.raf);
    const pos = posAt(ms, game.play.phase, game.play.speed_ms);
    const score = scoreFor(pos);
    setMarker(pos);
    finishPlay(score, ms);
  }
  $('#game').addEventListener('pointerdown', onTap);
  document.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'Enter') && game.state === 'sweeping') onTap(e);
  });

  async function finishPlay(score, ms) {
    const g = $('#game');
    g.classList.remove('flash'); void g.offsetWidth; g.classList.add('flash');
    marker.classList.add(score >= 900 ? 'hit' : 'miss');
    $('#game-msg').textContent = '';
    $('#tap-hint').classList.remove('live');
    $('#tap-hint').textContent = '';
    vibrate(score >= 950 ? [30, 40, 30, 40, 60] : 40);

    // Count the score up
    const el = $('#score-value');
    const t0 = performance.now(), dur = 900;
    await new Promise((resolve) => {
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(score * eased);
        if (k < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    const v = $('#verdict');
    v.textContent = verdictFor(score);
    v.classList.toggle('miss', score < 850);

    const payload = { player_id: player.id, play_id: game.play.play_id, score, tap_ms: ms };
    game.pending = payload;
    store.set(PENDING_KEY, payload);
    await submitPending(score);
  }

  async function submitPending(score) {
    const payload = game.pending;
    let r = null, note = '';
    try {
      r = await api('submit', payload);
      game.pending = null;
      store.del(PENDING_KEY);
      credits = r.credits;
    } catch (ex) {
      if (ex.code === 'ALREADY_SCORED' || ex.code === 'PLAY_NOT_FOUND' || ex.code === 'SCORE_MISMATCH' || ex.code === 'BAD_TAP') {
        game.pending = null;
        store.del(PENDING_KEY);
        note = ex.code === 'ALREADY_SCORED' ? '' : MESSAGES[ex.code];
      } else {
        note = "Couldn't save your score yet. Check your connection and tap Try again.";
      }
    }
    showResult(score, r, note);
  }

  function showResult(score, r, note) {
    updatePlayCredits();
    $('#result-score').textContent = score;
    $('#result-best').textContent = r ? r.best_this_week : '–';
    $('#result-rank').textContent = r && r.rank ? '#' + r.rank : '–';
    const n = $('#result-note');
    n.textContent = note || '';
    n.hidden = !note;
    const again = $('#result-again');
    if (game.pending) {
      again.textContent = 'Try again';
      again.onclick = () => { n.hidden = true; submitPending(score); };
    } else if (credits > 0) {
      again.textContent = `Play again (${credits} left)`;
      again.onclick = () => { game.state = 'idle'; startGame(); };
    } else {
      again.textContent = 'Insert coin';
      again.onclick = () => go('arcade');
    }
    $('#result').hidden = false;
    if (r && r.rank === 1) { toast('You are top of the board!'); }
  }

  // ---------------------------------------------------------------------------
  // Leaderboard
  // ---------------------------------------------------------------------------
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    boardRole = t.dataset.role;
    $$('.tab').forEach((x) => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', x === t); });
    loadBoard();
  }));
  function fmtWhen(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IE', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
  }
  async function loadBoard() {
    if (player && !$$('.tab').some((t) => t.classList.contains('active') && t.dataset.role === boardRole)) boardRole = player.role;
    $$('.tab').forEach((x) => { x.classList.toggle('active', x.dataset.role === boardRole); x.setAttribute('aria-selected', x.dataset.role === boardRole); });
    const list = $('#board-list');
    list.innerHTML = '';
    let rows = [], winners = [];
    try {
      [rows, winners] = await Promise.all([rpc('leaderboard', { p_role: boardRole }), rpc('past_winners')]);
    } catch (ex) { toast(msg(ex), true); return; }
    refreshStats();
    $('#board-empty').hidden = rows.length > 0;
    rows.slice(0, 50).forEach((r) => {
      const li = document.createElement('li');
      li.className = (player && r.tag === player.tag ? 'me ' : '') + (r.rank === 1 ? 'top' : '');
      li.innerHTML = `<span class="rank">${r.rank === 1 ? '🏆' : '#' + r.rank}</span>
        <span class="name">${r.initials}<span class="meta">${r.plays} ${Number(r.plays) === 1 ? 'play' : 'plays'} · ${fmtWhen(r.achieved_at)}${player && r.tag === player.tag ? ' · you' : ''}</span></span>
        <span class="pts">${r.score}</span>`;
      list.appendChild(li);
    });
    const w = $('#winners');
    w.innerHTML = '';
    $('#winners-empty').hidden = winners.length > 0;
    winners.forEach((r) => {
      const li = document.createElement('li');
      const d = new Date(r.week_start + 'T12:00:00');
      li.innerHTML = `<span>Week of ${d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })} · ${cap(r.role)}s</span>
        <span class="name">${r.initials}</span><span class="pts">${r.score}</span>`;
      w.appendChild(li);
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  $('#home-play').addEventListener('click', () => go(player ? 'arcade' : 'join'));

  async function boot() {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    const cancelled = params.get('cancelled');
    if (sessionId || cancelled) history.replaceState(null, '', location.pathname + '#arcade');

    // A score that could not be saved earlier (connection dropped) is retried silently.
    const pending = store.get(PENDING_KEY);
    if (pending && player && pending.player_id === player.id) {
      api('submit', pending).then(() => store.del(PENDING_KEY), (ex) => { if (ex.code !== 'NETWORK' && ex.code !== 'SERVER_ERROR') store.del(PENDING_KEY); });
    }

    if (DEMO) toast('Demo mode: payments and scores are simulated on this device.', false, 5000);

    render(location.hash.slice(1) || 'home');
    if (sessionId) await confirmPayment(sessionId);
    else if (cancelled) toast('Payment cancelled. Nothing was charged.');
  }
  boot();
})();
