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
  function expectedScore(tapMs, phase, speedMs) {
    let x = tapMs / speedMs + phase; x = x - 2 * Math.floor(x / 2);
    const pos = x < 1 ? x : 2 - x;
    return Math.round(1000 * (1 - 2 * Math.abs(pos - 0.5)));
  }

  function seed() {
    const db = { players: {}, plays: [], payments: [], sessions: {}, settings: { goal_cents: 200000, prize_text: '€20 voucher and the PresLink trophy' }, blocked: [], fails: {} };
    const demo = [['BRO', 'student', 983], ['TOM', 'student', 967], ['ZAC', 'student', 942], ['EVA', 'student', 921], ['OSC', 'student', 880], ['MRS', 'teacher', 958], ['SIR', 'teacher', 903]];
    demo.forEach(([initials, role, score], i) => {
      const id = uuid();
      db.players[id] = { id, initials, role, claim_code: String(1000 + i * 731).slice(-4), credits: 0, banned: false, created_at: new Date().toISOString() };
      db.payments.push({ stripe_session_id: 'cs_test_seed' + i, player_id: id, bundle: 'single', credits: 1, amount_cents: 200, created_at: new Date().toISOString(), email: '' });
      const at = new Date(Date.now() - (i + 1) * 3600e3).toISOString();
      db.plays.push({ id: uuid(), player_id: id, started_at: at, finished_at: at, score, tap_ms: 500, phase: 0, speed_ms: 650, week_start: weekStart(), voided: false });
    });
    return db;
  }
  let db = load() || seed();
  if (!db.settings) db.settings = { goal_cents: 200000, prize_text: '' };
  if (!db.blocked) db.blocked = [];
  save(db);

  const me = (p) => {
    const open = db.plays.find((x) => x.player_id === p.id && x.score == null && !x.voided);
    const best = db.plays.filter((x) => x.player_id === p.id && x.score != null && !x.voided && x.week_start === weekStart()).reduce((m, x) => Math.max(m, x.score), null);
    return { id: p.id, tag: tag(p.id), initials: p.initials, role: p.role, claim_code: p.claim_code, credits: p.credits, banned: !!p.banned, best_this_week: best, open_play: open ? { play_id: open.id, phase: open.phase, speed_ms: open.speed_ms } : null };
  };
  const board = (role, week, withIds) => {
    const best = {};
    db.plays.filter((p) => p.score != null && !p.voided && p.week_start === (week || weekStart())).forEach((p) => {
      const pl = db.players[p.player_id];
      if (!pl || (pl.banned && !withIds)) return;
      const b = best[p.player_id];
      if (!b || p.score > b.score || (p.score === b.score && p.finished_at < b.finished_at)) best[p.player_id] = { ...p, plays: (b ? b.plays : 0) + 1 };
      else b.plays += 1;
    });
    return Object.values(best).map((p) => ({ ...p, player: db.players[p.player_id] }))
      .filter((p) => !role || p.player.role === role)
      .sort((a, b) => b.score - a.score || a.finished_at.localeCompare(b.finished_at))
      .map((p, i) => ({ rank: i + 1, tag: tag(p.player_id), initials: p.player.initials, role: p.player.role, score: p.score, achieved_at: p.finished_at, plays: p.plays,
        ...(withIds ? { play_id: p.id, player_id: p.player_id, claim_code: p.player.claim_code, banned: !!p.player.banned } : {}) }));
  };
  const stats = () => ({
    total_raised_cents: db.payments.reduce((s, p) => s + p.amount_cents, 0), goal_cents: db.settings.goal_cents, prize_text: db.settings.prize_text,
    payments: db.payments.length, plays: db.plays.filter((p) => p.score != null && !p.voided).length, players: Object.keys(db.players).length,
    week_start: weekStart(), week_end: (() => { const d = new Date(weekStart() + 'T12:00:00'); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })(),
  });
  const adminCheck = (code) => { if (code !== DEMO_ADMIN_CODE) fail('BAD_ADMIN'); };

  async function api(action, b) {
    await wait(250);
    db = load() || db;
    const player = b.player_id ? db.players[b.player_id] : null;
    switch (action) {
      case 'register': {
        const initials = String(b.initials || '').toUpperCase();
        if (!/^[A-Z]{3}$/.test(initials)) fail('BAD_INITIALS');
        if (BLOCKED.includes(initials) || db.blocked.includes(initials)) fail('BLOCKED_INITIALS');
        if (Object.values(db.players).some((p) => p.initials === initials)) fail('TAKEN');
        const id = uuid();
        db.players[id] = { id, initials, role: b.role, claim_code: String(Math.floor(Math.random() * 10000)).padStart(4, '0'), credits: 0, banned: false };
        save(db);
        return me(db.players[id]);
      }
      case 'signin': {
        const initials = String(b.initials || '').toUpperCase();
        const p = Object.values(db.players).find((x) => x.initials === initials && x.claim_code === String(b.code));
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
        const open = db.plays.find((x) => x.player_id === player.id && x.score == null && !x.voided);
        if (open) return { play_id: open.id, phase: open.phase, speed_ms: open.speed_ms, credits: player.credits, resumed: true };
        if (player.credits <= 0) fail('NO_CREDITS');
        player.credits -= 1;
        const play = { id: uuid(), player_id: player.id, started_at: new Date().toISOString(), score: null, phase: Math.random(), speed_ms: 650, voided: false };
        db.plays.push(play); save(db);
        return { play_id: play.id, phase: play.phase, speed_ms: play.speed_ms, credits: player.credits, resumed: false };
      }
      case 'submit': {
        if (!player) fail('PLAYER_NOT_FOUND');
        const play = db.plays.find((x) => x.id === b.play_id && x.player_id === player.id);
        if (!play) fail('PLAY_NOT_FOUND');
        if (play.score != null) fail('ALREADY_SCORED');
        const exp = expectedScore(b.tap_ms, play.phase, play.speed_ms);
        if (Math.abs(exp - b.score) > 5) fail('SCORE_MISMATCH');
        play.score = exp; play.tap_ms = b.tap_ms; play.finished_at = new Date().toISOString(); play.week_start = weekStart();
        save(db);
        const row = board(player.role).find((r) => r.tag === tag(player.id));
        return { score: exp, best_this_week: me(player).best_this_week, rank: row ? row.rank : null, credits: player.credits, week_start: play.week_start };
      }
      case 'admin': {
        adminCheck(b.code);
        switch (b.op) {
          case 'overview':
            return {
              stats: stats(),
              board: [...board('student', null, true), ...board('teacher', null, true)],
              past_winners: [],
              payments: db.payments.slice().reverse().slice(0, 30).map((p) => ({ ...p, initials: (db.players[p.player_id] || {}).initials || '???' })),
              blocked_by_committee: db.blocked,
              banned: Object.values(db.players).filter((p) => p.banned).map((p) => ({ player_id: p.id, initials: p.initials, claim_code: p.claim_code })),
            };
          case 'void': { const pl = db.plays.find((x) => x.id === b.play_id); if (!pl) fail('PLAY_NOT_FOUND'); pl.voided = b.voided !== false; save(db); return { ok: true }; }
          case 'ban': { const p = db.players[b.player_id]; if (!p) fail('PLAYER_NOT_FOUND'); p.banned = b.banned !== false; save(db); return { ok: true }; }
          case 'block': { const i = String(b.initials).toUpperCase(); if (b.block !== false) { if (!db.blocked.includes(i)) db.blocked.push(i); } else db.blocked = db.blocked.filter((x) => x !== i); save(db); return { ok: true }; }
          case 'set_code': return { ok: true };
          case 'settings': { if (b.goal_cents != null) db.settings.goal_cents = b.goal_cents; if (b.prize_text != null) db.settings.prize_text = b.prize_text; save(db); return { ok: true }; }
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
    if (name === 'past_winners') return [];
    fail('UNKNOWN_RPC');
  }

  window.PRESLINK_MOCK = { api, rpc, reset() { localStorage.removeItem(KEY); db = seed(); save(db); } };
})();
