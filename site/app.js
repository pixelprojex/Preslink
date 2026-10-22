/* PresLink Arcade: front-end logic. No framework, no build step. */
(() => {
  'use strict';

  const CONFIG = window.PRESLINK_CONFIG || {};
  const DEMO = !CONFIG.SUPABASE_URL;
  const STORAGE_KEY = 'preslink.player';
  const PENDING_KEY = 'preslink.pendingScore';
  const ADMIN_KEY = 'preslink.adminCode';
  const SWEEP_GUARD_MS = 150;
  const BUNDLE_AMOUNT = { single: 2, triple: 5, seven: 10 };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const euro = (cents) => '€' + Math.round((cents || 0) / 100).toLocaleString('en-IE');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vibrate = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* ignore */ } };

  const MESSAGES = {
    NETWORK: 'No connection. Check your signal and try again.',
    NO_CREDITS: 'No credits left. Insert a coin to play.',
    BAD_INITIALS: 'Three letters, A to Z.',
    BLOCKED_INITIALS: "Those letters aren't allowed. Pick another three.",
    TAKEN: 'Those letters are taken. Try another three, or sign back in.',
    BAD_ROLE: 'Choose student or teacher.',
    BAD_SIGNIN: "That name and code don't match.",
    LOCKED: 'Too many tries. Wait 15 minutes and try again.',
    BANNED: 'This player has been removed by the committee.',
    STRIPE_NOT_CONFIGURED: "Payments aren't switched on yet. Try again soon.",
    NO_SITE_URL: "Payments aren't set up for this address yet.",
    PLAYER_NOT_FOUND: "We couldn't find your player. Please pick your letters again.",
    SCORE_MISMATCH: "That score didn't check out, so it wasn't saved.",
    ALREADY_SCORED: 'That play was already scored.',
    PLAY_NOT_FOUND: "That play couldn't be found.",
    STRIPE_ERROR: 'Stripe had a problem. Please try again.',
    BAD_ADMIN: 'Wrong committee code.',
    ADMIN_NOT_SET: 'No committee code has been set yet.',
    CODE_TOO_SHORT: 'Use at least 6 characters.',
    SERVER_ERROR: 'Something went wrong on our side. Please try again.',
  };
  const msg = (e) => MESSAGES[e && e.code] || MESSAGES.SERVER_ERROR;

  // ---------------------------------------------------------------------------
  // Storage and state
  // ---------------------------------------------------------------------------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* ignore */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (_) { /* ignore */ } },
  };

  let player = store.get(STORAGE_KEY);
  let credits = 0;
  let openPlay = null;
  let bestThisWeek = null;
  let stats = null;
  let boardRole = 'student';
  let prevScreen = 'home';

  const savePlayer = () => store.set(STORAGE_KEY, player);
  const clearPlayer = () => { player = null; credits = 0; openPlay = null; bestThisWeek = null; store.del(STORAGE_KEY); };
  function adoptPlayer(p) {
    player = { id: p.id, tag: p.tag, initials: p.initials, role: p.role, claim_code: p.claim_code };
    credits = p.credits || 0;
    openPlay = p.open_play || null;
    bestThisWeek = p.best_this_week == null ? null : p.best_this_week;
    savePlayer();
  }

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
      res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/api', { method: 'POST', headers: headers(), body: JSON.stringify({ action, ...payload }) });
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
      res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
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
  function openSheet(id) {
    $$('.sheet').forEach((s) => { s.hidden = s.id !== 'sheet-' + id; });
    $('#sheet-backdrop').hidden = false;
  }
  function closeSheets() {
    $$('.sheet').forEach((s) => { s.hidden = true; });
    $('#sheet-backdrop').hidden = true;
  }
  $('#sheet-backdrop').addEventListener('click', closeSheets);
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sheet]');
    if (s) { e.preventDefault(); openSheet(s.dataset.sheet); return; }
    if (e.target.closest('[data-close]')) closeSheets();
  });

  const confetti = (() => {
    const canvas = $('#confetti');
    const ctx = canvas.getContext('2d');
    let parts = [], raf = 0;
    const colors = ['#58cc02', '#1cb0f6', '#ffc800', '#ff9600', '#ff4b4b', '#ce82ff'];
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts = parts.filter((p) => p.life > 0);
      for (const p of parts) {
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr; p.life--;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.min(1, p.life / 25); ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      raf = parts.length ? requestAnimationFrame(tick) : 0;
      if (!raf) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    function burst(n) {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const d = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * d; canvas.height = window.innerHeight * d;
      const cx = canvas.width / 2, cy = canvas.height * 0.38;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (5 + Math.random() * 9) * d;
        parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 7 * d, g: 0.38 * d, w: (6 + Math.random() * 6) * d, h: (8 + Math.random() * 9) * d, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, c: colors[i % colors.length], life: 80 + Math.random() * 40 });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }
    return { burst };
  })();

  // ---------------------------------------------------------------------------
  // Router and tab bar
  // ---------------------------------------------------------------------------
  const SCREENS = ['home', 'about', 'join', 'signin', 'arcade', 'play', 'board', 'you', 'admin'];
  const screens = $$('.screen');
  let current = 'home';
  function go(name) {
    if (location.hash === '#' + name) render(name);
    else location.hash = name;
  }
  function goPlay() { go(player ? 'arcade' : 'join'); }
  function render(name) {
    if (!SCREENS.includes(name)) name = 'home';
    if ((name === 'arcade' || name === 'play' || name === 'you') && !player) { go('join'); return; }
    if ((name === 'join' || name === 'signin') && player) { go('arcade'); return; }
    if (name !== current) prevScreen = current;
    current = name;
    closeSheets();
    screens.forEach((s) => { s.hidden = s.dataset.screen !== name; });
    window.scrollTo(0, 0);
    const tab = { home: 'play', arcade: 'play', join: 'play', signin: 'play', board: 'board', about: 'about', you: 'you' }[name];
    $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('#tabbar').hidden = name === 'play' || name === 'admin';
    if (name !== 'play' && game.state !== 'idle' && game.state !== 'done') abandonGame();
    if (name === 'home') { refreshStats(); $('#home-resume').hidden = !player; }
    if (name === 'join') setTimeout(() => $('#join-initials').focus(), 60);
    if (name === 'signin') setTimeout(() => $('#signin-initials').focus(), 60);
    if (name === 'arcade') { renderArcade(); refreshMe(); refreshStats(); }
    if (name === 'play') startGame();
    if (name === 'board') loadBoard();
    if (name === 'you') { renderYou(); refreshMe().then(renderYou); }
    if (name === 'admin') renderAdminEntry();
  }
  window.addEventListener('hashchange', () => render(location.hash.slice(1) || 'home'));
  document.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]');
    if (back) { e.preventDefault(); go(prevScreen === current ? 'home' : prevScreen); return; }
    const p = e.target.closest('.js-play');
    if (p) { e.preventDefault(); goPlay(); return; }
    const t = e.target.closest('[data-go]');
    if (t) { e.preventDefault(); go(t.dataset.go); }
  });
  $$('#tabbar button').forEach((b) => b.addEventListener('click', () => {
    const tab = b.dataset.tab;
    if (tab === 'play') goPlay();
    else if (tab === 'you') go(player ? 'you' : 'join');
    else go(tab);
  }));

  // ---------------------------------------------------------------------------
  // Stats, goal, prize
  // ---------------------------------------------------------------------------
  async function refreshStats() {
    try { stats = await rpc('stats'); } catch (_) { return; }
    const raised = Number(stats.total_raised_cents || 0);
    const goal = Number(stats.goal_cents || 0);
    $('#home-raised').textContent = euro(raised);
    $('#home-goal').textContent = goal > 0 ? `raised of ${euro(goal)}` : 'raised';
    const pct = goal > 0 ? Math.min(100, Math.max(raised > 0 ? 2 : 0, (raised / goal) * 100)) : (raised > 0 ? 100 : 0);
    $('#home-bar').style.width = pct + '%';
    const plays = Number(stats.plays || 0);
    $('#home-raised-sub').textContent = plays > 0
      ? `${Number(stats.payments).toLocaleString('en-IE')} coins in · ${plays.toLocaleString('en-IE')} plays · for schools in Ghana and Nigeria`
      : 'For Presentation Brothers schools in Ghana and Nigeria';
    renderWeekChip();
    const prize = (stats.prize_text || '').trim();
    $('#board-prize').hidden = !prize;
    $('#board-prize-text').textContent = prize;
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
    $('#board-week').textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Initials field (used by join and sign in)
  // ---------------------------------------------------------------------------
  function initialsField(inputId) {
    const input = $('#' + inputId);
    const label = input.closest('.initials');
    const boxes = $$('.box', label);
    const sync = () => {
      const v = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
      if (v !== input.value) input.value = v;
      boxes.forEach((b, i) => {
        b.textContent = v[i] || '';
        b.classList.toggle('filled', !!v[i]);
        b.classList.toggle('active', i === Math.min(v.length, 2));
      });
    };
    input.addEventListener('input', sync);
    input.addEventListener('focus', sync);
    label.addEventListener('click', () => input.focus());
    sync();
    return { input, value: () => input.value.toUpperCase(), clear: () => { input.value = ''; sync(); } };
  }
  const joinInitials = initialsField('join-initials');
  const signinInitials = initialsField('signin-initials');

  function showError(id, text) {
    const el = $('#' + id);
    el.textContent = text || '';
    el.hidden = !text;
  }

  $('#join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = joinInitials.value();
    const role = ($('input[name="role"]:checked') || {}).value;
    if (!/^[A-Z]{3}$/.test(initials)) { showError('join-error', MESSAGES.BAD_INITIALS); joinInitials.input.focus(); return; }
    const btn = $('#join-submit');
    btn.disabled = true;
    showError('join-error', '');
    try {
      adoptPlayer(await api('register', { initials, role }));
      toast(`Welcome, ${player.initials}! Your claim code is ${player.claim_code}.`, false, 6000);
      go('arcade');
    } catch (ex) {
      showError('join-error', msg(ex));
    } finally {
      btn.disabled = false;
    }
  });

  $('#signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = signinInitials.value();
    const code = $('#signin-code').value.replace(/\D/g, '');
    if (!/^[A-Z]{3}$/.test(initials)) { showError('signin-error', MESSAGES.BAD_INITIALS); return; }
    if (!/^\d{4}$/.test(code)) { showError('signin-error', 'Your claim code is four digits.'); return; }
    const btn = $('#signin-submit');
    btn.disabled = true;
    showError('signin-error', '');
    try {
      adoptPlayer(await api('signin', { initials, code }));
      toast(`Welcome back, ${player.initials}!`);
      go('arcade');
    } catch (ex) {
      showError('signin-error', msg(ex));
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
      adoptPlayer(me);
      if (me.banned) { toast(MESSAGES.BANNED, true, 6000); }
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
    const canPlay = credits > 0 || !!openPlay;
    const play = $('#arcade-play');
    play.disabled = !canPlay;
    play.classList.toggle('ready', canPlay);
    $('#arcade-hint').textContent = openPlay ? 'A play is waiting for you' : credits > 0 ? `${credits} ${credits === 1 ? 'play' : 'plays'} ready` : 'Insert a coin to play';
    $('#bundles-title').textContent = credits > 0 ? 'Top up' : 'Insert a coin';
  }
  $('#arcade-play').addEventListener('click', () => go('play'));

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
    if (result.player) adoptPlayer(result.player);
    if (location.hash !== '#arcade') location.hash = 'arcade';
    screens.forEach((s) => { s.hidden = s.dataset.screen !== 'arcade'; });
    current = 'arcade';
    $('#tabbar').hidden = false;
    renderArcade();
    refreshStats();
    const n = result.credits_added || 1;
    await coinDrop(n);
    const amount = BUNDLE_AMOUNT[result.bundle] || (n === 1 ? 2 : n === 3 ? 5 : n === 7 ? 10 : null);
    $('#thanks-text').textContent = amount
      ? `Your €${amount} is on its way to Presentation Brothers schools in Ghana and Nigeria.`
      : 'Your donation is on its way to Presentation Brothers schools in Ghana and Nigeria.';
    openSheet('thanks');
  }
  $('#thanks-play').addEventListener('click', () => { closeSheets(); go('play'); });

  // A coin goes into the slot at the top, a play token pops out of the tray at the bottom.
  async function coinDrop(n) {
    const coin = $('#coin'), slot = $('.slot'), token = $('#token'), val = $('#arcade-credits'), play = $('#arcade-play');
    const target = credits;
    const from = Math.max(0, target - n);
    play.classList.remove('ready');
    val.textContent = from;
    $('#arcade-hint').textContent = 'Coin in!';
    coin.classList.remove('drop'); void coin.offsetWidth; coin.classList.add('drop');
    await wait(620);
    slot.classList.add('glow');
    vibrate(30);
    await wait(260);
    slot.classList.remove('glow');
    coin.classList.remove('drop');
    const step = n > 3 ? 260 : 420;
    for (let i = 0; i < n; i++) {
      token.textContent = String(from + i + 1);
      token.classList.remove('out'); void token.offsetWidth; token.classList.add('out');
      await wait(step);
      val.textContent = from + i + 1;
      val.classList.remove('bump'); void val.offsetWidth; val.classList.add('bump');
      vibrate(15);
    }
    await wait(420);
    token.classList.remove('out');
    renderArcade();
  }

  // ---------------------------------------------------------------------------
  // Game: Stop the Light
  // ---------------------------------------------------------------------------
  const game = { state: 'idle', play: null, sweepStart: 0, raf: 0, trackW: 0, pending: null, lastScore: 0 };
  const marker = $('#marker'), track = $('#track');

  function posAt(ms, phase, speed) {
    let x = ms / speed + phase;
    x = x - 2 * Math.floor(x / 2);
    return x < 1 ? x : 2 - x;
  }
  const scoreFor = (pos) => Math.round(1000 * (1 - 2 * Math.abs(pos - 0.5)));
  function titleFor(s) {
    if (s >= 990) return 'Perfect run!';
    if (s >= 950) return 'Nearly perfect!';
    if (s >= 850) return 'Great tap!';
    if (s >= 600) return 'Good effort!';
    return 'Next time!';
  }
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
    $('#game').classList.remove('done');
    $('#game-msg').textContent = 'Ready?';
    $('#game-msg').classList.remove('go');
    $('#score-value').textContent = '0';
    $('.score').classList.remove('pop');
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
    if (game.state === 'countdown' || game.state === 'sweeping' || game.state === 'loading') return;
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
    if (game.state !== 'loading') return;
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
    game.lastScore = score;

    const el = $('#score-value');
    const t0 = performance.now(), dur = 850;
    await new Promise((resolve) => {
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(score * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    $('.score').classList.add('pop');
    const v = $('#verdict');
    v.textContent = verdictFor(score);
    v.classList.toggle('miss', score < 850);
    if (score >= 950) confetti.burst(score >= 990 ? 180 : 110);

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
      bestThisWeek = r.best_this_week;
    } catch (ex) {
      if (['ALREADY_SCORED', 'PLAY_NOT_FOUND', 'SCORE_MISMATCH', 'BAD_TAP'].includes(ex.code)) {
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
    $('#result-title').textContent = titleFor(score);
    $('#game').classList.add('done');
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
      again.textContent = 'Insert a coin';
      again.onclick = () => go('arcade');
    }
    $('#result').hidden = false;
    if (r && r.rank === 1) toast('You are top of the board!');
  }

  $('#result-share').addEventListener('click', async () => {
    const text = `I scored ${game.lastScore} in the PresLink Arcade. Can you beat me? Every play funds schools in Ghana and Nigeria.`;
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) { await navigator.share({ title: 'PresLink Arcade', text, url }); return; }
      await navigator.clipboard.writeText(text + ' ' + url);
      toast('Copied. Paste it anywhere!');
    } catch (_) { /* cancelled */ }
  });

  // ---------------------------------------------------------------------------
  // Leaderboard
  // ---------------------------------------------------------------------------
  $$('#screen-board .tab, [data-screen="board"] .tab').forEach((t) => t.addEventListener('click', () => {
    boardRole = t.dataset.role;
    loadBoard();
  }));
  function fmtWhen(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IE', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
  }
  let boardTouched = false;
  async function loadBoard() {
    if (!boardTouched && player) boardRole = player.role;
    boardTouched = true;
    $$('[data-screen="board"] .tab').forEach((x) => { x.classList.toggle('active', x.dataset.role === boardRole); x.setAttribute('aria-selected', x.dataset.role === boardRole); });
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
      const me = player && r.tag === player.tag;
      li.className = (me ? 'me ' : '') + (r.rank <= 3 ? 'r' + r.rank : '');
      li.innerHTML = `<span class="rank">${r.rank}</span>
        <span class="name">${esc(r.initials)}<span class="meta">${r.plays} ${Number(r.plays) === 1 ? 'play' : 'plays'} · ${fmtWhen(r.achieved_at)}${me ? ' · you' : ''}</span></span>
        <span class="pts">${r.score}</span>`;
      list.appendChild(li);
    });
    const w = $('#winners');
    w.innerHTML = '';
    $('#winners-empty').hidden = winners.length > 0;
    winners.forEach((r) => {
      const li = document.createElement('li');
      const d = new Date(r.week_start + 'T12:00:00');
      li.innerHTML = `<span>${d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })} · ${cap(r.role)}s</span><span class="name">${esc(r.initials)}</span><span class="pts">${r.score}</span>`;
      w.appendChild(li);
    });
  }

  // ---------------------------------------------------------------------------
  // You
  // ---------------------------------------------------------------------------
  function renderYou() {
    if (!player) return;
    $('#you-initials').textContent = player.initials;
    $('#you-role').textContent = cap(player.role);
    $('#you-code').textContent = player.claim_code;
    $('#you-credits').textContent = credits;
    $('#you-best').textContent = bestThisWeek == null ? '–' : bestThisWeek;
  }
  $('#you-signout').addEventListener('click', () => {
    if (!confirm(`Sign out ${player.initials} on this phone? You can sign back in with your letters and claim code ${player.claim_code}.`)) return;
    clearPlayer();
    toast('Signed out.');
    go('home');
  });

  // ---------------------------------------------------------------------------
  // Committee admin
  // ---------------------------------------------------------------------------
  let adminRole = 'student';
  let adminData = null;
  const adminCode = () => session.get(ADMIN_KEY) || '';

  function renderAdminEntry() {
    const code = adminCode();
    $('#admin-login').hidden = !!code;
    $('#admin-panel').hidden = !code;
    $('#admin-logout').hidden = !code;
    if (DEMO) $('#admin-code').placeholder = 'Demo code: PRESLINK';
    if (code) loadAdmin();
    else setTimeout(() => $('#admin-code').focus(), 60);
  }
  async function adminCall(op, extra = {}) {
    return api('admin', { code: adminCode(), op, ...extra });
  }
  $('#admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#admin-code').value.trim();
    showError('admin-error', '');
    try {
      const data = await api('admin', { code, op: 'overview' });
      session.set(ADMIN_KEY, code);
      $('#admin-code').value = '';
      adminData = data;
      renderAdminEntry();
    } catch (ex) {
      showError('admin-error', msg(ex));
    }
  });
  $('#admin-logout').addEventListener('click', () => { session.del(ADMIN_KEY); adminData = null; renderAdminEntry(); });

  async function loadAdmin() {
    try { adminData = await adminCall('overview'); }
    catch (ex) {
      if (ex.code === 'BAD_ADMIN' || ex.code === 'LOCKED' || ex.code === 'ADMIN_NOT_SET') { session.del(ADMIN_KEY); renderAdminEntry(); showError('admin-error', msg(ex)); return; }
      toast(msg(ex), true); return;
    }
    renderAdmin();
  }
  function renderAdmin() {
    const d = adminData;
    if (!d) return;
    const s = d.stats || {};
    $('#adm-raised').textContent = euro(s.total_raised_cents);
    $('#adm-payments').textContent = s.payments || 0;
    $('#adm-plays').textContent = s.plays || 0;
    $('#adm-players').textContent = s.players || 0;
    if (document.activeElement !== $('#adm-goal')) $('#adm-goal').value = Math.round((s.goal_cents || 0) / 100);
    if (document.activeElement !== $('#adm-prize')) $('#adm-prize').value = s.prize_text || '';
    $$('#admin-tabs .tab').forEach((x) => x.classList.toggle('active', x.dataset.role === adminRole));

    const tb = $('#adm-board tbody');
    tb.innerHTML = '';
    (d.board || []).filter((r) => r.role === adminRole).forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.rank}</td><td><b>${esc(r.initials)}</b>${r.banned ? ' <span class="muted">(banned)</span>' : ''}</td><td>${esc(r.claim_code)}</td><td>${r.score}</td><td>${r.plays}</td>
        <td><button class="mini" data-void="${esc(r.play_id)}">Void</button> <button class="mini ${r.banned ? 'undo' : ''}" data-ban="${esc(r.player_id)}" data-banned="${r.banned ? '1' : ''}">${r.banned ? 'Unban' : 'Ban'}</button></td>`;
      tb.appendChild(tr);
    });
    if (!tb.children.length) tb.innerHTML = '<tr><td colspan="6" class="muted">No scores yet this week.</td></tr>';

    const tw = $('#adm-winners tbody');
    tw.innerHTML = '';
    (d.past_winners || []).forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(r.week_start)}</td><td>${cap(r.role)}s</td><td><b>${esc(r.initials)}</b></td><td>${esc(r.claim_code)}</td><td>${r.score}</td>`;
      tw.appendChild(tr);
    });
    if (!tw.children.length) tw.innerHTML = '<tr><td colspan="5" class="muted">None yet.</td></tr>';

    const tp = $('#adm-payments tbody');
    tp.innerHTML = '';
    (d.payments || []).forEach((p) => {
      const tr = document.createElement('tr');
      const when = new Date(p.created_at).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      tr.innerHTML = `<td>${esc(when)}</td><td><b>${esc(p.initials)}</b></td><td>${p.credits}</td><td>${(p.amount_cents / 100).toFixed(2)}</td><td>${esc(p.email || '')}</td>`;
      tp.appendChild(tr);
    });
    if (!tp.children.length) tp.innerHTML = '<tr><td colspan="5" class="muted">No payments yet.</td></tr>';

    const blocked = d.blocked_by_committee || [];
    $('#adm-blocked-list').innerHTML = blocked.length
      ? 'Added by the committee: ' + blocked.map((b) => `<button class="mini undo" data-unblock="${esc(b)}">${esc(b)} ×</button>`).join(' ')
      : 'The built-in list of offensive names is active. Add more here.';

    const ul = $('#adm-banned');
    ul.innerHTML = '';
    (d.banned || []).forEach((p) => {
      const li = document.createElement('li');
      li.innerHTML = `<span><b>${esc(p.initials)}</b> · code ${esc(p.claim_code)}</span><button class="mini undo" data-ban="${esc(p.player_id)}" data-banned="1">Unban</button>`;
      ul.appendChild(li);
    });
    if (!ul.children.length) ul.innerHTML = '<li class="muted">Nobody is banned.</li>';
  }
  $$('#admin-tabs .tab').forEach((t) => t.addEventListener('click', () => { adminRole = t.dataset.role; renderAdmin(); }));
  $('#admin-panel').addEventListener('click', async (e) => {
    const v = e.target.closest('[data-void]');
    const b = e.target.closest('[data-ban]');
    const u = e.target.closest('[data-unblock]');
    try {
      if (v) {
        if (!confirm('Void this score? It disappears from the leaderboard.')) return;
        await adminCall('void', { play_id: v.dataset.void, voided: true, reason: 'committee' });
      } else if (b) {
        const banned = !b.dataset.banned;
        if (banned && !confirm('Ban this player? They will not be able to play and their scores are hidden.')) return;
        await adminCall('ban', { player_id: b.dataset.ban, banned });
      } else if (u) {
        await adminCall('block', { initials: u.dataset.unblock, block: false });
      } else return;
      toast('Done.');
      loadAdmin();
    } catch (ex) { toast(msg(ex), true); }
  });
  $('#admin-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const goal = Math.round(Number($('#adm-goal').value || 0) * 100);
    try {
      await adminCall('settings', { goal_cents: goal, prize_text: $('#adm-prize').value });
      toast('Saved.');
      loadAdmin();
      refreshStats();
    } catch (ex) { toast(msg(ex), true); }
  });
  $('#admin-block').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = $('#adm-block-initials').value.toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(initials)) { toast(MESSAGES.BAD_INITIALS, true); return; }
    try {
      await adminCall('block', { initials, block: true });
      $('#adm-block-initials').value = '';
      toast(`${initials} blocked.`);
      loadAdmin();
    } catch (ex) { toast(msg(ex), true); }
  });
  $('#admin-newcode').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newCode = $('#adm-newcode').value;
    if (newCode.length < 6) { toast(MESSAGES.CODE_TOO_SHORT, true); return; }
    try {
      await adminCall('set_code', { new_code: newCode });
      session.set(ADMIN_KEY, newCode);
      $('#adm-newcode').value = '';
      toast('Committee code changed.');
    } catch (ex) { toast(msg(ex), true); }
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function boot() {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    const cancelled = params.get('cancelled');
    if (sessionId || cancelled) history.replaceState(null, '', location.pathname + '#arcade');

    const pending = store.get(PENDING_KEY);
    if (pending && player && pending.player_id === player.id) {
      api('submit', pending).then(() => store.del(PENDING_KEY), (ex) => { if (ex.code !== 'NETWORK' && ex.code !== 'SERVER_ERROR') store.del(PENDING_KEY); });
    }
    if (DEMO) toast('Demo mode: payments and scores are simulated on this device.', false, 4000);

    render(location.hash.slice(1) || 'home');
    if (sessionId) await confirmPayment(sessionId);
    else if (cancelled) toast('Payment cancelled. Nothing was charged.');
  }
  boot();
})();
