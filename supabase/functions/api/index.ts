// PresLink Arcade API (Supabase Edge Function, Deno).
//
// Dependency-free on purpose: Postgres is reached through PostgREST RPC with the
// service-role key, Stripe through its REST API. Every action is a POST with a
// JSON body: { action: "register" | "update" | "school" | "contact" | "signin" | "me" | "checkout" | "confirm" | "start" | "submit" | "admin", ... }.
// "register" needs no name: the database assigns a random three-letter one. New players start on the
// Everyone board (role "everyone"); "school" moves a player onto the Students or Teachers board by
// checking the shape of a school email address (students @pbccork.ie, teachers @pbc-cork.ie; nothing is sent).
// One campaign, no weeks: boards and spot prizes run until the committee's end date.
// Admin calls carry the committee code; the database verifies it (SHA-256 hash in settings) and
// locks the admin scope after repeated failures.
//
// Stripe: the committee connects it from the Committee page (admin op "stripe_connect"): the key is
// checked with Stripe, the webhook endpoint is created, and both secrets are kept in app_secrets,
// which only the service role can read. A STRIPE_SECRET_KEY environment secret, if set, wins.
//   SITE_URL            optional, e.g. https://preslink.netlify.app (used for Stripe return URLs;
//                       falls back to the browser's Origin header)

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_ENV_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
// The key the committee saved from the Committee page, cached for a minute. Empty means demo mode.
let keyCache: { value: string; at: number } | null = null;
export async function stripeKey(): Promise<string> {
  if (STRIPE_ENV_KEY) return STRIPE_ENV_KEY;
  if (keyCache && Date.now() - keyCache.at < 60_000) return keyCache.value;
  const value = await secretGet("stripe_secret_key");
  keyCache = { value, at: Date.now() };
  return value;
}
async function secretGet(key: string): Promise<string> {
  try { return (await rpc<string | null>("app_secret_get", { p_key: key })) ?? ""; } catch { return ""; }
}
const STRIPE_API = (Deno.env.get("STRIPE_API_BASE") ?? "https://api.stripe.com").replace(/\/$/, "");
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");

export const BUNDLES: Record<string, { credits: number; amount: number; label: string }> = {
  single: { credits: 1, amount: 200, label: "1 play" },
  triple: { credits: 3, amount: 500, label: "3 plays" },
  seven: { credits: 7, amount: 1000, label: "7 plays" },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class HttpError extends Error {
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Postgres (PostgREST RPC with the service role)
// ---------------------------------------------------------------------------
export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "message" in data)
      ? String((data as { message: unknown }).message)
      : String(data);
    // Our SQL raises short upper-case codes such as NO_CREDITS; pass those to the browser.
    const code = /^[A-Z_]{3,40}$/.test(msg) ? msg : "DB_ERROR";
    console.error("rpc error", name, res.status, text);
    throw new HttpError(code === "DB_ERROR" ? 500 : 400, code);
  }
  // Some functions return { error: CODE } instead of raising, so that a failed sign-in or admin
  // attempt stays recorded for the lockout. Surface those the same way.
  if (data && typeof data === "object" && !Array.isArray(data) && typeof (data as { error?: unknown }).error === "string") {
    throw new HttpError(400, String((data as { error: string }).error));
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Stripe (REST, form-encoded)
// ---------------------------------------------------------------------------
export async function stripe(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, string>, key?: string) {
  const k = key ?? await stripeKey();
  if (!k) throw new HttpError(503, "STRIPE_NOT_CONFIGURED");
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${k}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? new URLSearchParams(params ?? {}).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("stripe error", path, res.status, JSON.stringify(data));
    throw new HttpError(502, "STRIPE_ERROR");
  }
  return data;
}

function siteOrigin(req: Request): string {
  if (SITE_URL) return SITE_URL;
  const origin = req.headers.get("origin") ?? "";
  if (/^https:\/\/[a-z0-9.-]+$/i.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }
  throw new HttpError(400, "NO_SITE_URL");
}

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function requireUuid(v: unknown, code: string): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new HttpError(400, code);
  return v.toLowerCase();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
type Body = Record<string, unknown>;

const ROLES = new Set(["student", "teacher", "everyone"]);
// Students end with @pbccork.ie, teachers with @pbc-cork.ie. The database applies the same rule
// (set_school raises BAD_SCHOOL_EMAIL); checking here first saves a round trip.
const SCHOOL_EMAIL = /^[^\s@]+@(pbccork\.ie|pbc-cork\.ie)$/; // anything before the @

async function register(body: Body) {
  const role = String(body.role ?? "everyone");
  if (!ROLES.has(role)) throw new HttpError(400, "BAD_ROLE");
  const initials = body.initials == null ? null : String(body.initials).toUpperCase().trim();
  if (initials !== null && !/^[A-Z]{2,3}$/.test(initials)) throw new HttpError(400, "BAD_INITIALS");
  return await rpc("register_player", { p_role: role, p_initials: initials });
}

// Role "everyone" is always allowed; "student"/"teacher" need a matching school email on file
// (the database raises NEEDS_SCHOOL_EMAIL otherwise).
async function update(body: Body) {
  const playerId = requireUuid(body.player_id, "BAD_PLAYER");
  const initials = body.initials == null ? null : String(body.initials).toUpperCase().trim();
  const role = body.role == null ? null : String(body.role);
  if (initials !== null && !/^[A-Z]{2,3}$/.test(initials)) throw new HttpError(400, "BAD_INITIALS");
  if (role !== null && !ROLES.has(role)) throw new HttpError(400, "BAD_ROLE");
  if (initials === null && role === null) throw new HttpError(400, "NOTHING_TO_UPDATE");
  return await rpc("update_player", { p_id: playerId, p_initials: initials, p_role: role });
}

// Joins the Students or Teachers board. Format check only: no mail is sent.
async function school(body: Body) {
  const playerId = requireUuid(body.player_id, "BAD_PLAYER");
  if (typeof body.email !== "string") throw new HttpError(400, "BAD_SCHOOL_EMAIL");
  const email = body.email.replace(/\s+/g, "").toLowerCase(); // capitals and stray spaces are not mistakes
  if (email.length < 6 || email.length > 120 || email.split("@").length !== 2) throw new HttpError(400, "BAD_SCHOOL_EMAIL");
  if (!SCHOOL_EMAIL.test(email)) throw new HttpError(400, "BAD_SCHOOL_EMAIL");
  return await rpc("set_school", { p_id: playerId, p_email: email });
}

// Where to send the news if they win, plus an optional school email that joins a board. A school
// address in the first field counts too. Format checks only; the database applies the same rules.
const ANY_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function contact(body: Body) {
  const playerId = requireUuid(body.player_id, "BAD_PLAYER");
  if (typeof body.email !== "string") throw new HttpError(400, "BAD_EMAIL");
  const email = body.email.replace(/\s+/g, "").toLowerCase();
  if (email.length < 6 || email.length > 120 || !ANY_EMAIL.test(email)) throw new HttpError(400, "BAD_EMAIL");
  const school = body.school_email == null ? "" : String(body.school_email).replace(/\s+/g, "").toLowerCase();
  if (school !== "" && !SCHOOL_EMAIL.test(school)) throw new HttpError(400, "BAD_SCHOOL_EMAIL");
  return await rpc("set_contact", { p_id: playerId, p_email: email, p_school_email: school === "" ? null : school });
}

async function me(body: Body) {
  const playerId = requireUuid(body.player_id, "BAD_PLAYER");
  return await rpc("me_player", { p_id: playerId });
}

async function checkout(req: Request, body: Body) {
  const playerId = requireUuid(body.player_id, "BAD_PLAYER");
  const bundle = String(body.bundle ?? "");
  const b = BUNDLES[bundle];
  if (!b) throw new HttpError(400, "BAD_BUNDLE");

  const player = await rpc<{ initials: string }>("me_player", { p_id: playerId });
  const origin = siteOrigin(req);

  // Demo mode: with no Stripe key configured, plays are free and clearly labelled as such.
  if (!(await stripeKey())) {
    const id = `cs_demo_${bundle}_${playerId}_${crypto.randomUUID().replace(/-/g, "")}`;
    return { url: `${origin}/?session_id=${id}`, session_id: id, demo: true };
  }

  const session = await stripe("POST", "/v1/checkout/sessions", {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(b.amount),
    "line_items[0][price_data][product_data][name]": `PresLink Arcade: ${b.label}`,
    "line_items[0][price_data][product_data][description]":
      "Every play supports Presentation Brothers schools in Ghana and Nigeria.",
    success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?cancelled=1`,
    client_reference_id: playerId,
    "metadata[player_id]": playerId,
    "metadata[bundle]": bundle,
    "metadata[credits]": String(b.credits),
    "payment_intent_data[description]": `PresLink Arcade: ${b.label} (${player.initials})`,
    "payment_intent_data[metadata][player_id]": playerId,
    submit_type: "pay",
  });

  return { url: session.url, session_id: session.id };
}

// Called by the browser when Stripe sends it back. Idempotent with the webhook.
async function confirm(body: Body) {
  const sessionId = String(body.session_id ?? "");
  const demo = sessionId.match(/^cs_demo_(single|triple|seven)_([0-9a-f-]{36})_[0-9a-f]{32}$/);
  if (demo && !(await stripeKey())) {
    const b = BUNDLES[demo[1]];
    const grant = await rpc<{ credits: number }>("grant_demo_credits", { p_player_id: demo[2], p_credits: b.credits });
    const player = await rpc("me_player", { p_id: demo[2] });
    return { paid: true, granted: true, demo: true, credits_added: b.credits, bundle: demo[1], credits: grant.credits, player };
  }
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) throw new HttpError(400, "BAD_SESSION");

  const s = await stripe("GET", `/v1/checkout/sessions/${sessionId}`);
  const meta = (s.metadata ?? {}) as Record<string, string>;
  const b = BUNDLES[meta.bundle ?? ""];
  if (!b || !UUID.test(meta.player_id ?? "")) throw new HttpError(400, "UNKNOWN_SESSION");

  if (s.payment_status !== "paid") {
    return { paid: false, granted: false };
  }

  const grant = await rpc<{ granted: boolean; credits: number }>("grant_credits", {
    p_session_id: s.id,
    p_payment_intent: typeof s.payment_intent === "string" ? s.payment_intent : null,
    p_player_id: meta.player_id,
    p_bundle: meta.bundle,
    p_credits: b.credits,
    p_amount_cents: Number(s.amount_total ?? b.amount),
    p_currency: String(s.currency ?? "eur"),
    p_email: s.customer_details?.email ?? null,
    p_source: "confirm",
  });

  // Returning the player lets a browser that lost its storage recover its account from the receipt URL.
  const player = await rpc("me_player", { p_id: meta.player_id });
  return { paid: true, granted: grant.granted, credits_added: b.credits, bundle: meta.bundle, player };
}

async function start(body: Body) {
  const playerId = requireUuid(body.player_id, "BAD_PLAYER");
  return await rpc("start_play", { p_player_id: playerId });
}

async function submit(req: Request, body: Body) {
  const playerId = requireUuid(body.player_id, "BAD_PLAYER");
  const playId = requireUuid(body.play_id, "BAD_PLAY");
  const score = Number(body.score);
  const taps = Array.isArray(body.taps) ? body.taps.map((t) => Number(t)) : [];
  if (!Number.isInteger(score) || score < 0 || score > 1000) throw new HttpError(400, "BAD_SCORE");
  if (taps.length !== 3 || taps.some((t) => !Number.isInteger(t) || t < 0 || t > 600000)) throw new HttpError(400, "BAD_TAP");
  const ua = req.headers.get("user-agent") ?? "";
  return await rpc("submit_play", {
    p_player_id: playerId,
    p_play_id: playId,
    p_score: score,
    p_taps: taps,
    p_client: { ua: ua.slice(0, 200) },
  });
}

async function signin(body: Body) {
  const initials = String(body.initials ?? "").toUpperCase().trim();
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (!/^[A-Z]{2,3}(#\d{1,3})?$/.test(initials)) throw new HttpError(400, "BAD_INITIALS");
  if (!/^\d{4}$/.test(code)) throw new HttpError(400, "BAD_SIGNIN");
  return await rpc("signin_player", { p_initials: initials, p_code: code });
}

const ADMIN_OPS = new Set(["overview", "emails", "void", "ban", "block", "set_code", "settings", "player", "reset_name", "stripe_status", "stripe_connect", "stripe_disconnect", "payments", "players", "set_content", "upload_image"]);
// The operations that change anything (the site's words and photos, prizes, the campaign, Stripe, the
// committee code, bans, voids, blocked names) belong to the site's owner, not the committee: they need the
// OWNER_CODE secret as well as the committee code. With no OWNER_CODE configured, nothing can be changed.
const OWNER_OPS = new Set(["void", "ban", "block", "set_code", "settings", "reset_name", "stripe_connect", "stripe_disconnect", "set_content", "upload_image"]);

// The committee code is checked by the database (same lockout as every admin call).
async function adminVerify(code: string) {
  const err = await rpc<string | null>("admin_verify", { p_code: code });
  if (err) throw new HttpError(403, String(err));
}
function accountName(a: Record<string, unknown>): string {
  const bp = (a.business_profile ?? {}) as Record<string, unknown>;
  const dash = ((a.settings ?? {}) as Record<string, unknown>).dashboard as Record<string, unknown> | undefined;
  return String(bp.name || (dash && dash.display_name) || a.email || a.id || "Stripe").slice(0, 120);
}
async function stripeStatus() {
  const key = await stripeKey();
  if (!key) return { connected: false, mode: "", account: "", webhook: false, from_env: false };
  const fromEnv = !!STRIPE_ENV_KEY;
  const account = fromEnv ? "" : await secretGet("stripe_account");
  const webhook = fromEnv ? !!(Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "") : !!(await secretGet("stripe_webhook_secret"));
  return { connected: true, mode: key.startsWith("sk_live_") ? "live" : "test", account, webhook, from_env: fromEnv };
}
const SECRET_KEYS = ["stripe_secret_key", "stripe_webhook_secret", "stripe_webhook_id", "stripe_account"];
const PRIZE_KEYS = new Set(["students", "teachers", "everyone", "best_light", "most_plays"]);

// body.prizes: null (leave alone) or an object whose keys are the five prize slots; each value is
// stored as settings.prize_<key>, cut to 200 characters.
function parsePrizes(v: unknown): Record<string, string> | null {
  if (v == null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "BAD_PRIZES");
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!PRIZE_KEYS.has(k) || typeof val !== "string") throw new HttpError(400, "BAD_PRIZES");
    out[k] = val.trim().slice(0, 200);
  }
  return out;
}

async function admin(body: Body) {
  const code = String(body.code ?? "");
  const op = String(body.op ?? "");
  if (!code || code.length > 200) throw new HttpError(400, "BAD_ADMIN");
  if (!ADMIN_OPS.has(op)) throw new HttpError(400, "BAD_ADMIN_OP");
  if (OWNER_OPS.has(op)) {
    const owner = Deno.env.get("OWNER_CODE") ?? "";
    if (!owner || String(body.owner_code ?? "") !== owner) throw new HttpError(403, "OWNER_ONLY");
  }

  switch (op) {
    case "overview": {
      // No week means the whole campaign (all-time); a date narrows to that week's plays.
      const week = body.week == null ? null : String(body.week);
      if (week !== null && !/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new HttpError(400, "BAD_WEEK");
      return await rpc("admin_overview", { p_code: code, p_week: week });
    }
    case "player": {
      const initials = String(body.initials ?? "").toUpperCase().trim();
      if (!/^[A-Z]{2,3}(#\d{1,3})?$/.test(initials)) throw new HttpError(400, "BAD_INITIALS");
      return await rpc("admin_player", { p_code: code, p_initials: initials });
    }
    case "reset_name": {
      const playerId = requireUuid(body.player_id, "BAD_PLAYER");
      return await rpc("admin_reset_name", { p_code: code, p_player_id: playerId });
    }
    case "void": {
      const playId = requireUuid(body.play_id, "BAD_PLAY");
      await rpc("admin_void_play", { p_code: code, p_play_id: playId, p_voided: body.voided !== false, p_reason: String(body.reason ?? "committee").slice(0, 200) });
      return { ok: true };
    }
    case "ban": {
      const playerId = requireUuid(body.player_id, "BAD_PLAYER");
      await rpc("admin_ban_player", { p_code: code, p_player_id: playerId, p_banned: body.banned !== false });
      return { ok: true };
    }
    case "block": {
      const initials = String(body.initials ?? "").toUpperCase().trim();
      if (!/^[A-Z]{3}$/.test(initials)) throw new HttpError(400, "BAD_INITIALS");
      await rpc("admin_block_initials", { p_code: code, p_initials: initials, p_block: body.block !== false });
      return { ok: true };
    }
    case "set_code": {
      const newCode = String(body.new_code ?? "");
      if (newCode.length < 6 || newCode.length > 200) throw new HttpError(400, "CODE_TOO_SHORT");
      await rpc("admin_set_code", { p_code: code, p_new_code: newCode });
      return { ok: true };
    }
    case "emails": return await rpc("admin_emails", { p_code: code }); // a bad code comes back as BAD_ADMIN, like overview
    case "stripe_status": {
      await adminVerify(code);
      return await stripeStatus();
    }
    case "stripe_connect": {
      await adminVerify(code);
      const key = String(body.secret_key ?? "").trim();
      if (!/^sk_(live|test)_[A-Za-z0-9]{16,}$/.test(key)) throw new HttpError(400, "BAD_STRIPE_KEY");
      // 1. The key must work: ask Stripe who it belongs to.
      let account: Record<string, unknown>;
      try { account = await stripe("GET", "/v1/account", undefined, key); } catch { throw new HttpError(400, "STRIPE_KEY_REJECTED"); }
      // 2. One webhook endpoint for this project, replacing the one we made before, if any.
      const oldId = await secretGet("stripe_webhook_id");
      if (oldId) { try { await stripe("DELETE", `/v1/webhook_endpoints/${oldId}`, undefined, key); } catch { /* already gone */ } }
      const hook = await stripe("POST", "/v1/webhook_endpoints", {
        url: `${SUPABASE_URL}/functions/v1/stripe-webhook`,
        "enabled_events[0]": "checkout.session.completed",
        "enabled_events[1]": "checkout.session.async_payment_succeeded",
        description: "PresLink Arcade",
      }, key);
      // 3. Keep both secrets where only the service role can read them.
      await rpc("app_secret_set", { p_key: "stripe_secret_key", p_value: key });
      await rpc("app_secret_set", { p_key: "stripe_webhook_secret", p_value: String(hook.secret ?? "") });
      await rpc("app_secret_set", { p_key: "stripe_webhook_id", p_value: String(hook.id ?? "") });
      await rpc("app_secret_set", { p_key: "stripe_account", p_value: accountName(account) });
      keyCache = null;
      return await stripeStatus();
    }
    case "stripe_disconnect": {
      await adminVerify(code);
      const key = await stripeKey();
      const oldId = await secretGet("stripe_webhook_id");
      if (key && oldId && !STRIPE_ENV_KEY) { try { await stripe("DELETE", `/v1/webhook_endpoints/${oldId}`, undefined, key); } catch { /* best effort */ } }
      for (const k of SECRET_KEYS) await rpc("app_secret_set", { p_key: k, p_value: "" });
      keyCache = null;
      return await stripeStatus();
    }
    case "settings": {
      const goal = body.goal_cents == null ? null : Number(body.goal_cents);
      if (goal !== null && (!Number.isInteger(goal) || goal < 0 || goal > 100000000)) throw new HttpError(400, "BAD_GOAL");
      const prize = body.prize_text == null ? null : String(body.prize_text).slice(0, 200);
      // ends_on: null leaves the date alone, "" clears it, otherwise YYYY-MM-DD (the database parses it).
      const endsOn = body.ends_on == null ? null : String(body.ends_on).trim();
      if (endsOn !== null && endsOn !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) throw new HttpError(400, "BAD_DATE");
      const prizes = parsePrizes(body.prizes);
      await rpc("admin_set_settings", { p_code: code, p_goal_cents: goal, p_prize_text: prize, p_ends_on: endsOn, p_prizes: prizes });
      return { ok: true };
    }
    case "payments": {
      // Search over name, emails, Stripe ids, bundle and euro amount; optional Dublin date range; paging.
      const q = body.q == null ? null : String(body.q).slice(0, 80);
      const from = body.from == null || body.from === "" ? null : String(body.from);
      const to = body.to == null || body.to === "" ? null : String(body.to);
      for (const d of [from, to]) if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, "BAD_DATE");
      return await rpc("admin_payments", { p_code: code, p_q: q, p_from: from, p_to: to, p_limit: clampInt(body.limit, 1, 500, 50), p_offset: clampInt(body.offset, 0, 1_000_000, 0) });
    }
    case "players": {
      const q = body.q == null ? null : String(body.q).slice(0, 80);
      const role = body.role == null || body.role === "" ? null : String(body.role);
      if (role !== null && !ROLES.has(role)) throw new HttpError(400, "BAD_ROLE");
      const banned = body.banned == null ? null : !!body.banned;
      return await rpc("admin_players", { p_code: code, p_q: q, p_role: role, p_banned: banned, p_limit: clampInt(body.limit, 1, 500, 50), p_offset: clampInt(body.offset, 0, 1_000_000, 0) });
    }
    case "set_content": {
      // The site's words and photos, one JSON document the public stats() carries.
      const content = body.content;
      if (!content || typeof content !== "object" || Array.isArray(content)) throw new HttpError(400, "BAD_CONTENT");
      if (JSON.stringify(content).length > 400_000) throw new HttpError(400, "CONTENT_TOO_BIG");
      return await rpc("admin_set_content", { p_code: code, p_content: content });
    }
    case "upload_image": {
      // A photo for the About page: base64 in, a public URL out. Stored with the service role in the
      // public "site" bucket; the browser resizes before sending, so the limit is generous.
      await adminVerify(code);
      const type = String(body.type ?? "");
      const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[type];
      if (!ext) throw new HttpError(400, "BAD_IMAGE");
      const data = String(body.data ?? "");
      if (!data || data.length > 4_200_000) throw new HttpError(400, "IMAGE_TOO_BIG");
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)); } catch { throw new HttpError(400, "BAD_IMAGE"); }
      if (bytes.length < 100 || bytes.length > 3_145_728) throw new HttpError(400, "IMAGE_TOO_BIG");
      const path = `about/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/site/${path}`, {
        method: "POST",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": type, "x-upsert": "true" },
        body: bytes,
      });
      if (!res.ok) { console.error("upload failed", res.status, await res.text()); throw new HttpError(502, "UPLOAD_FAILED"); }
      return { url: `${SUPABASE_URL}/storage/v1/object/public/site/${path}` };
    }
  }
  throw new HttpError(400, "BAD_ADMIN_OP");
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }

  try {
    switch (body.action) {
      case "register": return json(await register(body));
      case "update": return json(await update(body));
      case "school": return json(await school(body));
      case "contact": return json(await contact(body));
      case "signin": return json(await signin(body));
      case "admin": return json(await admin(body));
      case "me": return json(await me(body));
      case "checkout": return json(await checkout(req, body));
      case "confirm": return json(await confirm(body));
      case "start": return json(await start(body));
      case "submit": return json(await submit(req, body));
      default: return json({ error: "UNKNOWN_ACTION" }, 400);
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("unhandled", err);
    return json({ error: "SERVER_ERROR" }, 500);
  }
}

Deno.serve(handler);
