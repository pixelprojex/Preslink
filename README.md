# PresLink Arcade

A phone-first web app for the PresLink charity at Presentation Brothers College, Cork.
Scan a QR code, pick three letters, insert a coin (€2 a play, €5 for 3, €10 for 7), and
**stop the light in the green**. One tap, score out of 1,000. Highest score of the week
wins, with separate boards for students and teachers. Every payment goes to PresLink.

```
  Phone (QR)  ──▶  Netlify (static site: site/)
                       │
                       ├──▶ Supabase Edge Function "api"  ──▶ Postgres (players, payments, plays)
                       │          │
                       │          └──▶ Stripe Checkout (hosted payment page)
                       │
  Stripe ──webhook──▶ Supabase Edge Function "stripe-webhook" ──▶ Postgres (adds credits)
```

- **Netlify** hosts the site straight from GitHub. No build step. Push to the branch, it deploys.
- **Supabase** holds the data and runs the two server functions. The browser can only read the
  leaderboard, past winners and the "raised so far" total. Everything that changes data goes through
  the functions.
- **Stripe Checkout** takes the money. The app never sees card numbers. Apple Pay, Google Pay and
  cards (including Revolut) all work.

## Repository layout

| Path | What it is |
|---|---|
| `site/index.html` | The whole app: landing page, terms, sign-up, arcade, game, leaderboard |
| `site/styles.css` | Design |
| `site/app.js` | Front-end logic and the game |
| `site/config.js` | **The only file you must edit**: Supabase URL and publishable key |
| `site/mock.js` | Demo backend. Active only while `config.js` is empty, so the site works before Supabase is wired |
| `site/qr.html` | Printable QR poster that always encodes the live address |
| `supabase/migrations/0001_init.sql` | Database tables and functions |
| `supabase/functions/api/index.ts` | Register, checkout, confirm payment, start play, submit score |
| `supabase/functions/stripe-webhook/index.ts` | Receives Stripe's payment confirmation |
| `docs/admin.sql` | Queries for the committee: find winners, void a play, totals |
| `netlify.toml` | Netlify settings and security headers |

## Launch checklist

Do these in order. Steps 1 and 2 are a one-off technical setup; 3 to 6 are the launch.

### 1. Supabase (database + functions)

1. Create a project at <https://supabase.com/dashboard> (region **West EU (Ireland)**). The free plan is enough.
   Give it a strong database password and keep it somewhere safe; you will not need it day to day.
2. Apply the schema: Dashboard → **SQL Editor** → New query → paste the whole of
   `supabase/migrations/0001_init.sql` → **Run**.
3. Deploy the two functions. Either ask Claude to deploy them through the Supabase connector, or with the
   Supabase CLI from this folder:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase functions deploy api --no-verify-jwt
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
4. Dashboard → **Project Settings → API**: copy the **Project URL** and the **publishable key**
   (`sb_publishable_...`, or the legacy `anon` key). Put them in `site/config.js`:
   ```js
   window.PRESLINK_CONFIG = {
     SUPABASE_URL: "https://xxxxxxxxxxxx.supabase.co",
     SUPABASE_KEY: "sb_publishable_...",
   };
   ```
   Commit and push.

### 2. Stripe (payments)

The Stripe account must be opened by an adult in the charity's name, with the charity's bank account
and registered details. A student cannot be the account holder.

1. Create the account at <https://dashboard.stripe.com/register>. Stay in **Test mode** for now.
2. **Developers → API keys** → copy the **Secret key** (`sk_test_...`).
3. In Supabase: **Edge Functions → Secrets** → add:
   - `STRIPE_SECRET_KEY` = the secret key
   - `SITE_URL` = your site address, e.g. `https://preslink-arcade.netlify.app` (no trailing slash).
     Optional: without it the function uses the address the request came from.
4. **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - After saving, copy the **Signing secret** (`whsec_...`) and add it in Supabase secrets as
     `STRIPE_WEBHOOK_SECRET`.
5. Optional but recommended: apply for Stripe's reduced nonprofit pricing (search "Stripe nonprofit
   pricing" in the Stripe support site) and switch on Apple Pay and Google Pay under **Settings →
   Payment methods** (they are on by default for Checkout).

### 3. Netlify (hosting)

1. Sign up at <https://app.netlify.com> with the GitHub account that owns this repository.
2. **Add new site → Import an existing project → GitHub** → choose this repository and the branch to deploy.
3. Build settings: leave **Build command** empty, set **Publish directory** to `site`. (netlify.toml already
   says this.) Deploy.
4. **Site configuration → Site details → Change site name** to something short, e.g. `preslink-arcade`.
   The address is then `https://preslink-arcade.netlify.app`. If you set `SITE_URL` in step 2.3, make sure
   it matches.

### 4. Test it end to end (still in Stripe test mode)

1. Open the site on a phone. Pick initials. Insert a coin. Stripe's test page opens.
2. Pay with card number `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
3. You should land back in the arcade, see the coin drop, and have credits. Play, then check the leaderboard.
4. In Supabase → **Table Editor** you will see the player, the payment and the play.
5. In Stripe → **Developers → Webhooks** the endpoint should show a successful delivery.

### 5. Go live

1. Finish Stripe account activation (the charity's details and bank account).
2. Switch the Stripe dashboard to **Live mode** and repeat steps 2.2 to 2.4 with the **live** keys
   (`sk_live_...`, a new webhook endpoint and its `whsec_...`). Replace the two secrets in Supabase.
3. Fill the yellow placeholders in the terms in `site/index.html` (committee contact, where winners are
   announced). Have the school check the terms and the legal position of a paid game with a prize.
4. Open `/qr.html` on the live site, print the poster or download the PNG.
5. Make one real €2 payment yourself to be sure, then announce it.

### 6. Every Monday

1. Supabase → **SQL Editor** → run query 2 in `docs/admin.sql`: last week's winners with their claim codes.
2. Announce the initials. The winner shows the "My claim code" screen on their phone; it must match.
3. If a score looks wrong, query 7 shows every play by that player and query 8 voids one.

## Editing the content

All the words are in `site/index.html`. The "What is PresLink?" section and the three project cards were
written from the school's newsletters and the Presentation Brothers' website; the committee should check
them and add photos (drop images into `site/assets/` and reference them from the cards). Prices live in
three places that must agree: the bundle buttons in `index.html`, `BUNDLES` in
`supabase/functions/api/index.ts` and `BUNDLES` in `supabase/functions/stripe-webhook/index.ts`.

## How the game is kept honest

- A play can only start when the server holds a paid credit, and the server hands out a one-time play.
- The server recomputes the score from the tap time and the light's start position and rejects anything
  that does not match, as well as scores that arrive before enough real time has passed.
- Every play is logged with its tap time. The committee reviews the top scores before announcing and can
  void a play. The terms say so.
- A refresh mid-game never costs a credit: the same play resumes.
- Nobody can read the players or payments tables from the browser; the only public reads are the
  leaderboard, past winners and the total.
- The game runs in a browser, so a determined person with developer tools could still try to script a
  perfect tap. Announcing winners after a human check, and the claim code, is the practical safeguard.

## Running it locally

```bash
python3 -m http.server 8787 --directory site
# open http://localhost:8787
```
With `config.js` empty the site runs in demo mode: payments and scores are simulated in the browser and a
few example players are on the leaderboard. Fill in `config.js` to talk to the real backend.

## Legal note

This is a paid game of skill with a weekly prize, open to people who are mostly under 18. Before launch the
school should confirm it is comfortable with that under the Gambling Regulation Act 2024 and Stripe's terms
for contests, and decide the parental-consent wording in the terms. The terms are drafted; they are not legal
advice.
