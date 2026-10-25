# PresLink Arcade

A web app, opened from a QR code on any device with a browser, for the PresLink charity at Presentation Brothers College, Cork.
Scan a QR code, tap **Play · €2**, pay with Apple Pay, Google Pay or a card, and
**stop the light on the mark**: three lights a play, the score is the average, out of 1,000.
One campaign, three boards (Everyone, Students, Teachers) and prizes at the end, plus two spot prizes
(best single light, most plays). Every payment goes to PresLink.

There is no sign-up. On the first tap a small sheet asks for two or three letters (your initials),
picked on an on-screen letter pad (tap a box to clear that letter), so the phone keyboard never covers
the boxes; then it goes straight to payment. After the first play a "Keep your details" sheet asks for an email, because winners are emailed when the
arcade closes, and shows the code with Save to Photos beside it; a school email, in that field or the optional one under "At Presentation Brothers
College?", puts the player on the Students or Teachers board on its own (no student/teacher choice to
make). "Not now" leaves a reminder row on the result screen and the You tab. The four-digit **code**
lives on the You tab, where "Save to Photos" keeps it as a ticket picture (on an iPhone or iPad through
Apple's share sheet, where Save Image is one tap, since a web page cannot write to Photos any other way;
a plain download elsewhere); winners show the code to collect. The code also signs them in anywhere. Everyone is on the Everyone board. People at
Presentation Brothers College can optionally give their school email to join the Students board
(@pbccork.ie) or the Teachers board (@pbc-cork.ie); anything before the @ is accepted, capitals and stray spaces are cleaned up rather than refused, nothing is sent. If someone
already has the same letters you still get them, shown with a small blue numbered bubble on your circle (the second JAK
carries a 2), so nobody is ever refused.

The look follows the conventions of native apps (grouped white cards on a soft grey canvas, large titles,
segmented controls, avatars, a progress ring) in PresLink's colours: green for actions, orange for the
light and the ring, the yellow of the Presentation Brothers cross for the logo. The logo and the running
total raised sit at the top of every screen; there is a tab bar (Play, Board, About, You), a Prizes page
of boxed colour cards with a photo slot each, and very little text. The same pages lay themselves out for
an iPad (a 640 px column with the tab bar underneath; About and You share rows, Home gets a top-three
card) and for a desktop (the tab bar becomes a sidebar with the school at its foot, sheets become centred
modals, Home puts the hero beside the links and the top three, the leaderboard shows all three boards at
once, a mouse gets hover states that touch never sees, and a keyboard plays the whole game with Space or Enter).

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
   your device. That is the site. The A3 poster is at `/poster.html`: its Save as PDF button downloads
   `/poster.pdf`, the print file (A3, QR pointing at preslink.netlify.app).

Optional: in Netlify, **Site configuration → Site details → Change site name** lets you pick a
nicer address, for example `preslink-arcade`.

The committee console is at your link with `/admin.html` on the end (also the Committee row on the You tab). Use the committee code you were given; the eye on the field shows what you typed. The console is read-only: it shows the money, the payments, the players and the leaders, and it cannot change the site. Prizes, the words and photos, the closing date and goal, Stripe, bans and the committee code are the owner's to change, through the API with the owner code (see "What the owner changes" below).

To take real money later: an adult opens a Stripe account for the charity, then in the console
under **Stripe** pastes the Stripe secret key and taps **Connect**. The site checks the key
with Stripe, creates the webhook for you and keeps both secrets in the database, where only the
server can read them. The free plays switch off by themselves the moment Stripe is connected, and
**Disconnect** brings them back. Nobody needs to open Supabase. Details are in section 2 below.

---

## Repository layout

| Path | What it is |
|---|---|
| `site/index.html` | The whole app: home, coin cabinet, game, leaderboard, about, you, sign back in, terms |
| `site/styles.css` | Design |
| `site/app.js` | Front-end logic and the game |
| `site/admin.html`, `site/admin.css`, `site/admin.js` | The committee console: its own plain page with a menu (overview, payments, players, prizes, site content, campaign, Stripe, names, committee code) |
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
| `supabase/migrations/0012_bell_curve.sql` | Bell-shaped score curve (15 ms per e-fold) so the field spreads out and 900+ stays rare |
| `supabase/migrations/0013_stripe_from_admin.sql` | Server-only `app_secrets` table so the committee connects Stripe from the Committee screen instead of the Supabase dashboard |
| `supabase/migrations/0014_fair_scores_contact.sql` | Bell-shaped score curve over milliseconds (40 ms wide), one-second sweep, `contact_email` and the committee's email list |
| `supabase/migrations/0015_tolerant_submit.sql` | The server scores the taps itself and ignores the browser's number, so an older build keeps working when the curve changes; taps count from 60 ms |
| `supabase/migrations/0016_top_is_999.sql` | 999 is the ceiling; a cusp over the first 3 ms of error makes the top a fine ruler, so the best score is one person's |
| `supabase/migrations/0017_whole_bar.sql` | The whole bar scores: distance to the line as a fraction of the bar, 999 on the line, the floor only half a bar away |
| `supabase/migrations/0018_first_curve.sql` | The first game's curve back: the cube of the closeness over the whole bar, 999 ceiling, cusp at the top |
| `supabase/migrations/0019_any_school_email.sql` | Any local part on a school email; the general email check only asks for something@something.tld |
| `supabase/migrations/0023_admin_console.sql` | The console: the site content document (home words, notice, About stories and photos, contact details) carried by `stats()`, payment and player search with paging, a public `site` bucket for photos |
| `supabase/migrations/0022_peak_curve.sql` | A steep peak at the line on a gentle ramp across the bar: ordinary plays land in the hundreds, the far end still scores, 999 needs the line itself |
| `supabase/migrations/0021_even_curve.sql` | Scores spread evenly over the whole bar: 999 on the line down to about 60 at the far end, by the square of the distance |
| `supabase/migrations/0020_email_spaces_case.sql` | Emails are lower-cased and stripped of every space before the check, so capitals and stray spaces never turn an address away |
| `site/poster.html` | A3 poster preview with a large QR code (vendored encoder in `site/vendor/`); its Save as PDF button downloads the file below |
| `site/poster.pdf` | The poster rendered to A3 PDF for the printer, QR pointing at preslink.netlify.app (re-render it if the address changes) |
| `site/assets/` | Logo (`logo.svg`, `cross.svg`), icons, and the photo slots `photo-*.svg` to replace with real photos |
| `supabase/functions/api/index.ts` | Register, checkout, confirm payment, start play, submit score, committee actions (including Stripe connect) |
| `supabase/functions/stripe-webhook/index.ts` | Receives Stripe's payment confirmation |
| `docs/admin.sql` | Extra SQL for the committee (most day-to-day admin is in the app's Committee screen) |
| `netlify.toml` | Netlify settings and security headers |

## Launch checklist

Do these in order. Steps 1 and 2 are a one-off technical setup; 3 to 6 are the launch.

### 1. Supabase (database + functions): already done

The project **preslink-demo** (`bsovummlmfclefdlvsic`, London) already has all twenty-three migrations applied,
both functions deployed, and `site/config.js` points at it. The committee code was set at deployment
and handed over privately; change it any time from the console's Committee code page, which can also generate one in the form `PRES-KQX#-4821-9930`.

If you ever need to redo this on a fresh project: Dashboard → **SQL Editor** → run the files in
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
and registered details. A student cannot be the account holder. Everything else happens on the
Committee screen; nobody needs to open Supabase.

1. Create the account at <https://dashboard.stripe.com/register>. Stay in **Test mode** for now.
2. **Developers → API keys** → copy the **Secret key** (`sk_test_...`).
3. Open the console (`/admin.html`), enter the committee code, and under **Stripe** paste the
   key and tap **Connect**. The site checks the key with Stripe, creates the webhook endpoint
   (`.../functions/v1/stripe-webhook`, listening for `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`) and stores the key and the webhook signing secret in the
   database table `app_secrets`, which only the server can read. The card then shows the Stripe account
   name and whether it is a test or a live key. Free plays stop at once.
4. **Disconnect** removes the key, deletes the webhook endpoint and brings the free plays back.
   Connecting a new key replaces the old webhook endpoint, so you can repeat step 3 any time.
5. Optional but recommended: apply for Stripe's reduced nonprofit pricing (search "Stripe nonprofit
   pricing" in the Stripe support site) and switch on Apple Pay and Google Pay under **Settings →
   Payment methods** (they are on by default for Checkout).

If you would rather keep the secrets out of the database, the old way still works and wins: set
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` under **Edge Functions → Secrets** in Supabase, and the
Committee screen shows that Stripe is set from the server. `SITE_URL` (your site address without a
trailing slash) is optional in both cases: without it the function sends players back to the address
the request came from.

### 3. Netlify (hosting)

1. Sign up at <https://app.netlify.com> with the GitHub account that owns this repository.
2. **Add new site → Import an existing project → GitHub** → choose this repository and the branch to deploy.
3. Build settings: leave **Build command** empty, set **Publish directory** to `site`. (netlify.toml already
   says this.) Deploy.
4. **Site configuration → Site details → Change site name** to something short, e.g. `preslink-arcade`.
   The address is then `https://preslink-arcade.netlify.app`. If you set the optional `SITE_URL`
   secret, make sure it matches.

### 4. Test it end to end (still in Stripe test mode)

1. Open the site on your device. Tap **Play · €2**. Stripe's test page opens.
2. Pay with card number `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
3. You land back in the coin cabinet, see the coin go in and a token come out, and tap Start: three lights, then the result, then the If you win sheet asking for an email (a school email joins the Students or Teachers board on its own). Check the leaderboard after.
4. In Supabase → **Table Editor** you will see the player, the payment and the play.
5. In Stripe → **Developers → Webhooks** the endpoint should show a successful delivery.

### 5. Go live

1. Finish Stripe account activation (the charity's details and bank account).
2. Switch the Stripe dashboard to **Live mode**, copy the **live** secret key (`sk_live_...`) and on
   the Committee screen under **Payments** tap **Connect** with it. The site swaps the webhook and the
   secrets for you; the card should now say Live.
3. Fill the yellow placeholders in the terms in `site/index.html` (committee contact, where winners are
   announced). Have the school check the terms and the legal position of a paid game with a prize.
4. Open `/poster.html`, tap Save as PDF, and print the PDF at A3.
5. Make one real €2 payment yourself to be sure, then announce it.

### 6. Prizes at the end

1. The owner sets the closing date and the five prize texts (Everyone, Students, Teachers, Best light,
   Most plays), each with a photo if there is one, through the API with the owner code (below). They
   appear on the Prizes page as typed, one boxed card per prize; an empty line shows "To be announced".
2. At the end, **Overview** shows the leader of each board and the two spot-prize holders, with their codes
   and emails; **Players** has everyone with a CSV download for the emails.
3. Announce the letters. A winner shows their **You** tab (or the saved code image): letters and code must match.

## The committee console

A separate, plain page at `/admin.html` (also the Committee row on the You tab): white, system type, a menu
on the left (a strip across the top on a phone), nothing of the arcade's look. It needs the committee
code, which is stored only as a hash in the database and locks for 15 minutes after 8 wrong tries; every
secret field has an eye to show what was typed. The pages:

- **Overview**: money raised against the goal, payments (and today's), plays, players by board; the leader of
  each board and the two spot-prize holders with codes and emails; money by day.
- **Payments**: every payment, newest first, with a search over the name, the emails, the Stripe ids, the
  bundle and the amount in euro, a date range, paging and a CSV download of whatever matches.
- **Players**: everyone, with a search over the name, the emails and the code, a board filter and a banned
  filter; plays, best score and money paid per row; **View** opens the player with every play (void or
  restore) and payment, **Ban**, **Unban** and a **new random name**; CSV download.
- Nothing else: there is no Prizes, Site content, Campaign, Stripe, Names or Committee code page any more,
  and no button that changes anything. The sign-in tidies a pasted code (spaces, odd dashes, case).

### What the owner changes

Every change goes through the same API (`action: "admin"`) but needs the owner code as well as the committee
code: the Edge Function refuses `settings`, `set_content`, `upload_image`, `ban`, `void`, `block`, `reset_name`,
`set_code`, `stripe_connect` and `stripe_disconnect` with `OWNER_ONLY` unless the request carries
`owner_code` equal to the function's `OWNER_CODE` secret. Until that secret is set, nothing can be changed
through the API at all (the database functions still work from the Supabase SQL editor). To enable it:
Supabase, Edge Functions, Secrets, add `OWNER_CODE`. The demo backend's owner code is `OWNER`. The owner's
own page for these changes is a later step; until then the calls below do the same thing:

```
curl -X POST "$SUPABASE_URL/functions/v1/api" -H "Content-Type: application/json" -H "apikey: $SUPABASE_KEY" \
  -d '{"action":"admin","code":"<committee code>","owner_code":"<owner code>","op":"settings","prizes":{"everyone":"€50 voucher"},"ends_on":"2026-12-12","goal_cents":200000}'
```

The content document (`set_content`) holds: `hero.title`, `hero.subtitle`, `notice`, `about.intro_title`,
`about.intro_text`, `about.intro_image`, `about.stories[]` (`image`, `title`, `text`), `contact` (`email`,
`phone`, `instagram`, `website`) and `prize_photos` (`everyone`, `students`, `teachers`, `best_light`,
`most_plays`); `upload_image` takes `type` and base64 `data` and returns a public `url` to put in it.

- **Prizes** (owner): five plain text fields and a photo each, shown on the Prizes page as typed (the photos are
  kept in the site content document as `prize_photos`).
- **Site content** (owner): the home title and the line under it, a notice shown on Home while set, the About page's
  committee card photo, heading and text, the About stories (a photo, a heading and a line each, added, reordered
  or removed; photos are shrunk in the browser and stored in the public `site` bucket) and the contact
  details (email, phone, Instagram, website, shown as a Contact card on About). Saved as one document in
  `settings.site_content`; the public `stats()` carries it, so the site shows it at once.
- **Campaign**: the goal and the closing date.
- **Stripe**: status, connect with a secret key (the webhook is created for you), disconnect, a link to the
  Stripe dashboard.
- **Names**: initials nobody may use, and the banned players.
- **Committee code**: generate a new code (`PRES-`, three letters and a symbol, two groups of four digits)
  with copy and show, or set your own.

## Names, codes and signing back in

- Two or three letters, picked on the letter pad on the first tap. Duplicates get a small blue numbered bubble on the
  rim of their circle (the second JAK shows "JAK" with a 2 on the bubble) instead of a refusal, so the real initials
  always work. Offensive letters are refused; the built-in list is in
  `0002_names_signin_admin.sql` (table `blocked_initials`), the committee can add more, and can reset a
  player's name to a random one.
- The game: a play is three lights. Each light sweeps the bar once a second and has its own mark and starting
  point; you tap when the light is on the mark. The score is a steep peak at the line on top of a gentle ramp across
  the whole bar: with d the distance from the line as a fraction of the bar, a light scores
  50 + 300 × (1 − d) + 649 × e^(−d ÷ 0.05) − 12 × √(min(error, 3 ms) ÷ 3), kept between 50 and 999. The ramp means a tap
  anywhere earns a readable number; the peak halves every 35 ms, so the high numbers are hard: on the line 999
  (which needs the line itself), 10 ms off 866, 20 ms 767, 30 ms 685, 50 ms 562, a tenth of the bar 396, a fifth 290,
  half the bar 188, seven tenths 128 and the far end about 80, never zero. An ordinary play lands in the hundreds
  and the top of the board is earned Taps are whole milliseconds and the line is a random fraction, so a 999 needs the tap within
  a few microseconds of the line, which keeps the top of the board to one person (equal scores: the earlier one wins).
  The play's score is the average of the three lights. The sweep is a fixed second
  per pass. The light is drawn by the first game's frame loop: each light notes the moment it starts and every frame
  places the light at the position for the time since then. A tap counts at the moment the finger touched the glass
  (the event's own timestamp, where the browser gives a sane one; on a phone the page hears about a touch 20 to 50 ms
  after it happened), and it is matched to the frame that was on the glass then: the last frame drawn at least one
  refresh earlier. The light is put back to that frame and scored there, so it stops where it was seen and never runs
  on ahead of the finger. The play itself (its marks and starting points) is fetched before the tap on Play or Start,
  so the light is already moving in the first frame of the game screen. After each light the number sits under the
  bar with a verdict and a line of coaching (early or late) for about a second, then the next light starts. The
  server recomputes every light from the taps and stores its own number; the browser's score is only what it shows
  while the answer is on its way.
- Everyone starts on the Everyone board. After the first play the Keep your details sheet asks for an email (so a
  winner can be reached on the closing date) and has an "At Presentation Brothers College?" switch; a school email
  ending @pbccork.ie puts the player on the Students board, @pbc-cork.ie on the Teachers board, whatever is in
  front of the @ and however it is typed (spaces and capitals are removed first). The same switch is on the You
  tab. The address is stored for the committee to check and export; nothing is emailed by the site itself.
- The splash plays once per visit (decided by a tiny script in the page head, before anything loads), so a
  return from payment or a reload in the same tab never flashes it.
- Every player has a four-digit **code**, shown once after the first play (save the ticket picture, or Copy) and always on
  the **You** tab. It proves a winning score is theirs and lets them **sign back in** on another device
  (You tab → "Played before?"). Five wrong codes lock that name for 15 minutes. A lost code can be looked up
  by the committee.

## Editing the content

All the words are in `site/index.html`. The About page was written from the school's newsletters and the
Presentation Brothers' website; the committee should check it. Three photos are real (`photo-classrooms.jpg`,
`photo-bikes.jpg`, `photo-babies.jpg`); `photo-school.svg` (the committee card) is a placeholder until a photo
is chosen in the console, and each prize card shows a tinted placeholder until the committee adds its photo.
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
