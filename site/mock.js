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
    return 50 + Math.round(950 * Math.pow(Math.max(0, 1 - Math.abs(pos - target) / 0.5), 3));
  }
  const newRounds = () => Array.from({ length: 3 }, () => ({ phase: Math.random(), target: 0.15 + Math.random() * 0.7 }));

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
    return { id: p.id, tag: tag(p.id), initials: p.initials, suffix: p.suffix || 1, display: disp(p), role: p.role || 'everyone', school_email: p.school_email || null, claim_code: p.claim_code, credits: p.credits, banned: !!p.banned, best, best_this_week: best, best_light: bestLightOf(p.id), open_play: open ? { play_id: open.id, speed_ms: open.speed_ms, rounds: open.rounds } : null };
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
      .map((p, i) => ({ rank: i + 1, tag: tag(p.player_id), initials: disp(p.player), role: p.player.role || 'everyone', score: p.score, achieved_at: p.finished_at, plays: p.plays, best_light: bestLightOf(p.player_id),
        ...(withIds ? { play_id: p.id, player_id: p.player_id, claim_code: p.player.claim_code, banned: !!p.player.banned } : {}) }));
  };
  const spotPrizes = () => {
    let light = null;
    db.plays.filter((x) => x.score != null && !x.voided && db.players[x.player_id] && !db.players[x.player_id].banned).forEach((x) => {
      const s = playLight(x);
      if (!light || s > light.score || (s === light.score && x.finished_at < light.achieved_at)) light = { tag: tag(x.player_id), initials: disp(db.players[x.player_id]), role: db.players[x.player_id].role || 'everyone', score: s, achieved_at: x.finished_at };
    });
    let most = null;
    Object.values(db.players).filter((p) => !p.banned).forEach((p) => {
      const n = scoredPlays(p.id).length;
      if (n && (!most || n > most.plays)) most = { tag: tag(p.id), initials: disp(p), role: p.role || 'everyone', plays: n };
    });
    return { best_light: light, most_plays: most };
  };
  const stats = () => ({
    total_raised_cents: db.payments.reduce((s, p) => s + p.amount_cents, 0), goal_cents: db.settings.goal_cents, prize_text: '', ends_on: db.settings.ends_on || '', prizes: db.settings.prizes || {},
    payments: db.payments.length, plays: db.plays.filter((p) => p.score != null && !p.voided).length, players: Object.keys(db.players).length,
    week_start: weekStart(), week_end: (() => { const d = new Date(weekStart() + 'T12:00:00'); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })(),
  });
  const adminCheck = (code) => { if (code !== DEMO_ADMIN_CODE) fail('BAD_ADMIN'); };

  async function api(action, b) {
    await wait(250);
    db = load() || db;
    const player = b.player_id ? db.players[b.player_id] : null;
    switch (action) {
      case 'school': {
        if (!player) fail('PLAYER_NOT_FOUND');
        const email = String(b.email || '').trim().toLowerCase();
        const m = email.match(/^[a-z0-9._%+'-]+@(pbccork\.ie|pbc-cork\.ie)$/);
        if (!m) fail('BAD_SCHOOL_EMAIL');
        player.role = m[1] === 'pbccork.ie' ? 'student' : 'teacher'; player.school_email = email; save(db);
        return me(player);
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
        db.players[id] = { id, initials, suffix: nextSuffix(initials), role: b.role, claim_code: String(Math.floor(Math.random() * 10000)).padStart(4, '0'), credits: 0, banned: false };
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
        const bu = BUNDLES[b.bundle]; if (!bu) fail('BAD_BUNDLE');
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
        if (player.credits <= 0) fail('NO_CREDITS');
        player.credits -= 1;
        const play = { id: uuid(), player_id: player.id, started_at: new Date().toISOString(), score: null, rounds: newRounds(), speed_ms: 850 + Math.floor(Math.random() * 201), voided: false };
        db.plays.push(play); save(db);
        return { play_id: play.id, speed_ms: play.speed_ms, rounds: play.rounds, credits: player.credits, resumed: false };
      }
      case 'submit': {
        if (!player) fail('PLAYER_NOT_FOUND');
        const play = db.plays.find((x) => x.id === b.play_id && x.player_id === player.id);
        if (!play) fail('PLAY_NOT_FOUND');
        if (play.score != null) fail('ALREADY_SCORED');
        const taps = Array.isArray(b.taps) ? b.taps.map(Number) : [];
        if (taps.length !== 3 || taps.some((t) => !Number.isInteger(t) || t < 150 || t > 120000)) fail('BAD_TAP');
        const rounds = taps.map((t, i) => roundScore(t, play.rounds[i].phase, play.rounds[i].target, play.speed_ms));
        const exp = Math.round((rounds[0] + rounds[1] + rounds[2]) / 3);
        if (Math.abs(exp - b.score) > 5) fail('SCORE_MISMATCH');
        play.score = exp; play.taps = taps; play.finished_at = new Date().toISOString(); play.week_start = weekStart();
        save(db);
        const row = board(player.role === 'everyone' ? null : player.role).find((r) => r.tag === tag(player.id));
        const rowAll = board(null).find((r) => r.tag === tag(player.id));
        const m = me(player);
        return { score: exp, rounds, best: m.best, best_this_week: m.best, best_light: Math.max(...rounds), rank: row ? row.rank : null, rank_all: rowAll ? rowAll.rank : null, credits: player.credits, week_start: play.week_start };
      }
      case 'admin': {
        adminCheck(b.code);
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
              past_winners: [],
              payments: db.payments.slice().reverse().slice(0, 50).map((p) => ({ ...p, initials: db.players[p.player_id] ? disp(db.players[p.player_id]) : '???', role: (db.players[p.player_id] || {}).role })),
              by_day: Object.values(byDay).sort((a, c) => c.day.localeCompare(a.day)),
              players_by_role: roles,
              blocked_by_committee: db.blocked,
              banned: Object.values(db.players).filter((p) => p.banned).map((p) => ({ player_id: p.id, initials: disp(p), claim_code: p.claim_code })),
            };
          }
          case 'player': {
            const [ini, sfx] = String(b.initials).toUpperCase().split('#');
            const p = Object.values(db.players).sort((x, y) => (x.suffix || 1) - (y.suffix || 1)).find((x) => x.initials === ini && (!sfx || (x.suffix || 1) === Number(sfx))); if (!p) fail('PLAYER_NOT_FOUND');
            return { player: { ...p, initials: disp(p), created_at: p.created_at || new Date().toISOString(), last_seen_at: new Date().toISOString() }, others: Object.values(db.players).filter((x) => x.initials === ini && x.id !== p.id).map(disp),
              plays: db.plays.filter((x) => x.player_id === p.id).map((x) => ({ play_id: x.id, started_at: x.started_at, finished_at: x.finished_at, score: x.score, week_start: x.week_start, voided: x.voided })),
              payments: db.payments.filter((x) => x.player_id === p.id) };
          }
          case 'reset_name': { const p = db.players[b.player_id]; if (!p) fail('PLAYER_NOT_FOUND'); p.initials = randomInitials(); p.suffix = 1; save(db); return { ok: true, initials: p.initials }; }
          case 'void': { const pl = db.plays.find((x) => x.id === b.play_id); if (!pl) fail('PLAY_NOT_FOUND'); pl.voided = b.voided !== false; save(db); return { ok: true }; }
          case 'ban': { const p = db.players[b.player_id]; if (!p) fail('PLAYER_NOT_FOUND'); p.banned = b.banned !== false; save(db); return { ok: true }; }
          case 'block': { const i = String(b.initials).toUpperCase(); if (b.block !== false) { if (!db.blocked.includes(i)) db.blocked.push(i); } else db.blocked = db.blocked.filter((x) => x !== i); save(db); return { ok: true }; }
          case 'set_code': return { ok: true };
          case 'settings': {
            if (b.goal_cents != null) db.settings.goal_cents = b.goal_cents;
            if (b.ends_on != null) { if (b.ends_on !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(b.ends_on)) fail('BAD_DATE'); db.settings.ends_on = b.ends_on; }
            if (b.prizes && typeof b.prizes === 'object') { ['students', 'teachers', 'everyone', 'best_light', 'most_plays'].forEach((k) => { if (b.prizes[k] != null) db.settings.prizes[k] = String(b.prizes[k]).slice(0, 200); }); }
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
    if (name === 'leaderboard') return board(args.p_role, args.p_week);
    if (name === 'spot_prizes') return spotPrizes();
    if (name === 'past_winners') return [];
    fail('UNKNOWN_RPC');
  }

  window.PRESLINK_MOCK = { api, rpc, reset() { localStorage.removeItem(KEY); db = seed(); save(db); } };
})();
