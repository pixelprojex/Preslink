/* PresLink Arcade: the committee console. The committee runs the game from here: the money and the payments, the
   players (their codes, bans, cancelled plays, offensive names and free plays), the winners and the blocked names,
   with searches and CSV downloads. Nothing here edits the site: its words, photos, prizes, dates, goal, limits and
   switches are the owner's, and the campaign strip on the Overview only shows them. Every change asks first, inline,
   then shows what it did. No framework, no build step; talks to the same API as the arcade (action "admin" with the
   committee code) or to the demo backend when config.js is empty. */
(() => {
  'use strict';

  const CONFIG = window.PRESLINK_CONFIG || {};
  const DEMO = !CONFIG.SUPABASE_URL;
  const KEY = 'preslink.adminCode';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euro = (cents) => '€' + (Math.round(cents || 0) / 100).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const whole = (cents) => '€' + Math.round((cents || 0) / 100).toLocaleString('en-IE');
  const when = (iso, time = true) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-IE', time ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }); };
  const dayName = (ymd) => { const d = new Date(ymd + 'T12:00:00'); return isNaN(d) ? String(ymd || '') : d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const BOARD = { everyone: 'Everyone', student: 'Students', teacher: 'Teachers' };
  const MESSAGES = {
    NETWORK: 'No connection. Check the internet and try again.',
    BAD_ADMIN: 'Wrong committee code.',
    LOCKED: 'Too many wrong codes. Try again in 15 minutes.',
    ADMIN_NOT_SET: 'No committee code has been set yet.',
    PLAYER_NOT_FOUND: 'No player with that name.',
    PLAY_NOT_FOUND: 'That play was not found. Open the player again.',
    BANNED: 'This player is banned. Unban them first.',
    CLOSED: 'The game has closed, so a new play could not be used.',
    FREE_PLAY_LIMIT: 'This player has had all the free plays one player can have.',
    BAD_REASON: 'Write a short reason (at least 3 characters).',
    BAD_INITIALS: 'Type three initials, A to Z.',
    BUILT_IN_NAME: "That name is on the site's own list, and it stays blocked.",
    NO_NAMES_LEFT: 'No new name could be found. Try again.',
    OWNER_ONLY: "Only the site's owner can do that.",
    BAD_ADMIN_OP: "The server needs an update for this. Ask the site's owner.",
    SERVER_ERROR: 'Something went wrong. Try again.',
  };
  const msg = (e) => MESSAGES[e && e.code] || MESSAGES.SERVER_ERROR;
  const AUTH = ['BAD_ADMIN', 'LOCKED', 'ADMIN_NOT_SET'];
  const session = {
    get() { try { return sessionStorage.getItem(KEY) || ''; } catch (_) { return ''; } },
    set(v) { try { sessionStorage.setItem(KEY, v); } catch (_) { /* ignore */ } },
    del() { try { sessionStorage.removeItem(KEY); } catch (_) { /* ignore */ } },
  };

  // ---------------------------------------------------------------------------
  // Backend
  // ---------------------------------------------------------------------------
  class ApiError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }
  function headers() {
    const h = { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY || '' };
    if ((CONFIG.SUPABASE_KEY || '').startsWith('eyJ')) h.Authorization = 'Bearer ' + CONFIG.SUPABASE_KEY;
    return h;
  }
  async function api(action, payload = {}) {
    if (DEMO) return window.PRESLINK_MOCK.api(action, payload);
    let res;
    try { res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/api', { method: 'POST', headers: headers(), body: JSON.stringify({ action, ...payload }) }); }
    catch (_) { throw new ApiError('NETWORK', 0); }
    let data = null;
    try { data = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) throw new ApiError((data && data.error) || 'SERVER_ERROR', res.status);
    return data;
  }
  const call = (op, extra = {}) => api('admin', { code: session.get(), op, ...extra });

  let toastTimer = 0;
  function toast(text, isError = false) {
    const t = $('#toast');
    t.textContent = text; t.classList.toggle('error', isError); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 5000 : 2600);
  }
  // A failed call that means the code no longer works sends the committee back to the sign-in.
  async function guarded(fn) {
    try { return await fn(); }
    catch (ex) {
      if (AUTH.includes(ex.code)) { signOut(msg(ex)); return null; }
      toast(msg(ex), true); return null;
    }
  }

  // ---------------------------------------------------------------------------
  // The eye on the code field
  // ---------------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.eye');
    if (!b) return;
    const inp = $('#' + b.dataset.eye);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.classList.toggle('on', show);
    b.setAttribute('aria-label', show ? 'Hide' : 'Show');
    b.title = show ? 'Hide' : 'Show';
  });

  // ---------------------------------------------------------------------------
  // Sign in and out
  // ---------------------------------------------------------------------------
  let overview = null;
  let stripe = null; // stripe_status: whether payments are on, and live or test
  function showLogin(error) {
    $('#shell').hidden = true;
    $('#login').hidden = false;
    $('#login-hint').hidden = !DEMO;
    if (DEMO) $('#login-hint').textContent = 'Demo code: PRESLINK';
    const err = $('#login-error');
    err.textContent = error || ''; err.hidden = !error;
    setTimeout(() => $('#login-code').focus(), 50);
  }
  function signOut(error) { session.del(); overview = null; closeConfirm(); showLogin(error); }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Tidy what was typed or pasted: spaces, long or curly dashes, and the case of a PRES- code.
    let code = $('#login-code').value.trim().replace(/[‐-―−]/g, '-').replace(/\s+/g, '');
    if (/^pres-[a-z]{3}[#$%&*!]-\d{4}-\d{4}$/i.test(code)) code = code.toUpperCase();
    const btn = $('#login-submit');
    if (!code) { showLogin('Type the committee code.'); return; }
    btn.disabled = true;
    try {
      overview = await api('admin', { code, op: 'overview' });
      session.set(code);
      $('#login-code').value = '';
      $('#login').hidden = true; $('#shell').hidden = false;
      route();
      call('stripe_status').then(renderStripe).catch(() => {});
    } catch (ex) { showLogin(msg(ex)); }
    finally { btn.disabled = false; }
  });
  $('#signout').addEventListener('click', () => signOut());
  function renderStripe(s) {
    stripe = s || null;
    $('#top-stripe').textContent = !s || !s.connected ? 'Stripe not connected' : (s.mode === 'live' ? 'Stripe live' : 'Stripe test mode');
    renderCampaign();
  }

  // ---------------------------------------------------------------------------
  // Changes: each one asks first, inline, under what was clicked
  // ---------------------------------------------------------------------------
  // opts: text (the question), ok (its button), danger, input ({ label, placeholder, max, min, hint }: a reason,
  // required when min is set), run(value) (makes the change and shows the outcome; an error stays in the box).
  let asking = null;
  function closeConfirm(refocus) {
    if (!asking) return;
    const { el, from } = asking; asking = null;
    (el.closest('tr.cf-row') || el).remove();
    if (refocus && from && document.contains(from)) from.focus();
  }
  function askFirst(from, after, opts) {
    closeConfirm();
    const el = document.createElement('div');
    el.className = 'confirm';
    el.setAttribute('role', 'group'); el.setAttribute('aria-labelledby', 'cf-q');
    const inp = opts.input;
    el.innerHTML = `<p id="cf-q">${esc(opts.text)}</p>`
      + (inp ? `<label class="lbl" for="cf-reason">${esc(inp.label)}</label><input id="cf-reason" type="text" maxlength="${inp.max || 120}" autocomplete="off" placeholder="${esc(inp.placeholder || '')}">` : '')
      + `<p class="err" hidden></p><div class="actions"><button class="btn small ${opts.danger ? 'danger' : 'primary'}" type="button" data-cf="ok">${esc(opts.ok)}</button><button class="btn small" type="button" data-cf="back">Back</button></div>`;
    if (after.tagName === 'TR') {
      const tr = document.createElement('tr'); tr.className = 'cf-row';
      const td = document.createElement('td'); td.colSpan = after.children.length; td.className = 'wrap';
      td.appendChild(el); tr.appendChild(td); after.after(tr);
    } else after.after(el);
    asking = { el, from };
    const field = $('#cf-reason', el), ok = $('[data-cf="ok"]', el), err = $('.err', el);
    const go = async () => {
      if (ok.disabled) return;
      const value = field ? field.value.replace(/\s+/g, ' ').trim() : '';
      if (inp && inp.min && value.length < inp.min) { err.textContent = inp.hint; err.hidden = false; field.focus(); return; }
      ok.disabled = true; err.hidden = true;
      try { await opts.run(value); }
      catch (ex) {
        if (AUTH.includes(ex.code)) { signOut(msg(ex)); return; }
        err.textContent = msg(ex); err.hidden = false; ok.disabled = false;
      }
    };
    ok.addEventListener('click', go);
    $('[data-cf="back"]', el).addEventListener('click', () => closeConfirm(true));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeConfirm(true); }
      else if (e.key === 'Enter' && e.target === field) { e.preventDefault(); go(); }
    });
    (field || ok).focus();
    el.scrollIntoView({ block: 'nearest' });
  }

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------
  const PAGES = ['overview', 'payments', 'players', 'winners', 'blocked'];
  const loaders = {};
  function route() {
    let page = location.hash.slice(1) || 'overview';
    if (!PAGES.includes(page)) page = 'overview';
    closeConfirm();
    $$('main > section').forEach((s) => { s.hidden = s.dataset.page !== page; });
    $$('#menu a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
    window.scrollTo(0, 0);
    if (loaders[page]) loaders[page]();
  }
  window.addEventListener('hashchange', () => { if (session.get()) route(); });

  async function refreshOverview() {
    const o = await guarded(() => call('overview'));
    if (o) overview = o;
    return overview;
  }

  // Overview -------------------------------------------------------------------
  loaders.overview = async () => { await refreshOverview(); renderOverview(); loadRecent(); loadCampaign(); };
  async function loadRecent() {
    let res;
    try { res = await call('payments', { q: '', from: '', to: '', limit: 5, offset: 0 }); } catch (_) { return; }
    const tb = $('#ov-recent tbody'); tb.innerHTML = '';
    (res.rows || []).forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(when(p.created_at))}</td><td><a href="#players" data-player="${esc(p.initials)}">${esc(p.initials)}</a></td><td class="num">${p.credits}</td><td class="num">${euro(p.amount_cents)}</td><td>${esc(p.email || p.contact_email || '')}</td>`;
      tb.appendChild(tr);
    });
    if (!tb.children.length) tb.innerHTML = '<tr><td colspan="5" class="muted">No payments yet.</td></tr>';
  }
  function renderOverview() {
    const d = overview; if (!d) return;
    const s = d.stats || {};
    $('#ov-raised').textContent = whole(s.total_raised_cents);
    const goal = Number(s.goal_cents || 0);
    $('#ov-goal').textContent = goal > 0 ? `${Math.round((Number(s.total_raised_cents || 0) / goal) * 100)}% of ${whole(goal)}` : 'No goal set';
    $('#ov-payments').textContent = s.payments || 0;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });
    const td = (d.by_day || []).find((x) => x.day === today);
    $('#ov-today').textContent = td ? `${td.payments} today · ${euro(td.amount_cents)}` : 'None today';
    $('#ov-plays').textContent = s.plays || 0;
    $('#ov-players').textContent = s.players || 0;
    const r = d.players_by_role || {};
    $('#ov-roles').textContent = `${r.student || 0} students · ${r.teacher || 0} teachers · ${r.everyone || 0} everyone`;
    const tb = $('#ov-leaders tbody'); tb.innerHTML = '';
    const board = d.board || [];
    const emailOf = (id) => { const e = (d.emails || []).find((x) => x.player_id === id); return e ? (e.contact_email || e.school_email || '') : ''; };
    const lead = (label, row, scoreText) => {
      const tr = document.createElement('tr');
      tr.innerHTML = row ? `<td>${label}</td><td>${esc(row.initials)}</td><td class="num">${esc(scoreText)}</td><td>${esc(row.claim_code)}</td><td>${esc(emailOf(row.player_id))}</td>` : `<td>${label}</td><td class="muted" colspan="4">Nobody yet</td>`;
      tb.appendChild(tr);
    };
    const top = (pred) => board.filter(pred).sort((a, b) => b.score - a.score || String(a.finished_at).localeCompare(String(b.finished_at)))[0];
    lead('Everyone board', top((x) => !x.banned), (top((x) => !x.banned) || {}).score);
    lead('Students board', top((x) => !x.banned && x.role === 'student'), (top((x) => !x.banned && x.role === 'student') || {}).score);
    lead('Teachers board', top((x) => !x.banned && x.role === 'teacher'), (top((x) => !x.banned && x.role === 'teacher') || {}).score);
    const sp = d.spot || {};
    const rowFor = (initials) => board.find((x) => x.initials === initials);
    lead('Best light', sp.best_light ? rowFor(sp.best_light.initials) || { initials: sp.best_light.initials, claim_code: '', player_id: '' } : null, sp.best_light ? sp.best_light.score : '');
    lead('First play', sp.first_play ? rowFor(sp.first_play.initials) || { initials: sp.first_play.initials, claim_code: '', player_id: '' } : null, sp.first_play ? sp.first_play.score : '');
    const dd = $('#ov-days tbody'); dd.innerHTML = '';
    (d.by_day || []).forEach((x) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${esc(when(x.day + 'T12:00:00', false))}</td><td class="num">${x.payments}</td><td class="num">${euro(x.amount_cents)}</td>`; dd.appendChild(tr); });
    if (!dd.children.length) dd.innerHTML = '<tr><td colspan="3" class="muted">No payments yet.</td></tr>';
    if (!d.emails) call('emails').then((rows) => { d.emails = Array.isArray(rows) ? rows : []; if (!$('main > section[data-page="overview"]').hidden) renderOverview(); }).catch(() => {});
  }
  // The campaign as the owner set it: shown, never changed here.
  let camp = null;
  async function loadCampaign() {
    try { camp = await call('campaign'); } catch (_) { camp = null; }
    renderCampaign();
  }
  function closing(c) {
    if (!c.ends_on) return 'No date set';
    const left = new Date(c.closes_at || c.ends_on + 'T23:59:59') - Date.now();
    if (c.closed || left <= 0) return `Closed · the last day was ${dayName(c.ends_on)}`;
    const days = Math.ceil(left / 86400000);
    return `${dayName(c.ends_on)} · ${days <= 1 ? 'last day' : days + ' days left'}`;
  }
  function renderCampaign() {
    const box = $('#ov-campaign');
    box.hidden = !camp;
    if (!camp) return;
    $('#cp-close').textContent = closing(camp);
    $('#cp-goal').textContent = Number(camp.goal_cents) > 0 ? whole(camp.goal_cents) : 'Not set';
    $('#cp-limits').textContent = `${whole(camp.daily_cap_cents)} a day, ${whole(camp.campaign_cap_cents)} in all`;
    $('#cp-mode').textContent = camp.prize_mode === 'honours' ? 'Honours only, no prizes' : 'Prizes';
    $('#cp-pay').textContent = !stripe ? '–' : !stripe.connected ? 'Off' : stripe.mode === 'live' ? 'On, live' : 'On, test mode';
  }

  // Payments -------------------------------------------------------------------
  // A payment's page in the Stripe Dashboard. Test payments live under /test: the session's cs_test_ or cs_live_
  // says which, and Stripe's mode is the fallback.
  function stripeUrl(p) {
    const pi = String(p.stripe_payment_intent || '');
    if (!/^pi_[A-Za-z0-9_]+$/.test(pi)) return '';
    const sid = String(p.stripe_session_id || '');
    const test = sid.startsWith('cs_test_') ? true : sid.startsWith('cs_live_') ? false : !(stripe && stripe.mode === 'live');
    return `https://dashboard.stripe.com/${test ? 'test/' : ''}payments/${pi}`;
  }
  const stripeCell = (p) => { const u = stripeUrl(p); return (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">Open in Stripe</a>` : '') + (p.stripe_session_id ? `<div class="muted small">${esc(p.stripe_session_id)}</div>` : ''); };
  const refundCell = (p) => (p.refunded_cents > 0 ? euro(p.refunded_cents) + (p.refunded_cents >= p.amount_cents ? ' (all)' : '') : '');
  const pay = { q: '', from: '', to: '', offset: 0, limit: 50, total: 0, rows: [] };
  loaders.payments = () => loadPayments();
  async function loadPayments() {
    const res = await guarded(() => call('payments', { q: pay.q, from: pay.from, to: pay.to, limit: pay.limit, offset: pay.offset }));
    if (!res) return;
    pay.rows = res.rows || []; pay.total = Number(res.total || 0);
    const refunded = Number(res.refunded_cents || 0);
    $('#pay-summary').textContent = `${plural(pay.total, 'payment', 'payments')} · ${euro(res.sum_cents)}${refunded > 0 ? ` · ${euro(refunded)} refunded` : ''}`;
    const tb = $('#pay-table tbody'); tb.innerHTML = '';
    pay.rows.forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(when(p.created_at))}</td><td><a href="#players" data-player="${esc(p.initials)}">${esc(p.initials)}</a></td><td>${esc(BOARD[p.role] || p.role || '')}</td><td class="num">${p.credits}</td><td class="num">${euro(p.amount_cents)}</td><td class="num">${refundCell(p)}</td><td>${esc(p.email || p.contact_email || '')}</td><td>${esc(p.source || '')}</td><td>${stripeCell(p)}</td>`;
      tb.appendChild(tr);
    });
    if (!tb.children.length) tb.innerHTML = '<tr><td colspan="9" class="muted">Nothing matches.</td></tr>';
    const first = pay.total ? pay.offset + 1 : 0, last = Math.min(pay.total, pay.offset + pay.rows.length);
    $('#pay-page').textContent = pay.total ? `${first} to ${last} of ${pay.total}` : '';
    $('#pay-prev').disabled = pay.offset === 0; $('#pay-next').disabled = last >= pay.total;
  }
  $('#pay-filters').addEventListener('submit', (e) => { e.preventDefault(); $$('#pay-quick .mini').forEach((x) => x.classList.remove('on')); pay.q = $('#pay-q').value.trim(); pay.from = $('#pay-from').value; pay.to = $('#pay-to').value; pay.offset = 0; loadPayments(); });
  const dayIE = (back) => { const d = new Date(); d.setDate(d.getDate() - back); return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' }); };
  $('#pay-quick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]'); if (!b) return;
    const r = b.dataset.range;
    $('#pay-from').value = r === 'all' ? '' : dayIE(r === 'today' ? 0 : Number(r) - 1);
    $('#pay-to').value = r === 'all' ? '' : dayIE(0);
    $$('#pay-quick .mini').forEach((x) => x.classList.toggle('on', x === b));
    pay.q = $('#pay-q').value.trim(); pay.from = $('#pay-from').value; pay.to = $('#pay-to').value; pay.offset = 0; loadPayments();
  });
  $('#pay-prev').addEventListener('click', () => { pay.offset = Math.max(0, pay.offset - pay.limit); loadPayments(); });
  $('#pay-next').addEventListener('click', () => { pay.offset += pay.limit; loadPayments(); });
  $('#pay-csv').addEventListener('click', async () => {
    const rows = [['when', 'name', 'board', 'bundle', 'plays', 'amount_eur', 'refunded_eur', 'email', 'source', 'stripe_session', 'payment_intent']];
    for (let off = 0; ; off += 500) {
      const res = await guarded(() => call('payments', { q: pay.q, from: pay.from, to: pay.to, limit: 500, offset: off }));
      if (!res) return;
      (res.rows || []).forEach((p) => rows.push([p.created_at, p.initials, p.role || '', p.bundle, p.credits, (p.amount_cents / 100).toFixed(2), ((p.refunded_cents || 0) / 100).toFixed(2), p.email || p.contact_email || '', p.source || '', p.stripe_session_id || '', p.stripe_payment_intent || '']));
      if (!res.rows || res.rows.length < 500) break;
    }
    downloadCsv(rows, 'preslink-payments.csv');
  });
  // A cell that starts with = + - or @ is read as a formula by spreadsheets: an apostrophe in front keeps it text.
  const cell = (c) => { const t = String(c == null ? '' : c); return '"' + (/^[=+\-@\t\r]/.test(t) ? "'" + t : t).replace(/"/g, '""') + '"'; };
  function downloadCsv(rows, name) {
    const csv = rows.map((r) => r.map(cell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name; a.click();
  }

  // Players --------------------------------------------------------------------
  const pl = { q: '', role: '', banned: false, offset: 0, limit: 50, total: 0, rows: [] };
  loaders.players = () => loadPlayers();
  async function loadPlayers() {
    const res = await guarded(() => call('players', { q: pl.q, role: pl.role || null, banned: pl.banned ? true : null, limit: pl.limit, offset: pl.offset }));
    if (!res) return;
    pl.rows = res.rows || []; pl.total = Number(res.total || 0);
    $('#pl-summary').textContent = plural(pl.total, 'player', 'players');
    const tb = $('#pl-table tbody'); tb.innerHTML = '';
    pl.rows.forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><a href="#players" data-view="${esc(p.initials)}"><b>${esc(p.initials)}</b></a>${p.banned ? ' <span class="muted">(banned)</span>' : ''}</td><td>${esc(BOARD[p.role] || p.role)}</td><td>${esc(p.claim_code)}</td><td>${esc(p.contact_email || '')}</td><td>${esc(p.school_email || '')}</td><td class="num">${p.plays || 0}</td><td class="num">${p.best == null ? '–' : p.best}</td><td class="num">${euro(p.paid_cents)}</td><td>${esc(when(p.last_seen_at))}</td>
        <td><button class="mini" type="button" data-view="${esc(p.initials)}">View</button></td>`;
      tb.appendChild(tr);
    });
    if (!tb.children.length) tb.innerHTML = '<tr><td colspan="10" class="muted">Nothing matches.</td></tr>';
    const first = pl.total ? pl.offset + 1 : 0, last = Math.min(pl.total, pl.offset + pl.rows.length);
    $('#pl-page').textContent = pl.total ? `${first} to ${last} of ${pl.total}` : '';
    $('#pl-prev').disabled = pl.offset === 0; $('#pl-next').disabled = last >= pl.total;
  }
  $('#pl-filters').addEventListener('submit', (e) => { e.preventDefault(); pl.q = $('#pl-q').value.trim(); pl.role = $('#pl-role').value; pl.banned = $('#pl-banned').checked; pl.offset = 0; loadPlayers(); });
  $('#pl-prev').addEventListener('click', () => { pl.offset = Math.max(0, pl.offset - pl.limit); loadPlayers(); });
  $('#pl-next').addEventListener('click', () => { pl.offset += pl.limit; loadPlayers(); });
  $('#pl-csv').addEventListener('click', async () => {
    const rows = [['name', 'board', 'code', 'email', 'school_email', 'plays', 'best', 'paid_eur', 'banned', 'first_seen', 'last_seen']];
    for (let off = 0; ; off += 500) {
      const res = await guarded(() => call('players', { q: pl.q, role: pl.role || null, banned: pl.banned ? true : null, limit: 500, offset: off }));
      if (!res) return;
      (res.rows || []).forEach((p) => rows.push([p.initials, p.role || '', p.claim_code, p.contact_email || '', p.school_email || '', p.plays || 0, p.best == null ? '' : p.best, ((p.paid_cents || 0) / 100).toFixed(2), p.banned ? 'yes' : '', p.created_at, p.last_seen_at]));
      if (!res.rows || res.rows.length < 500) break;
    }
    downloadCsv(rows, 'preslink-players.csv');
  });
  // Searches the players list for some letters (keeping the board and banned filters clear) and opens the first.
  function findPlayer(initials) {
    $('#pl-q').value = initials; pl.q = initials; pl.role = ''; pl.banned = false; pl.offset = 0; $('#pl-role').value = ''; $('#pl-banned').checked = false;
  }
  // a name link anywhere opens that player
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-player]');
    if (!a) return;
    e.preventDefault();
    findPlayer(a.dataset.player);
    location.hash = 'players';
    loadPlayers().then(() => viewPlayer(a.dataset.player));
  });
  // the name (handy on a phone, where the View button is off to the right) or View opens the player
  $('main > section[data-page="players"]').addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { e.preventDefault(); viewPlayer(v.dataset.view); }
  });

  // The player's record, and what the committee can do for or about them.
  let shown = null;       // the player in the detail
  let detailNote = null;  // what the last change did, shown once after the refresh: { text, at: 'top' | 'plays' }
  const playRow = (x) => {
    const scored = x.score != null;
    const why = x.voided && x.void_reason && x.void_reason !== 'committee' ? ` <span class="muted small">${esc(x.void_reason)}</span>` : '';
    const act = !scored ? '' : x.voided ? '<button class="mini" type="button" data-act="restore">Restore</button>' : '<button class="mini" type="button" data-act="cancel">Cancel play</button>';
    return `<tr data-play="${esc(x.play_id)}" data-score="${scored ? x.score : ''}"><td>${esc(when(x.started_at))}</td><td class="num">${scored ? x.score : 'unfinished'}</td><td class="num">${x.best_light == null ? '–' : x.best_light}</td><td>${x.voided ? '<span class="tag">Cancelled</span>' + why + ' ' : ''}${act}</td></tr>`;
  };
  async function viewPlayer(initials, scroll = true) {
    const box = $('#pl-detail');
    const res = await guarded(() => call('player', { initials }));
    if (!res) { box.hidden = true; return; }
    closeConfirm();
    const p = res.player, plays = res.plays || [], pays = res.payments || [], free = res.free_plays || [];
    const limit = Number(res.free_play_limit) || 3;
    shown = { id: p.id, initials: p.initials, code: p.claim_code, banned: !!p.banned, given: free.length, limit };
    const note = detailNote; detailNote = null;
    const noteAt = (at) => (note && note.at === at ? `<p class="status" role="status">${esc(note.text)}</p>` : '');
    const left = p.credits + plays.filter((x) => x.score == null && !x.voided).length;
    const canGive = !p.banned && free.length < limit;
    box.dataset.initials = p.initials;
    box.innerHTML = `<div class="head"><h3 class="who">${esc(p.initials)}${p.banned ? ' <span class="tag">Banned</span>' : ''}</h3><button class="mini" type="button" data-act="close">Close</button></div>
      <p class="code-line"><span class="muted">Code</span> <strong class="code">${esc(p.claim_code)}</strong> <span class="muted small">Give it only to the player, in person.</span></p>
      <dl><dt>Board</dt><dd>${esc(BOARD[p.role] || p.role)}</dd><dt>Email</dt><dd>${esc(p.contact_email || '–')}</dd><dt>School email</dt><dd>${esc(p.school_email || '–')}</dd><dt>Plays left</dt><dd>${left}</dd><dt>Free plays</dt><dd>${free.length} of ${limit} given</dd><dt>First seen</dt><dd>${esc(when(p.created_at))}</dd><dt>Last seen</dt><dd>${esc(when(p.last_seen_at))}</dd>${(res.others || []).length ? `<dt>Same initials</dt><dd>${res.others.map(esc).join(', ')}</dd>` : ''}</dl>
      <div class="actions" id="pl-actions"><button class="btn small" type="button" data-act="give"${canGive ? '' : ' disabled'}>Give a free play</button><button class="btn small" type="button" data-act="rename">Reset name</button><button class="btn small" type="button" data-act="${p.banned ? 'unban' : 'ban'}">${p.banned ? 'Unban' : 'Ban'}</button>${canGive ? '' : `<span class="muted small">${p.banned ? 'Unban them to give a free play.' : 'All the free plays allowed are given.'}</span>`}</div>
      ${noteAt('top')}
      <h4>Plays</h4>
      ${noteAt('plays')}
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Started</th><th>Score</th><th>Best light</th><th></th></tr></thead><tbody>${plays.map(playRow).join('') || '<tr><td colspan="4" class="muted">No plays.</td></tr>'}</tbody></table></div>
      <h4>Free plays</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Given</th><th>Reason</th></tr></thead><tbody>${free.map((x) => `<tr><td>${esc(when(x.created_at))}</td><td class="wrap">${esc(x.reason)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">None given.</td></tr>'}</tbody></table></div>
      <h4>Payments</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Bundle</th><th>Plays</th><th>Amount</th><th>Refunded</th><th>Stripe</th></tr></thead><tbody>${pays.map((x) => `<tr><td>${esc(when(x.created_at))}</td><td>${esc(x.bundle)}</td><td class="num">${x.credits}</td><td class="num">${euro(x.amount_cents)}</td><td class="num">${refundCell(x)}</td><td>${stripeCell(x)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No payments.</td></tr>'}</tbody></table></div>`;
    box.hidden = false;
    const status = $('.status', box);
    if (scroll) box.scrollIntoView({ block: 'nearest' });
    else if (status) status.scrollIntoView({ block: 'nearest' });
  }
  // After a change: the record and the list fresh together, and the outcome in the record.
  async function changed(initials, text, at = 'top') {
    detailNote = { text, at };
    await Promise.all([viewPlayer(initials, false), loadPlayers()]);
  }
  $('#pl-detail').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !shown) return;
    const { id, initials: name, code } = shown;
    const top = $('#pl-actions');
    switch (b.dataset.act) {
      case 'close': closeConfirm(); $('#pl-detail').hidden = true; return;
      case 'give':
        askFirst(b, top, {
          text: `Give ${name} a free play? Only for a play that failed through a fault on our side. It isn't a payment and doesn't count as money raised. ${shown.given} of ${shown.limit} given so far.`,
          ok: 'Give the play',
          input: { label: 'Reason (kept with the play)', placeholder: 'e.g. froze on the second light', min: 3, max: 120, hint: MESSAGES.BAD_REASON },
          run: async (reason) => { const r = await call('give_play', { player_id: id, reason }); await changed(name, `Free play given to ${name} (${r.given} of ${r.limit}).`); },
        });
        return;
      case 'rename': {
        const letters = name.split('#')[0];
        askFirst(b, top, {
          text: `Give ${name} a new random name? Their scores, plays and code stay. They sign in with the new name and the same code, so tell them.`,
          ok: 'Reset name',
          run: async () => {
            const r = await call('reset_name', { player_id: id });
            findPlayer(r.initials);
            await changed(r.initials, `${name} is now ${r.initials}. The code is still ${code}.${letters.length === 3 ? ` To stop anyone else choosing ${letters}, block it under Blocked names.` : ''}`);
          },
        });
        return;
      }
      case 'ban':
        askFirst(b, top, {
          text: `Ban ${name}? They can't play or pay while banned, and their scores leave the boards and the winners. You can unban them.`,
          ok: `Ban ${name}`, danger: true,
          run: async () => { await call('ban', { player_id: id, banned: true }); await changed(name, `${name} is banned.`); },
        });
        return;
      case 'unban':
        askFirst(b, top, {
          text: `Unban ${name}? They can play again, and their scores go back on the boards.`,
          ok: `Unban ${name}`,
          run: async () => { await call('ban', { player_id: id, banned: false }); await changed(name, `${name} is unbanned.`); },
        });
        return;
      case 'cancel': {
        const tr = b.closest('tr');
        askFirst(b, tr, {
          text: `Cancel this play? Its score of ${tr.dataset.score} stops counting on the boards and for prizes. You can restore it.`,
          ok: 'Cancel play', danger: true,
          input: { label: 'Why (kept with the play, optional)', placeholder: "e.g. a committee member's play", max: 120 },
          run: async (reason) => { await call('void', { play_id: tr.dataset.play, voided: true, reason }); await changed(name, `Play cancelled: the score of ${tr.dataset.score} no longer counts.`, 'plays'); },
        });
        return;
      }
      case 'restore': {
        const tr = b.closest('tr');
        askFirst(b, tr, {
          text: `Restore this play? Its score of ${tr.dataset.score} counts again.`,
          ok: 'Restore play',
          run: async () => { await call('void', { play_id: tr.dataset.play, voided: false }); await changed(name, `Play restored: the score of ${tr.dataset.score} counts again.`, 'plays'); },
        });
        return;
      }
    }
  });

  // Winners --------------------------------------------------------------------
  // The top three of each prize slot, ranked as the public site ranks them, with what the committee needs at the
  // close: the emails to reach a winner and the code they show to collect.
  const SLOTS = [['everyone', 'Everyone board'], ['students', 'Students board'], ['teachers', 'Teachers board'], ['best_light', 'Best light'], ['first_play', 'First play']];
  loaders.winners = async () => {
    const res = await guarded(() => call('winners'));
    if (!res) return;
    const closed = res.closes_at && new Date(res.closes_at) <= Date.now();
    $('#win-sub').textContent = !res.ends_on ? 'Standings now. No closing date is set yet.'
      : closed ? `Final places: the game closed after ${dayName(res.ends_on)}.` : `Standings now: they can change until the game closes after ${dayName(res.ends_on)}.`;
    const lights = (k, w) => {
      const l = Array.isArray(w.lights) ? w.lights : [];
      if (k === 'best_light') return l.length > 1 ? ` <span class="muted small">then ${l.slice(1).join(', ')}</span>` : '';
      return k === 'first_play' && l.length ? ` <span class="muted small">lights ${l.join(', ')}</span>` : '';
    };
    $('#win-slots').innerHTML = SLOTS.map(([k, label]) => {
      const rows = (res[k] || []).map((w) => `<tr><td class="num">${w.rank}</td><td><a href="#players" data-player="${esc(w.initials)}">${esc(w.initials)}</a>${w.banned ? ' <span class="muted">(banned)</span>' : ''}</td><td class="num">${w.score}${lights(k, w)}</td><td><strong class="code">${esc(w.claim_code)}</strong></td><td>${esc(w.contact_email || '–')}</td><td>${esc(w.school_email || '–')}</td><td>${esc(when(w.achieved_at))}</td></tr>`).join('');
      return `<h3>${label}</h3><div class="tbl-wrap"><table class="tbl" data-slot="${k}"><thead><tr><th>Place</th><th>Name</th><th>${k === 'best_light' ? 'Light' : 'Score'}</th><th>Code</th><th>Email</th><th>School email</th><th>When</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">Nobody yet.</td></tr>'}</tbody></table></div>`;
    }).join('');
  };
  // The places as they stand when the button is pressed.
  $('#win-csv').addEventListener('click', async () => {
    const res = await guarded(() => call('winners'));
    if (!res) return;
    const rows = [['prize', 'place', 'name', 'board', 'score', 'lights', 'code', 'email', 'school_email', 'banned', 'when']];
    SLOTS.forEach(([k, label]) => (res[k] || []).forEach((w) => rows.push([label, w.rank, w.initials, w.role || '', w.score, (w.lights || []).join(' '), w.claim_code, w.contact_email || '', w.school_email || '', w.banned ? 'yes' : '', w.achieved_at])));
    downloadCsv(rows, 'preslink-winners.csv');
  });

  // Blocked names --------------------------------------------------------------
  // Initials nobody can choose for a new name. The committee's own can be unblocked; the site's own list stays.
  let blocked = { committee: [], built_in: [] };
  const blNote = (text, isError = false) => { const n = $('#bl-note'); n.textContent = text; n.classList.toggle('err', isError); n.classList.toggle('status', !isError); };
  loaders.blocked = () => loadBlocked();
  async function loadBlocked() {
    const res = await guarded(() => call('blocked'));
    if (!res) return null;
    blocked = { committee: res.committee || [], built_in: res.built_in || [] };
    const tb = $('#bl-table tbody');
    tb.innerHTML = blocked.committee.map((b) => `<tr data-letters="${esc(b.initials)}"><td><b>${esc(b.initials)}</b></td><td>${esc(when(b.created_at))}</td><td class="num">${b.players ? `<a href="#players" data-player="${esc(b.initials)}">${b.players}</a>` : '0'}</td><td><button class="mini" type="button" data-unblock>Unblock</button></td></tr>`).join('')
      || '<tr><td colspan="4" class="muted">The committee has not blocked any names.</td></tr>';
    $('#bl-builtin').textContent = `The site also blocks ${plural(blocked.built_in.length, 'offensive name', 'offensive names')} of its own. Those stay blocked.`;
    return blocked;
  }
  $('#bl-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const field = $('#bl-initials');
    const v = field.value.toUpperCase().replace(/[^A-Z]/g, '');
    if (v.length !== 3) { blNote(MESSAGES.BAD_INITIALS, true); field.focus(); return; }
    if (blocked.built_in.includes(v)) { blNote(`${v} is on the site's own list already.`); return; }
    if (blocked.committee.some((b) => b.initials === v)) { blNote(`${v} is blocked already.`); return; }
    blNote('');
    askFirst($('#bl-form button'), $('#bl-form'), {
      text: `Block ${v}? Nobody can choose these initials for a new name. Anyone who has them already keeps them until you reset their name.`,
      ok: `Block ${v}`,
      run: async () => {
        await call('block', { initials: v });
        closeConfirm(); field.value = '';
        const now = await loadBlocked();
        const row = now && now.committee.find((b) => b.initials === v);
        blNote(!row ? `${v} is on the site's own list already.` : row.players ? `${v} is blocked. ${plural(row.players, 'player has', 'players have')} these initials already: reset the name on the Players page if it's offensive.` : `${v} is blocked.`);
      },
    });
  });
  $('#bl-table').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unblock]');
    if (!b) return;
    const tr = b.closest('tr'), v = tr.dataset.letters;
    askFirst(b, tr, {
      text: `Unblock ${v}? Anyone can choose these initials for a new name again.`,
      ok: `Unblock ${v}`,
      run: async () => { await call('block', { initials: v, block: false }); closeConfirm(); await loadBlocked(); blNote(`${v} is unblocked.`); },
    });
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  (async () => {
    if (!session.get()) { showLogin(); return; }
    try {
      overview = await call('overview');
      $('#login').hidden = true; $('#shell').hidden = false;
      route();
      call('stripe_status').then(renderStripe).catch(() => {});
    } catch (ex) { signOut(AUTH.includes(ex.code) ? msg(ex) : ''); }
  })();
})();
