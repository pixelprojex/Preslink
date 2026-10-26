/* PresLink Arcade: the committee console. It is read-only: the money, the payments, the players and the
   leaders, with searches and CSV downloads, and nothing that changes the site or the data. Everything
   that changes anything is the owner's, through the API with the owner code. No framework, no build
   step; talks to the same API as the arcade (action "admin" with the committee code) or to the demo
   backend when config.js is empty. */
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
  const BOARD = { everyone: 'Everyone', student: 'Students', teacher: 'Teachers' };
  const MESSAGES = {
    NETWORK: 'No connection. Check the internet and try again.',
    BAD_ADMIN: 'Wrong committee code.',
    LOCKED: 'Too many wrong codes. Try again in 15 minutes.',
    ADMIN_NOT_SET: 'No committee code has been set yet.',
    PLAYER_NOT_FOUND: 'No player with that name.',
    SERVER_ERROR: 'Something went wrong. Try again.',
  };
  const msg = (e) => MESSAGES[e && e.code] || MESSAGES.SERVER_ERROR;
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
      if (['BAD_ADMIN', 'LOCKED', 'ADMIN_NOT_SET'].includes(ex.code)) { signOut(msg(ex)); return null; }
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
  function showLogin(error) {
    $('#shell').hidden = true;
    $('#login').hidden = false;
    $('#login-hint').hidden = !DEMO;
    if (DEMO) $('#login-hint').textContent = 'Demo code: PRESLINK';
    const err = $('#login-error');
    err.textContent = error || ''; err.hidden = !error;
    setTimeout(() => $('#login-code').focus(), 50);
  }
  function signOut(error) { session.del(); overview = null; showLogin(error); }
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
      call('stripe_status').then(renderStripePill).catch(() => {});
    } catch (ex) { showLogin(msg(ex)); }
    finally { btn.disabled = false; }
  });
  $('#signout').addEventListener('click', () => signOut());
  function renderStripePill(s) { $('#top-stripe').textContent = !s || !s.connected ? 'Stripe not connected' : (s.mode === 'live' ? 'Stripe live' : 'Stripe test mode'); }

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------
  const PAGES = ['overview', 'payments', 'players'];
  const loaders = {};
  function route() {
    let page = location.hash.slice(1) || 'overview';
    if (!PAGES.includes(page)) page = 'overview';
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
  loaders.overview = async () => { await refreshOverview(); renderOverview(); loadRecent(); };
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

  // Payments -------------------------------------------------------------------
  const pay = { q: '', from: '', to: '', offset: 0, limit: 50, total: 0, rows: [] };
  loaders.payments = () => loadPayments();
  async function loadPayments() {
    const res = await guarded(() => call('payments', { q: pay.q, from: pay.from, to: pay.to, limit: pay.limit, offset: pay.offset }));
    if (!res) return;
    pay.rows = res.rows || []; pay.total = Number(res.total || 0);
    $('#pay-summary').textContent = `${pay.total} payment${pay.total === 1 ? '' : 's'} · ${euro(res.sum_cents)}`;
    const tb = $('#pay-table tbody'); tb.innerHTML = '';
    pay.rows.forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(when(p.created_at))}</td><td><a href="#players" data-player="${esc(p.initials)}">${esc(p.initials)}</a></td><td>${esc(BOARD[p.role] || p.role || '')}</td><td class="num">${p.credits}</td><td class="num">${euro(p.amount_cents)}</td><td>${esc(p.email || p.contact_email || '')}</td><td>${esc(p.source || '')}</td><td class="muted small">${esc(p.stripe_session_id || '')}</td>`;
      tb.appendChild(tr);
    });
    if (!tb.children.length) tb.innerHTML = '<tr><td colspan="8" class="muted">Nothing matches.</td></tr>';
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
    const rows = [['when', 'name', 'board', 'bundle', 'plays', 'amount_eur', 'email', 'source', 'stripe_session', 'payment_intent']];
    for (let off = 0; ; off += 500) {
      const res = await guarded(() => call('payments', { q: pay.q, from: pay.from, to: pay.to, limit: 500, offset: off }));
      if (!res) return;
      (res.rows || []).forEach((p) => rows.push([p.created_at, p.initials, p.role || '', p.bundle, p.credits, (p.amount_cents / 100).toFixed(2), p.email || p.contact_email || '', p.source || '', p.stripe_session_id || '', p.stripe_payment_intent || '']));
      if (!res.rows || res.rows.length < 500) break;
    }
    downloadCsv(rows, 'preslink-payments.csv');
  });
  function downloadCsv(rows, name) {
    const csv = rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
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
    $('#pl-summary').textContent = `${pl.total} player${pl.total === 1 ? '' : 's'}`;
    const tb = $('#pl-table tbody'); tb.innerHTML = '';
    pl.rows.forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><b>${esc(p.initials)}</b>${p.banned ? ' <span class="muted">(banned)</span>' : ''}</td><td>${esc(BOARD[p.role] || p.role)}</td><td>${esc(p.claim_code)}</td><td>${esc(p.contact_email || '')}</td><td>${esc(p.school_email || '')}</td><td class="num">${p.plays || 0}</td><td class="num">${p.best == null ? '–' : p.best}</td><td class="num">${euro(p.paid_cents)}</td><td>${esc(when(p.last_seen_at))}</td>
        <td><button class="mini" data-view="${esc(p.initials)}">View</button></td>`;
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
  // a name link anywhere opens that player
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-player]');
    if (!a) return;
    e.preventDefault();
    $('#pl-q').value = a.dataset.player; pl.q = a.dataset.player; pl.role = ''; pl.banned = false; pl.offset = 0; $('#pl-role').value = ''; $('#pl-banned').checked = false;
    location.hash = 'players';
    loadPlayers().then(() => viewPlayer(a.dataset.player));
  });
  $('main > section[data-page="players"]').addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) viewPlayer(v.dataset.view);
  });
  async function viewPlayer(initials) {
    const box = $('#pl-detail');
    const res = await guarded(() => call('player', { initials }));
    if (!res) { box.hidden = true; return; }
    const p = res.player;
    box.dataset.initials = p.initials;
    box.innerHTML = `<div class="head"><h3 style="margin:0">${esc(p.initials)}${p.banned ? ' <span class="muted">(banned)</span>' : ''}</h3><div class="actions" style="margin:0"><button class="mini" type="button" id="pl-close">Close</button></div></div>
      <dl><dt>Board</dt><dd>${esc(BOARD[p.role] || p.role)}</dd><dt>Code</dt><dd>${esc(p.claim_code)}</dd><dt>Email</dt><dd>${esc(p.contact_email || '–')}</dd><dt>School email</dt><dd>${esc(p.school_email || '–')}</dd><dt>Plays left</dt><dd>${p.credits}</dd><dt>First seen</dt><dd>${esc(when(p.created_at))}</dd><dt>Last seen</dt><dd>${esc(when(p.last_seen_at))}</dd>${(res.others || []).length ? `<dt>Same letters</dt><dd>${res.others.map(esc).join(', ')}</dd>` : ''}</dl>
      <h4>Plays</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Started</th><th>Score</th><th>Best light</th></tr></thead><tbody>${(res.plays || []).map((x) => `<tr><td>${esc(when(x.started_at))}</td><td class="num">${x.score == null ? 'unfinished' : x.score}${x.voided ? ' <span class="muted">(voided)</span>' : ''}</td><td class="num">${x.best_light == null ? '–' : x.best_light}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No plays.</td></tr>'}</tbody></table></div>
      <h4>Payments</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Bundle</th><th>Plays</th><th>Amount</th><th>Stripe session</th></tr></thead><tbody>${(res.payments || []).map((x) => `<tr><td>${esc(when(x.created_at))}</td><td>${esc(x.bundle)}</td><td class="num">${x.credits}</td><td class="num">${euro(x.amount_cents)}</td><td class="muted small">${esc(x.stripe_session_id || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No payments.</td></tr>'}</tbody></table></div>`;
    box.hidden = false;
    $('#pl-close').addEventListener('click', () => { box.hidden = true; });
    box.scrollIntoView({ block: 'nearest' });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  (async () => {
    if (!session.get()) { showLogin(); return; }
    try {
      overview = await call('overview');
      $('#login').hidden = true; $('#shell').hidden = false;
      route();
      call('stripe_status').then(renderStripePill).catch(() => {});
    } catch (ex) { signOut(['BAD_ADMIN', 'LOCKED', 'ADMIN_NOT_SET'].includes(ex.code) ? msg(ex) : ''); }
  })();
})();
