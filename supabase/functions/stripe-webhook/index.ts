// Stripe webhook receiver (Supabase Edge Function, Deno). Deploy with verify_jwt = false.
//
// Stripe calls this after a successful Checkout. We verify the signature and add
// the paid credits to the player. The same session is also confirmed by the
// browser on return, so grant_credits is idempotent and the two never double-count.
// A refund made in Stripe (charge.refunded) takes the refunded amount off the total
// and the unused plays it paid for off the player (refund_payment, also idempotent).
//
// The signing secret comes from the endpoint the Committee page created (kept in app_secrets, read
// with the service role), or from a STRIPE_WEBHOOK_SECRET environment secret, which wins if set.

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENV_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
let secretCache: { value: string; at: number } | null = null;
async function webhookSecret(): Promise<string> {
  if (ENV_WEBHOOK_SECRET) return ENV_WEBHOOK_SECRET;
  if (secretCache && Date.now() - secretCache.at < 60_000) return secretCache.value;
  let value = "";
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/app_secret_get`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: "stripe_webhook_secret" }),
    });
    const data = res.ok ? await res.json() : null;
    value = typeof data === "string" ? data : "";
  } catch { value = ""; }
  secretCache = { value, at: Date.now() };
  return value;
}

const BUNDLES: Record<string, { credits: number; amount: number }> = {
  single: { credits: 1, amount: 200 },
  triple: { credits: 3, amount: 500 },
  seven: { credits: 7, amount: 1000 },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Stripe-Signature: t=<unix>,v1=<hex hmac>[,v1=<hex hmac>]
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") sigs.push(v);
  }
  if (!t || sigs.length === 0) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const expected = hex(new Uint8Array(mac));
  return sigs.some((s) => timingSafeEqual(s, expected));
}

async function grant(session: Record<string, unknown>): Promise<Record<string, unknown>> {
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const b = BUNDLES[meta.bundle ?? ""];
  if (!b || !UUID.test(meta.player_id ?? "")) return { ignored: "no_bundle_metadata" };
  if (session.payment_status !== "paid") return { ignored: "not_paid" };

  const details = (session.customer_details ?? {}) as Record<string, unknown>;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/grant_credits`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_session_id: session.id,
      p_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
      p_player_id: meta.player_id,
      p_bundle: meta.bundle,
      p_credits: b.credits,
      p_amount_cents: Number(session.amount_total ?? b.amount),
      p_currency: String(session.currency ?? "eur"),
      p_email: typeof details.email === "string" ? details.email : null,
      p_source: "webhook",
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    // A player that no longer exists is permanent: tell Stripe we are done so it stops retrying.
    if (/PLAYER_NOT_FOUND|foreign key/i.test(text)) {
      console.error("webhook: unknown player", text);
      return { ignored: "unknown_player" };
    }
    throw new Error(`grant_credits failed: ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

async function refund(charge: Record<string, unknown>): Promise<Record<string, unknown>> {
  const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : "";
  if (!intent) return { ignored: "no_payment_intent" };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/refund_payment`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_payment_intent: intent, p_refunded_cents: Number(charge.amount_refunded ?? 0) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`refund_payment failed: ${res.status} ${text}`);
  return JSON.parse(text);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = await webhookSecret();
  if (!secret) {
    console.error("no webhook secret: connect Stripe from the Committee page or set STRIPE_WEBHOOK_SECRET");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const payload = await req.text();
  const ok = await verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret);
  if (!ok) return new Response("Bad signature", { status: 400 });

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const result = await grant(event.data?.object ?? {});
      return Response.json({ received: true, ...result });
    }
    if (event.type === "charge.refunded") {
      const result = await refund(event.data?.object ?? {});
      return Response.json({ received: true, ...result });
    }
    return Response.json({ received: true, ignored: event.type });
  } catch (err) {
    console.error("webhook error", err);
    return new Response("Internal error", { status: 500 }); // Stripe will retry
  }
}

Deno.serve(handler);
