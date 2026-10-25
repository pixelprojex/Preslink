/* PresLink Arcade: the committee console. No framework, no build step. Talks to the same API as the
   arcade (action "admin" with the committee code) or to the demo backend when config.js is empty. */
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
    CODE_TOO_SHORT: 'Use at least 6 characters.',
    BAD_DATE: 'Use a date like 2026-12-12.',
    BAD_GOAL: 'The goal must be a whole number of euro.',
    BAD_STRIPE_KEY: 'That is not a Stripe secret key (it starts with sk_live_ or sk_test_).',
    STRIPE_KEY_REJECTED: 'Stripe did not accept that key.',
    PLAYER_NOT_FOUND: 'No player with that name.',
    BAD_INITIALS: 'Three letters, A to Z.',
    BAD_IMAGE: 'That file is not a photo we can use (JPEG, PNG or WebP).',
    IMAGE_TOO_BIG: 'That photo is too big.',
    UPLOAD_FAILED: 'The photo could not be stored. Try again.',
    CONTENT_TOO_BIG: 'That is too much content. Shorten the text or remove a story.',
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
  const status = (id, text) => { const el = $('#' + id); if (!el) return; el.textContent = text; clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; }, 3000); };
  // A failed call that means the code no longer works sends the committee back to the sign-in.
  async function guarded(fn) {
    try { return await fn(); }
    catch (ex) {
      if (['BAD_ADMIN', 'LOCKED', 'ADMIN_NOT_SET'].includes(ex.code)) { signOut(msg(ex)); return null; }
      toast(msg(ex), true); return null;
    }
  }

  // ---------------------------------------------------------------------------
  // The eye on every secret field
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
    let code = $('#login-code').value.trim().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, '');
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

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------
  const PAGES = ['overview', 'payments', 'players', 'prizes', 'content', 'campaign', 'stripe', 'names', 'security'];
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
    lead('Most plays', sp.most_plays ? rowFor(sp.most_plays.initials) || { initials: sp.most_plays.initials, claim_code: '', player_id: '' } : null, sp.most_plays ? `${sp.most_plays.plays} plays` : '');
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
        <td><button class="mini" data-view="${esc(p.initials)}">View</button> <button class="mini ${p.banned ? '' : 'danger'}" data-ban="${esc(p.id)}" data-banned="${p.banned ? '1' : ''}">${p.banned ? 'Unban' : 'Ban'}</button></td>`;
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
  $('main > section[data-page="players"]').addEventListener('click', async (e) => {
    const v = e.target.closest('[data-view]'); const b = e.target.closest('[data-ban]'); const r = e.target.closest('[data-reset]'); const vo = e.target.closest('[data-void]'); const uv = e.target.closest('[data-unvoid]');
    if (v) { viewPlayer(v.dataset.view); return; }
    if (b) {
      const banned = !b.dataset.banned;
      if (banned && !confirm('Ban this player? They cannot play and their scores leave the boards.')) return;
      if (await guarded(() => call('ban', { player_id: b.dataset.ban, banned }))) { toast(banned ? 'Banned' : 'Unbanned'); loadPlayers(); if (!$('#pl-detail').hidden) viewPlayer($('#pl-detail').dataset.initials); }
      return;
    }
    if (r) {
      if (!confirm('Give this player a new random name?')) return;
      const res = await guarded(() => call('reset_name', { player_id: r.dataset.reset }));
      if (res) { toast(`Renamed to ${res.initials}`); loadPlayers(); viewPlayer(res.initials); }
      return;
    }
    if (vo || uv) {
      const id = vo ? vo.dataset.void : uv.dataset.unvoid;
      if (vo && !confirm('Void this score? It leaves the leaderboard.')) return;
      if (await guarded(() => call('void', { play_id: id, voided: !!vo, reason: 'committee' }))) { toast(vo ? 'Voided' : 'Restored'); viewPlayer($('#pl-detail').dataset.initials); }
    }
  });
  async function viewPlayer(initials) {
    const box = $('#pl-detail');
    const res = await guarded(() => call('player', { initials }));
    if (!res) { box.hidden = true; return; }
    const p = res.player;
    box.dataset.initials = p.initials;
    box.innerHTML = `<div class="head"><h3 style="margin:0">${esc(p.initials)}${p.banned ? ' <span class="muted">(banned)</span>' : ''}</h3><div class="actions" style="margin:0"><button class="mini" data-reset="${esc(p.id)}">New random name</button><button class="mini ${p.banned ? '' : 'danger'}" data-ban="${esc(p.id)}" data-banned="${p.banned ? '1' : ''}">${p.banned ? 'Unban' : 'Ban'}</button><button class="mini" type="button" id="pl-close">Close</button></div></div>
      <dl><dt>Board</dt><dd>${esc(BOARD[p.role] || p.role)}</dd><dt>Code</dt><dd>${esc(p.claim_code)}</dd><dt>Email</dt><dd>${esc(p.contact_email || '–')}</dd><dt>School email</dt><dd>${esc(p.school_email || '–')}</dd><dt>Plays left</dt><dd>${p.credits}</dd><dt>First seen</dt><dd>${esc(when(p.created_at))}</dd><dt>Last seen</dt><dd>${esc(when(p.last_seen_at))}</dd>${(res.others || []).length ? `<dt>Same letters</dt><dd>${res.others.map(esc).join(', ')}</dd>` : ''}</dl>
      <h4>Plays</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Started</th><th>Score</th><th>Best light</th><th></th></tr></thead><tbody>${(res.plays || []).map((x) => `<tr><td>${esc(when(x.started_at))}</td><td class="num">${x.score == null ? 'unfinished' : x.score}${x.voided ? ' <span class="muted">(voided)</span>' : ''}</td><td class="num">${x.best_light == null ? '–' : x.best_light}</td><td>${x.score == null ? '' : (x.voided ? `<button class="mini" data-unvoid="${esc(x.play_id)}">Restore</button>` : `<button class="mini danger" data-void="${esc(x.play_id)}">Void</button>`)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No plays.</td></tr>'}</tbody></table></div>
      <h4>Payments</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Bundle</th><th>Plays</th><th>Amount</th><th>Stripe session</th></tr></thead><tbody>${(res.payments || []).map((x) => `<tr><td>${esc(when(x.created_at))}</td><td>${esc(x.bundle)}</td><td class="num">${x.credits}</td><td class="num">${euro(x.amount_cents)}</td><td class="muted small">${esc(x.stripe_session_id || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No payments.</td></tr>'}</tbody></table></div>`;
    box.hidden = false;
    $('#pl-close').addEventListener('click', () => { box.hidden = true; });
    box.scrollIntoView({ block: 'nearest' });
  }

  // Prizes ---------------------------------------------------------------------
  const PRIZES = ['everyone', 'students', 'teachers', 'best_light', 'most_plays'];
  let prizePhotos = {};
  loaders.prizes = async () => {
    await refreshOverview();
    const s = (overview || {}).stats || {};
    const pz = s.prizes || {};
    PRIZES.forEach((k) => { $('#pz-' + k).value = pz[k] || ''; });
    prizePhotos = Object.assign({}, (s.content || {}).prize_photos || {});
    renderPrizePhotos();
  };
  function renderPrizePhotos() {
    $$('#prize-form .prize-row').forEach((row) => {
      const src = prizePhotos[row.dataset.key] || '', img = row.querySelector('img');
      if (src) img.src = src; else img.removeAttribute('src');
      row.querySelector('[data-clear]').hidden = !src;
    });
  }
  // The texts live in the settings, the photos in the site content document with everything else the committee writes.
  $('#prize-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prizes = {}; PRIZES.forEach((k) => { prizes[k] = $('#pz-' + k).value.trim(); });
    if (!await guarded(() => call('settings', { prizes }))) return;
    const base = (((await refreshOverview()) || {}).stats || {}).content || {};
    const content = Object.assign({}, base, { prize_photos: prizePhotos });
    if (await guarded(() => call('set_content', { content }))) { status('prize-status', 'Saved · live on the site'); overview = null; }
  });
  $('#prize-form').addEventListener('change', async (e) => {
    const inp = e.target.closest('input[type="file"]'); if (!inp || !inp.files || !inp.files[0]) return;
    const row = inp.closest('.prize-row'), note = row.querySelector('.uploading');
    note.textContent = 'Uploading…';
    try { prizePhotos[row.dataset.key] = await uploadPhoto(inp.files[0]); renderPrizePhotos(); note.textContent = 'Uploaded · save to publish'; }
    catch (ex) { note.textContent = ''; toast(msg(ex), true); }
    inp.value = '';
  });
  $('#prize-form').addEventListener('click', (e) => {
    const b = e.target.closest('[data-clear]'); if (!b) return;
    const row = b.closest('.prize-row'); delete prizePhotos[row.dataset.key]; row.querySelector('.uploading').textContent = ''; renderPrizePhotos();
  });
  async function uploadPhoto(file) { const { type, data } = await shrinkImage(file); const res = await call('upload_image', { type, data }); return res.url; }

  // Site content ---------------------------------------------------------------
  let stories = [];
  let introImage = '';
  loaders.content = async () => {
    await refreshOverview();
    const c = ((overview || {}).stats || {}).content || {};
    const hero = c.hero || {}, about = c.about || {}, contact = c.contact || {};
    $('#ct-hero-title').value = hero.title || ''; $('#ct-hero-sub').value = hero.subtitle || ''; $('#ct-notice').value = c.notice || '';
    $('#ct-intro-title').value = about.intro_title || ''; $('#ct-intro-text').value = about.intro_text || '';
    introImage = about.intro_image || ''; renderIntroPhoto();
    stories = Array.isArray(about.stories) ? about.stories.map((s) => ({ id: s.id || uid(), image: s.image || '', title: s.title || '', text: s.text || '' })) : [];
    renderStories();
    $('#ct-email').value = contact.email || ''; $('#ct-phone').value = contact.phone || ''; $('#ct-instagram').value = contact.instagram || ''; $('#ct-website').value = contact.website || '';
  };
  const uid = () => Math.random().toString(36).slice(2, 10);
  function renderIntroPhoto() { const img = $('#ct-intro-photo'); if (introImage) img.src = introImage; else img.removeAttribute('src'); $('#ct-intro-clear').hidden = !introImage; }
  $('#ct-intro-file').addEventListener('change', async (e) => {
    const inp = e.target; if (!inp.files || !inp.files[0]) return;
    const note = $('#ct-intro-up'); note.textContent = 'Uploading…';
    try { introImage = await uploadPhoto(inp.files[0]); renderIntroPhoto(); note.textContent = 'Uploaded · save to publish'; }
    catch (ex) { note.textContent = ''; toast(msg(ex), true); }
    inp.value = '';
  });
  $('#ct-intro-clear').addEventListener('click', () => { introImage = ''; $('#ct-intro-up').textContent = ''; renderIntroPhoto(); });
  function renderStories() {
    const box = $('#ct-stories'); box.innerHTML = '';
    stories.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'story'; el.dataset.i = i;
      el.innerHTML = `<div><img src="${esc(s.image || '')}" alt=""><label class="btn small pick">Choose photo<input type="file" accept="image/*"></label> <span class="uploading"></span></div>
        <div class="story-fields"><input placeholder="Heading" maxlength="80" value="${esc(s.title)}" data-field="title"><textarea rows="2" maxlength="300" placeholder="A line about it" data-field="text">${esc(s.text)}</textarea>
        <div class="story-tools"><button type="button" class="mini" data-up ${i === 0 ? 'disabled' : ''}>Up</button><button type="button" class="mini" data-down ${i === stories.length - 1 ? 'disabled' : ''}>Down</button><button type="button" class="mini danger" data-remove>Remove</button></div></div>`;
      box.appendChild(el);
    });
  }
  $('#ct-add-story').addEventListener('click', () => { stories.push({ id: uid(), image: '', title: '', text: '' }); renderStories(); const last = $$('#ct-stories .story').pop(); if (last) last.querySelector('input[data-field]').focus(); });
  $('#ct-stories').addEventListener('input', (e) => { const f = e.target.closest('[data-field]'); if (!f) return; const i = Number(f.closest('.story').dataset.i); stories[i][f.dataset.field] = f.value; });
  $('#ct-stories').addEventListener('click', (e) => {
    const el = e.target.closest('.story'); if (!el) return;
    const i = Number(el.dataset.i);
    if (e.target.closest('[data-remove]')) { if (stories[i].image || stories[i].title ? confirm('Remove this story?') : true) { stories.splice(i, 1); renderStories(); } }
    else if (e.target.closest('[data-up]') && i > 0) { [stories[i - 1], stories[i]] = [stories[i], stories[i - 1]]; renderStories(); }
    else if (e.target.closest('[data-down]') && i < stories.length - 1) { [stories[i + 1], stories[i]] = [stories[i], stories[i + 1]]; renderStories(); }
  });
  $('#ct-stories').addEventListener('change', async (e) => {
    const inp = e.target.closest('input[type="file"]'); if (!inp || !inp.files || !inp.files[0]) return;
    const el = inp.closest('.story'); const i = Number(el.dataset.i); const note = el.querySelector('.uploading');
    note.textContent = 'Uploading…';
    try {
      const { type, data } = await shrinkImage(inp.files[0]);
      const res = await call('upload_image', { type, data });
      stories[i].image = res.url;
      el.querySelector('img').src = res.url;
      note.textContent = 'Uploaded';
    } catch (ex) { note.textContent = ''; toast(msg(ex), true); }
    inp.value = '';
  });
  // Photos are shrunk in the browser: at most 1600 px on the long side, JPEG, before they go up.
  async function shrinkImage(file) {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new ApiError('BAD_IMAGE', 0)); i.src = URL.createObjectURL(file); });
    const scale = Math.min(1, 1600 / img.naturalWidth, 1600 / img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new ApiError('BAD_IMAGE', 0);
    const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    return { type: 'image/jpeg', data };
  }
  $('#content-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const base = (((await refreshOverview()) || {}).stats || {}).content || {};
    const content = Object.assign({}, base, {
      hero: { title: $('#ct-hero-title').value.trim(), subtitle: $('#ct-hero-sub').value.trim() },
      notice: $('#ct-notice').value.trim(),
      about: { intro_title: $('#ct-intro-title').value.trim(), intro_text: $('#ct-intro-text').value.trim(), intro_image: introImage, stories: stories.filter((s) => s.image || s.title || s.text).map((s) => ({ id: s.id, image: s.image, title: s.title.trim(), text: s.text.trim() })) },
      contact: { email: $('#ct-email').value.trim(), phone: $('#ct-phone').value.trim(), instagram: $('#ct-instagram').value.trim().replace(/^@/, ''), website: $('#ct-website').value.trim() },
    });
    if (await guarded(() => call('set_content', { content }))) { status('content-status', 'Saved · live on the site'); overview = null; }
  });

  // Campaign -------------------------------------------------------------------
  loaders.campaign = async () => {
    await refreshOverview();
    const s = ((overview || {}).stats || {});
    $('#camp-goal').value = Math.round((s.goal_cents || 0) / 100);
    $('#camp-ends').value = s.ends_on || '';
    const goal = Number(s.goal_cents || 0);
    $('#camp-progress').textContent = goal > 0 ? `${whole(s.total_raised_cents)} raised so far, ${Math.round((Number(s.total_raised_cents || 0) / goal) * 100)}% of the goal.` : `${whole(s.total_raised_cents)} raised so far.`;
  };
  $('#camp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const goalEuro = Number(String($('#camp-goal').value || '0').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(goalEuro) || goalEuro < 0 || goalEuro > 1000000) { toast(MESSAGES.BAD_GOAL, true); return; }
    if (await guarded(() => call('settings', { goal_cents: Math.round(goalEuro * 100), ends_on: $('#camp-ends').value || '' }))) { status('camp-status', 'Saved'); overview = null; loaders.campaign(); }
  });

  // Stripe ---------------------------------------------------------------------
  loaders.stripe = async () => { const s = await guarded(() => call('stripe_status')); if (s) { renderStripe(s); renderStripePill(s); } };
  function stripeText(s) {
    if (!s || !s.connected) return 'Not connected. Plays are free demo plays until a key is connected.';
    return (s.mode === 'live' ? 'Connected, live payments' : 'Connected, test mode') + (s.account ? ' · ' + s.account : '') + (s.webhook ? '' : ' · no webhook') + (s.from_env ? ' · key set in Supabase' : '');
  }
  function renderStripe(s) {
    $('#st-status').textContent = stripeText(s);
    $('#st-disconnect').hidden = !(s && s.connected && !s.from_env);
    $('#st-form').querySelector('label').hidden = !!(s && s.from_env);
  }
  function renderStripePill(s) { $('#top-stripe').textContent = !s || !s.connected ? 'Stripe not connected' : (s.mode === 'live' ? 'Stripe live' : 'Stripe test mode'); }
  $('#st-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = $('#st-key').value.trim();
    if (!/^sk_(live|test)_[A-Za-z0-9]{16,}$/.test(key)) { toast(MESSAGES.BAD_STRIPE_KEY, true); return; }
    const btn = $('#st-connect'); btn.disabled = true; btn.textContent = 'Checking with Stripe…';
    const s = await guarded(() => call('stripe_connect', { secret_key: key }));
    btn.disabled = false; btn.textContent = 'Connect';
    if (s) { $('#st-key').value = ''; renderStripe(s); renderStripePill(s); toast('Connected. Payments are live.'); }
  });
  $('#st-disconnect').addEventListener('click', async () => {
    if (!confirm('Disconnect Stripe? Plays become free demo plays until it is connected again.')) return;
    const s = await guarded(() => call('stripe_disconnect'));
    if (s) { renderStripe(s); renderStripePill(s); toast('Disconnected'); }
  });

  // Names ----------------------------------------------------------------------
  loaders.names = async () => { await refreshOverview(); renderNames(); };
  function renderNames() {
    const d = overview; if (!d) return;
    const blocked = d.blocked_by_committee || [];
    $('#blocked-list').innerHTML = blocked.length ? blocked.map((b) => `<button class="mini" data-unblock="${esc(b)}" title="Allow again">${esc(b)} ×</button>`).join(' ') : 'None added by the committee.';
    const tb = $('#banned-table tbody'); tb.innerHTML = '';
    (d.banned || []).forEach((p) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${esc(p.initials)}</td><td>${esc(p.claim_code)}</td><td><button class="mini" data-ban="${esc(p.player_id)}" data-banned="1">Unban</button></td>`; tb.appendChild(tr); });
    if (!tb.children.length) tb.innerHTML = '<tr><td colspan="3" class="muted">Nobody is banned.</td></tr>';
  }
  $('#block-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = $('#block-initials').value.toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(initials)) { toast(MESSAGES.BAD_INITIALS, true); return; }
    if (await guarded(() => call('block', { initials, block: true }))) { $('#block-initials').value = ''; toast(`${initials} blocked`); await refreshOverview(); renderNames(); }
  });
  $('main > section[data-page="names"]').addEventListener('click', async (e) => {
    const u = e.target.closest('[data-unblock]'); const b = e.target.closest('[data-ban]');
    if (u) { if (await guarded(() => call('block', { initials: u.dataset.unblock, block: false }))) { toast('Allowed again'); await refreshOverview(); renderNames(); } }
    else if (b) { if (await guarded(() => call('ban', { player_id: b.dataset.ban, banned: false }))) { toast('Unbanned'); await refreshOverview(); renderNames(); } }
  });

  // Committee code -------------------------------------------------------------
  // PRES-, three letters and a symbol, then two groups of four digits: PRES-KQX#-4821-9930.
  function newCode() {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', S = '#$%&*!';
    const rnd = (n) => Array.from(crypto.getRandomValues(new Uint32Array(n)));
    const pick = (set, n) => rnd(n).map((x) => set[x % set.length]).join('');
    const digits = (n) => rnd(n).map((x) => String(x % 10)).join('');
    return `PRES-${pick(L, 3)}${pick(S, 1)}-${digits(4)}-${digits(4)}`;
  }
  loaders.security = () => { $('#gen-code').value = ''; $('#gen-copy').disabled = true; $('#gen-use').disabled = true; };
  $('#gen-new').addEventListener('click', () => { $('#gen-code').value = newCode(); $('#gen-copy').disabled = false; $('#gen-use').disabled = false; });
  $('#gen-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#gen-code').value); toast('Copied'); } catch (_) { $('#gen-code').type = 'text'; $('#gen-code').select(); } });
  $('#gen-use').addEventListener('click', async () => {
    const code = $('#gen-code').value;
    if (!code) return;
    if (!confirm('Use this code from now on? The old one stops working at once. Make sure it is written down.')) return;
    if (await guarded(() => call('set_code', { new_code: code }))) { session.set(code); toast('The committee code has changed'); }
  });
  $('#own-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#own-code').value;
    if (code.length < 6) { toast(MESSAGES.CODE_TOO_SHORT, true); return; }
    if (!confirm('Change the committee code? The old one stops working at once.')) return;
    if (await guarded(() => call('set_code', { new_code: code }))) { session.set(code); $('#own-code').value = ''; status('own-status', 'Changed'); toast('The committee code has changed'); }
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
      call('stripe_status').then(renderStripePill).catch(() => {});
    } catch (ex) { signOut(['BAD_ADMIN', 'LOCKED', 'ADMIN_NOT_SET'].includes(ex.code) ? msg(ex) : ''); }
  })();
})();
