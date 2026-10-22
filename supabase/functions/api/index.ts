// PresLink Arcade API (Supabase Edge Function, Deno).
//
// Dependency-free on purpose: Postgres is reached through PostgREST RPC with the
// service-role key, Stripe through its REST API. Every action is a POST with a
// JSON body: { action: "register" | "update" | "signin" | "me" | "checkout" | "confirm" | "start" | "submit" | "admin", ... }.
// "register" needs no name: the database assigns a random three-letter one.
// Admin calls carry the committee code; the database verifies it (SHA-256 hash in settings) and
// locks the admin scope after repeated failures.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY   sk_test_... / sk_live_...
//   SITE_URL            optional, e.g. https://preslink-arcade.netlify.app (used for Stripe return URLs;
//                       falls back to the browser's Origin header)

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
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
export async function stripe(method: "GET" | "POST", path: string, params?: Record<string, string>) {
  if (!STRIPE_KEY) throw new HttpError(503, "STRIPE_NOT_CONFIGURED");
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
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

function requireUuid(v: unknown, code: string): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new HttpError(400, code);
  return v.toLowerCase();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
type Body = Record<string, unknown>;

async function register(body: Body) {
  const role = String(body.role ?? "student");
  if (role !== "student" && role !== "teacher") throw new HttpError(400, "BAD_ROLE");
  const initials = body.initials == null ? null : String(body.initials).toUpperCase().trim();
  if (initials !== null && !/^[A-Z]{2,3}$/.test(initials)) throw new HttpError(400, "BAD_INITIALS");
  return await rpc("register_player", { p_role: role, p_initials: initials });
}

async function update(body: Body) {
  const playerId = requireUuid(body.player_id, "BAD_PLAYER");
  const initials = body.initials == null ? null : String(body.initials).toUpperCase().trim();
  const role = body.role == null ? null : String(body.role);
  if (initials !== null && !/^[A-Z]{2,3}$/.test(initials)) throw new HttpError(400, "BAD_INITIALS");
  if (role !== null && role !== "student" && role !== "teacher") throw new HttpError(400, "BAD_ROLE");
  if (initials === null && role === null) throw new HttpError(400, "NOTHING_TO_UPDATE");
  return await rpc("update_player", { p_id: playerId, p_initials: initials, p_role: role });
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
  if (!STRIPE_KEY) {
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
  if (demo && !STRIPE_KEY) {
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
  const tapMs = Number(body.tap_ms);
  if (!Number.isInteger(score) || score < 0 || score > 1000) throw new HttpError(400, "BAD_SCORE");
  if (!Number.isInteger(tapMs) || tapMs < 0 || tapMs > 600000) throw new HttpError(400, "BAD_TAP");
  const ua = req.headers.get("user-agent") ?? "";
  return await rpc("submit_score", {
    p_player_id: playerId,
    p_play_id: playId,
    p_score: score,
    p_tap_ms: tapMs,
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

const ADMIN_OPS = new Set(["overview", "void", "ban", "block", "set_code", "settings", "player", "reset_name"]);

async function admin(body: Body) {
  const code = String(body.code ?? "");
  const op = String(body.op ?? "");
  if (!code || code.length > 200) throw new HttpError(400, "BAD_ADMIN");
  if (!ADMIN_OPS.has(op)) throw new HttpError(400, "BAD_ADMIN_OP");

  switch (op) {
    case "overview": {
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
    case "settings": {
      const goal = body.goal_cents == null ? null : Number(body.goal_cents);
      if (goal !== null && (!Number.isInteger(goal) || goal < 0 || goal > 100000000)) throw new HttpError(400, "BAD_GOAL");
      const prize = body.prize_text == null ? null : String(body.prize_text).slice(0, 200);
      await rpc("admin_set_settings", { p_code: code, p_goal_cents: goal, p_prize_text: prize });
      return { ok: true };
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
