/* PresLink Arcade: front-end logic. No framework, no build step. */
(() => {
  'use strict';

  const CONFIG = window.PRESLINK_CONFIG || {};
  const DEMO = !CONFIG.SUPABASE_URL;
  const STORAGE_KEY = 'preslink.player';
  const SCHOOL_ASKED_KEY = 'preslink.schoolAsked';
  const CONTACT_ASKED_KEY = 'preslink.contactAsked';
  const CODE_SHOWN_KEY = 'preslink.codeShown';
  const HOW_SEEN_KEY = 'preslink.howSeen';
  const PENDING_KEY = 'preslink.pendingScore';
  const SWEEP_GUARD_MS = 60; // the server accepts taps from 60 ms into a sweep
  const ROUNDS = 3;
  const BUNDLES = { single: { amount: 2, credits: 1 }, triple: { amount: 5, credits: 3 }, seven: { amount: 10, credits: 7 } };
  const SCHOOL = /^[a-z0-9._%+'-]+@(pbccork\.ie|pbc-cork\.ie)$/;
  const BOARD_NAMES = { everyone: 'Everyone', student: 'Students', teacher: 'Teachers' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const euro = (cents) => '€' + Math.round((cents || 0) / 100).toLocaleString('en-IE');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "JAK", "jak 2", "JAK2" and "JAK#2" all mean the same name.
  const normTag = (raw) => String(raw || '').toUpperCase().replace(/[\s#]/g, '').replace(/^([A-Z]{2,3})(\d{1,3})$/, '$1#$2');
  const vibrate = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* ignore */ } };
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // "JAK#2" -> JAK with a small #2
  // Two people with the same initials: the second is the letters with a 2 in a bubble, never "FB#2" on screen.
  const nameHtml = (display) => { const [l, n] = String(display || '').split('#'); return esc(l) + (n ? `<span class="dup inline">${esc(n)}</span>` : ''); };
  // A coloured circle with the letters; the tint comes from the letters so it is stable. The bubble sits on the rim.
  // The leader line on a prize card: the word, the bubble, the name, the score on the right.
  const leadHtml = (initials, score, colour) => `<span class="lead-k">Leading</span>${avatarHtml(initials, false, colour)}<strong>${esc(String(score))}</strong>`;
  // Every tile has one of eight colours: the player's choice (1 to 8), or one picked from the letters.
  const TILE_COLOURS = 8;
  const tileColour = (letters, colour) => { const c = Number(colour) || 0; if (c >= 1 && c <= TILE_COLOURS) return c; let h = 0; for (const ch of String(letters)) h = (h * 31 + ch.charCodeAt(0)) % TILE_COLOURS; return h + 1; };
  const avatarHtml = (display, big, colour) => { const [l, n] = String(display || '').split('#'); return `<span class="avatar k${tileColour(l, colour)}${big ? ' big' : ''}">${esc(l)}${n ? `<span class="dup">${esc(n)}</span>` : ''}</span>`; };
  const boardName = (role) => BOARD_NAMES[role] || 'Everyone';
  const CREST_IMG = '<img class="crest-ic" src="assets/crest.svg?v=10" alt="">';

  const MESSAGES = {
    NETWORK: 'No connection. Check your signal and try again.',
    NO_CREDITS: 'No plays left.',
    BAD_INITIALS: 'Two or three initials, A to Z.',
    BLOCKED_INITIALS: 'Those initials are not allowed. Try others.',
    TAKEN: 'Those initials are taken. Try others.',
    BAD_ROLE: 'To join a school board, add your school email on the You tab.',
    BAD_SESSION: 'This payment link is not valid any more. Nothing was charged.',
    UNKNOWN_SESSION: 'This payment link is not valid any more. Nothing was charged.',
    BAD_GOAL: 'Enter a whole number of euro.',
    NO_PLAYER: 'No player with those initials.',
    BAD_SCHOOL_EMAIL: 'That is not a school email we recognise.',
    BAD_EMAIL: 'That does not look like an email address.',
    NEEDS_SCHOOL_EMAIL: 'Add your school email first.',
    BAD_SIGNIN: 'That name and code do not match.',
    LOCKED: 'Too many tries. Wait 15 minutes.',
    BANNED: 'This player has been removed by the committee.',
    STRIPE_NOT_CONFIGURED: 'Payments are not switched on yet.',
    BAD_STRIPE_KEY: 'That is not a Stripe secret key. It starts with sk_live_ or sk_test_.',
    STRIPE_KEY_REJECTED: 'Stripe did not accept that key.',
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
  // The next play, fetched ahead of the tap so the light moves on the first frame of the game.
  let nextPlay = null, prefetching = null;
  function prefetchPlay() {
    if (!player || nextPlay || prefetching || (credits <= 0 && !openPlay)) return;
    prefetching = api('start', { player_id: player.id })
      .then((res) => { if (res && res.rounds && res.rounds.length === ROUNDS) { nextPlay = res; credits = res.credits; openPlay = { play_id: res.play_id }; renderHome(); } })
      .catch(() => {})
      .finally(() => { prefetching = null; });
  }
  const clearPlayer = () => { player = null; credits = 0; openPlay = null; nextPlay = null; best = null; bestLight = null; store.del(STORAGE_KEY); store.del(SCHOOL_ASKED_KEY); store.del(CODE_SHOWN_KEY); store.del(CONTACT_ASKED_KEY); store.del('preslink.prevBest'); store.del('preslink.prevRank'); };
  function adoptPlayer(p) {
    player = { id: p.id, tag: p.tag, initials: p.initials, suffix: p.suffix || 1, display: p.display || p.initials, role: p.role || 'everyone', claim_code: p.claim_code, school_email: p.school_email || null, contact_email: p.contact_email || null, colour: Number(p.colour) || 0 };
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
  let pendingAfter = null; // 'school' when the initials sheet was opened from the join-your-board row
  function ensurePlayer(bundle, after) {
    if (player) return true;
    pendingBundle = bundle || 'single';
    $('#name-submit').textContent = { single: 'Play · €2', triple: '3 plays · €5', seven: '7 plays · €10' }[pendingBundle] || 'Play';
    pendingAfter = after || null;
    showError('name-error', '');
    nameInitials.set('');
    openSheet('name');
    nameInitials.focus();
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
    t.classList.toggle('top', !$('#sheet-backdrop').hidden); // over a sheet it sits under the app bar; otherwise above the tab bar
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
    $('#toast').classList.add('top'); // a toast already showing must not sit on the sheet's buttons
  }
  function closeSheets() {
    $('#toast').classList.remove('top'); // a toast that was held clear of a sheet drops back above the tab bar
    $$('.sheet').forEach((s) => { s.hidden = true; });
    $('#sheet-backdrop').hidden = true;
  }
  $('#sheet-backdrop').addEventListener('click', () => { if (!$('#sheet-contact').hidden) { skipContact(); return; } if ($('#sheet-code').hidden) closeSheets(); });
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sheet]');
    if (s) { e.preventDefault(); openSheet(s.dataset.sheet); return; }
    if (e.target.closest('[data-close]')) closeSheets();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });
  // How to play: shown by its rows, and once by itself before the very first light.
  function showIntro() {
    return new Promise((resolve) => {
      const sheet = $('#sheet-how');
      store.set(HOW_SEEN_KEY, true); // once per device, even if the page is reloaded with the sheet open
      openSheet('how');
      const obs = new MutationObserver(() => { if (sheet.hidden) { obs.disconnect(); store.set(HOW_SEEN_KEY, true); resolve(); } });
      obs.observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
    });
  }
  $('#how-done').addEventListener('click', () => { store.set(HOW_SEEN_KEY, true); sounds.prime(); closeSheets(); });
  // Arcade sounds: a soft tick on each tap, a two-note chime for a good light, a run of notes for a
  // new best. Built with the Web Audio API on the first tap, so nothing plays uninvited.
  let audio = null;
  function beep(freq, ms, gain, type, at) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime + (at || 0);
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g); g.connect(audio.destination);
      o.start(t); o.stop(t + ms / 1000 + 0.02);
    } catch (_) { /* no sound on this device */ }
  }
  const sounds = {
    // Made and woken on the tap that starts a play, so the first light's tap has nothing to set up.
    prime: () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (_) { /* no sound on this device */ } },
    tap: () => beep(640, 50, 0.04, 'square', 0),
    good: () => { beep(880, 140, 0.05, 'sine', 0); beep(1320, 220, 0.05, 'sine', 0.11); },
    best: () => [660, 880, 1100, 1320].forEach((f, i) => beep(f, 180, 0.05, 'sine', i * 0.1)),
  };
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
  const SCREENS = ['home', 'cabinet', 'play', 'board', 'prize', 'about', 'you', 'signin'];
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
    const tname = { board: 'Leaderboard', prize: 'Prizes', about: 'About', you: 'You', play: 'Play', signin: 'Sign in' }[name];
    document.title = tname ? `${tname} · PresLink Arcade` : 'PresLink Arcade';
    closeSheets();
    screens.forEach((s) => { s.hidden = s.dataset.screen !== name; });
    window.scrollTo(0, 0);
    const tab = { home: 'play', cabinet: 'play', play: 'play', signin: 'play', board: 'board', prize: 'board', about: 'about', you: 'you' }[name];
    $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const ti = ['play', 'board', 'about', 'you'].indexOf(tab);
    if (ti >= 0) $('#tabbar').style.setProperty('--i', ti);
    $('#tabbar').hidden = name === 'play' || name === 'cabinet';
    if (name !== 'play' && game.state !== 'idle' && game.state !== 'done') abandonGame();
    if (name === 'home') { renderHome(); refreshStats(); refreshMe(); sizeDemo(); }
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
    btn.textContent = canPlay ? `Play · ${credits + (openPlay ? 1 : 0)} left` : 'Play · €2';
    btn.classList.toggle('ready', canPlay);
    if (canPlay) prefetchPlay();
    renderHomeTop();
  }
  // The top three of the Everyone board on Home, from iPad width up (the card is hidden on a phone).
  let homeTopSeq = 0;
  function renderHomeTop() {
    const rows = boardCache.everyone;
    if (!rows) {
      const seq = ++homeTopSeq;
      rpc('board', { p_role: null }).then((r) => { if (seq !== homeTopSeq || boardCache.everyone) return; boardCache.everyone = r; renderHomeTop(); }).catch(() => {});
      return;
    }
    $('#home-top-list').innerHTML = rows.slice(0, 3).map((r) => `<li class="${player && r.tag === player.tag ? 'me ' : ''}r${r.rank}"><span class="rank r${r.rank}">${r.rank}</span>${avatarHtml(r.initials, false, r.colour)}<span class="name"><span class="meta">${r.plays} ${Number(r.plays) === 1 ? 'play' : 'plays'}</span></span><span class="pts">${r.score}</span></li>`).join('');
    $('#home-top-empty').hidden = rows.length > 0;
  }
  $('#home-play').addEventListener('click', playOrBuy);
  let wantGame = false;
  function startPlay() { sounds.prime(); wantGame = true; if (location.hash === '#play') { wantGame = false; game.state = 'idle'; startGame(); } else go('play'); }
  function playOrBuy() {
    if (player && (credits > 0 || openPlay)) startPlay();
    else buy('single');
  }

  // Rolling-digit counter, like a follower ticker: each changed digit slides up.
  // The app-bar counter is an odometer: every digit is a strip that rolls, and all strips roll in one
  // eased motion whose length grows with the jump (a €2 nudge takes about 0.7 s, a €40 catch-up about
  // two and a half), so it winds up, spins and settles as one movement, never a run of separate ticks.
  const fmtEuro = (n) => '€' + n.toLocaleString('en-IE');
  const fmtPlain = (n) => String(n);
  function odoStatic(el, value, fmt = fmtEuro) {
    const txt = fmt(value);
    el.innerHTML = Array.from(txt).map((c) => /\d/.test(c) ? `<span class="dg"><span class="strip"><span>${c}</span></span></span>` : `<span class="sep">${esc(c)}</span>`).join('');
    el.setAttribute('aria-label', txt);
  }
  function odoRoll(el, from, to, fmt = fmtEuro) {
    clearTimeout(el._settle);
    if (reduceMotion() || to <= from) { odoStatic(el, to, fmt); return; }
    const toS = String(to), L = toS.length;
    const fromS = String(from).padStart(L, ' ');
    const ms = Math.min(2600, 520 + 95 * (to - from));
    let html = fmt(0).replace(/[\d,]/g, '') ? '<span class="sep">€</span>' : '';
    const turns = [];
    for (let i = 0; i < L; i++) {
      if (i > 0 && (L - i) % 3 === 0) html += '<span class="sep">,</span>';
      const want = Number(toS.slice(0, i + 1)) - Number(fromS.slice(0, i + 1).trim() || '0'); // positions this column rolls
      const steps = want > 29 ? 20 + (want % 10) : want; // more than two turns looks the same as two, and ends on the same digit
      const end = Number(toS[i]);
      const seq = [];
      for (let k = steps; k >= 0; k--) seq.push(((end - k) % 10 + 10) % 10);
      if (fromS[i] === ' ') seq[0] = ''; // a new leading column rolls in from blank
      turns.push(steps);
      html += `<span class="dg"><span class="strip">${seq.map((d) => `<span>${d}</span>`).join('')}</span></span>`;
    }
    el.innerHTML = html;
    el.setAttribute('aria-label', fmt(to));
    void el.offsetWidth; // the strips sit on their first digit, then roll
    el.querySelectorAll('.strip').forEach((st, i) => { st.style.transitionDuration = ms + 'ms'; st.style.transform = `translateY(-${(turns[i] * 1.1).toFixed(2)}em)`; });
    el._settle = setTimeout(() => odoStatic(el, to, fmt), ms + 80);
  }
  let shownRaised = null; // whole euro shown in the app bar
  function showRing(cents, goalCents) {
    const ring = $('#ring-fg');
    const circ = 97.4;
    const pct = goalCents > 0 ? Math.min(1, cents / goalCents) : (cents > 0 ? 1 : 0);
    ring.setAttribute('stroke-dasharray', `${Math.max(pct > 0 ? 3 : 0, pct * circ).toFixed(1)} ${circ}`);
  }
  // The raised total only ever rolls up; a lower total (demo plays cleared) just sets.
  function showRaised(cents) {
    const el = $('#raised-n');
    const target = Math.round((cents || 0) / 100);
    const from = shownRaised;
    shownRaised = target;
    if (from === null) { odoRoll(el, 0, target); return; }
    if (target !== from) odoRoll(el, from, target);
  }
  const STATS_EVERY = 5000;
  let statsTimer = 0;
  const inPlay = () => ['loading', 'countdown', 'sweeping', 'between'].includes(game.state);
  function pollStats() {
    clearTimeout(statsTimer);
    if (document.hidden || inPlay()) return; // nothing moves on the page while the light sweeps
    statsTimer = setTimeout(() => { refreshStats().finally(pollStats); }, STATS_EVERY);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStats(); pollStats(); });
  window.addEventListener('offline', () => toast('No connection', true, 4000));
  window.addEventListener('online', () => { toast('Back online'); if (game.pending && game.state === 'done') submitPending(game.lastScore); else refreshStats(); });

  // The committee's words and photos (the console's Site content page). Empty fields keep the page's own.
  let contentKey = '';
  function applyContent(c) {
    const key = JSON.stringify(c || {});
    if (key === contentKey) return;
    contentKey = key;
    c = c || {};
    const hero = c.hero || {}, about = c.about || {}, contact = c.contact || {};
    $('.hero-h').textContent = hero.title || 'Stop the light.';
    $('.hero-p').textContent = hero.subtitle || 'Every play funds schools in Ghana and Nigeria.';
    const notice = $('#home-notice');
    notice.textContent = c.notice || ''; notice.hidden = !c.notice;
    $('#about-intro-title').textContent = about.intro_title || 'Run by students';
    $('#about-intro-text').textContent = about.intro_text || 'PresLink is the student-run charity of Presentation Brothers College, Cork. Every cent raised here, after card fees, goes to PresLink.';
    const box = $('#about-stories');
    if (!box._default) box._default = box.innerHTML;
    const stories = Array.isArray(about.stories) ? about.stories.filter((x) => x && (x.image || x.title || x.text)) : [];
    box.innerHTML = stories.length
      ? stories.map((x) => `<div class="card story">${x.image ? `<img class="photo" src="${esc(x.image)}" alt="${esc(x.title || '')}" loading="lazy">` : ''}<div class="story-body">${x.title ? `<h2>${esc(x.title)}</h2>` : ''}${x.text ? `<p>${esc(x.text)}</p>` : ''}</div></div>`).join('')
      : box._default;
    const cards = $$('#about-stories > .card');
    cards.forEach((el, i) => el.classList.toggle('wide', cards.length % 2 === 1 && i === cards.length - 1));
    const cc = $('#about-contact');
    const rows = [];
    const handle = String(contact.instagram || '').replace(/^@/, '');
    const site = String(contact.website || '');
    if (contact.email) rows.push(`<a class="cell" href="mailto:${esc(contact.email)}"><span>Email<small>${esc(contact.email)}</small></span><span class="chev">›</span></a>`);
    if (contact.phone) rows.push(`<a class="cell" href="tel:${esc(String(contact.phone).replace(/\s+/g, ''))}"><span>Phone<small>${esc(contact.phone)}</small></span><span class="chev">›</span></a>`);
    if (handle) rows.push(`<a class="cell" href="https://instagram.com/${esc(handle)}" target="_blank" rel="noopener"><span>Instagram<small>@${esc(handle)}</small></span><span class="chev">›</span></a>`);
    if (site) rows.push(`<a class="cell" href="${esc(/^https?:\/\//.test(site) ? site : 'https://' + site)}" target="_blank" rel="noopener"><span>Website<small>${esc(site.replace(/^https?:\/\//, ''))}</small></span><span class="chev">›</span></a>`);
    cc.innerHTML = rows.length ? `<h2 class="card-h">Contact</h2>${rows.join('')}` : '';
    cc.hidden = !rows.length;
    $('.story.school .photo').src = about.intro_image || 'assets/photo-school.svg';
    const photos = c.prize_photos || {};
    $$('.prize[data-prize]').forEach((el) => {
      const src = String(photos[el.dataset.prize] || ''), img = $('img', el);
      if (src) img.src = src; else img.removeAttribute('src');
      img.hidden = !src; el.classList.toggle('has-photo', !!src);
    });
  }
  const endsText = () => {
    const d = stats && stats.ends_on ? new Date(stats.ends_on + 'T12:00:00') : null;
    return d && !isNaN(d) ? 'Ends ' + d.toLocaleDateString('en-IE', { day: 'numeric', month: 'long' }) : '';
  };
  const closesText = () => endsText().replace('Ends ', '');
  let statsSeq = 0;
  async function refreshStats() {
    const seq = ++statsSeq;
    let fresh;
    try { fresh = await rpc('stats'); } catch (_) { return; }
    if (seq !== statsSeq) return; // a newer answer is on its way (e.g. right after a payment)
    stats = fresh;
    applyContent(stats.content || {});
    showRaised(Number(stats.total_raised_cents || 0));
    showRing(Number(stats.total_raised_cents || 0), Number(stats.goal_cents || 0));
    const ends = endsText();
    $('#board-sub').textContent = ends ? `Prizes at the end · ${ends.replace('Ends', 'ends')}` : 'Prizes at the end';
    const closes = closesText();
    $('#prize-sub').textContent = closes ? `Closes ${closes} · winners are emailed` : 'Winners are emailed at the close';
    $('#home-ends').textContent = closes ? `Closes ${closes}` : '';
    const pz = stats.prizes || {};
    const put = (id, v) => { const el = $(id); const t = String(v || '').trim(); el.textContent = t || 'To be announced'; el.classList.toggle('tba', !t); };
    put('#prize-everyone', pz.everyone);
    put('#prize-students', pz.students);
    put('#prize-teachers', pz.teachers);
    put('#prize-best-light', pz.best_light);
    put('#prize-most-plays', pz.most_plays);
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
    $('#cab-text').textContent = '';
    cabinetBusy = true;
    $('#cab-play').hidden = true;
    await splashDone;
    go('cabinet');
    refreshStats();
    await wait(120);
    prefetchPlay(); // ready before the Start button is
    await coinDrop(n);
    $('#cab-text').textContent = n === 1 ? '1 play added' : `${n} plays added`;
    // The player starts the play themselves: the button pops in and waits.
    const btn = $('#cab-play');
    btn.hidden = false; btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    cabinetBusy = false;
  }
  $('#cab-play').addEventListener('click', () => startPlay());

  // A coin goes into the slot at the top, a play token pops out of the tray at the bottom.
  // A coin goes into the slot at the top, a play token pops out of the tray at the bottom.
  async function coinDrop(n) {
    const coin = $('#coin'), slot = $('#cab-slot'), panel = $('#cab-panel'), token = $('#token'), val = $('#cab-credits');
    const target = credits;
    const from = Math.max(0, target - n);
    val.textContent = from;
    coin.classList.remove('drop'); void coin.offsetWidth; coin.classList.add('drop');
    await wait(760);
    slot.classList.add('glow');
    panel.classList.remove('hit'); void panel.offsetWidth; panel.classList.add('hit');
    vibrate(30);
    await wait(280);
    slot.classList.remove('glow');
    coin.classList.remove('drop');
    const step = n > 3 ? 240 : 420;
    for (let i = 0; i < n; i++) {
      token.textContent = String(from + i + 1);
      token.classList.remove('out'); void token.offsetWidth; token.classList.add('out');
      await wait(step);
      val.textContent = from + i + 1;
      val.classList.remove('bump'); void val.offsetWidth; val.classList.add('bump');
      vibrate(15);
    }
    await wait(150);
  }

  // ---------------------------------------------------------------------------
  // Game: three lights, line each one up with the mark
  // ---------------------------------------------------------------------------
  const game = { state: 'idle', play: null, round: 0, taps: [], scores: [], sweepStart: 0, trackW: 0, pending: null, lastScore: 0 };
  const marker = $('#marker'), track = $('#track'), pin = $('#pin'), swatch = $('#swatch');

  function posAt(ms, phase, speed) {
    let x = ms / speed + phase;
    x = x - 2 * Math.floor(x / 2);
    return x < 1 ? x : 2 - x;
  }
  // Mirrors round_score() in the database: a steep peak at the line on top of a gentle ramp across the
  // whole bar. The ramp is 300 on the line down to about 45 at the far end, so a tap anywhere earns a
  // readable number; the peak is 649 on the line and halves every 35 ms, so the high numbers are hard:
  // 10 ms off 866, 20 ms 767, 30 ms 685, 50 ms 562, 100 ms 396, 200 ms 290, half the bar 188, the far
  // end about 80. 999 needs the line itself; the cusp over the first 3 ms keeps it to one person.
  const roundScore = (pos, target, speed) => {
    const d = Math.abs(pos - target);
    return Math.min(999, Math.max(50, Math.round(50 + 300 * (1 - d) + 649 * Math.exp(-d / 0.05) - 12 * Math.sqrt(Math.min(d * speed, 3) / 3))));
  };
  // A light is a hit (green) from 700: within about 28 ms of the line.
  const HIT = 700;
  function titleFor(s) {
    if (s >= 850) return 'Outstanding';
    if (s >= 750) return 'Superb';
    if (s >= 600) return 'Great run';
    if (s >= 400) return 'Good effort';
    return 'Next time';
  }
  function verdictFor(s) {
    if (s >= 850) return 'Perfect';
    if (s >= HIT) return 'So close';
    if (s >= 500) return 'Nice';
    if (s >= 300) return 'Not bad';
    return 'Unlucky';
  }
  function setMarker(pos) { marker.style.transform = `translateX(${pos * game.trackW}px)`; }
  function setPin(target) {
    pin.style.left = (target * 100) + '%';
  }
  function measure() { game.trackW = track.clientWidth; }
  window.addEventListener('resize', measure);
  // The home preview light sweeps the width of its bar by a transform, whatever the screen width.
  const demoTrack = $('.demo-track');
  function sizeDemo() { if (demoTrack && demoTrack.clientWidth) demoTrack.style.setProperty('--sweep', (demoTrack.clientWidth - 10) + 'px'); }
  window.addEventListener('resize', sizeDemo);

  function renderDots() {
    $$('#rounds .dot').forEach((d, i) => {
      d.className = 'dot';
      d.textContent = i < game.scores.length ? game.scores[i] : i + 1;
      if (i < game.scores.length) d.classList.add('done', game.scores[i] < HIT ? 'low' : 'high');
      else if (i === game.round && (game.state === 'sweeping' || game.state === 'countdown')) d.classList.add('live');
    });
  }
  function resetGameUI() {
    $('#result').hidden = true;
    $('#game').hidden = false;
    $('#game').classList.remove('done');
    $('#game-msg').textContent = 'Ready';
    $('#game-msg').classList.remove('go', 'coach');
    $('#score-value').textContent = '';
    $('.score').classList.remove('pop', 'hit');
    $('#verdict').textContent = '';
    $('#coach').textContent = '';
    $('#verdict').classList.remove('miss');
    $('#tap-hint').textContent = tapWord();
    $('#tap-hint').classList.remove('live');
    $('#result-note').hidden = true;
    pin.style.opacity = '';
    marker.classList.remove('hit', 'miss', 'hide');
    game.round = 0; game.taps = []; game.scores = [];
    renderDots();
    measure();
    setMarker(0);
  }
  function updatePlayCredits() {
    $('#play-credits').textContent = `${credits} left`;
  }

  // The play is fetched before the tap (see prefetchPlay), so the light is moving on the first frame.
  async function startGame() {
    if (!player) { go('home'); return; }
    if (game.state === 'countdown' || game.state === 'sweeping' || game.state === 'between' || game.state === 'loading') return;
    resetGameUI();
    updatePlayCredits();
    $('#tabbar').hidden = true;
    const g = $('#game');
    g.classList.remove('enter'); void g.offsetWidth; g.classList.add('enter');
    game.state = 'loading';
    pollStats(); // pauses the counter refresh until the play is over
    let res = nextPlay; nextPlay = null;
    const fetching = res ? Promise.resolve(res) : api('start', { player_id: player.id });
    fetching.catch(() => {});
    const m = $('#game-msg');
    m.classList.remove('count', 'go', 'coach');
    m.textContent = 'Light 1 of 3';
    // The first time, the rules sit over the game until Got it is tapped; nothing moves meanwhile.
    if (!store.get(HOW_SEEN_KEY) && best == null) { await showIntro(); if (game.state !== 'loading') return; }
    try {
      res = await fetching;
    } catch (ex) {
      game.state = 'idle';
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
    $('#tap-hint').classList.add('live');
    beginRound(0);
  }
  // Each light starts sweeping the moment it is announced. This is the first version's loop: a
  // frame callback draws posAt(now - sweepStart), and a tap is timed by the same clock.
  function beginRound(i) {
    game.round = i;
    const r = game.play.rounds[i];
    const m = $('#game-msg');
    m.classList.remove('go', 'count', 'coach');
    m.textContent = `Light ${i + 1} of 3`;
    setPin(r.target);
    marker.classList.remove('hit', 'miss', 'hide');
    measure();
    game.state = 'sweeping';
    $('#game').classList.add('sweeping');
    renderDots();
    game.sweepStart = performance.now();
    game.frames = [];
    setMarker(posAt(0, r.phase, game.play.speed_ms));
    game.raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    if (game.state !== 'sweeping') return;
    const r = game.play.rounds[game.round];
    setMarker(posAt(now - game.sweepStart, r.phase, game.play.speed_ms));
    game.frames.push(now); // when each frame was drawn, so a tap can be matched to the frame that was on the glass
    if (game.frames.length > 12) game.frames.shift();
    game.raf = requestAnimationFrame(loop);
  }
  function abandonGame() {
    cancelAnimationFrame(game.raf);
    $('#game').classList.remove('sweeping');
    game.state = 'idle';
  }

  // Signed timing error in ms: positive = late (the light had passed the mark), negative = early.
  function signedError(ms, r) {
    let x = ms / game.play.speed_ms + r.phase;
    x = x - 2 * Math.floor(x / 2);
    const pos = x < 1 ? x : 2 - x;
    const dir = x < 1 ? 1 : -1;
    return Math.round((pos - r.target) * dir * game.play.speed_ms);
  }
  // One line of coaching after a light, so the next one can be better.
  function coachFor(s, err) {
    const a = Math.abs(err);
    if (s >= 850 || a <= 10) return '';
    if (a < 40) return err > 0 ? 'A touch late' : 'A touch early';
    return err > 0 ? 'Late · tap a bit sooner' : 'Early · tap a bit later';
  }
  // A tap counts at the moment the finger touched the glass, not when the browser got round to telling
  // the page (on a phone that is 20 to 50 ms later, during which the light has moved on). The event's own
  // timestamp is that moment where the browser gives a sane one. The frame on the glass then was the last
  // one drawn at least a refresh before it, so the light is put back to that frame and scored there: it
  // stops where it was seen, never ahead of the finger.
  const DISPLAY_LAG_MS = 16;
  function touchTime(e) {
    const now = performance.now();
    const ts = e && Number.isFinite(e.timeStamp) ? e.timeStamp : NaN;
    return ts > 0 && ts <= now + 5 && ts > now - 400 ? ts : now;
  }
  function frameSeenAt(t) {
    const fs = game.frames;
    for (let i = fs.length - 1; i >= 0; i--) if (fs[i] <= t - DISPLAY_LAG_MS) return fs[i];
    return fs.length ? fs[0] : t;
  }
  function onTap(e) {
    if (game.state !== 'sweeping') return;
    const ms = Math.round(frameSeenAt(touchTime(e)) - game.sweepStart);
    if (ms < SWEEP_GUARD_MS) return;
    if (e.cancelable) e.preventDefault();
    cancelAnimationFrame(game.raf);
    game.state = 'between';
    $('#game').classList.remove('sweeping');
    const r = game.play.rounds[game.round];
    const pos = posAt(ms, r.phase, game.play.speed_ms);
    const s = roundScore(pos, r.target, game.play.speed_ms);
    setMarker(pos); // the light stops, this frame, where it was when the finger landed
    marker.classList.add(s >= HIT ? 'hit' : 'miss');
    sounds.tap();
    game.taps.push(ms);
    game.scores.push(s);
    requestAnimationFrame(() => afterRound(s, signedError(ms, r))); // the score and the rest follow a frame later
  }
  $('#game').addEventListener('pointerdown', onTap);
  document.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'Enter') && game.state === 'sweeping') onTap(e);
  });
  // A keyboard plays the whole game: Space or Enter starts from Home or the cabinet, stops the light
  // (above), and plays again from the result. Buttons and fields keep their own keys.
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (e.metaKey || e.ctrlKey || e.altKey || /^(input|textarea|select|button|a)$/i.test(e.target.tagName)) return;
    if ($$('.sheet').some((s) => !s.hidden)) return;
    if (current === 'home' && player && (credits > 0 || openPlay)) { e.preventDefault(); playOrBuy(); }
    else if (current === 'cabinet' && !$('#cab-play').hidden) { e.preventDefault(); startPlay(); }
    else if (current === 'play' && game.state === 'done' && !$('#result').hidden) { e.preventDefault(); $('#result-again').click(); }
  });
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const tapWord = () => (finePointer.matches ? 'Click or press Space when the light is on the mark' : 'Tap when the light is on the mark');
  if (finePointer.matches) { const step = $('#how-title').closest('.sheet').querySelector('.steps li'); if (step) step.textContent = 'Click or press Space when the light is on the mark.'; }

  // After the stop: the light's number under the bar, a verdict, a line of coaching; then the next light.
  async function afterRound(s, err) {
    if (game.state !== 'between') return;
    if (s >= HIT) sounds.good();
    vibrate(s >= 850 ? [20, 30, 20] : 25);
    renderDots();
    const el = $('#score-value');
    el.textContent = s;
    $('.score').classList.toggle('hit', s >= HIT);
    $('.score').classList.remove('pop'); void el.offsetWidth; $('.score').classList.add('pop');
    const v = $('#verdict');
    v.textContent = verdictFor(s);
    v.classList.toggle('miss', s < HIT);
    $('#game-msg').textContent = '';
    $('#coach').textContent = coachFor(s, err);
    await wait(850);
    if (game.state !== 'between') return;
    if (game.round < ROUNDS - 1) {
      v.textContent = '';
      $('#coach').textContent = '';
      $('#score-value').textContent = '';
      $('.score').classList.remove('pop', 'hit');
      marker.classList.add('hide'); // the light blinks off, then reappears at the next start, already moving
      await wait(150);
      if (game.state !== 'between') return;
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
    $('#coach').textContent = 'Average of your 3 lights';
    const el = $('#score-value');
    await countUp(el, game.scores[ROUNDS - 1], score, 900, String); // from the last light's number, never through zero
    $('.score').classList.add('pop');
    vibrate(score >= 850 ? [30, 40, 30, 40, 60] : 40);
    if (score >= 850) confetti.burst(score >= 950 ? 180 : 110);
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
    if (r && r.score != null) { score = r.score; game.lastScore = score; } // the server's number is the score
    updatePlayCredits();
    refreshStats();
    pollStats();
    prefetchBoards();
    if (credits > 0) prefetchPlay(); // Play again starts on the first frame too
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
    if (newBest) sounds.best();
    kicker.textContent = newBest ? 'New best' : movedUp ? `Up ${prevRank - rank} ${prevRank - rank === 1 ? 'place' : 'places'}` : titleFor(score);
    if (r) { store.set('preslink.prevBest', best); if (rank != null) store.set('preslink.prevRank', rank); }
    countUp($('#result-score'), 0, score, 900, String);
    const lights = r && Array.isArray(r.rounds) && r.rounds.length === ROUNDS ? r.rounds.map((x) => Number(x)) : game.scores;
    const bestRound = Math.max(...lights);
    $('#result-rounds').innerHTML = '<span class="lbl">3 lights</span>' + lights.map((s) => `<span class="chip${s === bestRound ? ' top' : ''}">${s}</span>`).join('');
    $('#result-best').textContent = r && best != null ? best : '–';
    $('#result-rank').textContent = rank ? '#' + rank : '–';
    $('#result-rank-sub').textContent = '';
    $('#result-rank-sub').className = '';
    if (r && rank) showGap(rank);
    renderResultEmail();
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
    if (finePointer.matches) again.focus({ preventScroll: true }); // Enter or Space plays again
    // First scored play: ask where to send the news if they win, and nothing on top of it.
    const firstAsk = !!r && !!player && !player.contact_email && !store.get(CONTACT_ASKED_KEY);
    if (r && rank === 1 && !firstAsk) toast('You are top of the board');
    if (firstAsk) openContact(true);
  }
  // The reminder row on the result screen shows only while no email is on file.
  function renderResultEmail() { $('#result-email').hidden = !player || !!player.contact_email; }

  // How far to the next place: the nudge that makes "one more go" worth it.
  async function showGap(rank) {
    const el = $('#result-rank-sub');
    try {
      const rows = await rpc('board', { p_role: null });
      if (rank === 1) { el.textContent = 'Top of the board'; el.className = 'good'; return; }
      const above = rows.find((x) => x.rank === rank - 1);
      if (above) { el.textContent = `${above.score - best + 1} to #${rank - 1}`; el.className = ''; }
    } catch (_) { /* leave blank */ }
  }

  // ---------------------------------------------------------------------------
  // The code: shown once after the first play, saved as an image, copied, and always on the You tab
  // ---------------------------------------------------------------------------
  function showCodeSheet() {
    $('#code-name').innerHTML = nameHtml(player.display);
    $('#code-digits').textContent = player.claim_code;
    showTicket();
    openSheet('code');
  }
  $('#code-done').addEventListener('click', () => { store.set(CODE_SHOWN_KEY, true); closeSheets(); });
  $('#you-copy').addEventListener('click', () => copyCode());
  $('#code-save').addEventListener('click', () => saveCodeImage());
  $('#you-save').addEventListener('click', () => (IS_APPLE_MOBILE ? showCodeSheet() : saveCodeImage())); // iPhone: the sheet shows what to tap
  async function copyCode() {
    if (!player) return;
    try { await navigator.clipboard.writeText(`PresLink Arcade: ${player.display} · code ${player.claim_code}`); toast('Copied'); }
    catch (_) { toast(`${player.display} · ${player.claim_code}`); }
  }
  // The ticket: a 4:5 image with the PresLink cross, the light bar, the initials and the code, and
  // the words that matter: it is not a prize, it is the code that collects one if you win. Shown in
  // the code sheet and saved by the button below (where it goes depends on the device, see save).
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const crossImage = new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = 'assets/cross.svg?v=11'; });
  async function renderTicket() {
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const font = (size, weight) => `${weight} ${size}px -apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
    // green ground, white card
    ctx.fillStyle = '#1f9d5a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff'; roundRect(ctx, 56, 56, W - 112, H - 112, 52); ctx.fill();
    // cross and wordmark
    const img = await crossImage;
    if (img) ctx.drawImage(img, W / 2 - 72, 128, 144, 144);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#5b3a9a'; ctx.font = font(50, 800); ctx.fillText('PresLink Arcade', W / 2, 356);
    // the light bar: the game's own mark
    const bx = 240, by = 396, bw = 600, bh = 34;
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#fff3c4'); g.addColorStop(.45, '#ffd766'); g.addColorStop(.75, '#ffab45'); g.addColorStop(1, '#f26a1b');
    ctx.fillStyle = g; roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#1c1c1e'; roundRect(ctx, bx + bw * 0.62 - 3, by - 10, 6, bh + 20, 3); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1c1c1e'; ctx.lineWidth = 4; roundRect(ctx, bx + bw * 0.62 - 13, by - 6, 26, bh + 12, 13); ctx.fill(); ctx.stroke();
    // name
    ctx.fillStyle = '#8e8e93'; ctx.font = font(28, 700); ctx.fillText('Y O U R   I N I T I A L S', W / 2, 560);
    const [lt, sx] = String(player.display).split('#');
    ctx.fillStyle = '#1c1c1e'; ctx.font = font(170, 800); ctx.fillText(lt, W / 2, 712);
    if (sx) { // the same initials as someone else: a numbered bubble on the shoulder of the name
      const w = ctx.measureText(lt).width;
      const cx = W / 2 + w / 2 + 34, cy = 712 - 150;
      ctx.fillStyle = '#2a7de1'; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = font(52, 800); ctx.textBaseline = 'middle'; ctx.fillText(sx, cx, cy + 2); ctx.textBaseline = 'alphabetic';
    }
    // code
    ctx.fillStyle = '#8e8e93'; ctx.font = font(28, 700); ctx.fillText('Y O U R   C O D E', W / 2, 820);
    ctx.fillStyle = '#1f9d5a'; ctx.font = font(200, 800); ctx.fillText(player.claim_code.split('').join(' '), W / 2, 1000);
    // rule, then the condition first so nobody reads the ticket as a prize
    ctx.fillStyle = '#e5e5ea'; ctx.fillRect(160, 1064, W - 320, 3);
    ctx.fillStyle = '#1c1c1e'; ctx.font = font(36, 800); ctx.fillText('Show this to collect a prize.', W / 2, 1140);
    ctx.fillStyle = '#8e8e93'; ctx.font = font(28, 600); ctx.fillText(location.host || 'preslink.netlify.app', W / 2, 1200);
    return c;
  }
  // One rendered ticket per player, kept as a blob so the save button has nothing left to wait for.
  let ticket = null;
  async function ticketFor() {
    const key = `${player.display}|${player.claim_code}|${location.host}`;
    if (ticket && ticket.key === key) return ticket;
    const c = await renderTicket();
    const blob = await new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
    if (ticket) URL.revokeObjectURL(ticket.url);
    const file = new File([blob], `preslink-${player.display.replace('#', '-')}.png`, { type: 'image/png' });
    ticket = { key, blob, file, url: URL.createObjectURL(blob) };
    return ticket;
  }
  async function showTicket() {
    const img = $('#code-preview');
    if (!player) { img.hidden = true; return; }
    try { img.src = (await ticketFor()).url; img.hidden = false; } catch (_) { img.hidden = true; }
  }
  // Where the picture goes depends on the device, and only Apple's phones and tablets see a menu.
  // iPhone and iPad: a web page cannot write to Photos; Apple's one road in is the share sheet, where
  // Save Image is a single tap, so the button opens that and the line under it says what to tap.
  // Android: a plain download, which lands in Downloads and shows up in the Gallery. Mac or PC: the
  // Downloads folder. Nothing else pops up anywhere.
  const UA = navigator.userAgent || '';
  const IS_APPLE_MOBILE = /iP(hone|ad|od)/.test(UA) || (/Mac/.test(navigator.platform || '') && navigator.maxTouchPoints > 1);
  const IS_ANDROID = /Android/i.test(UA);
  const SAVE_LABEL = IS_APPLE_MOBILE ? 'Save to Photos' : IS_ANDROID ? 'Save to Gallery' : 'Save picture';
  const HINT_TAP = 'Then tap Save Image on the menu that opens.';
  const HINT_HOLD = 'Or hold your finger on the ticket, then tap Add to Photos.';
  $$('.save-btn').forEach((b) => { b.textContent = SAVE_LABEL; });
  $$('#save-hint, #contact-save-hint').forEach((h) => { h.textContent = HINT_TAP; h.hidden = !IS_APPLE_MOBILE; });
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function saveCodeImage() {
    if (!player) return;
    let t;
    try { t = await ticketFor(); } catch (_) { toast('Could not make the picture', true); return; }
    const canShareFile = !!(navigator.canShare && navigator.canShare({ files: [t.file] }));
    if (IS_APPLE_MOBILE) {
      if (!canShareFile) { holdHint(); return; }
      try { await navigator.share({ files: [t.file], title: 'PresLink Arcade' }); toast('Saved'); }
      catch (_) { holdHint(); /* the menu was closed without saving */ }
      return;
    }
    if ('download' in HTMLAnchorElement.prototype) {
      downloadBlob(t.blob, t.file.name);
      toast(IS_ANDROID ? 'Saved. Look in Gallery, under Download.' : 'Saved to your Downloads folder.');
      return;
    }
    if (canShareFile) { try { await navigator.share({ files: [t.file], title: 'PresLink Arcade' }); } catch (_) { /* cancelled */ } return; }
    window.open(t.url, '_blank');
  }
  // The share sheet was closed without saving: point at the other road into Photos, on the ticket itself.
  function holdHint() {
    if ($('#sheet-code').hidden) return;
    const h = $('#save-hint');
    h.hidden = false; h.textContent = HINT_HOLD;
  }

  // ---------------------------------------------------------------------------
  // If you win: an email to send the news to. A school email joins the Students or Teachers board.
  // ---------------------------------------------------------------------------
  // Whatever comes before the @ is fine; a school address is anything ending in the school's domain.
  const STUDENT_EMAIL = /^[^\s@]+@pbccork\.ie$/;
  const TEACHER_EMAIL = /^[^\s@]+@pbc-cork\.ie$/;
  const ANY_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isSchoolEmail = (v) => STUDENT_EMAIL.test(v) || TEACHER_EMAIL.test(v);
  const cleanEmail = (v) => String(v || '').replace(/\s+/g, '').toLowerCase(); // capitals and stray spaces are not mistakes
  function openContact(first) {
    if (!player) return;
    showError('contact-error', '');
    $('#contact-email').value = player.contact_email || '';
    $('#contact-school').value = player.school_email || '';
    $('#contact-pbc').checked = !!player.school_email;
    $('#contact-school-wrap').hidden = !player.school_email;
    $('#contact-close').hidden = !!first;
    $('#contact-code').textContent = player.claim_code;
    renderContactSaved();
    const closes = closesText();
    $('#contact-note').textContent = closes ? `Winners are emailed when the arcade closes on ${closes}.` : 'Winners are emailed when the arcade closes.';
    openSheet('contact');
    if (!first) setTimeout(() => $('#contact-email').focus(), 60);
  }
  ['#contact-email', '#contact-school'].forEach((sel) => $(sel).addEventListener('input', () => { $('#contact-submit').hidden = false; }));
  $('#contact-pbc').addEventListener('change', (e) => {
    $('#contact-submit').hidden = false; const on = e.target.checked; $('#contact-school-wrap').hidden = !on; showError('contact-error', ''); if (on) setTimeout(() => $('#contact-school').focus(), 60); });
  $('#contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!player) return;
    let email = cleanEmail($('#contact-email').value);
    const school = $('#contact-pbc').checked ? cleanEmail($('#contact-school').value) : '';
    if ($('#contact-pbc').checked && !school) { showError('contact-error', 'Add your school email, or switch that off.'); return; }
    if (school && !isSchoolEmail(school)) { showError('contact-error', 'That is not a school email.'); return; }
    if (!email && school) email = school; // the school address on its own is enough: it is where the news goes too
    if (!ANY_EMAIL.test(email)) { showError('contact-error', email ? MESSAGES.BAD_EMAIL : 'Add an email address.'); return; }
    const btn = $('#contact-submit');
    btn.disabled = true;
    try {
      adoptPlayer(await api('contact', { player_id: player.id, email, school_email: school || null }));
      store.set(CONTACT_ASKED_KEY, true);
      showError('contact-error', '');
      renderContactSaved(); // the sheet stays open: the code is the other thing to keep
      renderYou();
      renderResultEmail();
      toast(isSchool() ? `Saved. You are on the ${boardName(player.role)} board.` : 'Saved. We will email you if you win.');
    } catch (ex) {
      showError('contact-error', msg(ex));
    } finally { btn.disabled = false; }
  });
  function renderContactSaved() {
    const on = !!(player && player.contact_email);
    const line = $('#contact-saved');
    line.hidden = !on;
    line.textContent = on ? `Saved · ${player.contact_email}` : '';
    $('#contact-submit').textContent = on ? 'Update email' : 'Save email';
    $('#contact-submit').hidden = on; // comes back the moment something is edited
  }
  $('#contact-save').addEventListener('click', () => saveCodeImage());
  const skipContact = () => { store.set(CONTACT_ASKED_KEY, true); closeSheets(); renderResultEmail(); };
  $('#contact-skip').addEventListener('click', skipContact);
  $('#contact-close').addEventListener('click', closeSheets);
  $('#result-email').addEventListener('click', () => openContact(false));
  $('#you-email').addEventListener('click', () => openContact(false));

  // ---------------------------------------------------------------------------
  // Leaderboard and prizes
  // ---------------------------------------------------------------------------
  $$('[data-screen="board"] .tab').forEach((t) => t.addEventListener('click', () => { boardRole = t.dataset.role; boardTouched = true; loadBoard(); }));
  // A white thumb slides under the active tab instead of each tab repainting.
  $$('.segmented').forEach((seg) => {
    const tabs = $$('.tab, button', seg).filter((b) => !b.classList.contains('thumb'));
    if (!tabs.length) return;
    const thumb = document.createElement('span'); thumb.className = 'thumb'; thumb.setAttribute('aria-hidden', 'true'); seg.prepend(thumb);
    seg.style.setProperty('--n', tabs.length);
    const place = () => { const i = tabs.findIndex((b) => b.classList.contains('active') || b.classList.contains('on')); seg.style.setProperty('--i', Math.max(0, i)); thumb.style.opacity = i < 0 ? '0' : '1'; };
    place();
    new MutationObserver(place).observe(seg, { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  function fmtWhen(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
  }
  let boardTouched = false;
  let boardSeq = 0;
  let spot = null;
  // A wide screen shows all three boards side by side; the tabs and one list otherwise.
  const wideBoards = window.matchMedia('(min-width: 1100px)');
  const ROLES = ['everyone', 'student', 'teacher'];
  const boardList = (role) => (role ? $(`#boards-wide .board[data-role="${role}"]`) : $('#board-list'));
  const skeletonRows = () => Array.from({ length: 5 }, () => '<li class="sk" aria-hidden="true"><span class="rank"></span><span class="avatar"></span><span class="name"></span><span class="pts"></span></li>').join('');
  function showSkeleton(role) { const list = boardList(role); if (!list.children.length) list.innerHTML = skeletonRows(); }
  async function loadBoardsWide() {
    ROLES.forEach((role) => { if (boardCache[role]) renderBoard(boardCache[role], role); else showSkeleton(role); });
    const seq = ++boardSeq;
    let lists;
    try {
      lists = await Promise.all([...ROLES.map((role) => rpc('board', { p_role: role === 'everyone' ? null : role })), loadSpot(), refreshStats()]);
    } catch (ex) { toast(msg(ex), true); return; }
    if (seq !== boardSeq) return;
    ROLES.forEach((role, i) => {
      const rows = lists[i];
      const same = boardCache[role] && JSON.stringify(boardCache[role]) === JSON.stringify(rows);
      boardCache[role] = rows;
      const list = boardList(role);
      if (!same || !list.children.length || list.querySelector('.sk')) renderBoard(rows, role);
    });
  }
  const onWideChange = () => { if (current === 'board') loadBoard(); };
  if (wideBoards.addEventListener) wideBoards.addEventListener('change', onWideChange); else wideBoards.addListener(onWideChange);
  async function loadSpot() {
    try { spot = await rpc('spot_prizes'); } catch (_) { spot = null; }
    const l = spot && spot.best_light, p = spot && spot.most_plays;
    if ($('#spot-light')) $('#spot-light').innerHTML = l ? `${nameHtml(l.initials)} · ${l.score}` : '–';
    if ($('#spot-plays')) $('#spot-plays').innerHTML = p ? `${nameHtml(p.initials)} · ${p.plays}` : '–';
    $('#lead-light').innerHTML = l ? leadHtml(l.initials, l.score, l.colour) : '';
    $('#lead-plays').innerHTML = p ? leadHtml(p.initials, `${p.plays} ${Number(p.plays) === 1 ? 'play' : 'plays'}`, p.colour) : '';
  }
  async function loadBoard() {
    if (!boardTouched) boardRole = isSchool() ? player.role : 'everyone';
    $$('[data-screen="board"] .tab').forEach((x) => { x.classList.toggle('active', x.dataset.role === boardRole); x.setAttribute('aria-selected', x.dataset.role === boardRole); });
    if (wideBoards.matches) return loadBoardsWide();
    if (boardCache[boardRole]) renderBoard(boardCache[boardRole]); else showSkeleton(); // the last known rows at once; fresh ones follow
    const seq = ++boardSeq;
    let rows = [];
    try {
      [rows] = await Promise.all([rpc('board', { p_role: boardRole === 'everyone' ? null : boardRole }), loadSpot(), refreshStats()]);
    } catch (ex) { toast(msg(ex), true); return; }
    if (seq !== boardSeq) return; // a newer tab tap is in flight
    const same = boardCache[boardRole] && JSON.stringify(boardCache[boardRole]) === JSON.stringify(rows);
    boardCache[boardRole] = rows;
    if (!same || !$('#board-list').children.length || $('#board-list .sk')) renderBoard(rows);
  }
  setInterval(() => { if (current === 'board' && !document.hidden) loadBoard(); }, 20000); // the board stays live while it is open
  const boardCache = {};
  function prefetchBoards() {
    for (const role of ['everyone', isSchool() ? player.role : null]) {
      if (role) rpc('board', { p_role: role === 'everyone' ? null : role }).then((rows) => { boardCache[role] = rows; }).catch(() => {});
    }
  }
  function renderBoard(rows, role) {
    const list = boardList(role);
    const empty = role ? list.nextElementSibling : $('#board-empty');
    list.innerHTML = '';
    empty.hidden = rows.length > 0;
    const lightTag = spot && spot.best_light ? spot.best_light.tag : null;
    const playsTag = spot && spot.most_plays ? spot.most_plays.tag : null;
    rows.slice(0, 50).forEach((r) => {
      const li = document.createElement('li');
      const me = player && r.tag === player.tag;
      li.className = (me ? 'me ' : '') + (r.rank <= 3 ? 'r' + r.rank : '');
      const badges = [r.tag === lightTag ? ['i-flash', 'Best light', 'light'] : null, r.tag === playsTag ? ['i-repeat', 'Most plays', 'plays'] : null].filter(Boolean)
        .map(([i, t, k]) => `<button class="badge ${k}" type="button" data-badge="${k}" title="${t}" aria-label="${t}"><svg><use href="#${i}"/></svg></button>`).join('');
      li.innerHTML = `<span class="rank${r.rank <= 3 ? ' r' + r.rank : ''}">${r.rank}</span>${avatarHtml(r.initials, false, r.colour)}
        <span class="name"><span class="badges">${badges}${me ? '<span class="youtag">You</span>' : ''}</span><span class="meta">${r.plays} ${Number(r.plays) === 1 ? 'play' : 'plays'}</span></span>
        <span class="pts">${r.score}</span>`;
      list.appendChild(li);
    });
  }
  // The leader on a prize card opens the board it leads.
  $('[data-screen="prize"]').addEventListener('click', (e) => {
    const lead = e.target.closest('.prize-lead');
    if (!lead || !lead.children.length) return;
    const key = lead.closest('.prize').dataset.prize;
    boardRole = key === 'students' ? 'student' : key === 'teachers' ? 'teacher' : 'everyone';
    boardTouched = true;
    go('board');
  });
  async function loadPrizes() {
    refreshStats();
    loadSpot();
    await Promise.all(['everyone', 'student', 'teacher'].map(async (role) => {
      try {
        const rows = await rpc('board', { p_role: role === 'everyone' ? null : role });
        boardCache[role] = rows;
        const top = rows[0];
        $('#lead-' + role).innerHTML = top ? leadHtml(top.initials, top.score, top.colour) : '';
      } catch (_) { /* leave blank */ }
    }));
  }

  // ---------------------------------------------------------------------------
  // You: letters, board, code
  // ---------------------------------------------------------------------------
  // Letters are picked on an on-screen pad, so no system keyboard ever covers the boxes. Tap a box to
  // clear that letter (the next letter goes there); a hardware keyboard works too.
  let liveLetters = null;
  function initialsField(id) {
    const root = $('#' + id);
    const boxes = $$('.box', root);
    const pad = root.parentElement.querySelector('.letterpad');
    const letters = ['', '', ''];
    let active = 0;
    pad.innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((ch) => `<button class="key" type="button" data-key="${ch}">${ch}</button>`).join('')
      + '<button class="key back" type="button" data-key="back" aria-label="Delete"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="m18 9-6 6M12 9l6 6"/></svg></button>';
    const firstEmpty = () => letters.findIndex((l) => !l);
    const paint = () => {
      boxes.forEach((b, i) => {
        b.textContent = letters[i]; b.classList.toggle('filled', !!letters[i]); b.classList.toggle('active', i === active);
        b.setAttribute('aria-label', letters[i] ? `Initial ${i + 1}: ${letters[i]}. Tap to clear` : `Initial ${i + 1}${i === 2 ? ', optional' : ''}, empty`);
      });
      pad.classList.toggle('full', active < 0);
      $$('.key:not(.back)', pad).forEach((k) => k.setAttribute('aria-disabled', active < 0 ? 'true' : 'false'));
    };
    const clearError = () => { const err = root.parentElement.querySelector('.field-error'); if (err) err.hidden = true; };
    const type = (ch) => { if (active < 0) return; letters[active] = ch; active = firstEmpty(); paint(); clearError(); };
    const back = () => { let i = 2; while (i >= 0 && !letters[i]) i--; if (i < 0) return; letters[i] = ''; active = firstEmpty(); paint(); };
    boxes.forEach((b, i) => b.addEventListener('click', () => { letters[i] = ''; active = i; paint(); }));
    pad.addEventListener('click', (e) => {
      const k = e.target.closest('.key'); if (!k) return;
      if (k.dataset.key === 'back') back(); else type(k.dataset.key);
      if (e.detail > 0) k.blur(); // a tapped key gives focus back, so Enter on a hardware keyboard submits; keyboard users keep their place
    });
    const field = {
      type, back,
      value: () => letters.map((l) => l || ' ').join('').trimEnd(), // an empty middle box stays visible to the validator
      set: (v) => { const s = (v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); for (let i = 0; i < 3; i++) letters[i] = s[i] || ''; active = firstEmpty(); paint(); },
      focus: () => { liveLetters = field; setTimeout(() => { const b = boxes[Math.max(active, 0)]; if (b && b.getClientRects().length) b.focus({ preventScroll: true }); }, 80); },
      visible: () => root.getClientRects().length > 0,
      el: root,
    };
    paint();
    return field;
  }
  document.addEventListener('keydown', (e) => {
    const f = liveLetters;
    if (!f || !f.visible() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
    const open = $$('.sheet').find((s) => !s.hidden);
    if (open && !open.contains(f.el)) return; // another sheet sits on top of the letters
    if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); f.type(e.key.toUpperCase()); }
    else if (e.key === 'Backspace') { e.preventDefault(); f.back(); }
    else if (e.key === 'Enter') {
      if (e.target !== document.body && !e.target.closest('.initials .box')) return; // Close, Cancel, tab bar and pad keys keep their own click
      const form = f.el.closest('form'); if (form) { e.preventDefault(); form.requestSubmit(); }
    }
  });
  // Sheets with a text field (school email) sit above the keyboard: iOS keeps the layout viewport
  // and shrinks the visual one, so the gap between them is the keyboard height.
  const vv = window.visualViewport;
  function fitSheets() {
    if (!vv) return;
    const lift = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', lift + 'px');
  }
  if (vv) { vv.addEventListener('resize', fitSheets); vv.addEventListener('scroll', fitSheets); }
  const editInitials = initialsField('edit-initials');
  const nameInitials = initialsField('name-initials');
  $('#name-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = nameInitials.value();
    if (!/^[A-Z]{2,3}$/.test(initials)) { showError('name-error', MESSAGES.BAD_INITIALS); return; }
    const btn = $('#name-submit');
    btn.disabled = true;
    try {
      adoptPlayer(await api('register', { role: 'everyone', initials }));
      store.del(SCHOOL_ASKED_KEY); store.del(CODE_SHOWN_KEY); store.del(CONTACT_ASKED_KEY); store.del('preslink.prevBest'); store.del('preslink.prevRank');
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
    $('#you-avatar').outerHTML = avatarHtml(player.display || player.initials, true, player.colour).replace('<span ', '<span id="you-avatar" ');
    const b = $('#you-board');
    b.innerHTML = isSchool() ? `${CREST_IMG}${esc(boardName(player.role))} board<span class="profile-mail">${esc(player.school_email || '')}</span>` : 'Everyone board';
    b.classList.toggle('school', isSchool());
    const eff = tileColour((player.display || player.initials).split('#')[0], player.colour);
    $$('#you-colours .sw').forEach((x) => { const on = Number(x.dataset.colour) === eff; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    $('#you-email-text').textContent = player.contact_email || 'Add your email · so we can tell you if you win';
    $('#you-code').textContent = player.claim_code;
    $('#you-credits').textContent = credits;
    $('#you-best').textContent = best == null ? '–' : best;
    $('#you-light').textContent = bestLight == null ? '–' : bestLight;
  }
  // A tap on a swatch colours the tile everywhere: the boards show it on their next load.
  $('#you-colours').addEventListener('click', async (e) => {
    const sw = e.target.closest('.sw');
    if (!sw || !player) return;
    try {
      adoptPlayer(await api('colour', { player_id: player.id, colour: Number(sw.dataset.colour) }));
      Object.keys(boardCache).forEach((k) => { delete boardCache[k]; });
      renderYou();
    } catch (ex) { toast(msg(ex), true); }
  });
  $('#you-edit').addEventListener('click', () => {
    const f = $('#edit-form');
    f.hidden = !f.hidden;
    if (!f.hidden) {
      editInitials.set(player.initials);
      showError('edit-error', '');
      editInitials.focus();
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
    if (!confirm(`Sign out ${player.display} on this device? Sign back in with your initials and code ${player.claim_code}.`)) return;
    clearPlayer();
    renderHome();
    toast('Signed out');
    go('home');
  });

  $('#signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = normTag($('#signin-name').value);
    const code = $('#signin-code').value.replace(/\D/g, '');
    if (!/^[A-Z]{2,3}(#\d{1,3})?$/.test(initials)) { showError('signin-error', 'Two or three letters, like JAK. A second JAK types JAK 2.'); return; }
    if (!/^\d{4}$/.test(code)) { showError('signin-error', 'Your code is four digits.'); return; }
    const btn = $('#signin-submit');
    btn.disabled = true;
    showError('signin-error', '');
    try {
      store.del(SCHOOL_ASKED_KEY); store.del('preslink.prevBest'); store.del('preslink.prevRank');
      adoptPlayer(await api('signin', { initials, code }));
      store.set(HOW_SEEN_KEY, true); // they have played before
      store.set(CODE_SHOWN_KEY, true);
      toast(`Welcome back, ${player.display}`);
      go('you');
    } catch (ex) {
      showError('signin-error', msg(ex));
    } finally { btn.disabled = false; }
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  // Splash: plays on every open and reload. A tap skips it.
  const splashDone = new Promise((resolve) => {
    const el = $('#splash');
    if (!el) { resolve(); return; }
    const finish = () => { el.classList.add('gone'); resolve(); };
    const returning = /session_id=|cancelled=/.test(location.search) || document.documentElement.classList.contains('no-splash');
    if (returning) { finish(); return; }
    setTimeout(finish, reduceMotion() ? 1400 : 3300);
    el.addEventListener('click', finish);
  });
  // Coming back to the tab from the back-forward cache counts as opening the site: play it again.
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

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
    pollStats();
    render(location.hash.slice(1) || 'home');
    if (sessionId) await confirmPayment(sessionId);
    else if (cancelled) toast('Payment cancelled. Nothing was charged.');
  }
  boot();
  setTimeout(prefetchBoards, 1500); // the leaderboard opens with rows already in hand
})();
