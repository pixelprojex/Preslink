/* PresLink Arcade: front-end logic. No framework, no build step. */
(() => {
  'use strict';

  const CONFIG = window.PRESLINK_CONFIG || {};
  const DEMO = !CONFIG.SUPABASE_URL;
  const STORAGE_KEY = 'preslink.player';
  const SCHOOL_ASKED_KEY = 'preslink.schoolAsked';
  const CODE_SHOWN_KEY = 'preslink.codeShown';
  const PENDING_KEY = 'preslink.pendingScore';
  const ADMIN_KEY = 'preslink.adminCode';
  const SWEEP_GUARD_MS = 150;
  const ROUNDS = 3;
  const BUNDLES = { single: { amount: 2, credits: 1 }, triple: { amount: 5, credits: 3 }, seven: { amount: 10, credits: 7 } };
  const SCHOOL = /^[a-z0-9._%+'-]+@(pbccork\.ie|pbc-cork\.ie)$/;
  const BOARD_NAMES = { everyone: 'Everyone', student: 'Students', teacher: 'Teachers' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const euro = (cents) => '€' + Math.round((cents || 0) / 100).toLocaleString('en-IE');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vibrate = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* ignore */ } };
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // "JAK#2" -> JAK with a small #2
  const nameHtml = (display) => { const [l, n] = String(display || '').split('#'); return esc(l) + (n ? `<span class="sfx">#${esc(n)}</span>` : ''); };
  // A coloured circle with the letters; the tint comes from the letters so it is stable.
  const avatarHtml = (display, big) => { const l = String(display || '').split('#')[0]; let h = 0; for (const c of l) h = (h * 31 + c.charCodeAt(0)) % 5; return `<span class="avatar c${h + 1}${big ? ' big' : ''}">${nameHtml(display)}</span>`; };
  const boardName = (role) => BOARD_NAMES[role] || 'Everyone';

  const MESSAGES = {
    NETWORK: 'No connection. Check your signal and try again.',
    NO_CREDITS: 'No plays left.',
    BAD_INITIALS: 'Two or three letters, A to Z.',
    BLOCKED_INITIALS: 'Those letters are not allowed. Try others.',
    TAKEN: 'Those letters are taken. Try others.',
    BAD_ROLE: 'To join a school board, add your school email on the You tab.',
    BAD_SESSION: 'This payment link is not valid any more. Nothing was charged.',
    UNKNOWN_SESSION: 'This payment link is not valid any more. Nothing was charged.',
    BAD_GOAL: 'Enter a whole number of euro.',
    NO_PLAYER: 'No player with those letters.',
    BAD_SCHOOL_EMAIL: 'That is not a school email we recognise.',
    NEEDS_SCHOOL_EMAIL: 'Add your school email first.',
    BAD_SIGNIN: 'That name and code do not match.',
    LOCKED: 'Too many tries. Wait 15 minutes.',
    BANNED: 'This player has been removed by the committee.',
    STRIPE_NOT_CONFIGURED: 'Payments are not switched on yet.',
    NO_SITE_URL: 'Payments are not set up for this address yet.',
    PLAYER_NOT_FOUND: 'We could not find your player on this device. Tap Play to start fresh.',
    SCORE_MISMATCH: 'That score did not check out, so it was not saved.',
    ALREADY_SCORED: 'That play was already scored.',
    PLAY_NOT_FOUND: 'That play could not be found.',
    PLAY_VOID: 'That play was cancelled.',
    BAD_TAP: 'That play did not check out, so it was not saved.',
    STRIPE_ERROR: 'Stripe had a problem. Please try again.',
    BAD_ADMIN: 'Wrong committee code.',
    ADMIN_NOT_SET: 'No committee code has been set yet.',
    CODE_TOO_SHORT: 'Use at least 6 characters.',
    BAD_DATE: 'Use a date like 2026-12-12.',
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
  let best = null;
  let bestLight = null;
  let stats = null;
  let boardRole = 'everyone';
  let prevScreen = 'home';

  const savePlayer = () => store.set(STORAGE_KEY, player);
  const clearPlayer = () => { player = null; credits = 0; openPlay = null; best = null; bestLight = null; store.del(STORAGE_KEY); store.del(SCHOOL_ASKED_KEY); store.del(CODE_SHOWN_KEY); store.del('preslink.prevBest'); store.del('preslink.prevRank'); };
  function adoptPlayer(p) {
    player = { id: p.id, tag: p.tag, initials: p.initials, suffix: p.suffix || 1, display: p.display || p.initials, role: p.role || 'everyone', claim_code: p.claim_code, school_email: p.school_email || null };
    credits = p.credits || 0;
    openPlay = p.open_play || null;
    best = p.best != null ? p.best : (p.best_this_week == null ? null : p.best_this_week);
    bestLight = p.best_light == null ? null : p.best_light;
    savePlayer();
    renderHome();
  }
  const isSchool = () => !!player && (player.role === 'student' || player.role === 'teacher');

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

  // The first tap opens a small sheet asking for two or three letters; the player is created on submit.
  let pendingBundle = null;
  function ensurePlayer(bundle) {
    if (player) return true;
    pendingBundle = bundle || 'single';
    showError('name-error', '');
    nameInitials.set('');
    openSheet('name');
    setTimeout(() => nameInitials.input.focus(), 80);
    return false;
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
  $('#sheet-backdrop').addEventListener('click', () => { if ($('#sheet-code').hidden) closeSheets(); });
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sheet]');
    if (s) { e.preventDefault(); openSheet(s.dataset.sheet); return; }
    if (e.target.closest('[data-close]')) closeSheets();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });
  // Badge bubbles: tap a prize symbol to see what it means.
  const BADGE_TEXT = { light: ['Best light', 'Closest to 1,000 with a single light. A spot prize at the end.'], plays: ['Most plays', 'The most plays in the campaign. A spot prize at the end.'] };
  function closeBubbles() { $$('.bubble').forEach((b) => b.remove()); $$('.board li.bubbling').forEach((l) => l.classList.remove('bubbling')); }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-badge]');
    const had = !!$('.bubble');
    closeBubbles();
    if (!b) return;
    if (had && b.dataset.open === '1') { $$('[data-badge]').forEach((x) => { x.dataset.open = ''; }); return; }
    $$('[data-badge]').forEach((x) => { x.dataset.open = ''; });
    b.dataset.open = '1';
    const li = b.closest('li');
    const [title, text] = BADGE_TEXT[b.dataset.badge] || ['', ''];
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.setAttribute('role', 'status');
    bubble.innerHTML = `<b>${esc(title)}</b> · ${esc(text)}`;
    li.classList.add('bubbling');
    li.appendChild(bubble);
  });
  // Accordion rows: a title until tapped.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.acc > .cell');
    if (!btn) return;
    const acc = btn.parentElement;
    const open = !acc.classList.contains('open');
    acc.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  function showError(id, text) { const el = $('#' + id); el.textContent = text || ''; el.hidden = !text; }

  // Count a number up smoothly (used for the money raised and the score).
  function countUp(el, from, to, dur, fmt) {
    return new Promise((resolve) => {
      if (reduceMotion() || dur <= 0) { el.textContent = fmt(to); resolve(); return; }
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  const confetti = (() => {
    const canvas = $('#confetti');
    const ctx = canvas.getContext('2d');
    let parts = [], raf = 0;
    const colors = ['#1f9d5a', '#f6c21f', '#5b3a9a', '#ffffff', '#ffe08a'];
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
      if (reduceMotion()) return;
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
  const SCREENS = ['home', 'cabinet', 'play', 'board', 'prize', 'about', 'you', 'signin', 'admin'];
  const screens = $$('.screen');
  let current = 'home';
  function go(name) {
    if (location.hash === '#' + name) render(name);
    else location.hash = name;
  }
  function render(name) {
    if (!SCREENS.includes(name)) name = 'home';
    if (name === 'play' && !player) { go('home'); return; }

    if (name !== current) prevScreen = current;
    current = name;
    closeSheets();
    screens.forEach((s) => { s.hidden = s.dataset.screen !== name; });
    window.scrollTo(0, 0);
    const tab = { home: 'play', cabinet: 'play', play: 'play', signin: 'play', board: 'board', prize: 'board', about: 'about', you: 'you' }[name];
    $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('#tabbar').hidden = name === 'play' || name === 'admin' || name === 'cabinet';
    if (name !== 'play' && game.state !== 'idle' && game.state !== 'done') abandonGame();
    if (name === 'home') { renderHome(); refreshStats(); refreshMe(); }
    if (name === 'cabinet' && !cabinetBusy) { go('home'); return; }
    if (name === 'play') {
      // Only an explicit tap starts a play; arriving here by Back/Forward shows the last result or goes home.
      if (wantGame) { wantGame = false; startGame(); }
      else if (game.state !== 'done' || $('#result').hidden) { go('home'); return; }
    }
    if (name === 'board') loadBoard();
    if (name === 'prize') loadPrizes();
    if (name === 'about') refreshStats();
    if (name === 'you') openYou();
    if (name === 'signin') setTimeout(() => $('#signin-name').focus(), 60);
    if (name === 'admin') renderAdminEntry();
  }
  window.addEventListener('hashchange', () => render(location.hash.slice(1) || 'home'));
  document.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]');
    if (back) { e.preventDefault(); go(prevScreen === current ? 'home' : prevScreen); return; }
    const p = e.target.closest('.js-play');
    if (p) { e.preventDefault(); playOrBuy(); return; }
    const b = e.target.closest('[data-bundle]');
    if (b) { e.preventDefault(); buy(b.dataset.bundle); return; }
    const t = e.target.closest('[data-go]');
    if (t) { e.preventDefault(); go(t.dataset.go); }
  });
  $$('#tabbar button').forEach((b) => b.addEventListener('click', () => {
    const tab = b.dataset.tab;
    go(tab === 'play' ? 'home' : tab);
  }));

  // ---------------------------------------------------------------------------
  // Home and the money counter in the app bar
  // ---------------------------------------------------------------------------
  function renderHome() {
    const btn = $('#home-play');
    const canPlay = !!player && (credits > 0 || !!openPlay);
    btn.textContent = canPlay ? (openPlay ? 'Play · a play is waiting' : `Play · ${credits} left`) : 'Play · €2';
    btn.classList.toggle('ready', canPlay);
  }
  $('#home-play').addEventListener('click', playOrBuy);
  let wantGame = false;
  function startPlay() { wantGame = true; if (location.hash === '#play') { wantGame = false; game.state = 'idle'; startGame(); } else go('play'); }
  function playOrBuy() {
    if (player && (credits > 0 || openPlay)) startPlay();
    else buy('single');
  }

  let shownRaised = null; // whole euro shown in the app bar
  function showRing(cents, goalCents) {
    const ring = $('#ring-fg');
    const circ = 97.4;
    const pct = goalCents > 0 ? Math.min(1, cents / goalCents) : (cents > 0 ? 1 : 0);
    ring.setAttribute('stroke-dasharray', `${Math.max(pct > 0 ? 3 : 0, pct * circ).toFixed(1)} ${circ}`);
  }
  function showRaised(cents) {
    const el = $('#raised-n');
    const wrap = $('#raised');
    const target = Math.round((cents || 0) / 100);
    const fmt = (n) => '€' + n.toLocaleString('en-IE');
    if (shownRaised === null) {
      shownRaised = target;
      countUp(el, 0, target, target > 0 ? 1600 : 0, fmt);
      return;
    }
    if (target > shownRaised) {
      const plus = document.createElement('span');
      plus.className = 'raised-plus';
      plus.textContent = '+' + fmt(target - shownRaised);
      wrap.appendChild(plus);
      setTimeout(() => plus.remove(), 2000);
      wrap.classList.remove('up'); void wrap.offsetWidth; wrap.classList.add('up');
      setTimeout(() => wrap.classList.remove('up'), 2000);
      countUp(el, shownRaised, target, 1400, fmt);
    } else {
      el.textContent = fmt(target);
    }
    shownRaised = target;
  }

  const endsText = () => {
    const d = stats && stats.ends_on ? new Date(stats.ends_on + 'T12:00:00') : null;
    return d && !isNaN(d) ? 'Ends ' + d.toLocaleDateString('en-IE', { day: 'numeric', month: 'long' }) : '';
  };
  async function refreshStats() {
    try { stats = await rpc('stats'); } catch (_) { return; }
    showRaised(Number(stats.total_raised_cents || 0));
    showRing(Number(stats.total_raised_cents || 0), Number(stats.goal_cents || 0));
    const ends = endsText();
    $('#board-sub').textContent = ends ? `Prizes at the end · ${ends.replace('Ends', 'ends')}` : 'Prizes at the end';
    $('#prize-sub').textContent = ends ? `Awarded at the end · ${ends.replace('Ends', 'ends')}` : 'Awarded at the end of the campaign';
    const pz = stats.prizes || {};
    const put = (id, v, fallback) => { $(id).textContent = (v || '').trim() || fallback; };
    put('#prize-everyone', pz.everyone, 'To be announced');
    put('#prize-students', pz.students, 'To be announced');
    put('#prize-teachers', pz.teachers, 'To be announced');
    put('#prize-best-light', pz.best_light, 'Closest to 1,000 with one light.');
    put('#prize-most-plays', pz.most_plays, 'The biggest supporter.');
  }

  async function refreshMe() {
    if (!player) return;
    try {
      const me = await api('me', { player_id: player.id });
      adoptPlayer(me);
      if (me.banned) toast(MESSAGES.BANNED, true, 6000);
    } catch (ex) {
      if (ex.code === 'PLAYER_NOT_FOUND') { clearPlayer(); renderHome(); toast(MESSAGES.PLAYER_NOT_FOUND, true); }
    }
  }

  // ---------------------------------------------------------------------------
  // Paying: one tap to Stripe, and back into the cabinet
  // ---------------------------------------------------------------------------
  async function buy(bundle) {
    if (!ensurePlayer(bundle)) return;
    overlay('Opening secure checkout');
    try {
      const r = await api('checkout', { player_id: player.id, bundle });
      location.assign(r.url);
    } catch (ex) {
      overlay(null);
      toast(msg(ex), true);
    }
  }

  let cabinetBusy = false;
  async function confirmPayment(sessionId) {
    overlay('Confirming your payment');
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
      toast('We could not confirm the payment yet. If you were charged, your plays will appear shortly.', true, 6000);
      return;
    }
    if (result.player) adoptPlayer(result.player);
    const n = result.credits_added || 1;
    const b = BUNDLES[result.bundle];
    $('#cab-title').textContent = result.demo ? 'Demo play' : 'Thank you';
    $('#cab-text').textContent = result.demo
      ? 'No payment was taken: payments are not switched on yet.'
      : `Your €${b ? b.amount : 2} goes to Presentation Brothers schools in Ghana and Nigeria.`;
    cabinetBusy = true;
    await splashDone;
    go('cabinet');
    refreshStats();
    await wait(300);
    await coinDrop(n);
    await wait(1200);
    if (current === 'cabinet') startPlay();
    cabinetBusy = false;
  }
  $('#cab-play').addEventListener('click', () => startPlay());

  // A coin goes into the slot at the top, a play token pops out of the tray at the bottom.
  async function coinDrop(n) {
    const coin = $('#coin'), slot = $('#cab-slot'), panel = $('#cab-panel'), token = $('#token'), val = $('#cab-credits');
    const target = credits;
    const from = Math.max(0, target - n);
    val.textContent = from;
    $('#cab-hint').textContent = '';
    coin.classList.remove('drop'); void coin.offsetWidth; coin.classList.add('drop');
    await wait(1250);
    slot.classList.add('glow');
    panel.classList.remove('hit'); void panel.offsetWidth; panel.classList.add('hit');
    vibrate(30);
    await wait(500);
    slot.classList.remove('glow');
    coin.classList.remove('drop');
    const step = n > 3 ? 420 : 750;
    for (let i = 0; i < n; i++) {
      token.textContent = String(from + i + 1);
      token.classList.remove('out'); void token.offsetWidth; token.classList.add('out');
      await wait(step);
      val.textContent = from + i + 1;
      val.classList.remove('bump'); void val.offsetWidth; val.classList.add('bump');
      vibrate(15);
    }
    await wait(500);
    $('#cab-hint').textContent = n === 1 ? '1 play ready' : `${n} plays ready`;
  }

  // ---------------------------------------------------------------------------
  // Game: three lights, line each one up with the mark
  // ---------------------------------------------------------------------------
  const game = { state: 'idle', play: null, round: 0, taps: [], scores: [], sweepStart: 0, raf: 0, trackW: 0, pending: null, lastScore: 0 };
  const marker = $('#marker'), track = $('#track'), pin = $('#pin'), swatch = $('#swatch');

  function posAt(ms, phase, speed) {
    let x = ms / speed + phase;
    x = x - 2 * Math.floor(x / 2);
    return x < 1 ? x : 2 - x;
  }
  // Steep on purpose: 20 ms off at a one-second sweep is about 880, and 1,000 needs an error under a tenth of a millisecond.
  const roundScore = (pos, target) => Math.round(1000 * Math.pow(Math.max(0, 1 - Math.abs(pos - target) / 0.5), 3));
  function titleFor(s) {
    if (s >= 950) return 'Outstanding';
    if (s >= 900) return 'Superb';
    if (s >= 800) return 'Great run';
    if (s >= 600) return 'Good effort';
    return 'Next time';
  }
  function verdictFor(s) {
    if (s >= 990) return 'Perfect';
    if (s >= 950) return 'So close';
    if (s >= 850) return 'Nice';
    if (s >= 600) return 'Not bad';
    return 'Unlucky';
  }
  function setMarker(pos) { marker.style.transform = `translateX(${pos * game.trackW}px)`; }
  function setPin(target) {
    pin.style.left = (target * 100) + '%';
    swatch.style.background = `color-mix(in srgb, #ffe08a ${Math.round((1 - target) * 100)}%, #f26a1b)`;
  }
  function measure() { game.trackW = track.clientWidth; }
  window.addEventListener('resize', measure);

  function renderDots() {
    $$('#rounds .dot').forEach((d, i) => {
      d.className = 'dot';
      if (i < game.scores.length) d.classList.add('done', game.scores[i] < 850 ? 'low' : 'high');
      else if (i === game.round && (game.state === 'sweeping' || game.state === 'countdown')) d.classList.add('live');
    });
  }
  function resetGameUI() {
    $('#result').hidden = true;
    $('#game').hidden = false;
    $('#game').classList.remove('done');
    $('#game-msg').textContent = 'Ready';
    $('#game-msg').classList.remove('go');
    $('#score-value').textContent = '0';
    $('.score').classList.remove('pop');
    $('#verdict').textContent = '';
    $('#verdict').classList.remove('miss');
    $('#tap-hint').textContent = 'Tap when the light is on the mark';
    $('#tap-hint').classList.remove('live');
    $('#result-note').hidden = true;
    marker.classList.remove('hit', 'miss');
    game.round = 0; game.taps = []; game.scores = [];
    renderDots();
    measure();
    setMarker(0);
  }
  function updatePlayCredits() {
    $('#play-credits').textContent = `${credits} left`;
  }

  async function startGame() {
    if (!player) { go('home'); return; }
    if (game.state === 'countdown' || game.state === 'sweeping' || game.state === 'between' || game.state === 'loading') return;
    resetGameUI();
    updatePlayCredits();
    $('#tabbar').hidden = true;
    const g = $('#game');
    g.classList.remove('enter'); void g.offsetWidth; g.classList.add('enter');
    game.state = 'loading';
    // The play is fetched while the countdown runs, so the light starts the moment "Go" shows.
    const fetching = api('start', { player_id: player.id });
    fetching.catch(() => {});
    const m = $('#game-msg');
    for (const n of ['3', '2', '1']) {
      if (game.state !== 'loading') return;
      m.textContent = n;
      m.classList.remove('count'); void m.offsetWidth; m.classList.add('count');
      await wait(650);
    }
    let res;
    try {
      res = await fetching;
    } catch (ex) {
      game.state = 'idle';
      m.classList.remove('count');
      toast(ex.code === 'NO_CREDITS' ? MESSAGES.NO_CREDITS : msg(ex), ex.code !== 'NO_CREDITS');
      go('home');
      return;
    }
    if (game.state !== 'loading') return;
    if (!res.rounds || res.rounds.length !== ROUNDS) { game.state = 'idle'; toast(MESSAGES.SERVER_ERROR, true); go('home'); return; }
    game.play = res;
    credits = res.credits;
    openPlay = null;
    updatePlayCredits();
    game.state = 'countdown';
    setPin(res.rounds[0].target);
    renderDots();
    m.classList.remove('count');
    m.textContent = 'Go';
    m.classList.add('go');
    $('#tap-hint').classList.add('live');
    beginRound(0);
    setTimeout(() => { if (game.state === 'sweeping' && game.round === 0) { m.classList.remove('go'); m.textContent = 'Light 1 of 3'; } }, 700);
  }
  function beginRound(i) {
    game.round = i;
    const r = game.play.rounds[i];
    if (i > 0) { const m = $('#game-msg'); m.classList.remove('go', 'count'); m.textContent = `Light ${i + 1} of 3`; }
    setPin(r.target);
    marker.classList.remove('hit', 'miss');
    measure();
    game.state = 'sweeping';
    renderDots();
    game.sweepStart = performance.now();
    game.raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    if (game.state !== 'sweeping') return;
    const r = game.play.rounds[game.round];
    setMarker(posAt(now - game.sweepStart, r.phase, game.play.speed_ms));
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
    game.state = 'between';
    cancelAnimationFrame(game.raf);
    const r = game.play.rounds[game.round];
    const pos = posAt(ms, r.phase, game.play.speed_ms);
    const s = roundScore(pos, r.target);
    setMarker(pos);
    game.taps.push(ms);
    game.scores.push(s);
    afterRound(s);
  }
  $('#game').addEventListener('pointerdown', onTap);
  document.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'Enter') && game.state === 'sweeping') onTap(e);
  });

  async function afterRound(s) {
    const g = $('#game');
    g.classList.remove('flash'); void g.offsetWidth; g.classList.add('flash');
    marker.classList.add(s >= 850 ? 'hit' : 'miss');
    const pop = document.createElement('span');
    pop.className = 'light-pop' + (s >= 900 ? ' top' : '');
    pop.textContent = '+' + s;
    pop.style.left = marker.style.transform.replace(/[^0-9.]/g, '') + 'px';
    track.appendChild(pop);
    setTimeout(() => pop.remove(), 1200);
    vibrate(s >= 950 ? [20, 30, 20] : 25);
    renderDots();
    const el = $('#score-value');
    el.textContent = s;
    $('.score').classList.remove('pop'); void el.offsetWidth; $('.score').classList.add('pop');
    const v = $('#verdict');
    v.textContent = verdictFor(s);
    v.classList.toggle('miss', s < 850);
    $('#game-msg').textContent = '';
    await wait(1150);
    if (game.state !== 'between') return;
    if (game.round < ROUNDS - 1) {
      v.textContent = '';
      $('#score-value').textContent = '0';
      $('.score').classList.remove('pop');
      beginRound(game.round + 1);
    } else {
      finishPlay();
    }
  }

  async function finishPlay() {
    game.state = 'done';
    const score = Math.round(game.scores.reduce((a, b) => a + b, 0) / ROUNDS);
    game.lastScore = score;
    $('#tap-hint').textContent = '';
    $('#tap-hint').classList.remove('live');
    $('#verdict').textContent = '';
    const el = $('#score-value');
    await countUp(el, 0, score, 1200, String);
    $('.score').classList.add('pop');
    vibrate(score >= 900 ? [30, 40, 30, 40, 60] : 40);
    if (score >= 900) confetti.burst(score >= 950 ? 180 : 110);
    await wait(900);

    const payload = { player_id: player.id, play_id: game.play.play_id, score, taps: game.taps.slice() };
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
      best = r.best != null ? r.best : r.best_this_week;
      if (r.best_light != null) bestLight = Math.max(bestLight || 0, r.best_light);
    } catch (ex) {
      if (['ALREADY_SCORED', 'PLAY_NOT_FOUND', 'PLAY_VOID', 'SCORE_MISMATCH', 'BAD_TAP'].includes(ex.code)) {
        game.pending = null;
        store.del(PENDING_KEY);
        note = ex.code === 'ALREADY_SCORED' ? '' : MESSAGES[ex.code];
      } else {
        note = 'Could not save your score yet. Check your connection and tap Try again.';
      }
    }
    showResult(score, r, note);
  }

  function showResult(score, r, note) {
    updatePlayCredits();
    $('#game').classList.add('done');
    $('#game').hidden = true;
    $('#tabbar').hidden = false; // the game is over: let people move around again
    const kicker = $('#result-title');
    const prevBest = store.get('preslink.prevBest');
    const prevRank = store.get('preslink.prevRank');
    const rank = r ? (r.rank_all != null ? r.rank_all : r.rank) : null;
    const newBest = !!r && prevBest != null && score > prevBest;
    const movedUp = !!r && prevRank != null && rank != null && rank < prevRank;
    kicker.className = 'result-kicker' + (newBest ? ' best' : movedUp ? ' up' : '');
    kicker.textContent = newBest ? 'New best' : movedUp ? `Up ${prevRank - rank} ${prevRank - rank === 1 ? 'place' : 'places'}` : titleFor(score);
    if (r) { store.set('preslink.prevBest', best); if (rank != null) store.set('preslink.prevRank', rank); }
    $('#result-score').textContent = score;
    $('#result-rounds').innerHTML = '<span class="lbl">3 lights</span>' + game.scores.map((s) => `<span class="${s >= 850 ? 'top' : ''}">${s}</span>`).join('');
    $('#result-best').textContent = r && best != null ? best : '–';
    $('#result-best-sub').textContent = r && r.best_light != null ? `best light ${r.best_light}` : '';
    $('#result-rank').textContent = rank ? '#' + rank : '–';
    $('#result-rank-sub').textContent = '';
    $('#result-rank-sub').className = '';
    if (r && rank) showGap(rank);
    $('#result-school').hidden = !player || isSchool() || !!store.get(SCHOOL_ASKED_KEY) || !r;
    const n = $('#result-note');
    n.textContent = note || '';
    n.hidden = !note;
    const again = $('#result-again');
    $('#result-topup').hidden = true;
    if (game.pending) {
      again.textContent = 'Try again';
      again.onclick = () => { n.hidden = true; submitPending(score); };
    } else if (credits > 0) {
      again.textContent = `Play again · ${credits} left`;
      again.onclick = () => { game.state = 'idle'; startGame(); };
    } else {
      again.textContent = 'Play again · €2';
      again.onclick = () => buy('single');
      $('#result-topup').hidden = false;
    }
    $('#result').hidden = false;
    if (r && rank === 1) toast('You are top of the board');
    // First scored play: make sure the code that collects a prize is kept.
    if (r && player && !store.get(CODE_SHOWN_KEY)) showCodeSheet();
  }

  // How far to the next place: the nudge that makes "one more go" worth it.
  async function showGap(rank) {
    const el = $('#result-rank-sub');
    try {
      const rows = await rpc('leaderboard', { p_role: null });
      if (rank === 1) { el.textContent = 'Top of the board'; el.className = 'good'; return; }
      const above = rows.find((x) => x.rank === rank - 1);
      if (above) { el.textContent = `${above.score - best + 1} to #${rank - 1}`; el.className = ''; }
    } catch (_) { /* leave blank */ }
  }

  $('#result-share').addEventListener('click', async () => {
    const text = `I scored ${game.lastScore} in the PresLink Arcade. Can you beat me? Every play funds schools in Ghana and Nigeria.`;
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) { await navigator.share({ title: 'PresLink Arcade', text, url }); return; }
      await navigator.clipboard.writeText(text + ' ' + url);
      toast('Copied');
    } catch (_) { /* cancelled */ }
  });

  // ---------------------------------------------------------------------------
  // The code: shown once after the first play, saved as an image, copied, and always on the You tab
  // ---------------------------------------------------------------------------
  function showCodeSheet() {
    $('#code-name').innerHTML = nameHtml(player.display);
    $('#code-digits').textContent = player.claim_code;
    openSheet('code');
  }
  $('#code-done').addEventListener('click', () => { store.set(CODE_SHOWN_KEY, true); closeSheets(); });
  $('#you-copy').addEventListener('click', () => copyCode());
  $('#code-save').addEventListener('click', () => saveCodeImage());
  $('#you-save').addEventListener('click', () => saveCodeImage());
  async function copyCode() {
    if (!player) return;
    try { await navigator.clipboard.writeText(`PresLink Arcade: ${player.display} · code ${player.claim_code}`); toast('Copied'); }
    catch (_) { toast(`${player.display} · ${player.claim_code}`); }
  }
  // Draws a card with the name and code and hands it to the share sheet (Save Image on iPad and iPhone)
  // or downloads it.
  async function saveCodeImage() {
    if (!player) return;
    const W = 1080, H = 1080;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5b3a9a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    const r = 44, x = 80, y = 120, w = W - 160, h = H - 240;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, W / 2 - 70, 190, 140, 140); resolve(); };
      img.onerror = resolve;
      img.src = 'assets/cross.svg?v=10';
    });
    const font = (size, weight) => `${weight} ${size}px -apple-system, BlinkMacSystemFont, Inter, Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5b3a9a'; ctx.font = font(44, 700); ctx.fillText('PresLink Arcade', W / 2, 400);
    ctx.fillStyle = '#8e8e93'; ctx.font = font(30, 600); ctx.fillText('YOUR NAME', W / 2, 500);
    ctx.fillStyle = '#1c1c1e'; ctx.font = font(120, 800); ctx.fillText(player.display, W / 2, 620);
    ctx.fillStyle = '#8e8e93'; ctx.font = font(30, 600); ctx.fillText('YOUR CODE', W / 2, 720);
    ctx.fillStyle = '#1f9d5a'; ctx.font = font(150, 800); ctx.fillText(player.claim_code.split('').join(' '), W / 2, 860);
    ctx.fillStyle = '#48484a'; ctx.font = font(30, 500); ctx.fillText('Show these to the committee to collect a prize.', W / 2, 920);
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    const file = new File([blob], `preslink-${player.display.replace('#', '-')}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'PresLink Arcade code' }); return; }
    } catch (_) { return; /* cancelled */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    toast('Saved');
  }

  // ---------------------------------------------------------------------------
  // School: optional. A school email puts you on the Students or Teachers board.
  // ---------------------------------------------------------------------------
  function openSchool() {
    showError('school-error', '');
    $('#school-email').value = player && player.school_email ? player.school_email : '';
    openSheet('school');
    setTimeout(() => $('#school-email').focus(), 80);
  }
  $('#result-school').addEventListener('click', openSchool);
  $('#you-school').addEventListener('click', openSchool);
  $('#school-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!player) return;
    const email = $('#school-email').value.trim().toLowerCase();
    if (!SCHOOL.test(email)) { showError('school-error', MESSAGES.BAD_SCHOOL_EMAIL); return; }
    const btn = $('#school-submit');
    btn.disabled = true;
    try {
      adoptPlayer(await api('school', { player_id: player.id, email }));
      store.set(SCHOOL_ASKED_KEY, true);
      closeSheets();
      $('#result-school').hidden = true;
      renderYou();
      toast(`You are on the ${boardName(player.role)} board`);
    } catch (ex) {
      showError('school-error', msg(ex));
    } finally { btn.disabled = false; }
  });
  $$('#sheet-school [data-close]').forEach((b) => b.addEventListener('click', () => { store.set(SCHOOL_ASKED_KEY, true); $('#result-school').hidden = true; }));

  // ---------------------------------------------------------------------------
  // Leaderboard and prizes
  // ---------------------------------------------------------------------------
  $$('[data-screen="board"] .tab').forEach((t) => t.addEventListener('click', () => { boardRole = t.dataset.role; boardTouched = true; loadBoard(); }));
  function fmtWhen(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
  }
  let boardTouched = false;
  let boardSeq = 0;
  let spot = null;
  async function loadSpot() {
    try { spot = await rpc('spot_prizes'); } catch (_) { spot = null; }
    const l = spot && spot.best_light, p = spot && spot.most_plays;
    $('#spot-light').innerHTML = l ? `${nameHtml(l.initials)} · ${l.score}` : '–';
    $('#spot-plays').innerHTML = p ? `${nameHtml(p.initials)} · ${p.plays}` : '–';
    $('#lead-light').innerHTML = l ? `Leading: ${nameHtml(l.initials)} · ${l.score}` : '';
    $('#lead-plays').innerHTML = p ? `Leading: ${nameHtml(p.initials)} · ${p.plays} ${Number(p.plays) === 1 ? 'play' : 'plays'}` : '';
  }
  async function loadBoard() {
    if (!boardTouched) boardRole = isSchool() ? player.role : 'everyone';
    $$('[data-screen="board"] .tab').forEach((x) => { x.classList.toggle('active', x.dataset.role === boardRole); x.setAttribute('aria-selected', x.dataset.role === boardRole); });
    const list = $('#board-list');
    const seq = ++boardSeq;
    let rows = [];
    try {
      [rows] = await Promise.all([rpc('leaderboard', { p_role: boardRole === 'everyone' ? null : boardRole }), loadSpot(), refreshStats()]);
    } catch (ex) { toast(msg(ex), true); return; }
    if (seq !== boardSeq) return; // a newer tab tap is in flight
    list.innerHTML = '';
    $('#board-empty').hidden = rows.length > 0;
    const lightTag = spot && spot.best_light ? spot.best_light.tag : null;
    const playsTag = spot && spot.most_plays ? spot.most_plays.tag : null;
    rows.slice(0, 50).forEach((r) => {
      const li = document.createElement('li');
      const me = player && r.tag === player.tag;
      li.className = (me ? 'me ' : '') + (r.rank <= 3 ? 'r' + r.rank : '');
      const badges = [r.tag === lightTag ? ['i-flash', 'Best light', 'light'] : null, r.tag === playsTag ? ['i-repeat', 'Most plays', 'plays'] : null].filter(Boolean)
        .map(([i, t, k]) => `<button class="badge ${k}" type="button" data-badge="${k}" title="${t}" aria-label="${t}"><svg><use href="#${i}"/></svg></button>`).join('');
      li.innerHTML = `<span class="rank">${r.rank}</span>${avatarHtml(r.initials)}
        <span class="name"><span class="badges">${badges}${me ? '<span class="youtag">You</span>' : ''}</span><span class="meta">${r.plays} ${Number(r.plays) === 1 ? 'play' : 'plays'} · ${fmtWhen(r.achieved_at)}${r.tag === lightTag ? ' · best light' : ''}${r.tag === playsTag ? ' · most plays' : ''}</span></span>
        <span class="pts">${r.score}</span>`;
      li.addEventListener('click', (e) => { if (!e.target.closest('.badge')) li.classList.toggle('open'); });
      list.appendChild(li);
    });
  }
  async function loadPrizes() {
    refreshStats();
    loadSpot();
    for (const role of ['everyone', 'student', 'teacher']) {
      try {
        const rows = await rpc('leaderboard', { p_role: role === 'everyone' ? null : role });
        const top = rows[0];
        $('#lead-' + role).innerHTML = top ? `Leading: ${nameHtml(top.initials)} · ${top.score}` : '';
      } catch (_) { /* leave blank */ }
    }
  }

  // ---------------------------------------------------------------------------
  // You: letters, board, code
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
        b.classList.toggle('active', document.activeElement === input && i === Math.min(v.length, 2));
        b.classList.toggle('filled', !!v[i]);
      });
    };
    input.addEventListener('input', () => { sync(); const err = label.parentElement.querySelector('.field-error'); if (err) err.hidden = true; });
    input.addEventListener('focus', sync);
    input.addEventListener('blur', sync);
    label.addEventListener('click', () => input.focus());
    sync();
    return { input, value: () => input.value.toUpperCase(), set: (v) => { input.value = v || ''; sync(); } };
  }
  const editInitials = initialsField('edit-initials');
  const nameInitials = initialsField('name-initials');
  $('#name-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = nameInitials.value();
    if (!/^[A-Z]{2,3}$/.test(initials)) { showError('name-error', MESSAGES.BAD_INITIALS); nameInitials.input.focus(); return; }
    const btn = $('#name-submit');
    btn.disabled = true;
    try {
      adoptPlayer(await api('register', { role: 'everyone', initials }));
      store.del(SCHOOL_ASKED_KEY); store.del(CODE_SHOWN_KEY); store.del('preslink.prevBest'); store.del('preslink.prevRank');
      closeSheets();
      buy(pendingBundle || 'single');
    } catch (ex) {
      showError('name-error', msg(ex));
    } finally { btn.disabled = false; }
  });

  async function openYou() {
    $('#you-empty').hidden = !!player;
    $('#you-panel').hidden = !player;
    if (!player) return;
    renderYou();
    refreshMe().then(() => { $('#you-empty').hidden = !!player; $('#you-panel').hidden = !player; renderYou(); });
  }
  function renderYou() {
    if (!player) return;
    $('#you-name').innerHTML = nameHtml(player.display || player.initials);
    $('#you-avatar').outerHTML = avatarHtml(player.display || player.initials, true).replace('<span ', '<span id="you-avatar" ');
    const b = $('#you-board');
    b.textContent = isSchool() ? `${boardName(player.role)} board · ${player.school_email || 'school'}` : 'Everyone board';
    b.classList.toggle('school', isSchool());
    $('#you-school').hidden = isSchool();
    $('#you-code').textContent = player.claim_code;
    $('#you-credits').textContent = credits;
    $('#you-best').textContent = best == null ? '–' : best;
    $('#you-light').textContent = bestLight == null ? '–' : bestLight;
  }
  $('#you-edit').addEventListener('click', () => {
    const f = $('#edit-form');
    f.hidden = !f.hidden;
    if (!f.hidden) {
      editInitials.set(player.initials);
      showError('edit-error', '');
      setTimeout(() => editInitials.input.focus(), 50);
    }
  });
  $('#edit-cancel').addEventListener('click', () => { $('#edit-form').hidden = true; });
  $('#edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = editInitials.value();
    if (!/^[A-Z]{2,3}$/.test(initials)) { showError('edit-error', MESSAGES.BAD_INITIALS); return; }
    if (initials === player.initials) { $('#edit-form').hidden = true; return; }
    $('#edit-save').disabled = true;
    try {
      adoptPlayer(await api('update', { player_id: player.id, initials }));
      $('#edit-form').hidden = true;
      renderYou();
      toast(`You now play as ${player.display}`);
    } catch (ex) {
      showError('edit-error', msg(ex));
    } finally { $('#edit-save').disabled = false; }
  });
  $('#you-signout').addEventListener('click', () => {
    if (!confirm(`Sign out ${player.display} on this device? Sign back in with your letters and code ${player.claim_code}.`)) return;
    clearPlayer();
    renderHome();
    toast('Signed out');
    go('home');
  });

  $('#signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = $('#signin-name').value.toUpperCase().replace(/\s/g, '');
    const code = $('#signin-code').value.replace(/\D/g, '');
    if (!/^[A-Z]{2,3}(#\d{1,3})?$/.test(initials)) { showError('signin-error', 'Two or three letters, like JAK or JAK#2.'); return; }
    if (!/^\d{4}$/.test(code)) { showError('signin-error', 'Your code is four digits.'); return; }
    const btn = $('#signin-submit');
    btn.disabled = true;
    showError('signin-error', '');
    try {
      store.del(SCHOOL_ASKED_KEY); store.del('preslink.prevBest'); store.del('preslink.prevRank');
      adoptPlayer(await api('signin', { initials, code }));
      store.set(CODE_SHOWN_KEY, true);
      toast(`Welcome back, ${player.display}`);
      go('you');
    } catch (ex) {
      showError('signin-error', msg(ex));
    } finally { btn.disabled = false; }
  });

  // ---------------------------------------------------------------------------
  // Committee
  // ---------------------------------------------------------------------------
  let adminRole = 'everyone';
  let adminData = null;
  const adminCode = () => session.get(ADMIN_KEY) || '';

  function renderAdminEntry() {
    const code = adminCode();
    $('#admin-login').hidden = !!code;
    $('#admin-panel').hidden = !code;
    $('#admin-logout').hidden = !code;
    $('#admin-sub').textContent = code ? 'Money, boards, players and prizes.' : 'Committee code required.';
    if (DEMO) $('#admin-code').placeholder = 'Demo code: PRESLINK';
    if (code) loadAdmin();
    else setTimeout(() => $('#admin-code').focus(), 60);
  }
  const adminCall = (op, extra = {}) => api('admin', { code: adminCode(), op, ...extra });
  $('#admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#admin-code').value.trim();
    showError('admin-error', '');
    try {
      adminData = await api('admin', { code, op: 'overview' });
      session.set(ADMIN_KEY, code);
      $('#admin-code').value = '';
      renderAdminEntry();
    } catch (ex) { showError('admin-error', msg(ex)); }
  });
  $('#admin-logout').addEventListener('click', () => { session.del(ADMIN_KEY); adminData = null; renderAdminEntry(); });

  async function loadAdmin() {
    try { adminData = await adminCall('overview'); }
    catch (ex) {
      if (['BAD_ADMIN', 'LOCKED', 'ADMIN_NOT_SET'].includes(ex.code)) { session.del(ADMIN_KEY); renderAdminEntry(); showError('admin-error', msg(ex)); return; }
      toast(msg(ex), true); return;
    }
    renderAdmin();
  }
  const fmtDate = (iso, withTime) => new Date(iso).toLocaleString('en-IE', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' });
  const PRIZE_FIELDS = { everyone: '#adm-prize-everyone', students: '#adm-prize-students', teachers: '#adm-prize-teachers', best_light: '#adm-prize-best-light', most_plays: '#adm-prize-most-plays' };
  function renderAdmin() {
    const d = adminData;
    if (!d) return;
    const s = d.stats || {};
    $('#adm-raised').textContent = euro(s.total_raised_cents);
    $('#adm-payments').textContent = s.payments || 0;
    $('#adm-plays').textContent = s.plays || 0;
    $('#adm-players').textContent = s.players || 0;
    const roles = d.players_by_role || {};
    $('#adm-roles').textContent = `${roles.student || 0} students · ${roles.teacher || 0} teachers · ${roles.everyone || 0} with no school email`;
    const setIf = (sel, v) => { const el = $(sel); if (document.activeElement !== el) el.value = v; };
    setIf('#adm-goal', Math.round((s.goal_cents || 0) / 100));
    setIf('#adm-ends', s.ends_on || '');
    const pz = s.prizes || {};
    Object.entries(PRIZE_FIELDS).forEach(([k, sel]) => setIf(sel, pz[k] || ''));
    const goal = Number(s.goal_cents || 0);
    $('#adm-progress').value = goal > 0 ? Math.round((Number(s.total_raised_cents || 0) / goal) * 100) + '%' : '–';

    $$('#admin-tabs .tab').forEach((x) => x.classList.toggle('active', x.dataset.role === adminRole));
    const tb = $('#adm-board tbody');
    tb.innerHTML = '';
    const rows = (d.board || []).filter((r) => adminRole === 'everyone' || r.role === adminRole)
      .sort((a, b) => b.score - a.score || String(a.finished_at).localeCompare(String(b.finished_at)));
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${adminRole === 'everyone' ? (r.rank_all == null ? '–' : r.rank_all) : (r.rank == null ? '–' : r.rank)}</td><td><b>${esc(r.initials)}</b>${r.banned ? ' <span class="muted">(banned)</span>' : ''}</td><td>${esc(boardName(r.role))}</td><td>${esc(r.claim_code)}</td><td><b>${r.score}</b></td><td>${r.best_light == null ? '' : r.best_light}</td><td>${r.plays}</td><td>${esc(fmtDate(r.finished_at, true))}</td>
        <td><button class="mini" data-void="${esc(r.play_id)}">Void</button> <button class="mini ${r.banned ? 'undo' : ''}" data-ban="${esc(r.player_id)}" data-banned="${r.banned ? '1' : ''}">${r.banned ? 'Unban' : 'Ban'}</button> <button class="mini alt" data-reset="${esc(r.player_id)}">New name</button></td>`;
      tb.appendChild(tr);
    });
    if (!tb.children.length) tb.innerHTML = '<tr><td colspan="9" class="muted">No scores yet.</td></tr>';
    const sp = d.spot || {};
    // spot_prizes is a public read and carries no codes; the committee board rows do.
    const codeFor = (initials) => { const row = (d.board || []).find((r) => r.initials === initials); return row ? row.claim_code : '–'; };
    $('#adm-spot').textContent = `Best light: ${sp.best_light ? `${sp.best_light.initials} (${sp.best_light.score}, code ${codeFor(sp.best_light.initials)})` : 'nobody yet'} · Most plays: ${sp.most_plays ? `${sp.most_plays.initials} (${sp.most_plays.plays} plays, code ${codeFor(sp.most_plays.initials)})` : 'nobody yet'}`;

    const td = $('#adm-days tbody');
    td.innerHTML = '';
    (d.by_day || []).forEach((x) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(fmtDate(x.day + 'T12:00:00'))}</td><td>${x.payments}</td><td>${(x.amount_cents / 100).toFixed(2)}</td>`;
      td.appendChild(tr);
    });
    if (!td.children.length) td.innerHTML = '<tr><td colspan="3" class="muted">No payments yet.</td></tr>';

    const tp = $('#adm-payments tbody');
    tp.innerHTML = '';
    (d.payments || []).forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(fmtDate(p.created_at, true))}</td><td><b>${esc(p.initials)}</b></td><td>${p.credits}</td><td>${(p.amount_cents / 100).toFixed(2)}</td><td>${esc(p.email || '')}</td>`;
      tp.appendChild(tr);
    });
    if (!tp.children.length) tp.innerHTML = '<tr><td colspan="5" class="muted">No payments yet.</td></tr>';

    const blocked = d.blocked_by_committee || [];
    $('#adm-blocked-list').innerHTML = blocked.length
      ? 'Added by the committee: ' + blocked.map((b) => `<button class="mini undo" data-unblock="${esc(b)}">${esc(b)} ×</button>`).join(' ')
      : 'The built-in list of offensive names is active. Add more above.';

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
    const r = e.target.closest('[data-reset]');
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
      } else if (r) {
        if (!confirm('Give this player a new random name?')) return;
        const res = await adminCall('reset_name', { player_id: r.dataset.reset });
        toast(`Renamed to ${res.initials}`);
        loadAdmin();
        return;
      } else return;
      toast('Done');
      loadAdmin();
      if (!$('#adm-player').hidden) findPlayer();
    } catch (ex) { toast(ex.code === 'PLAYER_NOT_FOUND' ? MESSAGES.NO_PLAYER : msg(ex), true); }
  });
  $('#admin-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const goalEuro = Number(String($('#adm-goal').value || '0').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(goalEuro) || goalEuro < 0 || goalEuro > 1000000) { toast(MESSAGES.BAD_GOAL, true); return; }
    const goal = Math.round(goalEuro * 100);
    const prizes = {};
    Object.entries(PRIZE_FIELDS).forEach(([k, sel]) => { prizes[k] = $(sel).value.trim(); });
    try {
      await adminCall('settings', { goal_cents: goal, ends_on: $('#adm-ends').value || '', prizes });
      toast('Saved');
      loadAdmin();
      refreshStats();
    } catch (ex) { toast(msg(ex), true); }
  });
  $('#admin-find').addEventListener('submit', (e) => { e.preventDefault(); findPlayer(); });
  async function findPlayer() {
    const initials = $('#adm-find-initials').value.toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z]{2,3}(#\d{1,3})?$/.test(initials)) { toast('Type a name like JAK or JAK#2.', true); return; }
    const box = $('#adm-player');
    try {
      const res = await adminCall('player', { initials });
      const p = res.player;
      box.innerHTML = `<dl><dt>Name</dt><dd>${esc(p.initials)}${p.banned ? ' (banned)' : ''}${(res.others || []).length ? ` <span class="muted">(also: ${res.others.map(esc).join(', ')})</span>` : ''}</dd><dt>Board</dt><dd>${esc(boardName(p.role))}${p.school_email ? ` · ${esc(p.school_email)}` : ''}</dd><dt>Code</dt><dd>${esc(p.claim_code)}</dd><dt>Plays left</dt><dd>${p.credits}</dd><dt>First seen</dt><dd>${esc(fmtDate(p.created_at, true))}</dd><dt>Last seen</dt><dd>${esc(fmtDate(p.last_seen_at, true))}</dd></dl>
        <div class="table-wrap"><table class="table"><thead><tr><th>Play</th><th>Score</th><th></th></tr></thead><tbody>${(res.plays || []).map((x) => `<tr><td>${esc(fmtDate(x.started_at, true))}</td><td>${x.score == null ? '<span class="muted">open</span>' : '<b>' + x.score + '</b>'}${x.voided ? ' <span class="muted">(void)</span>' : ''}</td><td>${x.score == null ? '' : x.voided ? `<button class="mini undo" data-unvoid="${esc(x.play_id)}">Restore</button>` : `<button class="mini" data-void="${esc(x.play_id)}">Void</button>`}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No plays.</td></tr>'}</tbody></table></div>
        <p class="note">${(res.payments || []).length} payment(s) · €${((res.payments || []).reduce((s, x) => s + x.amount_cents, 0) / 100).toFixed(2)}</p>`;
      box.hidden = false;
    } catch (ex) { box.hidden = true; toast(ex.code === 'PLAYER_NOT_FOUND' ? MESSAGES.NO_PLAYER : msg(ex), true); }
  }
  $('#adm-player').addEventListener('click', async (e) => {
    const uv = e.target.closest('[data-unvoid]');
    if (!uv) return;
    try { await adminCall('void', { play_id: uv.dataset.unvoid, voided: false }); toast('Restored'); findPlayer(); loadAdmin(); }
    catch (ex) { toast(msg(ex), true); }
  });
  $('#admin-block').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = $('#adm-block-initials').value.toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(initials)) { toast('Three letters, A to Z.', true); return; }
    try {
      await adminCall('block', { initials, block: true });
      $('#adm-block-initials').value = '';
      toast(`${initials} blocked`);
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
      toast('Committee code changed');
    } catch (ex) { toast(msg(ex), true); }
  });
  $('#adm-csv').addEventListener('click', () => {
    const d = adminData;
    if (!d) return;
    const rows = [['when', 'name', 'board', 'bundle', 'plays', 'amount_eur', 'email', 'stripe_session']];
    (d.payments || []).forEach((p) => rows.push([p.created_at, p.initials, p.role || '', p.bundle, p.credits, (p.amount_cents / 100).toFixed(2), p.email || '', p.stripe_session_id]));
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'preslink-payments.csv';
    a.click();
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  // Splash: plays on every open and reload. A tap skips it.
  const splashDone = new Promise((resolve) => {
    const el = $('#splash');
    if (!el) { resolve(); return; }
    const finish = () => { el.classList.add('gone'); resolve(); };
    const returning = /session_id=|cancelled=/.test(location.search);
    if (reduceMotion() || returning) { finish(); return; }
    setTimeout(finish, 3300);
    el.addEventListener('click', finish);
  });

  async function boot() {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    const cancelled = params.get('cancelled');
    if (sessionId || cancelled) history.replaceState(null, '', location.pathname + '#home');

    const pending = store.get(PENDING_KEY);
    if (pending && player && pending.player_id === player.id && Array.isArray(pending.taps)) {
      api('submit', pending).then(() => store.del(PENDING_KEY), (ex) => { if (ex.code !== 'NETWORK' && ex.code !== 'SERVER_ERROR') store.del(PENDING_KEY); })
        .finally(() => { refreshMe(); refreshStats(); });
    } else if (pending) store.del(PENDING_KEY);
    if (DEMO) toast('Demo: payments and scores are simulated on this device.', false, 4000);

    renderHome();
    refreshStats();
    render(location.hash.slice(1) || 'home');
    if (sessionId) await confirmPayment(sessionId);
    else if (cancelled) toast('Payment cancelled. Nothing was charged.');
  }
  boot();
})();
