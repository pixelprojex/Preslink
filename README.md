# PresLink Arcade

A web app, opened from a QR code on any device with a browser, for the PresLink charity at Presentation Brothers College, Cork.
Scan a QR code, tap **Play · €2**, pay with Apple Pay, Google Pay or a card, and
**stop the light on the mark**: three lights a play, the score is the average, out of 1,000.
One campaign, three boards (Everyone, Students, Teachers) and prizes at the end, plus two spot prizes
(best single light, most plays). Every payment goes to PresLink.

There is no sign-up. On the first tap a small sheet asks for two or three letters (your initials),
picked on an on-screen letter pad (tap a box to clear that letter), so the phone keyboard never covers
the boxes; then it goes straight to payment. After the first play a sheet shows the player's **name and four-digit
code** on a prize ticket image; Save to Photos hands it to the share sheet (Save Image on an iPhone) and a
long press on the ticket saves it too, because those two things collect a prize; the code is also on the
**You** tab on that device and signs them in anywhere. Everyone is on the Everyone board. People at
Presentation Brothers College can optionally give their school email to join the Students board
(@pbccork.ie) or the Teachers board (@pbc-cork.ie); it is a format check, nothing is sent. If someone
already has the same letters you still get them, shown with a small tag (JAK, JAK#2), so nobody is ever refused.

The look follows the conventions of native apps (grouped white cards on a soft grey canvas, large titles,
segmented controls, avatars, a progress ring) in PresLink's colours: green for actions, orange for the
light and the ring, the yellow of the Presentation Brothers cross for the logo. The logo and the running
total raised sit at the top of every screen; there is a tab bar (Play, Board, About, You), a Prize page
with a photo, and very little text.

```
  Device (QR) ──▶  Netlify (static site: site/)
                       │
                       ├──▶ Supabase Edge Function "api"  ──▶ Postgres (players, payments, plays)
                       │          │
                       │          └──▶ Stripe Checkout (hosted payment page)
                       │
  Stripe ──webhook──▶ Supabase Edge Function "stripe-webhook" ──▶ Postgres (adds credits)
```

- **Netlify** hosts the site straight from GitHub. No build step. Push to the branch, it deploys.
- **Supabase** holds the data and runs the two server functions. The browser can only read the
  leaderboard, the spot prizes and the "raised so far" total. Everything that changes data goes through
  the functions.
- **Stripe Checkout** takes the money. The app never sees card numbers. Apple Pay, Google Pay and
  cards (including Revolut) all work.

## Put it online in three steps (about 5 minutes)

You need a free Netlify account. Nothing else. No Stripe is needed for the demo: without a
Stripe key the site gives free plays and says so on screen. Demo plays still move the "raised"
counter so the site feels real; clear them before launch (`docs/admin.sql`).

1. Go to <https://app.netlify.com>, click **Sign up**, choose **GitHub**.
2. Click **Add new site**, then **Import an existing project**, then **GitHub**. Pick the
   **Preslink** repository. Choose the branch **claude/trusting-goodall-qzegrn**. In
   **Publish directory** type `site`. Leave **Build command** empty. Click **Deploy**.
3. Wait about a minute. Netlify shows a link like `https://something.netlify.app`. Open it on
   your device. That is the site. The A3 poster is at `/poster.pdf` (ready to print) and `/poster.html` (regenerates
   the QR code from the live address; print it at A3 with no margins).

Optional: in Netlify, **Site configuration → Site details → Change site name** lets you pick a
nicer address, for example `preslink-arcade`.

The committee screen is at your link with `/#admin` on the end. Use the committee code you were given.

To take real money later: an adult opens a Stripe account for the charity, then in Supabase
(**Edge Functions → Secrets**) adds `STRIPE_SECRET_KEY` and, for the webhook, `STRIPE_WEBHOOK_SECRET`.
The free plays switch off by themselves the moment a Stripe key exists. Details are in section 2 below.

---

## Repository layout

| Path | What it is |
|---|---|
| `site/index.html` | The whole app: home, coin cabinet, game, leaderboard, about, you, sign back in, committee panel, terms |
| `site/styles.css` | Design |
| `site/app.js` | Front-end logic and the game |
| `site/config.js` | **The only file you must edit**: Supabase URL and publishable key |
| `site/mock.js` | Demo backend. Active only while `config.js` is empty, so the site works before Supabase is wired |
| `site/qr.html` | Printable QR poster that always encodes the live address |
| `supabase/migrations/0001_init.sql` | Database tables and functions |
| `supabase/migrations/0002_names_signin_admin.sql` | Unique names, name blocklist, sign back in, bans, goal and prize settings, committee functions |
| `supabase/migrations/0003_auto_names_admin_v2.sql` | Random names on first tap, name and board changes, richer committee overview, player lookup, name reset |
| `supabase/migrations/0004_demo_credits.sql` | Free plays while no Stripe key is set |
| `supabase/migrations/0005_initials_suffix_harder.sql` | Chosen initials with #2 tags, sign in with JAK#2, steeper scoring |
| `supabase/migrations/0006_three_rounds.sql` | Three lights a play with a random mark each, slower sweep, score checked light by light |
| `supabase/migrations/0007_campaign.sql` | One campaign instead of weeks: Everyone board, school email for Students/Teachers, spot prizes, end date and five prize texts |
| `supabase/migrations/0008_harder_scoring.sql` | Steeper score curve so 1,000 is practically unreachable and scores spread below 900 |
| `supabase/migrations/0009_admin_school_email.sql` | Committee lookup shows a player's school email and best light |
| `supabase/migrations/0010_demo_payments_count.sql` | Demo plays count on the raised total (clear them before going live, see `docs/admin.sql`) |
| `supabase/migrations/0011_score_floor.sql` | Every light scores at least 50, so a wild tap never gives zero |
| `site/poster.html` | Print-ready A3 poster with a large QR code (vendored encoder in `site/vendor/`) |
| `site/poster.pdf` | The same poster rendered to A3 PDF for the printer, QR pointing at preslink.netlify.app |
| `site/assets/` | Logo (`logo.svg`, `cross.svg`), icons, and the photo slots `photo-*.svg` to replace with real photos |
| `supabase/functions/api/index.ts` | Register, checkout, confirm payment, start play, submit score |
| `supabase/functions/stripe-webhook/index.ts` | Receives Stripe's payment confirmation |
| `docs/admin.sql` | Extra SQL for the committee (most day-to-day admin is in the app's Committee screen) |
| `netlify.toml` | Netlify settings and security headers |

## Launch checklist

Do these in order. Steps 1 and 2 are a one-off technical setup; 3 to 6 are the launch.

### 1. Supabase (database + functions): already done

The project **preslink-demo** (`bsovummlmfclefdlvsic`, London) already has all eleven migrations applied,
both functions deployed, and `site/config.js` points at it. The committee code was set at deployment
and handed over privately; change it any time from the Committee screen.

If you ever need to redo this on a fresh project: Dashboard → **SQL Editor** → run the ten files in
`supabase/migrations/` in order (the first line of `0007` must be run on its own, before the rest of that file), deploy the two functions with `--no-verify-jwt` (CLI below), set the
committee code with `select public.admin_set_code(null, 'YourCode');`, and put the project URL and
publishable key in `site/config.js`.
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy api --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```

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
   - Endpoint URL: `https://bsovummlmfclefdlvsic.supabase.co/functions/v1/stripe-webhook`
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

1. Open the site on your device. Tap **Play · €2**. Stripe's test page opens.
2. Pay with card number `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
3. You land back in the coin cabinet, see the coin go in and a token come out, and the game starts: three lights, then the result, the Keep this sheet with your name and four-digit code, and the At Presentation Brothers College? card (a school email joins a school board). Check the leaderboard after.
4. In Supabase → **Table Editor** you will see the player, the payment and the play.
5. In Stripe → **Developers → Webhooks** the endpoint should show a successful delivery.

### 5. Go live

1. Finish Stripe account activation (the charity's details and bank account).
2. Switch the Stripe dashboard to **Live mode** and repeat steps 2.2 to 2.4 with the **live** keys
   (`sk_live_...`, a new webhook endpoint and its `whsec_...`). Replace the two secrets in Supabase.
3. Fill the yellow placeholders in the terms in `site/index.html` (committee contact, where winners are
   announced). Have the school check the terms and the legal position of a paid game with a prize.
4. Print `/poster.pdf` at A3 (or open `/poster.html` on the live site and print it at A3, margins none).
5. Make one real €2 payment yourself to be sure, then announce it.

### 6. Prizes at the end

1. In the Committee screen (`/#admin`), set the **end date** and the five **prize** texts (Everyone, Students,
   Teachers, Best light, Most plays). They appear on the Prizes page. To change the prize photo, replace
   `site/assets/photo-prize.svg` (any image file; keep the name or update `index.html`).
2. At the end, the **Boards** section shows the top of each board with codes, and the two spot-prize holders.
3. Announce the letters. A winner shows their **You** tab (or the saved code image): letters and code must match.

## The Committee screen

Reachable from the **You** tab or at `/#admin`. It needs the committee code, which is stored only as a
hash in the database and locks for 15 minutes after 8 wrong tries. From there the committee can:

- see money raised, coins inserted, plays, players by board, money per day, and set the fundraising **goal**,
  the **end date** and the five **prizes**;
- see the Everyone, Students and Teachers boards with codes, best light and times, the spot-prize holders, and
  **void** a score, **ban** a player or give a player a **new random name**;
- **find any player** by their letters: code, school email, credits, every play (void or restore) and payments;
- see recent payments with receipt emails, and **download a CSV**;
- **block** extra three-letter names on top of the built-in list of offensive ones;
- change the committee code.

## Names, codes and signing back in

- Two or three letters, picked on the letter pad on the first tap. Duplicates get a tag (JAK#2) instead of a refusal, so
  the real initials always work. Offensive letters are refused; the built-in list is in
  `0002_names_signin_admin.sql` (table `blocked_initials`), the committee can add more, and can reset a
  player's name to a random one.
- The game: a play is three lights. Each light sweeps the bar at its own random speed (about a second per
  pass) and has its own mark; you tap when the light is on the mark. The score for a light falls off steeply
  with distance (10 ms off is about 940, 20 ms about 885, 30 ms about 830, 50 ms about 730, and a wild tap
  still scores 50, never zero), and the play's
  score is the average of the three, so one lucky tap is not enough: scores above 900 need three taps within
  about 15 ms, and a single-light 1,000 needs an error under a tenth of a millisecond, which integer-millisecond
  taps practically never hit.
- Everyone starts on the Everyone board. The result screen and the You tab offer "At Presentation Brothers
  College?": a school email ending @pbccork.ie puts the player on the Students board, @pbc-cork.ie on the
  Teachers board. The address is stored for the committee to check; nothing is emailed.
- Every player has a four-digit **code**, shown once after the first play (Save image / Copy) and always on
  the **You** tab. It proves a winning score is theirs and lets them **sign back in** on another device
  (You tab → "Played before?"). Five wrong codes lock that name for 15 minutes. A lost code can be looked up
  by the committee.

## Editing the content

All the words are in `site/index.html`. The About page was written from the school's newsletters and the
Presentation Brothers' website; the committee should check it. Three photos are real (`photo-classrooms.jpg`,
`photo-bikes.jpg`, `photo-babies.jpg`); `photo-school.svg` (the committee) and `photo-prize.svg` are
placeholders to replace with real images (JPG or PNG; update the file names in `index.html` if they change).
Prices live in
three places that must agree: the bundle buttons in `index.html`, `BUNDLES` in
`supabase/functions/api/index.ts` and `BUNDLES` in `supabase/functions/stripe-webhook/index.ts`.

## What Supabase's security advisor says

The advisor reports two things on purpose:

- **RLS enabled, no policies** on every table. Correct: nobody reads tables directly. The browser only calls
  three read functions and the Edge Functions use the service role.
- **`leaderboard`, `spot_prizes` and `stats` are SECURITY DEFINER and callable by `anon`.** Also correct:
  they are the public read-outs (letters, scores, totals). They never return codes, emails or
  player ids. `past_winners` is left over from the weekly version and is no longer called.

## How the game is kept honest

- A play can only start when the server holds a paid credit, and the server hands out a one-time play.
- The server recomputes the score of each of the three lights from its tap time, start position and mark,
  and rejects anything that does not match, as well as plays whose taps add up to more time than has really
  passed.
- Every play is logged with its three tap times. The committee reviews the top scores before announcing and can
  void a play. The terms say so.
- A refresh mid-game never costs a credit: the same play resumes.
- Nobody can read the players or payments tables from the browser; the only public reads are the
  leaderboard, the spot prizes and the total.
- The game runs in a browser, so a determined person with developer tools could still try to script a
  perfect tap. Announcing winners after a human check, and the four-digit code, is the practical safeguard.

## Running it locally

```bash
python3 -m http.server 8787 --directory site
# open http://localhost:8787
```
With `config.js` empty the site runs in demo mode: payments and scores are simulated in the browser and a
few example players are on the leaderboard. The demo committee code is `PRESLINK`. Fill in `config.js` to
talk to the real backend.

## Legal note

This is a paid game of skill with prizes awarded once at the end of the campaign (three boards plus two spot prizes), open to people who are mostly under 18. Before launch the
school should confirm it is comfortable with that under the Gambling Regulation Act 2024 and Stripe's terms
for contests, and decide the parental-consent wording in the terms. The terms are drafted; they are not legal
advice.
