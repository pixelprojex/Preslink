/* Demo backend. Only active when config.js has no SUPABASE_URL. Everything lives in this browser. */
(() => {
  const C = window.PRESLINK_CONFIG || {};
  if (C.SUPABASE_URL) return;

  const KEY = 'preslink.mock';
  const DEMO_ADMIN_CODE = 'PRESLINK';
  const BUNDLES = { single: { credits: 1, amount: 200 }, triple: { credits: 3, amount: 500 }, seven: { credits: 7, amount: 1000 } };
  const BLOCKED = ['ASS', 'FUK', 'FUC', 'SEX', 'KKK', 'CNT', 'DIK', 'TIT', 'FAG', 'GOD', 'WTF'];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const tag = (id) => id.replace(/-/g, '').slice(0, 8);
  const fail = (code) => { const e = new Error(code); e.code = code; throw e; };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (_) { return null; } };
  const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* ignore */ } };

  function weekStart(d = new Date()) {
    const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(12, 0, 0, 0);
    return x.toISOString().slice(0, 10);
  }
  function randomInitials() {
    for (let i = 0; i < 200; i++) {
      const v = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
      if (!BLOCKED.includes(v) && !(db.blocked || []).includes(v) && !Object.values(db.players).some((p) => p.initials === v)) return v;
    }
    fail('NO_NAMES_LEFT');
  }
  function roundScore(tapMs, phase, target, speedMs) {
    let x = tapMs / speedMs + phase; x = x - 2 * Math.floor(x / 2);
    const pos = x < 1 ? x : 2 - x;
    const d = Math.abs(pos - target);
    return Math.min(999, Math.max(50, Math.round(50 + 300 * (1 - d) + 649 * Math.exp(-d / 0.05) - 12 * Math.sqrt(Math.min(d * speedMs, 3) / 3))));
  }
  // The day's three lights, the same for everyone, on the 1 ms grid (as the database's day_rounds).
  const hashInt = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const newRounds = () => { const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' }); return [1, 2, 3].map((i) => ({ phase: (hashInt(`phase-${day}-${i}`) % 1000) / 1000, target: (150 + (hashInt(`mark-${day}-${i}`) % 701)) / 1000 })); };
  const CAPS = { daily: 2000, campaign: 10000 };
  const spendOf = (pid) => { const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' }); const mine = db.payments.filter((x) => x.player_id === pid); return { spent_cents: mine.reduce((s, x) => s + x.amount_cents, 0), spent_today_cents: mine.filter((x) => new Date(x.created_at || 0).toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' }) === today).reduce((s, x) => s + x.amount_cents, 0), daily_cap_cents: CAPS.daily, campaign_cap_cents: CAPS.campaign }; };

  function seed() {
    return { players: {}, plays: [], payments: [], sessions: {}, settings: { goal_cents: 200000, ends_on: '', prizes: {} }, blocked: [], fails: {} };
  }
  let db = load() || seed();
  if (!db.settings) db.settings = { goal_cents: 200000, ends_on: '', prizes: {} };
  if (!db.settings.prizes) db.settings.prizes = {};
  if (!db.blocked) db.blocked = [];
  save(db);

  const disp = (p) => p.initials + ((p.suffix || 1) > 1 ? '#' + p.suffix : '');
  const playLight = (x) => (x.taps && x.rounds) ? Math.max(...x.taps.map((t, i) => roundScore(t, x.rounds[i].phase, x.rounds[i].target, x.speed_ms))) : (x.score || 0);
  const scoredPlays = (pid) => db.plays.filter((x) => x.player_id === pid && x.score != null && !x.voided);
  const bestLightOf = (pid) => scoredPlays(pid).reduce((m, x) => Math.max(m, playLight(x)), null);
  const nextSuffix = (initials, exceptId) => Object.values(db.players).filter((x) => x.initials === initials && x.id !== exceptId).reduce((m, x) => Math.max(m, x.suffix || 1), 0) + 1;
  const me = (p) => {
    const open = db.plays.find((x) => x.player_id === p.id && x.score == null && !x.voided);
    const best = scoredPlays(p.id).reduce((m, x) => Math.max(m, x.score), null);
    return { id: p.id, tag: tag(p.id), initials: p.initials, suffix: p.suffix || 1, display: disp(p), role: p.role || 'everyone', school_email: p.school_email || null, contact_email: p.contact_email || null, claim_code: p.claim_code, credits: p.credits, banned: !!p.banned, colour: p.colour || 0, ...spendOf(p.id), best, best_this_week: best, best_light: bestLightOf(p.id), open_play: open ? { play_id: open.id, speed_ms: open.speed_ms, rounds: open.rounds } : null };
  };
  const board = (role, week, withIds) => {
    if (role === 'everyone') role = null;
    const best = {};
    db.plays.filter((p) => p.score != null && !p.voided).forEach((p) => {
      const pl = db.players[p.player_id];
      if (!pl || (pl.banned && !withIds)) return;
      const b = best[p.player_id];
      if (!b || p.score > b.score || (p.score === b.score && p.finished_at < b.finished_at)) best[p.player_id] = { ...p, plays: (b ? b.plays : 0) + 1 };
      else b.plays += 1;
    });
    return Object.values(best).map((p) => ({ ...p, player: db.players[p.player_id] }))
      .filter((p) => !role || p.player.role === role)
      .sort((a, b) => b.score - a.score || a.finished_at.localeCompare(b.finished_at))
      .map((p, i) => ({ rank: i + 1, tag: tag(p.player_id), initials: disp(p.player), role: p.player.role || 'everyone', colour: p.player.colour || 0, score: p.score, achieved_at: p.finished_at, plays: p.plays, best_light: bestLightOf(p.player_id),
        ...(withIds ? { play_id: p.id, player_id: p.player_id, claim_code: p.player.claim_code, banned: !!p.player.banned } : {}) }));
  };
  // Spot prizes as the database's: best light split by the second- and third-best lights; first play
  // split by that play's lights.
  const lightsOf = (x) => (x.taps && x.rounds) ? x.taps.map((t, i) => roundScore(t, x.rounds[i].phase, x.rounds[i].target, x.speed_ms)) : [x.score || 0];
  const cmp3 = (a, b) => { for (let i = 0; i < 3; i++) { const d = (b[i] ?? -1) - (a[i] ?? -1); if (d) return d; } return 0; };
  const spotPrizes = () => {
    const ok = db.plays.filter((x) => x.score != null && !x.voided && db.players[x.player_id] && !db.players[x.player_id].banned);
    const byPlayer = {};
    ok.forEach((x) => { (byPlayer[x.player_id] = byPlayer[x.player_id] || []).push(x); });
    const row = (pid, extra) => { const p = db.players[pid]; return { tag: tag(pid), initials: disp(p), role: p.role || 'everyone', colour: p.colour || 0, ...extra }; };
    let light = null, lightKey = null;
    let first = null, firstKey = null;
    Object.entries(byPlayer).forEach(([pid, plays]) => {
      const all = plays.flatMap((x) => lightsOf(x).map((l) => ({ l, at: x.finished_at }))).sort((a, b) => b.l - a.l || String(a.at).localeCompare(String(b.at)));
      const top = all.slice(0, 3).map((z) => z.l);
      if (!light || cmp3(top, lightKey) < 0 || (cmp3(top, lightKey) === 0 && all[0].at < light.achieved_at)) { light = row(pid, { score: top[0], achieved_at: all[0].at }); lightKey = top; }
      const f = plays.slice().sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))[0];
      const fk = [f.score, ...lightsOf(f).sort((a, b) => b - a)];
      const cmpF = (a, b) => { for (let i = 0; i < 4; i++) { const d = (b[i] ?? -1) - (a[i] ?? -1); if (d) return d; } return 0; };
      if (!first || cmpF(fk, firstKey) < 0 || (cmpF(fk, firstKey) === 0 && f.finished_at < first.achieved_at)) { first = row(pid, { score: f.score, achieved_at: f.finished_at }); firstKey = fk; }
    });
    return { best_light: light, first_play: first };
  };
  const stats = () => ({
    total_raised_cents: db.payments.reduce((s, p) => s + p.amount_cents, 0), goal_cents: db.settings.goal_cents, prize_text: '', ends_on: db.settings.ends_on || '', prizes: db.settings.prizes || {}, prize_mode: db.settings.prize_mode === 'honours' ? 'honours' : 'prizes',
    content: db.settings.content || {},
    payments: db.payments.length, plays: db.plays.filter((p) => p.score != null && !p.voided).length, players: Object.keys(db.players).length,
    week_start: weekStart(), week_end: (() => { const d = new Date(weekStart() + 'T12:00:00'); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })(),
  });
  const adminCheck = (code) => { if (code !== DEMO_ADMIN_CODE) fail('BAD_ADMIN'); };
  // After the closing date (the end of that day) nothing more is bought or started, as on the server.
  const closed = () => { const e = db.settings.ends_on; return !!e && Date.now() > new Date(e + 'T23:59:59').getTime(); };
  const stripeStatus = () => { const s = db.settings.stripe; return s ? { connected: true, mode: s.mode, account: s.account, webhook: true, from_env: false } : { connected: false, mode: '', account: '', webhook: false, from_env: false }; };

  async function api(action, b) {
    await wait(250);
    db = load() || db;
    const player = b.player_id ? db.players[b.player_id] : null;
    switch (action) {
      case 'contact': {
        if (!player) fail('PLAYER_NOT_FOUND');
        const email = String(b.email || '').replace(/\s+/g, '').toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('BAD_EMAIL');
        let school = String(b.school_email || '').replace(/\s+/g, '').toLowerCase();
        if (!school && /@(pbccork\.ie|pbc-cork\.ie)$/.test(email)) school = email;
        if (school) {
          const m = school.match(/^[^\s@]+@(pbccork\.ie|pbc-cork\.ie)$/);
          if (!m) fail('BAD_SCHOOL_EMAIL');
          player.role = m[1] === 'pbccork.ie' ? 'student' : 'teacher'; player.school_email = school;
        }
        player.contact_email = email; save(db);
        return me(player);
      }
      case 'colour': {
        const p = db.players[b.player_id]; if (!p) fail('PLAYER_NOT_FOUND');
        const c = Number(b.colour); if (!Number.isInteger(c) || c < 0 || c > 8) fail('BAD_COLOUR');
        p.colour = c; save(db); return me(p);
      }
      case 'register': {
        b.role = b.role || 'everyone';
        if (!['student', 'teacher', 'everyone'].includes(b.role)) fail('BAD_ROLE');
        let initials = b.initials ? String(b.initials).toUpperCase() : '';
        if (initials) {
          if (!/^[A-Z]{2,3}$/.test(initials)) fail('BAD_INITIALS');
          if (BLOCKED.includes(initials) || db.blocked.includes(initials)) fail('BLOCKED_INITIALS');
        } else initials = randomInitials();
        const id = uuid();
        db.players[id] = { id, initials, suffix: nextSuffix(initials), role: b.role, claim_code: String(Math.floor(Math.random() * 10000)).padStart(4, '0'), credits: 0, banned: false, colour: 0 };
        save(db);
        return me(db.players[id]);
      }
      case 'update': {
        if (!player) fail('PLAYER_NOT_FOUND');
        if (b.initials != null && String(b.initials).toUpperCase() !== player.initials) {
          const initials = String(b.initials).toUpperCase();
          if (!/^[A-Z]{2,3}$/.test(initials)) fail('BAD_INITIALS');
          if (BLOCKED.includes(initials) || db.blocked.includes(initials)) fail('BLOCKED_INITIALS');
          player.initials = initials; player.suffix = nextSuffix(initials, player.id);
        }
        if (b.role != null) {
          if (!['student', 'teacher', 'everyone'].includes(b.role)) fail('BAD_ROLE');
          if (b.role === 'everyone') { player.role = 'everyone'; player.school_email = null; }
          else { if (!player.school_email) fail('NEEDS_SCHOOL_EMAIL'); player.role = b.role; }
        }
        save(db);
        return me(player);
      }
      case 'signin': {
        const [initials, sfx] = String(b.initials || '').toUpperCase().split('#');
        const p = Object.values(db.players).sort((x, y) => (x.suffix || 1) - (y.suffix || 1)).find((x) => x.initials === initials && x.claim_code === String(b.code) && (!sfx || (x.suffix || 1) === Number(sfx)));
        if (!p) { db.fails[initials] = (db.fails[initials] || 0) + 1; save(db); if (db.fails[initials] >= 5) fail('LOCKED'); fail('BAD_SIGNIN'); }
        db.fails[initials] = 0; save(db);
        return me(p);
      }
      case 'me': if (!player) fail('PLAYER_NOT_FOUND'); return me(player);
      case 'checkout': {
        if (!player) fail('PLAYER_NOT_FOUND');
        if (player.banned) fail('BANNED');
        if (closed()) fail('CLOSED');
        const bu = BUNDLES[b.bundle]; if (!bu) fail('BAD_BUNDLE');
        const sp = spendOf(player.id);
        if (sp.spent_today_cents + bu.amount > sp.daily_cap_cents) fail('DAILY_LIMIT');
        if (sp.spent_cents + bu.amount > sp.campaign_cap_cents) fail('SPEND_LIMIT');
        const sid = 'cs_test_mock' + uuid().replace(/-/g, '');
        db.sessions[sid] = { id: sid, player_id: player.id, bundle: b.bundle, paid: true };
        save(db);
        return { url: location.pathname + '?session_id=' + sid, session_id: sid };
      }
      case 'confirm': {
        const s = db.sessions[b.session_id]; if (!s) fail('UNKNOWN_SESSION');
        const bu = BUNDLES[s.bundle]; const p = db.players[s.player_id];
        let granted = false;
        if (!db.payments.some((x) => x.stripe_session_id === s.id)) {
          db.payments.push({ stripe_session_id: s.id, player_id: p.id, bundle: s.bundle, credits: bu.credits, amount_cents: bu.amount, created_at: new Date().toISOString(), email: 'demo@example.com' });
          p.credits += bu.credits; granted = true; save(db);
        }
        return { paid: true, granted, credits_added: bu.credits, bundle: s.bundle, player: me(p) };
      }
      case 'start': {
        if (!player) fail('PLAYER_NOT_FOUND');
        if (player.banned) fail('BANNED');
        const open = db.plays.find((x) => x.player_id === player.id && x.score == null && !x.voided && x.rounds);
        if (open) return { play_id: open.id, speed_ms: open.speed_ms, rounds: open.rounds, credits: player.credits, resumed: true };
        if (closed()) fail('CLOSED');
        if (player.credits <= 0) fail('NO_CREDITS');
        player.credits -= 1;
        const play = { id: uuid(), player_id: player.id, started_at: new Date().toISOString(), score: null, rounds: newRounds(), speed_ms: 1000, voided: false };
        db.plays.push(play); save(db);
        return { play_id: play.id, speed_ms: play.speed_ms, rounds: play.rounds, credits: player.credits, resumed: false };
      }
      case 'submit': {
        if (!player) fail('PLAYER_NOT_FOUND');
        const play = db.plays.find((x) => x.id === b.play_id && x.player_id === player.id);
        if (!play) fail('PLAY_NOT_FOUND');
        if (play.score != null) fail('ALREADY_SCORED');
        const taps = Array.isArray(b.taps) ? b.taps.map(Number) : [];
        if (taps.length !== 3 || taps.some((t) => !Number.isInteger(t) || t < 60 || t > 120000)) fail('BAD_TAP');
        const rounds = taps.map((t, i) => roundScore(t, play.rounds[i].phase, play.rounds[i].target, play.speed_ms));
        const exp = Math.round((rounds[0] + rounds[1] + rounds[2]) / 3);
        play.score = exp; play.taps = taps; play.finished_at = new Date().toISOString(); play.week_start = weekStart();
        save(db);
        const row = board(player.role === 'everyone' ? null : player.role).find((r) => r.tag === tag(player.id));
        const rowAll = board(null).find((r) => r.tag === tag(player.id));
        const m = me(player);
        return { score: exp, rounds, best: m.best, best_this_week: m.best, best_light: Math.max(...rounds), rank: row ? row.rank : null, rank_all: rowAll ? rowAll.rank : null, credits: player.credits, week_start: play.week_start };
      }
      case 'admin': {
        adminCheck(b.code);
        // The demo's owner code is OWNER: the site's words and photos, the prizes, the campaign, Stripe and the code.
        // The committee code alone runs the game: bans, cancelled plays, names, blocked names and free plays.
        if (['set_code', 'settings', 'stripe_connect', 'stripe_disconnect', 'set_content', 'upload_image'].includes(b.op) && b.owner_code !== 'OWNER') fail('OWNER_ONLY');
        const FREE_PLAY_LIMIT = 3;
        const freePlaysOf = (pid) => (db.free_plays || []).filter((x) => x.player_id === pid);
        const campaign = () => {
          const e = db.settings.ends_on || '';
          return { ends_on: e, closes_at: e ? new Date(new Date(e + 'T23:59:59').getTime() + 1000).toISOString() : null, closed: closed(), goal_cents: db.settings.goal_cents,
            prize_mode: db.settings.prize_mode === 'honours' ? 'honours' : 'prizes', daily_cap_cents: CAPS.daily, campaign_cap_cents: CAPS.campaign, free_play_limit: FREE_PLAY_LIMIT, server_time: new Date().toISOString() };
        };
        const tidy = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
        switch (b.op) {
          case 'overview': {
            const wk = b.week || weekStart();
            const byDay = {};
            db.payments.forEach((p) => { const d = p.created_at.slice(0, 10); byDay[d] = byDay[d] || { day: d, payments: 0, amount_cents: 0 }; byDay[d].payments++; byDay[d].amount_cents += p.amount_cents; });
            const roles = { student: 0, teacher: 0, everyone: 0 };
            Object.values(db.players).forEach((p) => { roles[p.role || 'everyone'] = (roles[p.role || 'everyone'] || 0) + 1; });
            const all = board(null, wk, true);
            const own = { student: board('student', wk, true), teacher: board('teacher', wk, true) };
            return {
              stats: stats(), week: wk, weeks: [weekStart()], spot: spotPrizes(),
              board: all.map((r) => { const o = (own[r.role] || []).find((x) => x.tag === r.tag); return { ...r, rank_all: r.rank, rank: o ? o.rank : r.rank, finished_at: r.achieved_at }; }),
              payments: db.payments.slice().reverse().slice(0, 50).map((p) => ({ ...p, initials: db.players[p.player_id] ? disp(db.players[p.player_id]) : '???', role: (db.players[p.player_id] || {}).role })),
              by_day: Object.values(byDay).sort((a, c) => c.day.localeCompare(a.day)),
              players_by_role: roles,
              blocked_by_committee: db.blocked,
              banned: Object.values(db.players).filter((p) => p.banned).map((p) => ({ player_id: p.id, initials: disp(p), claim_code: p.claim_code })),
            };
          }
          case 'emails': return Object.values(db.players).map((p) => ({ player_id: p.id, initials: disp(p), role: p.role || 'everyone', contact_email: p.contact_email || null, school_email: p.school_email || null, claim_code: p.claim_code, banned: !!p.banned, best: scoredPlays(p.id).reduce((m, x) => Math.max(m, x.score), null) }));
          case 'player': {
            const [ini, sfx] = String(b.initials).toUpperCase().split('#');
            const p = Object.values(db.players).sort((x, y) => (x.suffix || 1) - (y.suffix || 1)).find((x) => x.initials === ini && (!sfx || (x.suffix || 1) === Number(sfx))); if (!p) fail('PLAYER_NOT_FOUND');
            const newest = (a, c) => String(c).localeCompare(String(a));
            return { player: { ...p, initials: disp(p), created_at: p.created_at || new Date().toISOString(), last_seen_at: new Date().toISOString() }, others: Object.values(db.players).filter((x) => x.initials === ini && x.id !== p.id).map(disp),
              plays: db.plays.filter((x) => x.player_id === p.id).sort((x, y) => newest(x.started_at, y.started_at)).map((x) => ({ play_id: x.id, started_at: x.started_at, finished_at: x.finished_at, score: x.score, best_light: x.score == null ? null : playLight(x), week_start: x.week_start, voided: x.voided, void_reason: x.void_reason || null })),
              payments: db.payments.filter((x) => x.player_id === p.id).sort((x, y) => newest(x.created_at, y.created_at)).map((x) => ({ created_at: x.created_at, bundle: x.bundle, credits: x.credits, amount_cents: x.amount_cents, refunded_cents: x.refunded_cents || 0, email: x.email || null, source: x.source || 'confirm', stripe_session_id: x.stripe_session_id, stripe_payment_intent: x.stripe_payment_intent || null })),
              free_plays: freePlaysOf(p.id).sort((x, y) => newest(x.created_at, y.created_at)).map((x) => ({ created_at: x.created_at, reason: x.reason })), free_play_limit: FREE_PLAY_LIMIT };
          }
          case 'reset_name': { const p = db.players[b.player_id]; if (!p) fail('PLAYER_NOT_FOUND'); p.initials = randomInitials(); p.suffix = 1; save(db); return { ok: true, initials: p.initials }; }
          case 'void': { const pl = db.plays.find((x) => x.id === b.play_id); if (!pl) fail('PLAY_NOT_FOUND'); pl.voided = b.voided !== false; pl.void_reason = pl.voided ? (tidy(b.reason).slice(0, 200) || 'committee') : null; save(db); return { ok: true }; }
          case 'ban': { const p = db.players[b.player_id]; if (!p) fail('PLAYER_NOT_FOUND'); p.banned = b.banned !== false; save(db); return { ok: true }; }
          // Blocking adds a name; unblocking reaches only the committee's own, as on the server.
          case 'block': {
            const i = String(b.initials || '').toUpperCase().trim(); if (!/^[A-Z]{3}$/.test(i)) fail('BAD_INITIALS');
            db.blocked_at = db.blocked_at || {};
            if (b.block !== false) { if (!BLOCKED.includes(i) && !db.blocked.includes(i)) { db.blocked.push(i); db.blocked_at[i] = new Date().toISOString(); } }
            else { if (BLOCKED.includes(i)) fail('BUILT_IN_NAME'); db.blocked = db.blocked.filter((x) => x !== i); }
            save(db); return { ok: true };
          }
          case 'blocked': return {
            committee: db.blocked.slice().sort().map((i) => ({ initials: i, created_at: (db.blocked_at || {})[i] || null, players: Object.values(db.players).filter((p) => p.initials === i).length })),
            built_in: BLOCKED.slice().sort(),
          };
          case 'give_play': {
            const reason = tidy(b.reason); if (reason.length < 3 || reason.length > 200) fail('BAD_REASON');
            const p = db.players[b.player_id]; if (!p) fail('PLAYER_NOT_FOUND');
            if (p.banned) fail('BANNED');
            if (closed()) fail('CLOSED');
            const given = freePlaysOf(p.id).length;
            if (given >= FREE_PLAY_LIMIT) fail('FREE_PLAY_LIMIT');
            (db.free_plays = db.free_plays || []).push({ player_id: p.id, reason, created_at: new Date().toISOString() });
            p.credits += 1; save(db);
            return { ok: true, credits: p.credits, given: given + 1, limit: FREE_PLAY_LIMIT };
          }
          case 'campaign': return campaign();
          // The top three of each prize slot as the boards and spotPrizes() rank them, with the codes and emails.
          case 'winners': {
            const row = (p, rank, score, at, lights) => ({ rank, player_id: p.id, initials: disp(p), role: p.role || 'everyone', score, achieved_at: at, lights: lights || null, claim_code: p.claim_code, contact_email: p.contact_email || null, school_email: p.school_email || null, banned: !!p.banned });
            const byTag = {}; Object.values(db.players).forEach((p) => { byTag[tag(p.id)] = p; });
            const top3 = (role) => board(role).slice(0, 3).map((r) => row(byTag[r.tag], r.rank, r.score, r.achieved_at));
            const byPlayer = {};
            db.plays.filter((x) => x.score != null && !x.voided && db.players[x.player_id] && !db.players[x.player_id].banned).forEach((x) => { (byPlayer[x.player_id] = byPlayer[x.player_id] || []).push(x); });
            const cmpN = (a, c, n) => { for (let i = 0; i < n; i++) { const d = (c[i] ?? -1) - (a[i] ?? -1); if (d) return d; } return 0; };
            const light = [], first = [];
            Object.entries(byPlayer).forEach(([pid, plays]) => {
              const all = plays.flatMap((x) => lightsOf(x).map((l) => ({ l, at: x.finished_at }))).sort((a, c) => c.l - a.l || String(a.at).localeCompare(String(c.at)));
              light.push({ pid, key: all.slice(0, 3).map((z) => z.l), at: all[0].at });
              const f = plays.slice().sort((a, c) => String(a.started_at).localeCompare(String(c.started_at)))[0];
              first.push({ pid, key: [f.score, ...lightsOf(f).sort((a, c) => c - a).slice(0, 3)], at: f.finished_at });
            });
            light.sort((a, c) => cmpN(a.key, c.key, 3) || String(a.at).localeCompare(String(c.at)));
            first.sort((a, c) => cmpN(a.key, c.key, 4) || String(a.at).localeCompare(String(c.at)));
            const cp = campaign();
            return { everyone: top3(null), students: top3('student'), teachers: top3('teacher'),
              best_light: light.slice(0, 3).map((x, i) => row(db.players[x.pid], i + 1, x.key[0], x.at, x.key)),
              first_play: first.slice(0, 3).map((x, i) => row(db.players[x.pid], i + 1, x.key[0], x.at, x.key.slice(1))),
              ends_on: cp.ends_on, closes_at: cp.closes_at, prize_mode: cp.prize_mode };
          }
          case 'set_code': return { ok: true };
          case 'payments': {
            const q = String(b.q || '').trim().toLowerCase();
            const inRange = (p) => (!b.from || p.created_at.slice(0, 10) >= b.from) && (!b.to || p.created_at.slice(0, 10) <= b.to);
            const rows = db.payments.slice().reverse().map((p, i) => { const pl = db.players[p.player_id] || {}; return { id: p.stripe_session_id || String(i), created_at: p.created_at, initials: pl.initials ? disp(pl) : '???', player_id: p.player_id, role: pl.role || 'everyone', bundle: p.bundle, credits: p.credits, amount_cents: p.amount_cents, refunded_cents: p.refunded_cents || 0, email: p.email || null, source: p.source || 'confirm', stripe_session_id: p.stripe_session_id || '', stripe_payment_intent: p.stripe_payment_intent || null, contact_email: pl.contact_email || null }; })
              .filter(inRange).filter((r) => !q || r.initials.toLowerCase().startsWith(q) || String(r.email || '').toLowerCase().includes(q) || String(r.contact_email || '').toLowerCase().includes(q) || r.stripe_session_id.toLowerCase().includes(q) || String(r.stripe_payment_intent || '').toLowerCase().includes(q) || r.bundle === q || (/^\d+$/.test(q) && r.amount_cents === Number(q) * 100));
            const off = Math.max(0, Number(b.offset) || 0), lim = Math.min(500, Math.max(1, Number(b.limit) || 50));
            return { rows: rows.slice(off, off + lim), total: rows.length, sum_cents: rows.reduce((s, r) => s + r.amount_cents, 0), refunded_cents: rows.reduce((s, r) => s + r.refunded_cents, 0) };
          }
          case 'players': {
            const q = String(b.q || '').trim().toLowerCase();
            const rows = Object.values(db.players).map((p) => {
              const plays = db.plays.filter((x) => x.player_id === p.id && x.score != null && !x.voided);
              return { id: p.id, initials: disp(p), role: p.role || 'everyone', claim_code: p.claim_code, contact_email: p.contact_email || null, school_email: p.school_email || null, credits: p.credits || 0, banned: !!p.banned, created_at: p.created_at || new Date().toISOString(), last_seen_at: p.last_seen_at || p.created_at || new Date().toISOString(), plays: plays.length, best: plays.length ? Math.max(...plays.map((x) => x.score)) : null, paid_cents: db.payments.filter((x) => x.player_id === p.id).reduce((s, x) => s + x.amount_cents, 0) };
            }).filter((r) => (!b.role || r.role === b.role) && (b.banned == null || r.banned === !!b.banned))
              .filter((r) => !q || r.initials.toLowerCase().startsWith(q) || String(r.contact_email || '').toLowerCase().includes(q) || String(r.school_email || '').toLowerCase().includes(q) || r.claim_code === q)
              .sort((x, y) => String(y.last_seen_at).localeCompare(String(x.last_seen_at)));
            const off = Math.max(0, Number(b.offset) || 0), lim = Math.min(500, Math.max(1, Number(b.limit) || 50));
            return { rows: rows.slice(off, off + lim), total: rows.length };
          }
          case 'set_content': {
            if (!b.content || typeof b.content !== 'object' || Array.isArray(b.content)) fail('BAD_CONTENT');
            if (JSON.stringify(b.content).length > 400000) fail('CONTENT_TOO_BIG');
            db.settings.content = b.content; save(db); return { ok: true };
          }
          case 'upload_image': {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(b.type)) fail('BAD_IMAGE');
            if (!b.data || String(b.data).length > 4200000) fail('IMAGE_TOO_BIG');
            return { url: 'data:' + b.type + ';base64,' + b.data }; // the demo keeps the picture in the page itself
          }
          case 'stripe_status': return stripeStatus();
          case 'stripe_connect': {
            const key = String(b.secret_key || '').trim();
            if (!/^sk_(live|test)_[A-Za-z0-9]{16,}$/.test(key)) fail('BAD_STRIPE_KEY');
            db.settings.stripe = { mode: key.startsWith('sk_live_') ? 'live' : 'test', account: 'Demo account' };
            save(db); return stripeStatus();
          }
          case 'stripe_disconnect': { db.settings.stripe = null; save(db); return stripeStatus(); }
          case 'settings': {
            if (b.goal_cents != null) db.settings.goal_cents = b.goal_cents;
            if (b.ends_on != null) { if (b.ends_on !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(b.ends_on)) fail('BAD_DATE'); db.settings.ends_on = b.ends_on; }
            if (b.prizes && typeof b.prizes === 'object') { ['students', 'teachers', 'everyone', 'best_light', 'first_play'].forEach((k) => { if (b.prizes[k] != null) db.settings.prizes[k] = String(b.prizes[k]).slice(0, 200); }); }
            save(db); return { ok: true };
          }
          default: fail('BAD_ADMIN_OP');
        }
      }
      default: fail('UNKNOWN_ACTION');
    }
  }

  async function rpc(name, args) {
    await wait(120);
    db = load() || db;
    if (name === 'stats') return stats();
    if (name === 'board') return board(args.p_role, null).map(({ plays, ...r }) => r); // no play counts, as on the server
    if (name === 'spot_prizes') return spotPrizes();
    fail('UNKNOWN_RPC');
  }

  window.PRESLINK_MOCK = { api, rpc, reset() { localStorage.removeItem(KEY); db = seed(); save(db); } };
})();
