/* PresLink Arcade: front-end logic. No framework, no build step. */
(() => {
  'use strict';

  const CONFIG = window.PRESLINK_CONFIG || {};
  const DEMO = !CONFIG.SUPABASE_URL;
  const STORAGE_KEY = 'preslink.player';
  const CONTACT_ASKED_KEY = 'preslink.contactAsked';
  const HOW_SEEN_KEY = 'preslink.howSeen';
  const PENDING_KEY = 'preslink.pendingScore';
  const PROGRESS_KEY = 'preslink.progress'; // the lights already played of a play left half-way
  const SWEEP_GUARD_MS = 60; // the server accepts taps from 60 ms into a sweep
  const DOUBLE_TAP_MS = 280; // a second tap this soon after the one that started a light is a double tap, not a stop (the light comes round again)
  const ROUNDS = 3;
  const BUNDLES = { single: { amount: 2, credits: 1 }, triple: { amount: 5, credits: 3 }, seven: { amount: 10, credits: 7 } };
  const BOARD_NAMES = { everyone: 'Everyone', student: 'Students', teacher: 'Teachers' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const euro = (cents) => '€' + Math.round((cents || 0) / 100).toLocaleString('en-IE');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "JAK", "jak 2", "JAK2" and "JAK#2" all mean the same name.
  const normTag = (raw) => String(raw || '').toUpperCase().replace(/[\s#]/g, '').replace(/^([A-Z]{2,3})(\d{1,3})$/, '$1#$2');
  // Android vibrates; iPhones have no vibration API, so they get the switch-control haptic below instead.
  const IOS_TOUCH = /iP(hone|ad|od)/.test(navigator.userAgent || '') || (/Mac/.test(navigator.platform || '') && navigator.maxTouchPoints > 1);
  const CAN_VIBRATE = !IOS_TOUCH && typeof navigator.vibrate === 'function';
  const vibrate = (p) => { if (!CAN_VIBRATE) return; try { navigator.vibrate(p); } catch (_) { /* ignore */ } };
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // "JAK#2" -> JAK with a small #2
  // Two people with the same initials: the second is the letters with a 2 in a bubble, never "FB#2" on screen.
  const nameHtml = (display) => { const [l, n] = String(display || '').split('#'); return esc(l) + (n ? `<span class="dup inline">${esc(n)}</span>` : ''); };
  // A coloured circle with the letters; the tint comes from the letters so it is stable. The bubble sits on the rim.
  // Every tile has one of eight colours: the player's choice (1 to 8), or one picked from the letters.
  const TILE_COLOURS = 8;
  const tileColour = (letters, colour) => { const c = Number(colour) || 0; if (c >= 1 && c <= TILE_COLOURS) return c; let h = 0; for (const ch of String(letters)) h = (h * 31 + ch.charCodeAt(0)) % TILE_COLOURS; return h + 1; };
  const avatarHtml = (display, big, colour) => { const [l, n] = String(display || '').split('#'); return `<span class="avatar k${tileColour(l, colour)}${big ? ' big' : ''}">${esc(l)}${n ? `<span class="dup">${esc(n)}</span>` : ''}</span>`; };
  const boardName = (role) => BOARD_NAMES[role] || 'Everyone';

  const MESSAGES = {
    NETWORK: 'No connection. Check your signal and try again.',
    NO_CREDITS: 'No plays left.',
    BAD_INITIALS: 'Two or three initials, A to Z.',
    BLOCKED_INITIALS: 'Those initials are not allowed. Try others.',
    TAKEN: 'Those initials are taken. Try others.',
    BAD_ROLE: 'To join a school board, add your school email on the You tab.',
    BAD_SESSION: 'This payment link is not valid any more. Nothing was charged.',
    UNKNOWN_SESSION: 'This payment link is not valid any more. Nothing was charged.',
    NO_PLAYER: 'No player with those initials.',
    BAD_SCHOOL_EMAIL: 'That is not a school email we recognise.',
    BAD_EMAIL: 'That does not look like an email address.',
    NEEDS_SCHOOL_EMAIL: 'Add your school email first.',
    BAD_SIGNIN: 'That name and code do not match.',
    LOCKED: 'Too many tries for that name. Try again later.',
    BANNED: 'This player has been removed by the committee.',
    CLOSED: 'The game has closed. Thank you for playing!',
    STRIPE_NOT_CONFIGURED: 'Payments are not switched on yet.',
    NO_SITE_URL: 'Payments are not set up for this address yet.',
    PLAYER_NOT_FOUND: 'We could not find your player on this device. Tap Play to start fresh.',
    SCORE_MISMATCH: 'That score did not check out, so it was not saved.',
    ALREADY_SCORED: 'That play was already scored.',
    PLAY_NOT_FOUND: 'That play could not be found.',
    PLAY_VOID: 'That play was cancelled.',
    BAD_TAP: 'That play did not check out, so it was not saved.',
    STRIPE_ERROR: 'Stripe had a problem. Please try again.',
    SERVER_ERROR: 'Something went wrong on our side. Please try again.',
  };
  const msg = (e) => MESSAGES[e && e.code] || MESSAGES.SERVER_ERROR;
  // Which link brought this visit (?r=ig from a poster or post): kept for the visit and sent with a payment, so the
  // committee can see which posters work. Nothing else is recorded, and nothing about the person.
  const SOURCE = (() => {
    try {
      const u = new URL(location.href);
      const r = u.searchParams.get('r');
      if (r && /^[a-z0-9-]{1,16}$/i.test(r)) sessionStorage.setItem('preslink.r', r.toLowerCase());
      // Off the address bar once read, so a link copied from it doesn't carry the tag on.
      if (u.searchParams.has('r')) { u.searchParams.delete('r'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); }
      return sessionStorage.getItem('preslink.r') || '';
    } catch (_) { return ''; }
  })();

  // ---------------------------------------------------------------------------
  // Storage and state
  // ---------------------------------------------------------------------------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } },
  };

  let player = store.get(STORAGE_KEY);
  let credits = 0;
  let spend = null; // { spent, today, daily, campaign } in cent, from the server
  let openPlay = null;
  let best = null;
  let stats = null;
  let boardRole = 'everyone';

  const savePlayer = () => store.set(STORAGE_KEY, player);
  // The next play, fetched ahead of the tap so the light moves on the first frame of the game. An answer for
  // another player, for a play this device has already scored or for the play under way is never kept: it
  // would replay a finished play.
  let nextPlay = null, prefetching = null;
  const scoredPlays = new Set();
  function prefetchPlay() {
    if (!player || nextPlay || prefetching || inPlay() || (credits <= 0 && !openPlay)) return;
    const pid = player.id;
    prefetching = api('start', { player_id: pid })
      .then((res) => {
        if (!res || !res.rounds || res.rounds.length !== ROUNDS || !player || player.id !== pid || scoredPlays.has(res.play_id)) return;
        if (inPlay() && game.play && game.play.play_id === res.play_id) return;
        nextPlay = res; credits = res.credits; openPlay = { play_id: res.play_id };
        if (!inPlay()) renderHome();
      })
      .catch(() => {})
      .finally(() => { prefetching = null; });
  }
  const clearPlayer = () => {
    player = null; credits = 0; openPlay = null; nextPlay = null; best = null;
    ['signin-name', 'signin-code'].forEach((id) => { $('#' + id).value = ''; }); // a shared device keeps nobody's code
    [STORAGE_KEY, CONTACT_ASKED_KEY, PROGRESS_KEY, 'preslink.prevBest', 'preslink.prevRank'].forEach((k) => store.del(k));
  };
  function adoptPlayer(p) {
    if (!player || player.id !== p.id) nextPlay = null; // another player: their own plays
    player = { id: p.id, tag: p.tag, initials: p.initials, suffix: p.suffix || 1, display: p.display || p.initials, role: p.role || 'everyone', claim_code: p.claim_code, school_email: p.school_email || null, contact_email: p.contact_email || null, colour: Number(p.colour) || 0 };
    credits = p.credits || 0;
    openPlay = p.open_play || null;
    if (openPlay && inPlay() && game.play && game.play.play_id === openPlay.play_id) openPlay = null; // the play under way here
    best = p.best != null ? p.best : (p.best_this_week == null ? null : p.best_this_week);
    if (p.spent_cents != null) spend = { spent: Number(p.spent_cents) || 0, today: Number(p.spent_today_cents) || 0, daily: Number(p.daily_cap_cents) || 2000, campaign: Number(p.campaign_cap_cents) || 10000 };
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
  async function rpcFetch(name, args) {
    if (DEMO) return window.PRESLINK_MOCK.rpc(name, args);
    let res;
    try {
      res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
    } catch (_) { throw new ApiError('NETWORK', 0); }
    if (!res.ok) throw new ApiError('SERVER_ERROR', res.status);
    return res.json();
  }
  // The same read asked for twice at once (the board from two places, stats at boot) goes out once.
  const inflight = new Map();
  function rpc(name, args = {}) {
    const key = name + JSON.stringify(args);
    if (!inflight.has(key)) inflight.set(key, rpcFetch(name, args).finally(() => inflight.delete(key)));
    return inflight.get(key);
  }

  // The first tap opens a small sheet asking for two or three letters; the player is created on submit.
  let pendingBundle = null;
  function ensurePlayer(bundle) {
    if (player) return true;
    pendingBundle = bundle || 'single';
    $('#name-submit').textContent = { single: 'Play · €2', triple: '3 plays · €5', seven: '7 plays · €10' }[pendingBundle] || 'Play';
    showError('name-error', '');
    nameInitials.set('');
    openSheet('name');
    nameInitials.focus();
    return false;
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------
  // iPhone haptics. Safari plays the system tick when a switch control (<input type="checkbox" switch>, Safari
  // 17.4 and later) is toggled by a real tap. So each plain button gets a transparent label over it, wired to a
  // hidden switch: the finger lands on the label, the click still bubbles to the button's own handlers, and the
  // switch ticks. (The technique of the ios-haptics library, MIT.) Never on a submit button or a link, where a
  // label would take over the default action. setText changes a button's words without dropping its label.
  function hap(el) {
    if (!IOS_TOUCH || !el || el.querySelector(':scope > .hap')) return;
    const l = document.createElement('label'); l.className = 'hap'; l.setAttribute('aria-hidden', 'true');
    const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
    i.addEventListener('click', (e) => e.stopPropagation());
    l.appendChild(i); el.appendChild(l);
  }
  function hapAll(root = document) { if (IOS_TOUCH) $$('button[type="button"], #game', root).forEach(hap); }
  function setText(el, text) { const l = el.querySelector(':scope > .hap'); el.textContent = text; if (l) el.appendChild(l); }
  // Android: a short tick on every press, before the click lands (the game's taps have their own patterns).
  document.addEventListener('pointerdown', (e) => {
    if (!CAN_VIBRATE || e.pointerType === 'mouse') return;
    const b = e.target.closest('button, a.cell');
    if (b && !b.disabled && !b.closest('#game')) vibrate(8);
  }, { passive: true });
  // iOS only shows :active styles when the page listens for touches.
  document.addEventListener('touchstart', () => {}, { passive: true });
  // Stripe's checkout opens faster when the connection is already made: warm it on the first tap that may buy.
  let stripeWarm = false;
  document.addEventListener('pointerdown', (e) => {
    if (stripeWarm || DEMO || !e.target.closest('[data-bundle], #home-play, .js-play, #result-again, #name-submit')) return;
    stripeWarm = true;
    const l = document.createElement('link'); l.rel = 'preconnect'; l.href = 'https://checkout.stripe.com'; document.head.appendChild(l);
  }, { passive: true });

  let toastTimer = 0;
  function toast(text, isError = false, ms = 3200) {
    if (isError) vibrate([30, 50, 30]);
    const t = $('#toast');
    t.textContent = text;
    t.classList.toggle('error', isError);
    t.classList.toggle('top', !$('#sheet-backdrop').hidden); // over a sheet it sits under the app bar; otherwise above the tab bar
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }
  $('#toast').addEventListener('click', () => { $('#toast').hidden = true; });
  function overlay(text) {
    const o = $('#overlay');
    if (!text) { o.hidden = true; return; }
    $('#overlay-text').textContent = text;
    o.hidden = false;
  }
  // While a sheet is open the page behind it is inert: no focus, no taps, no keys reach it. Terms or Privacy
  // opened from inside another sheet sit on top of it, and closing them goes back to it as it was.
  const openSheetEl = () => $$('.sheet').find((s) => !s.hidden) || null;
  let sheetOpener = null, sheetBelow = null;
  function openSheet(id) {
    const was = openSheetEl(), sh = $('#sheet-' + id);
    if (!sh) return;
    if (!was) sheetOpener = document.activeElement;
    sheetBelow = was && was !== sh && SHEET_LINKS.includes(id) ? was : null;
    $$('.sheet').forEach((s) => { s.hidden = s !== sh; });
    $('#sheet-backdrop').hidden = false;
    $('#toast').classList.add('top'); // a toast already showing must not sit on the sheet's buttons
    $('main.shell').inert = true; $('#tabbar').inert = true;
    if (!sh.hasAttribute('tabindex')) sh.tabIndex = -1;
    requestAnimationFrame(() => { if (!sh.hidden && !sh.contains(document.activeElement)) sh.focus({ preventScroll: true }); });
  }
  function closeSheets(all) {
    if (/^#(terms|privacy)$/.test(location.hash)) history.replaceState(null, '', '#' + current);
    const below = sheetBelow; sheetBelow = null;
    if (below && !all) { $$('.sheet').forEach((s) => { s.hidden = s !== below; }); below.focus({ preventScroll: true }); return; }
    $('#toast').classList.remove('top'); // a toast that was held clear of a sheet drops back above the tab bar
    $$('.sheet').forEach((s) => { s.hidden = true; });
    $('#sheet-backdrop').hidden = true;
    $('main.shell').inert = false; $('#tabbar').inert = false;
    const back = sheetOpener; sheetOpener = null;
    if (!all && back && back.isConnected && back !== document.body && !back.closest('[hidden]')) back.focus({ preventScroll: true });
  }
  // The page is inert exactly while a sheet shows, however the sheet came to be hidden.
  // (It writes only what is out of step, so its own writes can't wake it again.)
  new MutationObserver(() => {
    if (openSheetEl()) return;
    const main = $('main.shell'), bar = $('#tabbar'), back = $('#sheet-backdrop');
    if (main.inert) main.inert = false;
    if (bar.inert) bar.inert = false;
    if (!back.hidden) back.hidden = true;
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  // The first-play sheet records that it was asked however it is closed, so it does not come back after the next play.
  function dismissSheet() {
    const open = openSheetEl();
    if (open && open.id === 'sheet-contact' && !sheetBelow) skipContact(); else closeSheets();
  }
  $('#sheet-backdrop').addEventListener('click', dismissSheet);
  // Buttons do nothing by default, so only links have theirs stopped (cancelling a button's click would also
  // cancel the iPhone haptic switch inside it).
  const noNav = (e, el) => { if (el.tagName === 'A') e.preventDefault(); };
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sheet]');
    if (s) { noNav(e, s); openSheet(s.dataset.sheet); return; }
    if (e.target.closest('[data-close]')) closeSheets();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSheetEl()) { e.preventDefault(); dismissSheet(); } });
  // A sheet's title bar can be pulled down to close it, as in an app.
  (() => {
    let sh = null, y0 = 0, dy = 0, t0 = 0;
    document.addEventListener('pointerdown', (e) => {
      const head = e.target.closest('.sheet-head');
      if (!head || e.pointerType === 'mouse' || e.target.closest('button') || window.innerWidth >= 900) return;
      const s = head.closest('.sheet');
      if (!s) return;
      sh = s; y0 = e.clientY; dy = 0; t0 = performance.now();
    }, { passive: true });
    document.addEventListener('pointermove', (e) => {
      if (!sh) return;
      dy = Math.max(0, e.clientY - y0);
      if (dy > 3) { sh.style.transition = 'none'; sh.style.transform = `translateY(${dy}px)`; }
    }, { passive: true });
    const end = () => {
      if (!sh) return;
      const s = sh; sh = null;
      const flick = dy > 40 && performance.now() - t0 < 260;
      s.style.transition = 'transform .2s cubic-bezier(.2, .8, .2, 1)';
      if (dy > 110 || flick) {
        s.style.transform = 'translateY(100%)';
        setTimeout(() => { s.style.transform = ''; s.style.transition = ''; dismissSheet(); }, 170);
      } else { s.style.transform = ''; setTimeout(() => { s.style.transition = ''; }, 220); }
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  })();
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
        parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 7 * d, g: 0.38 * d, w: (6 + Math.random() * 6) * d, h: (8 + Math.random() * 9) * d, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, c: colors[i % colors.length], life: 60 + Math.random() * 30 });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function stop() { parts = []; }
    document.addEventListener('pointerdown', stop); // a tap clears it
    return { burst, stop };
  })();

  // ---------------------------------------------------------------------------
  // Router and tab bar
  // ---------------------------------------------------------------------------
  const SCREENS = ['home', 'cabinet', 'play', 'board', 'prize', 'about', 'you', 'signin'];
  const TAB_ORDER = { home: 0, cabinet: 0, play: 0, board: 1, prize: 2, about: 3, you: 4, signin: 4 };
  const screens = $$('.screen');
  let current = 'home';
  function go(name) {
    if (location.hash === '#' + name) render(name);
    else location.hash = name;
  }
  // A screen that sends people on (no play to show, nothing in the cabinet) replaces itself in the history, so
  // Back still leaves the app instead of bouncing between screens.
  function redirect(name) { history.replaceState(null, '', '#' + name); render(name); }
  function render(name) {
    if (!SCREENS.includes(name)) name = 'home';
    if (name === 'play' && !player) { redirect('home'); return; }

    const from = current;
    current = name;
    const tname = { board: 'Leaderboard', prize: HONOURS() ? 'Honours' : 'Prizes', about: 'About', you: 'You', play: 'Play', signin: 'Sign in' }[name];
    document.title = tname ? `${tname} · PresLink Arcade` : 'PresLink Arcade';
    closeSheets(true);
    screens.forEach((s) => { s.hidden = s.dataset.screen !== name; });
    const scr = screens.find((s) => s.dataset.screen === name);
    if (scr && from !== name) {
      scr.classList.remove('from-l', 'from-r'); void scr.offsetWidth;
      scr.classList.add((TAB_ORDER[name] || 0) >= (TAB_ORDER[from] || 0) ? 'from-r' : 'from-l');
    }
    window.scrollTo(0, 0);
    const tab = { home: 'play', cabinet: 'play', play: 'play', signin: 'play', board: 'board', prize: 'board', about: 'about', you: 'you' }[name];
    $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const ti = ['play', 'board', 'about', 'you'].indexOf(tab);
    if (ti >= 0) $('#tabbar').style.setProperty('--i', ti);
    $('#tabbar').hidden = name === 'play' || name === 'cabinet';
    if (name !== 'play' && game.state !== 'idle' && game.state !== 'done') abandonGame();
    if (name === 'home') { renderHome(); refreshStats(); refreshMe(); sizeDemo(); }
    if (name === 'cabinet' && !cabinetBusy) { redirect('home'); return; }
    if (name === 'play') {
      // Only an explicit tap starts a play; arriving here by Back/Forward shows the last result or goes home.
      if (wantGame) { wantGame = false; startGame(); }
      else if (game.state !== 'done' || $('#result').hidden) { redirect('home'); return; }
    }
    if (name === 'board') loadBoard();
    if (name === 'prize') refreshStats();
    if (name === 'about') refreshStats();
    if (name === 'you') openYou();
    if (name === 'signin') setTimeout(() => $('#signin-name').focus(), 60);
  }
  const SHEET_LINKS = ['terms', 'privacy'];
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (SHEET_LINKS.includes(h)) { openSheet(h); return; }
    render(h || 'home');
  });
  document.addEventListener('click', (e) => {
    const p = e.target.closest('.js-play');
    if (p) { noNav(e, p); playOrBuy(); return; }
    const b = e.target.closest('[data-bundle]');
    if (b) { noNav(e, b); buy(b.dataset.bundle); return; }
    const t = e.target.closest('[data-go]');
    if (t) { noNav(e, t); go(t.dataset.go); }
  });
  $$('#tabbar button').forEach((b) => b.addEventListener('click', () => {
    const tab = b.dataset.tab;
    go(tab === 'play' ? 'home' : tab);
  }));

  // ---------------------------------------------------------------------------
  // Home and the money counter in the app bar
  // ---------------------------------------------------------------------------
  const canPlayNow = () => !!player && (credits > 0 || !!openPlay);
  const playsLeft = () => credits + (openPlay ? 1 : 0);
  const playLabel = () => canPlayNow() ? `Play · ${playsLeft()} left` : 'Play · €2';
  // After the closing date nothing more can be bought or started (the server refuses too).
  const isClosed = () => { const d = stats && stats.ends_on ? new Date(stats.ends_on + 'T23:59:59') : null; return !!d && !isNaN(d) && Date.now() > d.getTime(); };
  function renderHome() {
    const btn = $('#home-play');
    const closed = isClosed();
    setText(btn, closed ? 'The game has closed' : playLabel());
    btn.disabled = closed;
    btn.classList.toggle('ready', canPlayNow() && !closed);
    $('[data-screen="home"] .bundles-line').hidden = closed;
    if (canPlayNow() && !closed) prefetchPlay();
    renderHomeTop();
  }
  // The top three of the Everyone board on Home.
  let homeTopSeq = 0;
  function renderHomeTop() {
    const rows = boardCache.everyone;
    if (!rows) {
      const seq = ++homeTopSeq;
      rpc('board', { p_role: null }).then((r) => { if (seq !== homeTopSeq || boardCache.everyone) return; boardCache.everyone = r; renderHomeTop(); }).catch(() => {});
      return;
    }
    $('#home-top-list').innerHTML = rows.slice(0, 3).map((r) => rowHtml(r, !!player && r.tag === player.tag)).join('');
    $('#home-top-empty').hidden = rows.length > 0;
  }
  $('#home-play').addEventListener('click', () => playOrBuy());
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
  const STATS_EVERY = 15000;
  let statsTimer = 0;
  const inPlay = () => ['loading', 'countdown', 'sweeping', 'between'].includes(game.state);
  function pollStats() {
    clearTimeout(statsTimer);
    if (document.hidden) return; // the page coming back starts it again
    // nothing on the page moves while the light sweeps: during a play the poll only waits for the next turn
    statsTimer = setTimeout(() => { if (inPlay()) pollStats(); else refreshStats().finally(pollStats); }, STATS_EVERY);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStats(); pollStats(); });
  window.addEventListener('offline', () => toast('No connection', true, 4000));
  window.addEventListener('online', () => { toast('Back online'); if (game.pending && game.state === 'done') submitPending().then((x) => showResult(game.lastScore, x.r, x.note)); else refreshStats(); });

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
    $('.story.school .photo').src = about.intro_image || 'assets/photo-school.svg?v=2';
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
  // Prizes or honours: the owner can run the boards for honours instead of prizes (no prize of money's worth) with
  // one setting; every word that promises a prize follows it.
  const HONOURS = () => !!stats && stats.prize_mode === 'honours';
  function applyMode() {
    const h = HONOURS();
    document.documentElement.classList.toggle('honours', h);
    $$('[data-honours]').forEach((el) => { if (el.dataset.prizes == null) el.dataset.prizes = el.textContent; setText(el, h ? el.dataset.honours : el.dataset.prizes); });
    $$('.mode-prizes').forEach((el) => { el.hidden = h; });
    $$('.mode-honours').forEach((el) => { el.hidden = !h; });
  }
  // The organiser's details from the site content (content.org: name, rcn, email; or content.contact.email).
  function applyOrg(c) {
    const org = (c && c.org) || {}, contact = (c && c.contact) || {};
    const legal = (org.name ? `, under ${org.name}` : '') + (org.rcn ? ` (registered charity number ${org.rcn})` : '');
    $$('.org-legal').forEach((el) => { el.textContent = legal; });
    const email = String(org.email || contact.email || '').trim();
    $$('.org-contact').forEach((el) => { el.innerHTML = email ? `Email: <a href="mailto:${esc(email)}">${esc(email)}</a>.` : 'You can contact us through the school.'; });
    $$('.org-rcn').forEach((el) => { el.textContent = org.rcn ? ` · RCN ${org.rcn}` : ''; });
  }
  let statsSeq = 0, shownClosed = false;
  async function refreshStats() {
    const seq = ++statsSeq;
    let fresh;
    try { fresh = await rpc('stats'); } catch (_) { return; }
    if (seq !== statsSeq) return; // a newer answer is on its way (e.g. right after a payment)
    stats = fresh;
    applyContent(stats.content || {});
    applyOrg(stats.content || {});
    applyMode();
    showRaised(Number(stats.total_raised_cents || 0));
    showRing(Number(stats.total_raised_cents || 0), Number(stats.goal_cents || 0));
    const ends = endsText();
    $('#board-sub').textContent = ends;
    $('#board-sub').hidden = !ends;
    const closes = closesText();
    $('#prize-sub').textContent = HONOURS() ? (closes ? `Closes ${closes}` : 'Honoured at the close') : (closes ? `Closes ${closes} · winners are emailed` : 'Winners are emailed at the close');
    if (isClosed() !== shownClosed) { shownClosed = isClosed(); renderHome(); } // the close passes while the page is open
    const pz = stats.prizes || {};
    const put = (id, v) => { const el = $(id); const t = String(v || '').trim(); el.textContent = t || 'To be announced'; el.classList.toggle('tba', !t); };
    put('#prize-everyone', pz.everyone);
    put('#prize-students', pz.students);
    put('#prize-teachers', pz.teachers);
    put('#prize-best-light', pz.best_light);
    put('#prize-first-play', pz.first_play);
  }

  let meAt = 0;
  async function refreshMe(force) {
    if (!player) return;
    if (!force && Date.now() - meAt < 20000) return;
    meAt = Date.now();
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
  const limitText = (code) => code === 'DAILY_LIMIT'
    ? `That's the €${Math.round(((spend && spend.daily) || 2000) / 100)} limit for today.`
    : `That's the €${Math.round(((spend && spend.campaign) || 10000) / 100)} limit for the campaign. Thank you!`;
  async function buy(bundle) {
    if (!ensurePlayer(bundle)) return;
    const amount = (BUNDLES[bundle] || BUNDLES.single).amount * 100;
    if (spend && spend.today + amount > spend.daily) { toast(limitText('DAILY_LIMIT'), true, 5000); return; }
    if (spend && spend.spent + amount > spend.campaign) { toast(limitText('SPEND_LIMIT'), true, 5000); return; }
    overlay('Opening secure checkout');
    try {
      const r = await api('checkout', SOURCE ? { player_id: player.id, bundle, source: SOURCE } : { player_id: player.id, bundle });
      location.assign(r.url);
    } catch (ex) {
      overlay(null);
      toast(ex.code === 'DAILY_LIMIT' || ex.code === 'SPEND_LIMIT' ? limitText(ex.code) : msg(ex), true, 5000);
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
    $('#cab-title').textContent = result.demo ? 'Demo plays added' : 'Thank you';
    $('#cab-text').textContent = '';
    cabinetBusy = true;
    $('#cab-play').hidden = true;
    await splashDone;
    go('cabinet');
    refreshStats();
    await wait(120);
    prefetchPlay(); // ready before the Start button is
    await countIn(n);
    // The player starts the play themselves: the button pops in and waits.
    const btn = $('#cab-play');
    btn.hidden = false; btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    cabinetBusy = false;
  }
  $('#cab-play').addEventListener('click', () => startPlay());

  // The tick draws itself and the count rolls up to the plays now ready.
  async function countIn(n) {
    const val = $('#cab-credits'), card = $('#success-card');
    const target = playsLeft(), from = Math.max(0, target - n);
    val.textContent = from;
    $('#cab-text').textContent = target === 1 ? 'play ready' : 'plays ready';
    card.classList.remove('go'); void card.offsetWidth; card.classList.add('go');
    await wait(reduceMotion() ? 0 : 380);
    vibrate(30);
    for (let i = 0; i < n; i++) {
      await wait(reduceMotion() ? 0 : n > 3 ? 70 : 120);
      val.textContent = from + i + 1;
      val.classList.remove('bump'); void val.offsetWidth; val.classList.add('bump');
      vibrate(12);
    }
    await wait(60);
  }

  // ---------------------------------------------------------------------------
  // Game: three lights, line each one up with the mark
  // ---------------------------------------------------------------------------
  const game = { state: 'idle', play: null, round: 0, taps: [], scores: [], sweepStart: 0, trackW: 0, pending: null, lastScore: 0 };
  let armedAt = 0; // when the tap that started the current light landed (Start, Play again, a skipped wait)
  const marker = $('#marker'), track = $('#track'), pin = $('#pin'), swatch = $('#swatch');
  // Three faint copies of the light a moment behind it: a trail that shows its speed and direction.
  const ghosts = $$('#track .ghost');
  function setGhosts(t, r) {
    for (let k = 0; k < ghosts.length; k++) ghosts[k].style.transform = `translateX(${posAt(Math.max(0, t - (k + 1) * 22), r.phase, game.play.speed_ms) * game.trackW}px)`;
  }
  // Where the light stops: a ring spreads from it (green for a hit), and a perfect light throws sparks.
  function ripple(pos, kind) {
    if (reduceMotion()) return;
    const x = (pos * game.trackW) + 'px';
    const rp = document.createElement('span'); rp.className = 'ripple ' + kind; rp.style.left = x;
    track.appendChild(rp); setTimeout(() => rp.remove(), 700);
    if (kind !== 'perfect') return;
    for (let i = 0; i < 12; i++) {
      const sp = document.createElement('span'); sp.className = 'spark'; sp.style.left = x; sp.style.setProperty('--a', (i * 30) + 'deg');
      track.appendChild(sp); setTimeout(() => sp.remove(), 800);
    }
  }

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
  // Each light says how far off it was, in milliseconds; "Perfect" is kept for the exact millisecond.
  function verdictFor(s, err) {
    if (s >= 999 || err === 0) return 'Perfect';
    return `${Math.abs(err)} ms ${err > 0 ? 'late' : 'early'}`;
  }
  function setMarker(pos) { marker.style.transform = `translateX(${pos * game.trackW}px)`; }
  function setPin(target) {
    pin.style.left = (target * 100) + '%';
  }
  function measure() { game.trackW = track.clientWidth; }
  window.addEventListener('resize', measure);
  // The home preview light sweeps the width of its bar by a transform, whatever the screen width.
  function sizeDemo() { $$('.demo-track').forEach((d) => { if (d.clientWidth) d.style.setProperty('--sweep', (d.clientWidth - 10) + 'px'); }); }
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
    $('#practice-intro').hidden = true;
    $('#practice-end').hidden = true;
    $('#game').hidden = false;
    $('#game').classList.remove('done');
    $('#game-msg').textContent = 'Ready';
    $('#score-value').textContent = '';
    $('.score').classList.remove('pop', 'hit');
    $('#verdict').textContent = '';
    $('#verdict').classList.remove('miss');
    $('#tap-hint').textContent = tapWord();
    $('#tap-hint').classList.remove('live');
    $('#result-note').hidden = true;
    pin.style.opacity = '';
    marker.classList.remove('hit', 'miss', 'hide');
    game.round = 0; game.taps = []; game.scores = []; game.errs = [];
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
    if (needsPractice()) { openPractice(); return; }
    game.practice = false;
    $('#game').classList.remove('practice');
    armedAt = performance.now();
    game.play = null;
    if (game.pending && !game.sending) submitPending(); // an earlier play that has not reached the server yet
    resetGameUI();
    updatePlayCredits();
    $('#tabbar').hidden = true;
    const g = $('#game');
    g.classList.remove('enter'); void g.offsetWidth; g.classList.add('enter');
    game.state = 'loading';
    pollStats(); // pauses the counter refresh until the play is over
    let res = nextPlay; nextPlay = null;
    // A play already on its way (fetched ahead) is waited for, never asked for a second time.
    const fetching = res ? Promise.resolve(res) : (async () => {
      if (prefetching) await prefetching;
      if (nextPlay) { const r = nextPlay; nextPlay = null; return r; }
      return api('start', { player_id: player.id });
    })();
    fetching.catch(() => {});
    const m = $('#game-msg');
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
    if (game.state !== 'loading') { // left before the light came: the play waits on Home
      if (res && res.play_id) { openPlay = { play_id: res.play_id }; credits = res.credits; renderHome(); }
      return;
    }
    if (!res.rounds || res.rounds.length !== ROUNDS) { game.state = 'idle'; toast(MESSAGES.SERVER_ERROR, true); go('home'); return; }
    game.play = res;
    credits = res.credits;
    openPlay = null;
    updatePlayCredits();
    $('#tap-hint').classList.add('live');
    // A play left half-way carries on at its next light; the lights already played keep their scores.
    const prog = store.get(PROGRESS_KEY);
    let from = 0;
    if (prog && prog.play_id === res.play_id && Array.isArray(prog.taps) && prog.taps.length > 0 && prog.taps.length < ROUNDS) {
      game.taps = prog.taps.slice(); game.scores = prog.scores.slice(); game.errs = prog.errs.slice();
      from = prog.taps.length;
      toast(`Carrying on from light ${from + 1}`);
    } else if (prog) store.del(PROGRESS_KEY);
    beginRound(from);
  }
  // Each light starts sweeping the moment it is announced. This is the first version's loop: a
  // frame callback draws posAt(now - sweepStart), and a tap is timed by the same clock.
  function beginRound(i) {
    game.round = i;
    const r = game.play.rounds[i];
    const m = $('#game-msg');
    m.textContent = `${game.practice ? 'Practice light' : 'Light'} ${i + 1} of 3`;
    setPin(r.target);
    marker.classList.remove('hit', 'miss', 'hide');
    measure();
    game.state = 'sweeping';
    $('#game').classList.add('sweeping');
    renderDots();
    game.sweepStart = performance.now();
    setMarker(posAt(0, r.phase, game.play.speed_ms));
    setGhosts(0, r);
    track.classList.add('moving');
    game.raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    if (game.state !== 'sweeping') return;
    const r = game.play.rounds[game.round];
    // Away from the page for a long while (a call, another app): the light starts its sweep again, so no tap
    // ever comes after the server's two-minute limit.
    if (now - game.sweepStart > 90000) game.sweepStart = now;
    const t = now - game.sweepStart;
    setMarker(posAt(t, r.phase, game.play.speed_ms));
    setGhosts(t, r);
    game.raf = requestAnimationFrame(loop);
  }
  function abandonGame() {
    cancelAnimationFrame(game.raf);
    track.classList.remove('moving');
    $('#game').classList.remove('sweeping');
    // A scored play left before its last light waits on Home and carries on where it stopped.
    if (game.play && game.play.play_id && !scoredPlays.has(game.play.play_id) && !game.pending) openPlay = { play_id: game.play.play_id };
    game.state = 'idle';
    game.practice = false;
    $('#game').classList.remove('practice');
  }

  // Signed timing error in ms: positive = late (the light had passed the mark), negative = early.
  function signedError(ms, r) {
    let x = ms / game.play.speed_ms + r.phase;
    x = x - 2 * Math.floor(x / 2);
    const pos = x < 1 ? x : 2 - x;
    const dir = x < 1 ? 1 : -1;
    return Math.round((pos - r.target) * dir * game.play.speed_ms);
  }
  // A tap counts at the moment the finger touched the glass, not when the browser got round to telling
  // the page (on a phone that is 20 to 50 ms later, during which the light has moved on). The event's own
  // timestamp is that moment where the browser gives a sane one. What the player saw then was drawn about a
  // refresh earlier, so the tap is timed at that moment, to the millisecond and not snapped to a frame (a
  // frame's timing would put luck into the top scores). The light stops where it was at that moment.
  const DISPLAY_LAG_MS = 16;
  function touchTime(e) {
    const now = performance.now();
    const ts = e && Number.isFinite(e.timeStamp) ? e.timeStamp : NaN;
    return ts > 0 && ts <= now + 5 && ts > now - 400 ? ts : now;
  }
  // The light's number holds for a moment, then the next light starts; a tap after the first instant skips the
  // rest of the wait, so a quick player is never held back.
  const HOLD_MS = 650, LAST_HOLD_MS = 600, BLINK_MS = 90, SKIP_AFTER_MS = 220;
  let skipHold = null;
  function hold(ms) {
    return new Promise((resolve) => {
      const since = performance.now();
      const done = () => { clearTimeout(t); skipHold = null; resolve(); };
      const t = setTimeout(done, ms);
      skipHold = () => { if (performance.now() - since >= SKIP_AFTER_MS) done(); };
    });
  }
  function onTap(e) {
    if (e.target && e.target.closest && e.target.closest('.game-top')) return; // Back and the chips are not taps on the light
    if (game.state === 'between') { armedAt = touchTime(e); if (skipHold) skipHold(); return; }
    if (game.state !== 'sweeping') return;
    const at = touchTime(e);
    if (at - armedAt < DOUBLE_TAP_MS) return;
    const ms = Math.round(at - DISPLAY_LAG_MS - game.sweepStart);
    if (ms < SWEEP_GUARD_MS) return;
    if (e.cancelable) e.preventDefault();
    cancelAnimationFrame(game.raf);
    game.state = 'between';
    $('#game').classList.remove('sweeping');
    const r = game.play.rounds[game.round];
    const pos = posAt(ms, r.phase, game.play.speed_ms);
    const s = roundScore(pos, r.target, game.play.speed_ms);
    setMarker(pos); // the light stops, this frame, where it was when the finger landed
    track.classList.remove('moving');
    marker.classList.add(s >= HIT ? 'hit' : 'miss');
    sounds.tap();
    const err = signedError(ms, r);
    ripple(pos, s >= 999 || err === 0 ? 'perfect' : s >= HIT ? 'hit' : 'miss');
    game.taps.push(ms);
    game.scores.push(s);
    game.errs.push(err);
    vibrate(10);
    if (game.practice) { /* a practice light is kept nowhere */ }
    else if (game.round < ROUNDS - 1) store.set(PROGRESS_KEY, { play_id: game.play.play_id, taps: game.taps, scores: game.scores, errs: game.errs });
    else sendScore(); // the score leaves now, while its number shows
    requestAnimationFrame(() => afterRound(s, err)); // the score and the rest follow a frame later
  }
  $('#game').addEventListener('pointerdown', onTap);
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (e.repeat || openSheetEl() || /^(input|textarea|select)$/i.test(e.target.tagName)) return; // a held key or a typed field is not a tap
    if (game.state === 'sweeping' || game.state === 'between') onTap(e);
  });
  // A keyboard plays the whole game: Space or Enter starts from Home or the cabinet, stops the light
  // (above), and plays again from the result. Buttons and fields keep their own keys.
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (e.metaKey || e.ctrlKey || e.altKey || /^(input|textarea|select|button|a)$/i.test(e.target.tagName)) return;
    if ($$('.sheet').some((s) => !s.hidden)) return;
    if (e.repeat) return;
    if (current === 'home' && player && (credits > 0 || openPlay) && !isClosed()) { e.preventDefault(); playOrBuy(); }
    else if (current === 'cabinet' && !$('#cab-play').hidden) { e.preventDefault(); startPlay(); }
    else if (current === 'play' && game.state === 'done' && !$('#result').hidden) { e.preventDefault(); $('#result-again').click(); }
  });
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const tapWord = () => (finePointer.matches ? 'Click or press Space when the light is on the mark' : 'Tap when the light is on the mark');
  if (finePointer.matches) {
    const step = $('#how-title').closest('.sheet').querySelector('.steps li'); if (step) step.textContent = 'Click or press Space when the light is on the mark.';
    $('#practice-rule').textContent = 'Click or press Space when the light is on the mark.';
  }

  // After the stop: the light's number under the bar and a verdict; then the next light.
  async function afterRound(s, err) {
    if (game.state !== 'between') return;
    if (s >= HIT) sounds.good();
    if (s >= 999 || err === 0) vibrate([20, 30, 20, 30, 50]); else if (s >= HIT) vibrate([12, 40, 22]);
    renderDots();
    const el = $('#score-value');
    el.textContent = s;
    $('.score').classList.toggle('hit', s >= HIT);
    $('.score').classList.remove('pop'); void el.offsetWidth; $('.score').classList.add('pop');
    const v = $('#verdict');
    v.textContent = verdictFor(s, err);
    v.classList.toggle('miss', s < HIT);
    v.classList.toggle('perfect', s >= 999 || err === 0);
    $('#game-msg').textContent = '';
    if (game.round < ROUNDS - 1) {
      await hold(HOLD_MS);
      if (game.state !== 'between') return;
      v.textContent = '';
      $('#score-value').textContent = '';
      $('.score').classList.remove('pop', 'hit');
      marker.classList.add('hide'); // the light blinks off, then reappears at the next start, already moving
      await wait(BLINK_MS);
      if (game.state !== 'between') return;
      beginRound(game.round + 1);
    } else {
      await hold(LAST_HOLD_MS);
      if (game.state !== 'between') return;
      if (game.practice) finishPractice(); else finishPlay();
    }
  }

  // The score leaves at the last tap (sendScore), so the answer is usually back before the light's number has
  // finished showing, and the result opens straight away.
  function sendScore() {
    const score = Math.round(game.scores.reduce((a, b) => a + b, 0) / ROUNDS);
    game.lastScore = score;
    const payload = { player_id: player.id, play_id: game.play.play_id, score, taps: game.taps.slice() };
    game.pending = payload;
    store.set(PENDING_KEY, payload);
    store.del(PROGRESS_KEY);
    game.sending = submitPending();
  }
  async function finishPlay() {
    game.state = 'done';
    $('#tap-hint').classList.remove('live');
    const slow = setTimeout(() => { $('#tap-hint').textContent = 'Saving your score…'; }, 900);
    const { r, note } = await (game.sending || submitPending());
    clearTimeout(slow);
    $('#tap-hint').textContent = '';
    game.sending = null;
    showResult(game.lastScore, r, note);
  }

  // Practice: before a player's very first real play, three free lights, in a box that says it is a practice and
  // a game card marked Practice. Nothing is scored or sent, and the lights are made up here, not the day's real
  // ones. It can't be skipped; once done, it never comes back for that player.
  const PRACTICE_KEY = 'preslink.practised';
  const needsPractice = () => !!player && best == null && store.get(PRACTICE_KEY) !== player.tag;
  const practiceRounds = () => [0, 1, 2].map(() => ({ phase: Math.floor(Math.random() * 1000) / 1000, target: (150 + Math.floor(Math.random() * 701)) / 1000 }));
  function showPracticeBox(id) {
    ['practice-intro', 'practice-end'].forEach((x) => { $('#' + x).hidden = x !== id; });
    $('#game').hidden = true;
    $('#result').hidden = true;
    sizeDemo();
    if (finePointer.matches) $(`#${id} .btn`).focus({ preventScroll: true }); // Enter or Space goes on
  }
  function openPractice() {
    game.state = 'practice';
    store.set(HOW_SEEN_KEY, true); // the practice box carries the rules
    showPracticeBox('practice-intro');
  }
  $('#practice-go').addEventListener('click', () => {
    if (game.state !== 'practice') return;
    sounds.prime();
    resetGameUI();
    game.practice = true;
    game.play = { play_id: null, speed_ms: 1000, rounds: practiceRounds() };
    $('#game').classList.add('practice');
    $('#play-credits').textContent = 'Practice';
    const g = $('#game');
    g.classList.remove('enter'); void g.offsetWidth; g.classList.add('enter');
    armedAt = performance.now();
    $('#tap-hint').classList.add('live');
    beginRound(0);
  });
  function finishPractice() {
    game.state = 'practice';
    game.practice = false;
    $('#game').classList.remove('practice');
    $('#tap-hint').classList.remove('live');
    store.set(PRACTICE_KEY, player.tag);
    $('#practice-score').textContent = Math.round(game.scores.reduce((a, b) => a + b, 0) / ROUNDS);
    showPracticeBox('practice-end');
  }
  $('#practice-real').addEventListener('click', () => {
    if (game.state !== 'practice') return;
    game.state = 'idle';
    startGame();
  });

  // Sends the play waiting in game.pending; answers { r, note } and keeps the player's numbers up to date.
  const sentPlays = new Set(); // plays this device has tried to send: "already scored" then means saved
  async function submitPending() {
    const payload = game.pending;
    if (!payload) return { r: null, note: '' };
    let r = null, note = '';
    const tried = sentPlays.has(payload.play_id);
    sentPlays.add(payload.play_id);
    const done = () => {
      game.pending = null;
      store.del(PENDING_KEY);
      scoredPlays.add(payload.play_id);
      if (nextPlay && nextPlay.play_id === payload.play_id) nextPlay = null;
      if (openPlay && openPlay.play_id === payload.play_id) openPlay = null;
    };
    try {
      r = await api('submit', payload);
      done();
      credits = r.credits;
      best = r.best != null ? r.best : r.best_this_week;
    } catch (ex) {
      if (['ALREADY_SCORED', 'PLAY_NOT_FOUND', 'PLAY_VOID', 'SCORE_MISMATCH', 'BAD_TAP', 'CLOSED'].includes(ex.code)) {
        done();
        note = ex.code === 'ALREADY_SCORED' && tried ? '' : MESSAGES[ex.code];
      } else {
        note = 'Could not save your score yet. Check your connection and tap Try again.';
      }
    }
    return { r, note };
  }

  function showResult(score, r, note) {
    if (r && r.score != null) { score = r.score; game.lastScore = score; } // the server's number is the score
    updatePlayCredits();
    refreshStats();
    pollStats();
    prefetchBoards(true);
    if (credits > 0) prefetchPlay(); // Play again starts on the first frame too
    $('#game').classList.add('done');
    $('#game').hidden = true;
    $('#tabbar').hidden = false; // the game is over: let people move around again
    const kicker = $('#result-title');
    const prevBest = store.get('preslink.prevBest');
    const prevRank = store.get('preslink.prevRank');
    const rank = r ? (r.rank_all != null ? r.rank_all : r.rank) : null;
    const newBest = !!r && prevBest != null && score > prevBest;
    kicker.hidden = !newBest;
    if (newBest) sounds.best();
    const first900 = !!r && score >= 900 && !store.get('preslink.got900');
    if (r && score >= 900) store.set('preslink.got900', true);
    const intoTop10 = !!r && rank != null && rank <= 10 && (prevRank == null || prevRank > 10);
    if (current === 'play' && score >= HIT && (newBest || first900 || intoTop10)) confetti.burst(score >= 900 ? 110 : 70); // never for a below-median play
    vibrate(newBest ? [25, 60, 25, 60, 90] : 30);
    const fg = $('#gauge-fg'), C = 326.73;
    fg.style.transition = 'none'; fg.style.strokeDasharray = `0 ${C}`; void fg.getBoundingClientRect();
    fg.style.transition = '';
    requestAnimationFrame(() => { fg.style.strokeDasharray = `${(Math.max(0, Math.min(1000, score)) / 1000 * C).toFixed(1)} ${C}`; });
    if (r) { store.set('preslink.prevBest', best); if (rank != null) store.set('preslink.prevRank', rank); }
    countUp($('#result-score'), 0, score, 650, String);
    const lights = r && Array.isArray(r.rounds) && r.rounds.length === ROUNDS ? r.rounds.map((x) => Number(x)) : game.scores;
    // The three lights the score is the average of
    $('#result-rounds').innerHTML = lights.map((s, i) => `<div class="lt"><span>Light ${i + 1}</span><strong>${s}</strong></div>`).join('');
    $('#result-best').textContent = r && best != null ? best : '–';
    $('#result-rank').textContent = rank ? '#' + rank : '–';
    renderResultEmail();
    const n = $('#result-note');
    n.textContent = note || '';
    n.hidden = !note;
    const again = $('#result-again');
    $('#result-topup').hidden = true;
    if (game.pending) {
      setText(again, 'Try again');
      again.onclick = () => { n.hidden = true; submitPending().then((x) => showResult(score, x.r, x.note)); };
    } else if (credits > 0 && !isClosed()) {
      setText(again, `Play again · ${credits} left`);
      again.onclick = () => { game.state = 'idle'; startGame(); };
    } else if (isClosed()) {
      setText(again, 'Done');
      again.onclick = () => go('home');
    } else {
      setText(again, 'Another play · €2');
      again.onclick = () => buy('single');
      $('#result-topup').hidden = false;
    }
    $('#result').hidden = false;
    // First scored play: ask where to send the news if they win, and nothing on top of it.
    const firstAsk = !!r && !!player && !player.contact_email && !store.get(CONTACT_ASKED_KEY);
    if (finePointer.matches && !firstAsk) again.focus({ preventScroll: true }); // Enter or Space plays again
    if (r && rank === 1 && prevRank !== 1 && !firstAsk) toast('You are top of the board');
    if (firstAsk) openContact(true);
  }
  // The reminder row on the result screen shows only while no email is on file.
  function renderResultEmail() { const b = $('#result-email'); b.hidden = b.parentElement.hidden = !player || !!player.contact_email || !!store.get(CONTACT_ASKED_KEY); }

  // ---------------------------------------------------------------------------
  // The code: shown once after the first play, saved as an image, and always on the You tab
  // ---------------------------------------------------------------------------
  function showCodeSheet() {
    $('#code-name').innerHTML = nameHtml(player.display);
    $('#code-digits').textContent = player.claim_code;
    showTicket();
    openSheet('code');
  }
  $('#code-done').addEventListener('click', () => closeSheets());
  $('#code-save').addEventListener('click', () => saveCodeImage());
  $('#you-save').addEventListener('click', () => (IOS_TOUCH ? showCodeSheet() : saveCodeImage())); // iPhone: the sheet shows what to tap
  // The ticket: a 4:5 image with the PresLink cross, the light bar, the initials and the code, and
  // the words that matter: it is not a prize, it is the code that collects one if you win. Shown in
  // the code sheet and saved by the button below (where it goes depends on the device, see save).
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const crossImage = new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = 'assets/cross.svg?v=10'; });
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
    ctx.fillStyle = '#1c1c1e'; ctx.font = font(36, 800); ctx.fillText(HONOURS() ? 'Proves your scores are yours.' : 'Show this to collect a prize.', W / 2, 1140);
    ctx.fillStyle = '#8e8e93'; ctx.font = font(28, 600); ctx.fillText(location.host || 'preslink.netlify.app', W / 2, 1200);
    return c;
  }
  // One rendered ticket per player, kept as a blob so the save button has nothing left to wait for.
  let ticket = null;
  async function ticketFor() {
    const key = `${player.display}|${player.claim_code}|${location.host}|${HONOURS() ? 'h' : 'p'}`;
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
  const IS_ANDROID = /Android/i.test(navigator.userAgent || '');
  const SAVE_LABEL = IOS_TOUCH ? 'Save to Photos' : IS_ANDROID ? 'Save to Gallery' : 'Save picture';
  const HINT_TAP = 'Then tap Save Image on the menu that opens.';
  const HINT_HOLD = 'Or hold your finger on the ticket, then tap Add to Photos.';
  $$('.save-btn').forEach((b) => { b.textContent = SAVE_LABEL; });
  $$('#save-hint, #contact-save-hint').forEach((h) => { h.textContent = HINT_TAP; h.hidden = !IOS_TOUCH; });
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
    if (IOS_TOUCH) {
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
      toast(isSchool() ? `Saved. You are on the ${boardName(player.role)} board.` : HONOURS() ? 'Saved. We will email you if you top a board.' : 'Saved. We will email you if you win.');
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
  // A green line slides under the chosen tab.
  $$('.segmented').forEach((seg) => {
    const tabs = $$('.tab, button', seg).filter((b) => !b.classList.contains('thumb'));
    if (!tabs.length) return;
    const thumb = document.createElement('span'); thumb.className = 'thumb'; thumb.setAttribute('aria-hidden', 'true'); seg.prepend(thumb);
    seg.style.setProperty('--n', tabs.length);
    const place = () => { const i = tabs.findIndex((b) => b.classList.contains('active')); seg.style.setProperty('--i', Math.max(0, i)); thumb.style.opacity = i < 0 ? '0' : '1'; };
    place();
    new MutationObserver(place).observe(seg, { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  let boardTouched = false;
  let boardSeq = 0;
  // A row: the place, the initials tile, the score.
  function rowHtml(r, me) {
    return `<li${me ? ' class="me"' : ''}><span class="rank">${r.rank}</span>${avatarHtml(r.initials, false, r.colour)}<span class="who">${me ? 'You' : ''}</span><span class="pts">${r.score}</span></li>`;
  }
  // The top three on a podium: second on the left, first in the middle and highest, third on the right. Each
  // tile stands on a step with its place on it.
  const podiumHtml = (rows) => rows.slice(0, 3).map((r, i) => {
    const me = !!player && r.tag === player.tag;
    return `<li class="p${i + 1}${me ? ' me' : ''}"${me ? ' aria-label="You"' : ''}>${avatarHtml(r.initials, false, r.colour)}<span class="pts">${r.score}</span><span class="step">${r.rank}</span></li>`;
  }).join('');
  const emptyHtml = (role) => `<strong>No scores yet</strong><span>${role !== 'everyone' && !isSchool() ? 'Students and teachers join with their school email on the You tab.' : 'The first score takes the top spot.'}</span>`;
  // What the board shows now, so a refresh that changes nothing redraws nothing (and nothing replays its entrance).
  let painted = '';
  function paint(rows) {
    const key = `${boardRole}|${player ? player.tag : ''}|${JSON.stringify(rows)}`;
    if (painted === key) return;
    painted = key;
    renderBoard(rows);
  }
  async function loadBoard() {
    if (!boardTouched) boardRole = isSchool() ? player.role : 'everyone';
    $$('[data-screen="board"] .tab').forEach((x) => { x.classList.toggle('active', x.dataset.role === boardRole); x.setAttribute('aria-selected', x.dataset.role === boardRole); });
    if (boardCache[boardRole]) paint(boardCache[boardRole]); // the last known rows at once; fresh ones follow
    else { painted = ''; $('#board-podium').hidden = true; $('#board-list').hidden = true; $('#board-empty').innerHTML = '<span>Loading…</span>'; $('#board-empty').hidden = false; }
    const seq = ++boardSeq;
    let rows = [];
    try {
      rows = await rpc('board', { p_role: boardRole === 'everyone' ? null : boardRole });
    } catch (ex) {
      toast(msg(ex), true);
      if (seq === boardSeq && !boardCache[boardRole]) $('#board-empty').innerHTML = `<span>${esc(msg(ex))}</span>`; // the open board tries again every 20 seconds
      return;
    }
    if (seq !== boardSeq) return; // a newer tab tap is in flight
    boardCache[boardRole] = rows;
    paint(rows);
    prefetchBoards(false, ['everyone', 'student', 'teacher']); // the other tabs open at once
  }
  setInterval(() => { if (current === 'board' && !document.hidden) loadBoard(); }, 20000); // the board stays live while it is open
  const boardCache = {};
  // Everyone and the player's own board by default: the ones a new score changes and a visitor opens first.
  function prefetchBoards(force, roles = ['everyone', isSchool() ? player.role : null]) {
    for (const role of roles) {
      if (role && (force || !boardCache[role])) rpc('board', { p_role: role === 'everyone' ? null : role }).then((rows) => { boardCache[role] = rows; }).catch(() => {});
    }
  }
  function renderBoard(rows) {
    const pod = $('#board-podium'), list = $('#board-list'), empty = $('#board-empty');
    const TOP = 20;
    const isMe = (r) => !!player && r.tag === player.tag;
    const mine = player ? rows.findIndex(isMe) : -1;
    let html = rows.slice(3, TOP).map((r) => rowHtml(r, isMe(r))).join('');
    if (mine >= TOP) html += '<li class="gap" aria-hidden="true">···</li>' + rowHtml(rows[mine], true);
    pod.innerHTML = podiumHtml(rows);
    pod.hidden = !rows.length;
    list.innerHTML = html;
    list.hidden = !html;
    empty.innerHTML = rows.length ? '' : emptyHtml(boardRole);
    empty.hidden = rows.length > 0;
  }
  // ---------------------------------------------------------------------------
  // You: letters, board, code
  // ---------------------------------------------------------------------------
  // Letters are picked on an on-screen pad, so no system keyboard ever covers the boxes. Tap a box to
  // clear that letter (the next letter goes there); a hardware keyboard works too.
  let liveLetters = null;
  function initialsField(id, onChange) {
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
        setText(b, letters[i]); b.classList.toggle('filled', !!letters[i]); b.classList.toggle('active', i === active);
        b.setAttribute('aria-label', letters[i] ? `Initial ${i + 1}: ${letters[i]}. Tap to clear` : `Initial ${i + 1}${i === 2 ? ', optional' : ''}, empty`);
      });
      pad.classList.toggle('full', active < 0);
      $$('.key:not(.back)', pad).forEach((k) => k.setAttribute('aria-disabled', active < 0 ? 'true' : 'false'));
    };
    const clearError = () => { const err = root.parentElement.querySelector('.field-error'); if (err) err.hidden = true; };
    const changed = () => { paint(); if (onChange) onChange(); };
    const type = (ch) => { if (active < 0) return; letters[active] = ch; active = firstEmpty(); changed(); clearError(); };
    const back = () => { let i = 2; while (i >= 0 && !letters[i]) i--; if (i < 0) return; letters[i] = ''; active = firstEmpty(); changed(); };
    boxes.forEach((b, i) => b.addEventListener('click', () => { letters[i] = ''; active = i; changed(); }));
    pad.addEventListener('click', (e) => {
      const k = e.target.closest('.key'); if (!k) return;
      if (k.dataset.key === 'back') back(); else type(k.dataset.key);
      if (e.detail > 0) k.blur(); // a tapped key gives focus back, so Enter on a hardware keyboard submits; keyboard users keep their place
    });
    const field = {
      type, back,
      value: () => letters.map((l) => l || ' ').join('').trimEnd(), // an empty middle box stays visible to the validator
      set: (v) => { const s = (v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); for (let i = 0; i < 3; i++) letters[i] = s[i] || ''; active = firstEmpty(); changed(); },
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
  let kbLift = -1;
  function fitSheets() {
    if (!vv) return;
    const lift = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    if (lift !== kbLift) { kbLift = lift; document.documentElement.style.setProperty('--kb', lift + 'px'); }
  }
  if (vv) { vv.addEventListener('resize', fitSheets); vv.addEventListener('scroll', fitSheets); }
  const editInitials = initialsField('edit-initials', () => paintSwatches());
  const nameInitials = initialsField('name-initials');
  $('#name-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = nameInitials.value();
    if (!/^[A-Z]{2,3}$/.test(initials)) { showError('name-error', MESSAGES.BAD_INITIALS); return; }
    const btn = $('#name-submit');
    btn.disabled = true;
    try {
      adoptPlayer(await api('register', { role: 'everyone', initials }));
      [CONTACT_ASKED_KEY, PROGRESS_KEY, 'preslink.prevBest', 'preslink.prevRank'].forEach((k) => store.del(k));
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
    refreshMe(true).then(() => { $('#you-empty').hidden = !!player; $('#you-panel').hidden = !player; renderYou(); });
  }
  function renderYou() {
    if (!player) return;
    $('#you-name').innerHTML = nameHtml(player.display || player.initials);
    $('#you-avatar').outerHTML = avatarHtml(player.display || player.initials, true, player.colour).replace('<span ', '<span id="you-avatar" ');
    const b = $('#you-board');
    b.textContent = isSchool() ? `${boardName(player.role)} board` : '';
    b.hidden = !isSchool();
    b.classList.toggle('school', isSchool());
    $('#you-email-text').textContent = player.contact_email || 'Optional';
    $('#you-code').textContent = player.claim_code;
    $('#you-credits').textContent = playsLeft();
    $('#you-best').textContent = best == null ? '–' : best;
    $('#you-spent').textContent = '€' + Math.round(((spend && spend.spent) || 0) / 100);
  }
  // Initials and colour change together in the edit card: the swatches show the letters as they are typed, and
  // Save sends what changed. A colour nobody picked follows the letters, as it always has.
  let editColour = 0, colourPicked = false;
  function paintSwatches() {
    if (!player) return;
    const letters = editInitials.value().replace(/\s/g, '') || player.initials;
    const on = colourPicked ? editColour : tileColour(letters, player.colour);
    $$('#you-colours .sw').forEach((x) => { const sel = Number(x.dataset.colour) === on; setText(x, letters); x.classList.toggle('on', sel); x.setAttribute('aria-checked', sel); });
  }
  $('#you-colours').addEventListener('click', (e) => {
    const sw = e.target.closest('.sw');
    if (!sw || !player) return;
    editColour = Number(sw.dataset.colour); colourPicked = true;
    paintSwatches();
  });
  $('#you-edit').addEventListener('click', () => {
    const f = $('#edit-form');
    f.hidden = !f.hidden;
    if (!f.hidden) {
      colourPicked = false; editColour = 0;
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
    const renamed = initials !== player.initials;
    const colour = colourPicked && editColour !== Number(player.colour) ? editColour : null;
    if (!renamed && colour == null) { $('#edit-form').hidden = true; return; }
    $('#edit-save').disabled = true;
    const oldCode = player.claim_code;
    try {
      if (renamed) adoptPlayer(await api('update', { player_id: player.id, initials }));
      if (colour != null) adoptPlayer(await api('colour', { player_id: player.id, colour }));
      Object.keys(boardCache).forEach((k) => { delete boardCache[k]; }); // the boards show the new tile on their next load
      $('#edit-form').hidden = true;
      renderYou();
      // The code goes with the letters: when it changes, say so, because it is what collects a prize.
      if (renamed && player.claim_code !== oldCode) toast(`You now play as ${player.display}. Your new code is ${player.claim_code}.`, false, 7000);
      else toast(renamed ? `You now play as ${player.display}` : 'Saved');
    } catch (ex) {
      showError('edit-error', msg(ex));
    } finally { $('#edit-save').disabled = false; }
  });
  $('#you-signout').addEventListener('click', () => {
    if (!player) return;
    $('#signout-tile').innerHTML = avatarHtml(player.display, true, player.colour);
    $('#signout-code').textContent = player.claim_code;
    openSheet('signout');
  });
  $('#signout-yes').addEventListener('click', () => {
    closeSheets();
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
      ['preslink.prevBest', 'preslink.prevRank', PROGRESS_KEY].forEach((k) => store.del(k));
      adoptPlayer(await api('signin', { initials, code }));
      store.set(HOW_SEEN_KEY, true); // they have played before
      $('#signin-name').value = ''; $('#signin-code').value = '';
      toast(`Welcome back, ${player.display}`);
      go('you');
    } catch (ex) {
      showError('signin-error', msg(ex));
    } finally { btn.disabled = false; }
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  // Splash: a device's first visit only (decided in the head), about a second and a half. A tap skips it.
  const splashDone = new Promise((resolve) => {
    const el = $('#splash');
    if (!el) { resolve(); return; }
    const finish = () => { el.classList.add('gone'); resolve(); };
    const returning = /session_id=|cancelled=/.test(location.search) || document.documentElement.classList.contains('no-splash');
    if (returning) { finish(); return; }
    setTimeout(finish, reduceMotion() ? 600 : 1450);
    el.addEventListener('click', finish);
  });
  // Back from another page (the back-forward cache): the page is as it was; only the numbers are refreshed.
  window.addEventListener('pageshow', (e) => { if (e.persisted) { overlay(null); refreshStats(); refreshMe(true); } });

  async function boot() {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    const cancelled = params.get('cancelled');
    if (sessionId || cancelled) history.replaceState(null, '', location.pathname + '#home');

    const pending = store.get(PENDING_KEY);
    if (pending && player && pending.player_id === player.id && Array.isArray(pending.taps)) {
      api('submit', pending).then(() => store.del(PENDING_KEY), (ex) => { if (ex.code !== 'NETWORK' && ex.code !== 'SERVER_ERROR') store.del(PENDING_KEY); })
        .finally(() => { refreshMe(true); refreshStats(); });
    } else if (pending) store.del(PENDING_KEY);
    if (DEMO) toast('Demo: payments and scores are simulated on this device.', false, 4000);
    store.del('preslink.practice'); // left by the practice rounds of an earlier version

    renderHome();
    refreshStats();
    pollStats();
    const h0 = location.hash.slice(1);
    if (SHEET_LINKS.includes(h0)) { render('home'); openSheet(h0); } else render(h0 || 'home');
    if (params.get('r') && !sessionId && !cancelled) history.replaceState(null, '', location.pathname + location.hash); // the source is kept; the address stays clean
    if (sessionId) await confirmPayment(sessionId);
    else if (cancelled) toast('Payment cancelled. Nothing was charged.');
  }
  hapAll();
  boot();
  setTimeout(prefetchBoards, 1500); // the leaderboard opens with rows already in hand
})();
