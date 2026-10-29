# PresLink Arcade

A web app, opened from a QR code on any device with a browser, for the PresLink charity at Presentation Brothers College, Cork.
Scan a QR code, tap **Play · €2**, pay with Apple Pay, Google Pay or a card, and
**stop the light on the mark**: three lights a play, the score is the average, out of 1,000.
One campaign, three boards (Everyone, Students, Teachers) and prizes at the end, plus two spot prizes
(the best single light and the best first play). Every payment goes to PresLink.

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
segmented controls, initials tiles in one of eight muted pastel colours that the player can change on the You tab, a progress ring) in PresLink's colours: green for actions, orange for the
light and the ring, the yellow of the Presentation Brothers cross for the logo. The logo and the running
total raised sit at the top of every screen; there is a tab bar (Play, Board, About, You), a Prizes page
with a white card per prize (a tinted picture tile, or the prize's photo), and very little text. The
leaderboard opens on a podium: the top three under a warm light, first in the middle under a crown, each tile
ringed in gold, silver or bronze with its place on a medal; every row below carries a bar for its score against
the top score, and your own row is green. The same pages lay themselves out for
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
counter so the site feels real. Before launch, clear the test players, plays and payments (the "Launch day"
step at the end of `docs/admin.sql`), or test scores will lead the boards and spot prizes.

1. Go to <https://app.netlify.com>, click **Sign up**, choose **GitHub**.
2. Click **Add new site**, then **Import an existing project**, then **GitHub**. Pick the
   **Preslink** repository. Choose the branch **claude/trusting-goodall-qzegrn**. In
   **Publish directory** type `site`. Leave **Build command** empty. Click **Deploy**.
3. Wait about a minute. Netlify shows a link like `https://something.netlify.app`. Open it on
   your device. That is the site. The posters are at `/a3`, `/a4`, `/social` and `/message` (see
   **Posters** below).

Optional: in Netlify, **Site configuration → Site details → Change site name** lets you pick a
nicer address, for example `preslink-arcade`.

The committee console is at your link with `/admin.html` on the end; the arcade itself has no link to it, so send the committee that address. Use the committee code you were given; the eye on the field shows what you typed. The console is read-only: it shows the money, the payments, the players and the leaders, and it cannot change the site. Prizes, the words and photos, the closing date and goal, Stripe, bans and the committee code are the owner's to change, through the API with the owner code (see "What the owner changes" below).

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
| `site/qr.html` | Old poster address; forwards to `poster.html` |
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
| `supabase/migrations/0027_badges.sql` | Badges (Bullseye, Steady hand) worked out from the plays and carried by `me_player`; the app no longer shows them |
| `supabase/migrations/0026_skill_tiebreaks.sql` | Spot prizes split by skill: equal best lights by the next-best lights, equal first plays by that play's lights |
| `supabase/migrations/0025_safeguards.sql` | Safeguards: the same three lights for everyone each day on the 1 ms grid (`day_rounds`), spending limits per player checked before every checkout (`spend_check`, settings `daily_cap_cents` 2000 and `campaign_cap_cents` 10000) with the total on the player's record, and the first-play spot prize in place of most plays |
| `supabase/migrations/0024_tile_colours.sql` | A colour for every initials tile: `players.colour` (0 means one picked from the letters, 1 to 8 the player's choice on the You tab), `set_colour`, and `board()`, `spot_prizes()` and `me_player()` carrying it |
| `supabase/migrations/0022_peak_curve.sql` | A steep peak at the line on a gentle ramp across the bar: ordinary plays land in the hundreds, the far end still scores, 999 needs the line itself |
| `supabase/migrations/0021_even_curve.sql` | Scores spread evenly over the whole bar: 999 on the line down to about 60 at the far end, by the square of the distance |
| `supabase/migrations/0020_email_spaces_case.sql` | Emails are lower-cased and stripped of every space before the check, so capitals and stray spaces never turn an address away |
| `supabase/migrations/0028_prize_mode.sql` | The prize switch: setting `prize_mode` ('prizes' or 'honours'), carried by `stats()`; in 'honours' the site talks of honours instead of prizes |
| `supabase/migrations/0029_public_reads_no_play_counts.sql` | The public board no longer carries play counts (paid plays measure spending); the unused `leaderboard()` and `past_winners()` closed to the public |
| `supabase/migrations/0030_integrity.sql` | The closing date enforced, taps checked against the real time, sign-in lockouts that grow, demo checkouts granted once, Stripe refunds (`refund_payment`, `payments.refunded_cents`) taken off the total and the plays |
| `site/poster.html` | The poster in four formats, `?f=a3`, `a4`, `social` and `message` (QR from the vendored encoder in `site/vendor/`) |
| `site/posters/` | The four poster files, served at `/a3`, `/a4`, `/social` and `/message` |
| `tools/posters.cjs` | Saves the four poster files from `poster.html` (Playwright) |
| `site/fonts/` | Inter (OFL): the app's variable font, and static weights in `fonts/static/` that the posters use so PDFs embed ordinary TrueType |
| `site/assets/` | The PresLink cross (`cross.svg`), the school crest, icons, the project photos (JPEG and WebP) and the committee-photo placeholder `photo-school.svg` |
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
3. Work through **Before taking real money** below (the organiser's details, the prize decision, Stripe's
   terms link).
4. Print the posters from `/a3` and `/a4`, and send the link round (see **Posters**).
5. Make one real €2 payment yourself to be sure, then announce it.

### 6. Prizes at the end

1. The owner sets the closing date and the five prize texts (Everyone, Students, Teachers, Best light,
   First play), each with a photo if there is one, through the API with the owner code (below). They
   appear on the Prizes page as typed, one boxed card per prize; an empty line shows "To be announced".
2. At the end, **Overview** shows the leader of each board and the two spot-prize holders, with their codes
   and emails; **Players** has everyone with a CSV download for the emails.
3. Announce the letters. A winner shows their **You** tab (or the saved code image): letters and code must match.

## The committee console

A separate, plain page at `/admin.html`, reached only by its address (the arcade has no link to it): white, system type, a menu
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

- **Prizes** (owner): five plain text fields (Everyone, Students, Teachers, Best light, First play) and a photo each, shown on the Prizes page as typed (the photos are
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
  and the top of the board is earned. Taps are whole milliseconds and every mark sits on the same millisecond grid,
  so a 999 needs the exact millisecond (equal scores on a board: the earlier one wins; equal best lights are split by
  the next-best light, then the one after).
  The play's score is the average of the three lights. The sweep is a fixed second
  per pass. The light is drawn by the first game's frame loop: each light notes the moment it starts and every frame
  places the light at the position for the time since then. A tap counts at the moment the finger touched the glass
  (the event's own timestamp, where the browser gives a sane one; on a phone the page hears about a touch 20 to 50 ms
  after it happened), less one refresh for what was on the glass. It is not snapped to a frame, so a screen's refresh
  rate cannot add luck to the top scores. The light stops where it was at that moment. The play itself (its marks and starting points) is fetched before the tap on Play or Start,
  so the light is already moving in the first frame of the game screen. After each light the number sits under the
  bar with how many milliseconds early or late it was, for about a second, then the next light starts. The
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
  (You tab → "Played before?"). Five wrong codes lock those initials for 15 minutes, the next five for 30, and so
  on up to 16 hours, so a code can't be found by guessing. A lost code can be looked up
  by the committee.

## Editing the content

All the words are in `site/index.html`. The About page was written from the school's newsletters and the
Presentation Brothers' website; the committee should check it. Three photos are real (`photo-classrooms.jpg`,
`photo-bikes.jpg`, `photo-babies.jpg`); `photo-school.svg` (the committee card) is a placeholder until a photo
is chosen, and each prize card shows a tinted picture until its photo is added.
Prices live in
three places that must agree: the bundle buttons in `index.html`, `BUNDLES` in
`supabase/functions/api/index.ts` and `BUNDLES` in `supabase/functions/stripe-webhook/index.ts`.

## What Supabase's security advisor says

The advisor reports two things on purpose:

- **RLS enabled, no policies** on every table. Correct: nobody reads tables directly. The browser only calls
  three read functions and the Edge Functions use the service role.
- **`board`, `spot_prizes` and `stats` are SECURITY DEFINER and callable by `anon`.** Also correct:
  they are the public read-outs (letters, scores, totals). They never return codes, emails, play counts or
  player ids. Nothing else is open to the public (`leaderboard`, `past_winners` and `site_content` from older
  versions were closed in 0029 and 0030).

## How the game is kept honest

- A play can only start when the server holds a paid credit, and the server hands out a one-time play.
- The server recomputes the score of each of the three lights from its tap time, start position and mark,
  and rejects anything that does not match, as well as plays whose taps add up to more time than has really
  passed.
- Every play is logged with its three tap times. The committee reviews the top scores before announcing and can
  void a play. The terms say so.
- A play left half-way (a refresh, Back, a phone call) carries on at its next light; the lights already played keep
  their scores, so leaving is never a way to try the same lights again. A finished play can never be replayed.
- After the closing date (`ends_on`, end of that day in Dublin) no checkout opens and no play starts; a play under
  way at the close can still be finished for an hour (migration 0030).
- A refund made in Stripe comes back by itself (webhook `charge.refunded`): the amount leaves the total raised and
  the spending limits, and the unused plays it paid for are taken off. Connect Stripe again after updating, so the
  webhook also listens for refunds.
- Nobody can read the players or payments tables from the browser; the only public reads are the
  leaderboard (scores only, never how many plays anyone has made), the spot prizes and the total.
- The game runs in a browser, so a determined person with developer tools could still try to script a
  perfect tap; the server only refuses taps that add up to more time than has passed. Check the top plays in the
  console before announcing: three lights at 990 or more, or a run of near-perfect plays, deserve a closer look,
  and a winner's code and email should match the player on file.

## Running it locally

```bash
python3 -m http.server 8787 --directory site
# open http://localhost:8787
```
With `config.js` empty the site runs in demo mode: payments and scores are simulated in the browser and a
few example players are on the leaderboard. The demo committee code is `PRESLINK`. Fill in `config.js` to
talk to the real backend.

## Posters

The poster is the original A3 design, in four formats, each at its own address on the site:

| Address | What | Use |
|---|---|---|
| `preslink.netlify.app/a3` | A3 PDF | Corridors, the canteen, shop windows. Print at actual size. |
| `preslink.netlify.app/a4` | A4 PDF | Noticeboards, doors, handouts. The A3 shrunk exactly, as the paper is. |
| `preslink.netlify.app/social` | 1080 x 1350 picture | Instagram and Facebook posts, WhatsApp status. The web address takes the code's place. |
| `preslink.netlify.app/message` | 1200 x 630 picture | To attach to a message or an email; it is also the picture a shared link shows. |

The addresses work in capitals too (`/A3`). The QR codes open the site with a tag (`?r=a3`, `?r=a4`, `?r=msg`), and
the tag goes with any payment that follows, so Stripe's payment details (metadata, `source`) show which posters
bring plays. Nothing about the person is recorded. Online, send the link itself where you can:
`preslink.netlify.app` shows the Message poster as its preview in WhatsApp, Messages, Instagram, Facebook and most
email, and one tap opens the game.

All four are drawn by `site/poster.html` (open it to see them on screen), so the wording lives in one place. To
change one, edit that page and run `node tools/posters.cjs` (it needs Playwright: `npm install playwright` and
`npx playwright install chromium` once), commit the files in `site/posters/`, and bump `?v=` on the link picture in
`index.html`, because WhatsApp and Facebook keep an old preview for days. `--closes "12 December"` adds the closing
date to the small print, `--org "NAME OF THE CHARITY (RCN 20000000)"` adds the organiser, and `--honours` swaps
"Win prizes" for "Top the board" if the game runs for honours. If the site's address changes, change `SITE` in
`poster.html` and the `og:` tags in `index.html`.

The small print on the print and social formats says how the prizes are won, that under-18s need a parent's or
guardian's permission to pay, who runs it, and where the terms are.

## Before taking real money

None of this is legal advice. The research behind it, and what the site already does, is in the PR.

1. **The prize decision.** A paid game with prizes of money's worth is "gaming" under the Gaming and Lotteries
   Act 1956, and skill games count under the Gambling Regulation Act 2024. There is no exemption for a skill game
   or for a charity, and most players are under 18. Stripe also needs written approval for paid contests with
   prizes. Choose one, in writing, with the school and a solicitor:
   - **Honours, not prizes** (the safest): winners get recognition, no money or money's worth. Switch the whole
     site over with
     `update public.settings set value = 'honours' where key = 'prize_mode';`
     (and back with `'prizes'`). The Prizes page, the terms and every mention of prizes change at once.
   - **Prizes**, only with the solicitor's written view and Stripe's approval.
2. **Who runs it.** The site names PresLink and the school. If the money goes through a registered charity, add
   its name, registered charity number and a contact email; they then appear in the terms, the privacy notice,
   the About page and the posters' small print:
   ```sql
   update public.settings
   set value = (coalesce(nullif(value, ''), '{}')::jsonb
     || '{"org": {"name": "NAME OF THE CHARITY", "rcn": "20000000", "email": "preslink@pbc-cork.ie"}}'::jsonb)::text
   where key = 'site_content';
   ```
   Then re-render the posters with `--org` (see **Posters**).
3. **Stripe's terms box.** In the Stripe Dashboard, **Settings → Business → Public details**
   (<https://dashboard.stripe.com/settings/public>), set the terms of service URL to `https://preslink.netlify.app/#terms` (and the privacy policy to `/#privacy`). Checkout then asks
   every payer to tick a box agreeing to the terms, which link to the site. Until then Checkout shows the same link
   beside the Pay button.
4. **Clear the test data** (demo payments and test plays) with the launch-day steps in `docs/admin.sql`.
5. **Photos.** Make sure the school has permission to use the project photos, and that the people in them agreed.

What the site already does: terms rewritten in plain words (who runs it, prices, refunds of unused plays within 14
days, fair play, complaints, Irish law); a privacy notice (what is kept and why, who sees it, how long, rights,
the Data Protection Commission); "under 18s need a parent's or guardian's permission to pay" on Home and before
the first payment; no "only", "just" or commands to buy anywhere; spending caps; and the terms link on every
Stripe payment.

## Safeguards

The arcade is open to under-18s and takes money, so it keeps to a few rules (none of this is legal advice;
get a written view from a solicitor, or from the GRAI or the local Garda licensing office, before taking
real money):

- **No chance in who wins.** Everyone plays the same three lights on a given day, and every mark sits on the
  same 1 ms grid as taps, so a perfect tap is possible on every light. Nothing in a score is random.
- **No prize or figure tied to spending.** The spot prizes are the best single light and the best
  score on a first play; the public boards show scores, not how many plays anyone has bought, and stop at
  the top 20 (a player further down sees their own row).
- **Spending limits.** €20 a day and €100 in the campaign per player, checked by the server before every
  checkout; the You tab shows what the player has donated. At a limit the message only states it ("That's the €20
  limit for today."), with no invitation to come back and spend. Change them with
  `update public.settings set value = '3000' where key = 'daily_cap_cents';` (and `campaign_cap_cents`).
- **Children's data.** The email is optional, used only to tell winners, seen only by the committee and
  deleted within 30 days of the end (as the privacy notice says); under-16s are asked for a parent's email. After
  the prizes: `update public.players set contact_email = null;`
- **Skill tie-breaks.** Equal best lights are split by the second-best and third-best lights, and equal first plays
  by that play's lights (migration 0026), so an exact-millisecond 999 is not decided by who got there first.
- **One player per person.** Only a person's first player counts for the first-play prize and the limits are per
  person; check each winner's code and emails when prizes are collected.
- **Calm celebrations.** Confetti only for a play of 700 or more that is a new personal best, a first 900 or a first
  entry into the top 10; it lasts about a second and a tap clears it.
- **Device data.** Each score keeps only the kind of device, such as "iOS Safari" (`client.device`), so a pilot can
  check that no kind of phone dominates the winners; the full browser string is not kept. Plays saved before this
  change still hold it and go with the test data before launch.
- **Contrast.** Initials tiles are muted pastels with letters in a deep shade of the same hue, each pair at 4.5:1 or better.
