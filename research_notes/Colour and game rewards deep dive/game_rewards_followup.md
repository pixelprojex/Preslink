# Reward loops, feedback and game feel in casual skill and timing games: follow-up (verification, score design, phone latency, personal bests, spend-neutral rewards, free practice)

Follow-up to `research_notes/Engagement and giving in web games/reward_loops_and_game_feel.md` (called "the earlier notes" below). Findings that are already well sourced there are referenced, not repeated.

**How this pass was sourced.** WebFetch could not resolve any host, and the egress proxy refused most sites. I did not try to route around it. Two routes worked: (1) web-search extracts of primary pages, abstracts and publisher records; (2) direct reads of documentation and source code on raw GitHub (osu! wiki, StepMania, Friday Night Funkin', MDN docs and browser-compatibility data, Chromium). Each finding is tagged:

- **[full text]**: the primary text was read directly in this pass.
- **[extract]**: confirmed from a search extract of the primary page, abstract or publisher record, not the full text.
- **[secondary]**: found only in press coverage, blogs or fan wikis.
- **[unverified]**: could not be confirmed in this pass.

Evidence strength uses the earlier notes' scale: **STRONG**, **MODERATE**, **WEAK**, **PRACTITIONER**. Anything marked **(model)** is my own calculation under stated assumptions. It is not evidence.

PresLink context: a €2 play is three "lights" (stop a moving light on a mark, fixed one-second sweep). Each light is scored by its timing error, and the three are averaged to a score out of 1,000. There are three leaderboards and end-of-campaign prizes. Players are secondary-school students, teachers and parents, mostly on phones. Some are under 18, so the design rules out streaks, spend-linked rewards and pressure.

---

## Key question 1: Which of the earlier notes' unverified or second-hand claims hold up against the primary source, and which do not?

### Takeaway
Most of the earlier figures hold up at the level of the organisations' own pages or paper abstracts, but there are several corrections:
- Duolingo's "+0.38% DAU from two streak freezes" is confirmed. Its "leagues gave 17% more learning time" figure appears only in second-hand summaries.
- GameAnalytics changed its sample between report editions, so year-on-year comparisons are unsafe.
- The one direct near-miss experiment in a competitive video game found no effect on the urge to continue.
- The juiciness evidence is an inverted U: moderate juice helps, and none or extreme juice hurts.
- Hicks et al. (2024) interviewed audio designers. It is not a player experiment, as the earlier notes implied.
- Lomas 2013 confirms that easier versions were more engaging for very large samples.

### Cited Findings

**Duolingo (streak and league figures)**
- **HOLDS, upgraded from unverified.** Letting learners equip up to two Streak Freezes instead of one "increased the relative number of active learners on Duolingo every day by +0.38%". The extract attributes this to Duolingo's own blog but does not name the post (most likely the habit post). — [Duolingo blog, "How the Duolingo streak builds habit"](https://blog.duolingo.com/how-duolingo-streak-builds-habit) **[extract]**. WEAK–MODERATE (company A/B test, no method detail).
- **NEW.** Separating the streak from the daily goal, so that one lesson extends the streak and the daily goal is tracked separately, gave a 3.3% increase in Day-14 retention in an A/B test. Duolingo made the change because learners with higher ("intense") daily goals were less likely to be on a streak even when they used the app daily. — [Duolingo blog, "Improving the streak"](https://blog.duolingo.com/improving-the-streak) **[extract]**. A secondary summary adds +1% daily active learners and +10.5% share of daily learners on a streak (all relative). — [viblo.asia summary](https://viblo.asia/p/duolingo-streak-vi-sao-nguoi-hoc-co-giu-chuoi-ymJXDZ0qJkq) **[secondary]**.
- **NOT RE-CHECKED.** "7-day streak holders 3.6× more likely to complete their course" and "+1.7% D7 odds from the milestone animation". This pass found no new confirmation, so both stay at the earlier notes' search-extract level.
- **UNVERIFIED.** Leagues ("17% more learning time" and "roughly a tripling of highly engaged learners") appear only in a summary of Jorge Mazal's essay, not in the essay or a Duolingo page. — [Elite Game Developers / F4 Fund Substack](https://elitegamedevelopers.substack.com/p/investing-in-language-learning-apps) **[secondary]**. Duolingo itself only states that leaderboards were first tested in 2018 and that it now runs 10 leagues. — [Duolingo blog, leagues](https://blog.duolingo.com/duolingo-leagues-leaderboards/) **[extract]**.
- **NEW, relevant to rank design.** League XP incentives pulled learners away from the core learning path. Duolingo then rebalanced XP toward path lessons, which added about +1.1M minutes/day of path learning (partial adjustment) and about +1.8M minutes/day (full adjustment). — [Duolingo blog, "Time spent learning well"](https://blog.duolingo.com/time-spent-learning-well) **[extract]**; [Duoplanet newsletter](https://newsletter.duoplanet.com/posts/has-duolingo-finally-fixed-xp) **[secondary]**. WEAK–MODERATE. The point: what the rank counts is what people optimise.

**GameAnalytics retention benchmarks**
- **HOLDS, refined.** The "timing games 44% D1" figure comes from GameAnalytics' 2020 hyper-casual sub-genre snapshot of the top 5% of games: "The winner in this category was timing at 44%. And the rest were around the 40% mark." Timing games had lower playtime per user, and shooting led on D7 (17%) and on playtime. — [GameAnalytics blog](https://www.gameanalytics.com/blog/the-metrics-behind-hyper-casual-games-industry-report) **[extract]**. MODERATE (large vendor dataset, top performers only, 2020).
- **NEW and CONFLICTING.** The 2026 edition covers 2025 data from 16,262 games with at least 1,000 MAU. Reported figures:
  - D1: median about 22%, top quartile "just above 30%", top 10% about 40%, bottom quartile 13.42% (2024) falling to 12.45% (2025).
  - D7: median just under 4%, top quartile 6–7%.
  - D30: median 0.69–0.79%.
  - Sources: [GameDev Reports summary (sponsored)](https://gamedevreports.substack.com/p/gameanalytics-mobile-and-pc-game); [report PDF via InvestGame](https://investgame.net/wp-content/uploads/2026/01/2026-01-27-2026-mobile-pc-benchmarks_compressed.pdf) **[secondary; PDF not opened]**.
  - The 2025 edition (cited in the earlier notes) gave a 2024 top-quartile D1 of 26.48–27.69% and a bottom quartile of 10–11.5%. The 2026 edition's own 2024 bottom-quartile figure is 13.42%. The editions therefore use different samples or filters and should not be compared year on year.

**Near-misses in skill games**
- **NEW; partly closes the earlier gap.** The only direct experiment found in a skill-based video game is Finserås, Krossbakken, Pallesen, Mentzoni, King, Griffiths & Molde (2021), *International Journal of Mental Health and Addiction* 19:418–428.
  - Design: 40 participants competed against four avatars, with four counterbalanced outcomes (large loss, small loss, small win, large win).
  - Players felt "more bored and less excited when they experienced a near miss compared to winning by a large margin", and losses brought frustration and regret.
  - According to the search extracts, the study "found no support for the near-miss effect in relation to the urge to continue playing". The authors note that earlier interview evidence came from excessive players.
  - Sources: [Springer](https://link.springer.com/article/10.1007/s11469-019-00070-9); [University of Bergen repository](https://bora.uib.no/bora-xmlui/handle/1956/23601); [NTU repository](https://irep.ntu.ac.uk/id/eprint/36202) **[extract]**. MODERATE–WEAK (small N, one game).
- **HOLDS, URL now verified.** Reid's argument that "in a game of skill, like shooting, a near miss gives useful feedback and encourages the player by indicating that success may be within reach" is confirmed. — [Reid, "The Psychology of the Near Miss" (PDF mirror)](https://www.stat.berkeley.edu/~aldous/157/Papers/near_miss.pdf) **[extract]**. Classic (1986), theory only.

**"Juice" and later juiciness experiments**
- **CORRECTION.** Hicks et al. (2019) "Juicy Game Design: Understanding the Impact of Visual Embellishments on Player Experience", CHI PLAY 2019, pp. 185–197. A Staffordshire reference lists the authors as Hicks, Gerling, Dickinson et al., so the earlier notes' inclusion of Holopainen is not confirmed. Its results are still not retrievable; only the abstract (which says empirical evidence was lacking) was seen. — [Unpaywall record](https://unpaywall.org/10.1145%2F3311350.3347171); [Hicks staff page](https://www.staffs.ac.uk/people/kieran-hicks) **[extract]**.
- **NEW: inverted U.** Kao (2020), *Entertainment Computing* 34, built four versions of one action RPG differing only in visual and audio effects: none, medium, high and extreme juiciness. "Both Medium Juiciness and High Juiciness outperform No Juiciness and Extreme Juiciness across all measures." It was described as the largest juiciness study to date. — [Improbable Research summary](https://improbable.com/tag/rpg/) **[secondary]**. A later paper reads the same result as "none and extreme amounts of juiciness significantly decrease player experience". — [Lin et al. 2022, arXiv 2208.06155](https://arxiv.org/pdf/2208.06155) **[secondary]**. MODERATE (one large experiment).
- **NEW.** Juul & Begy (2016), FDG/DiGRA poster. Two versions of one game had identical mechanics but minimal versus heavy redundant feedback. Players rated the juicy version higher but played worse in it, which gave "partial support" to the hypotheses. — [Royal Danish Academy research record](https://adk.elsevierpure.com/en/publications/good-feedback-for-bad-players-a-preliminary-study-of-juicy-interf) **[extract]**. WEAK (preliminary).
- **CORRECTION.** Hicks, Rogers, Gerling & Nacke (2024), CHI PLAY, "Juicy Audio", is an **interview study of 12 game audio designers**, not a player experiment. Designers apply juicy principles to audio deliberately, organised around emphasis/augmentation, cohesion/coherence and synesthesia. — [Staffordshire eprint](https://eprints.staffs.ac.uk/8527) **[extract]**. PRACTITIONER (designer views).
- **NEW.** Smets & van der Spek (2021), "That Sound's Juicy!", compared a game with and without juicy audio. Juicy audio gave more presence, with significant effects on immersion and sensory fidelity. — [IFIP digital library](https://dl.ifip.org/hal-04144377v1); [TU/e record](https://research.tue.nl/en/publications/that-sounds-juicy-exploring-juicy-audio-effects-in-video-games/) **[extract]**. MODERATE–WEAK.
- **NEW.** "Juicy Haptic Design" (University of Waterloo Haptic Experience Lab, CHI 2021): excessive positive vibrotactile feedback "can improve enjoyability, aesthetic appeal, immersion, and meaning". — [UWSpace](https://uwspace.uwaterloo.ca/handle/10012/16894); [project page](https://uwaterloo.ca/haptic-experience-lab/projects/juicy-haptic-design-vibrotactile-embellishments-can-improve) **[extract]**. MODERATE–WEAK.
- **NEW.** Durmanova (2022, Waterloo thesis): 100 Prolific participants, three embellishment levels in an exergame. Enjoyment depended mainly on whether any embellishment was present and stopped rising beyond a certain level. Less-embellished versions sometimes motivated more exercise but were rated more boring. — [UWSpace](https://uwspace.uwaterloo.ca/items/c9d30c95-d7db-407f-9523-980cc85645ba/full) **[extract]**. WEAK–MODERATE.
- **UNVERIFIED.** Kao et al. (CHI 2024), an online experiment with n = 1,699 on whether competence, effectance or curiosity explains juicy feedback's effect. A summary says "amplification unexpectedly reduced motives, possibly because the tested condition unintentionally impeded players' sense of agency." — [UniversityXP summary](https://www.universityxp.com/research/2026/7/19/how-does-juicy-game-feedback-motivate-testing-curiosity-competence-and-effectance) **[secondary]**.

**Goal-gradient and progress framing**
- **HOLDS (citation verified; figures second-hand).** Nunes & Drèze (2006), *Journal of Consumer Research* 32(4):504–512. — [RePEc record](https://ideas.repec.org/a/oup/jconrs/v32y2006i4p504-512.html) **[extract]**. The 34% (pre-stamped 10-stamp card) vs 19% (blank 8-stamp card) completion figures were confirmed only via a summary. — [Coglode](https://www.coglode.com/nuggets/endowed-progress-effect) **[secondary]**. No independent replication was found.
- **NEW: how to frame the goal.** Koo & Fishbach's (2012) "small-area hypothesis": people are more motivated when they attend to whichever is smaller, progress made or progress remaining. Focusing on accumulated progress helps early on, and focusing on what remains helps near the goal. Their coffee-shop and bagel-store loyalty-card field experiments support this. — [RePEc](https://ideas.repec.org/a/oup/jconrs/doi10.1086-663827.html); [ScienceDaily](https://sciencedaily.com/releases/2012/04/120416113113.htm) **[extract]**. A natural experiment with badges in a German Q&A community found the same effect on contributions. — [Kundisch & Rechenberg 2017, RePEc](https://ideas.repec.org/a/spr/binfse/v59y2017i4d10.1007_s12599-016-0441-5.html) **[extract]**. MODERATE–STRONG.
- **NEW: goal-gradient in giving.** Cryder, Loewenstein & Seltman (2013), *Journal of Experimental Social Psychology* 49:1078–1083. Kiva contribution rates rose as loans approached their funding targets (field observation). In a field experiment, funds near their goal drew more donations. A scenario experiment linked the effect to the higher perceived impact of late contributions. — [CMU PDF](https://www.cmu.edu/dietrich/sds/docs/loewenstein/GoalGradient.pdf); [WUSTL record](https://profiles.wustl.edu/en/publications/goal-gradient-in-helping-behavior/) **[extract]**. MODERATE–STRONG.

**Other gaps from the earlier notes, now closed or narrowed**
- **Lomas et al. (2013), closed.** In two large online experiments (10K and 70K players) of a maths game, "in almost all cases, subjects were more engaged and played longer when the game was easier". The most engaging conditions produced the slowest learning. The authors suggest giving players feedforward about the expected challenge. — [CMU PDF](https://www.stat.cmu.edu/~brian/463-663/project-part-one/Optimizing%20Challenge.pdf); [ACM DOI](https://dx.doi.org/10.1145/2470654.2470668) **[extract]**. STRONG for "easier keeps people playing" (very large samples, one game).
- **Touch-latency detection thresholds, narrowed.**
  - Deber et al. (2015): just-noticeable differences on a touchscreen of about 11 ms for dragging and 69 ms for tapping (touchpad: 55 ms and 96 ms), as reported by a later paper. — [arXiv 2408.02525](https://arxiv.org/pdf/2408.02525) **[secondary]**.
  - Jota et al. (2013): commercial devices had up to 125 ms latency, and dragging performance fell as latency rose; a secondary source puts the threshold at about 25 ms for dragging. — [Unpaywall record](https://unpaywall.org/10.1145%2F2470654.2481317) **[extract/secondary]**.
- **Haptics on the mobile web, closed.**
  - `navigator.vibrate` works in Chrome for Android (since v32; since Chrome 60 it needs a user gesture, otherwise it returns false) and in Samsung Internet (which follows Chrome).
  - It is **not supported in Safari, including iOS**.
  - In Firefox for Android (since v79) vibration is disabled: the call returns true but nothing vibrates.
  - Source: [MDN browser-compat-data, api/Navigator.json](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json) **[full text]**. Documentation.
- **Leaderboard position effects, narrowed.** Jia, Liu, Yu & Voida (CHI 2017) surveyed users. A respondent's leaderboard position strongly affected how they rated both the leaderboard and the app. Leaderboards were rated most favourably in fitness apps, and more extraverted people liked them regardless of rank. — [IUPUI ScholarWorks PDF](https://scholarworks.iupui.edu/bitstream/1805/17645/1/Jia_2018_designing.pdf) **[extract]**. MODERATE (survey, not an experiment).

### Inferences
- The corrections make the earlier recommendations more conservative, not less:
  - Juice should be moderate (inverted U).
  - Near-misses in a skill game are no lever for persistence. The only direct experiment found boredom, not urge, so showing a near-miss honestly as diagnostic feedback (the earlier notes' advice) costs nothing.
  - The default difficulty should feel easy (Lomas 2013).
- For PresLink's Duolingo-style ideas: the streak results all concern free, daily learning. The +0.38% and +3.3% effects are small and come from huge user bases. None is transferable to a paid play aimed partly at under-18s, and the brief already excludes streaks.
- The Duolingo XP lesson does transfer: a leaderboard that counts plays or total points rewards spending. A leaderboard should count a quality of play that money cannot buy (see Key question 5).
- Benchmarks: compare PresLink only with the 2020 hyper-casual snapshot (timing top performers 44% D1), and only loosely. Mixing editions of the GameAnalytics reports gives spurious trends.

### Gaps
- No benchmark for **sessions per day** or within-session replays was found (still open).
- The primary text of Mazal's essay (leagues and per-feature numbers) could not be read. The "17%" and "tripled" figures stay unverified.
- Hicks et al. (2019) results and Kao et al. (2024) results are still unread. The "Juice it or lose it" (2012) talk link remains from memory. It is a practitioner demonstration, and the experiments above are the tests of its premise.
- No replication of the endowed-progress effect, and no primary confirmation of Kivetz et al.'s (2006) figures, was found.
- Legal gaps from the earlier notes are **still open**. The definitions of "game" and any skill carve-out in s.2 of the Gambling Regulation Act 2024 could not be retrieved. Search returned only the start of s.2 and a table of contents listing separate "reference to providing game" provisions. — [Law Reform Commission revised s.2](https://revisedacts.lawreform.ie/eli/2024/act/35/section/2/revised/en/html) **[extract, incomplete]**. The status of the EU Digital Fairness Act proposal and the final wording of ICO Children's Code Standard 13 were not re-checked.

---

## Key question 2: Score design in timing and precision games: how do games map error to points, how should a score out of 1,000 be calibrated so an ordinary attempt feels like a start, and how rare should a perfect score be?

### Takeaway
Shipped rhythm games almost all use **bands** of timing error, each worth fixed points:
- a top band of about ±16–25 ms;
- then about ±45–50 ms, ±90–100 ms and ±135–180 ms;
- often scaled by a difficulty setting.

One popular open-source game (Friday Night Funkin') uses a **continuous curve** for points and keeps bands only as labels.

For PresLink, the mapping matters less than calibrating it. Human timing precision in lab interception tasks is about 5–22 ms (SD). Device latency varies far more between phones (Key question 3). A simple model shows that a 40 ms uncorrected device bias moves the median score by roughly 50–250 points depending on the curve and the player's consistency, and by about 75–150 points for a typical player. The best design is a transparent continuous curve with a small "perfect" zone and a floor, with its slope set from pilot data so that the median first paid play (after free practice) lands at about 650–750.

### Cited Findings

**Published timing windows and scoring rules**
- **osu! (official wiki).** Hit windows are centred on the note time and depend on Overall Difficulty (OD 0–10). — [osu! wiki source, Beatmap/Overall_difficulty](https://github.com/ppy/osu-wiki/blob/master/wiki/Beatmap/Overall_difficulty/en.md) **[full text]**. PRACTITIONER (design documentation).
  - osu!standard: 300 within ±(80 − 6×OD) ms, 100 within ±(140 − 8×OD), 50 within ±(200 − 10×OD). At OD 5 that is ±50/±100/±150 ms; at OD 8, ±32/±76/±120 ms (my arithmetic).
  - osu!mania: a fixed MAX window of ±16 ms (effectively ±16.5 ms in the stable client because of rounding), then 300 at ±(64 − 3×OD) ms down to 50 at ±(151 − 3×OD) ms.
  - Mods change the windows: Easy halves OD, Hard Rock multiplies it by 1.4, and Double Time makes the windows 33% shorter.
- **StepMania (DDR-style).** Default windows are ±22.5 ms (W1), ±45 ms (W2), ±90 ms (W3), ±135 ms (W4) and ±180 ms (W5), with a 250 ms hold window. A global `TimingWindowScale` and `TimingWindowAdd` let operators loosen or tighten every band. — [StepMania source, src/Player.cpp](https://github.com/stepmania/stepmania/blob/5_1-new/src/Player.cpp) **[full text]**.
- **Friday Night Funkin' "PBOT1" (continuous scoring).** — [Funkin source, Scoring.hx](https://github.com/FunkinCrew/Funkin/blob/main/source/funkin/play/scoring/Scoring.hx) **[full text]**; points at each error computed by me from those constants.
  - The source comment reads "Scores the player based on the offset based on timing, represented by a sigmoid function."
  - Formula: points = int(500 × (1 − 1/(1 + e^(−0.080 × (|ms| − 54.99)))) + 9). Under 5 ms scores the maximum 500; beyond 160 ms is a miss worth −100.
  - Labels are banded separately: Sick ≤ 45 ms, Good ≤ 90, Bad ≤ 135, Shit ≤ 160.
  - The curve is flat near zero and steep around 55 ms. Points by error: 0 ms 500, 10 ms 495, 20 ms 480, 30 ms 449, 40 ms 393, 55 ms 258, 70 ms 124, 90 ms 37, 135 ms 9.
  - The legacy system was banded on a 166.67 ms window ("10 frames at 60fps"). Sick (under 33 ms) was worth 350, Good 200, Bad 100 and Shit 50.
- **Arcaea (mobile).** MAX PURE within about 25 ms, PURE within 50 ms, FAR within 100 ms, otherwise LOST. An optional setting shows Early/Late counts for PURE hits. — [Moegirl wiki](https://mobile.moegirl.org.cn/en/Arcaea); [player blog](https://git.moonythm.dev/prescientmoon/moonythm/raw/branch/main/content/echoes/arcaea.dj) **[secondary]**.
- **Beat Saber.** Each cut is worth up to 115 points before the combo multiplier (up to 8×):
  - 70 for the pre-swing (at least 100°);
  - 30 for the follow-through (at least 60°);
  - 15 for cutting through the centre.
  - The maximum was 110 before v1.0. Only 15 of the 115 points reward precision; most reward completing the motion.
  - Sources: [BSMG ranking guide](https://bsmg.wiki/ranking-guide.html); [AccSaber wiki](https://wiki.accsaber.com/Beat_Saber/How_to_improve/basics/); [Road to VR](https://roadtovr.com/beat-saber-studio-shows-get-highest-score-new-video/); [GameSkinny on v1.0](https://www.gameskinny.com/nnypb/how-to-get-the-maximum-score-in-beat-saber) **[extract/secondary]**. PRACTITIONER.
- **Guitar Hero.** No published millisecond windows were found. Fan documentation says hammer-on/pull-off windows were very tight in GH I and were widened in GH II and greatly in GH III. — [Giant Bomb wiki](https://giantbomb.com/wiki/Concepts/Hammer_On_And_Pull_Off) **[secondary]**. Guitar Hero Live "automatically calibrates the guitar controller as you play" and offers advanced calibration for early or late registration. — [Activision support](https://support.activision.com/uk/en/guitar-hero-live/articles/advanced-calibration-for-a-guitar-hero-live-controller) **[extract]**.
- **Rhythm Heaven.** No official windows were found. Rhythm Heaven Fever (Wii) had no sync options and suffered from HDTV lag, and Rhythm Heaven Groove warns that playing on a TV adds lag. — [VGC 2026 preview](https://www.videogameschronicle.com/features/2026-rhythm-heaven-groove/) **[extract]**; [Giant Bomb on lag calibration](https://giantbomb.com/wiki/Concepts/Lag_Calibration) **[secondary]**. PRACTITIONER.

**Human timing precision (for calibrating the curve)**
- Brenner & Smeets measured temporal precision when hitting moving targets:
  - about 20 ms SD when hitting a moving virtual disk through a goal (2009; cited later as 22 ms);
  - just above 5 ms SD for fast targets when people could choose where to intercept (2015);
  - about 7 ms for falling balls;
  - precision is "much poorer" when the interception point is fixed in advance, which is PresLink's case (stop on a mark).
  - Sources: [Brenner & Smeets 2015, Journal of Vision (PDF)](https://personal.fbw.vu.nl/~jsmeets/2015/Temporal_precision-JOV15.pdf); [2009, Experimental Brain Research (PDF)](https://personal.fbw.vu.nl/~jsmeets/2009/Variability_intercept-EBR09.pdf) **[extract]**. STRONG (lab, practised adults).
- In coincidence-anticipation tasks (stimulus runways like the Bassin timer, the lab analogue of "stop the light"), adults were more accurate and consistent than children at all target speeds, and absolute and variable error rose with speed in that study. It was a complex coincident-timing task, reportedly with a throwing response rather than a button press, so it transfers to tapping only loosely. The authors note the literature conflicts on whether slow speeds produce more error. — [Figueiredo & Barreiros 2013 (SciTePress PDF)](https://www.scitepress.org/Papers/2013/46655/46655.pdf) **[extract]**. MODERATE.
- Easier versions keep people playing longer (Lomas 2013, Key question 1). Expanded scales such as 0–1,000 make differences feel bigger (unit effect), and round-number reference points draw extra effort. Both are well sourced in the earlier notes (Key question 3 there).

### Inferences
1. **Bands for words, a continuous curve for points.** Three averaged lights need fine resolution to avoid leaderboard ties, and hard band edges ("1 ms outside Great") feel arbitrary. Follow Funkin's split: a continuous points curve, with labels such as "Bullseye", "Great" and "Good" as an overlay.
2. **Curve shape (model).** I compared four per-light mappings to 0–1,000:
   - Linear (4 points per ms, zero at 250 ms) is the most transparent ("every millisecond costs 4 points") and the least sensitive to device bias.
   - Exponential (τ = 80 ms) is harsh near zero: a 5 ms error already costs 61 points, which magnifies device noise for the best players.
   - Gaussian (τ = 60 ms) and a Funkin-style sigmoid are forgiving near zero but steep in the 40–100 ms range where most casual taps land, which magnifies device-bias differences there.

   **Model, per-light points by error:**

   | Mapping | 0 ms | 10 ms | 25 ms | 40 ms | 60 ms | 100 ms | 150 ms |
   |---|---|---|---|---|---|---|---|
   | Linear, 4 pts/ms | 1000 | 960 | 900 | 840 | 760 | 600 | 400 |
   | Exponential, τ 80 ms | 1000 | 882 | 732 | 607 | 472 | 287 | 153 |
   | Gaussian, τ 60 ms | 1000 | 986 | 917 | 801 | 607 | 249 | 44 |
   | Sigmoid (centre 75 ms, floor 100) | 1000 | 992 | 967 | 911 | 747 | 266 | 110 |

   **Model, median average-of-three score.** Assumptions: Normal human error with SD 15, 30 or 45 ms (bracketing practised to untrained); 120 Hz touch-sampling jitter; uncorrected device bias of 0 or 40 ms; 40,000 simulated plays per cell. Read "SD 15: 954 → 840" as the median at 0 ms bias falling to the median at 40 ms bias.

   | Mapping | SD 15 ms | SD 30 ms | SD 45 ms |
   |---|---|---|---|
   | Linear, 4 pts/ms | 954 → 840 | 909 → 834 | 863 → 809 |
   | Exponential, τ 80 | 868 → 613 | 763 → 616 | 675 → 587 |
   | Gaussian, τ 60 | 975 → 791 | 909 → 759 | 818 → 705 |
   | Sigmoid | 988 → 893 | 960 → 848 | 895 → 774 |

   A 40 ms device difference costs about as much as going from a practised to a novice player. Any curve therefore needs per-device calibration or practice (Key question 3) before prizes depend on it.
3. **Calibrating "an ordinary attempt feels like a start".** Do not guess the human SD; measure it.
   - Run a pilot week of **unscored practice lights** on real phones with students, teachers and parents, and log the signed offsets.
   - For a linear curve, set the slope as k ≈ (1,000 − target average) ÷ (mean absolute error of first-play taps). Examples: mean absolute error 36 ms with a target of 700 gives k ≈ 8 points per ms; 50 ms gives k = 6; 60 ms gives k = 5.
   - Add a floor (for example, no light below 100) so that no play reads as "0". Check that regular players' 90th percentile lands around 900–950 so there is visible headroom.
   - The 650–750 target follows from Lomas (easier keeps people playing), Kao (moderation) and the praise evidence in Key question 4. It is a judgement, not a measured optimum.
4. **How rare a perfect 1,000 should be (model).** P(perfect) ≈ (share of single lights inside ±p ms)³. Using P(single light within ±p) with Normal errors:
   - Within ±5 ms on all three lights: a practised player (SD 15 ms) at 0 bias gets a perfect play about 1 in 56 plays, but 1 in 734 with a 20 ms device bias. At SD 30 ms it is about 1 in 431 (0 bias) and 1 in 835 (20 ms bias).
   - Within ±3 ms: 1 in 251 for SD 15 at 0 bias, and 1 in 3,488 with a 20 ms bias.

   Uncalibrated, a perfect score therefore rewards low-latency phones about as much as skill. Practical rule: choose p from pilot data so that the expected number of perfect plays per campaign is about 0–3. Make the perfect zone no narrower than about ±3 ms, given 1 ms timestamp rounding in Safari and Firefox and touch scans of 4–17 ms (Key question 3). Treat a perfect play as a celebrated badge, and decide prizes with tie-break rules published in advance (for example, earliest achieved, then second-best play).
5. **Show the direction of every error ("12 ms late").** This is what Arcaea's Early/Late option does. It makes scoring transparent and lets players correct a constant bias themselves (see adaptation evidence in Key question 3).

### Gaps
- No millisecond hit windows for Guitar Hero or Rhythm Heaven were found from a developer or verified source. A county-government-domain page listing Rhythm Heaven windows looked like spam and was ignored.
- No developer write-up on "stop the timer" (stopwatch) style games was found in this pass, which did not search them exhaustively.
- No norms in milliseconds were found for coincidence-anticipation error in teenagers on phones. A search extract attributed to Pinheiro & Corrêa (2005) says adolescents had the **smallest** absolute error of four age groups (adults, children, older adults next), but its source page could not be identified.
- The model's SD values (15/30/45 ms) are assumptions, not measurements. Effects of the 60 Hz versus 120 Hz display refresh on the visible light (16.7 ms versus 8.3 ms position steps) were not found in any study.

---

## Key question 3: Touch latency and fairness on phones: how large is touch-to-event latency on iOS and Android, how much does it vary, and how do rhythm games calibrate it?

### Takeaway
Phones differ a lot. Total display-plus-touch latency across 26 smartphones ranged from **35 to 140 ms**. In a dataset of about 60,000 people, mobile users, especially on Android phones, scored slower on reaction-time tests than desktop users, and the authors attribute this to device latency.

In a stop-the-light game, display and touch latency add directly to the measured error as a constant "late" bias. This bias is larger than the skill differences between ordinary players. People partly adapt to constant delays when given feedback, but evidence suggests children may not. Rhythm games fix the bias with per-device offsets set by calibration: osu!'s universal offset and offset wizard, Rock Band's sensor-based or tap-along calibration, and Guitar Hero Live's in-play auto-calibration.

On the web, Chrome stamps touch events with the operating system's own input time, at 0.1 ms precision (1 ms in Safari and Firefox).

### Cited Findings

**How big and how variable**
- **Nicosia et al. (2023)**, *Behavior Research Methods* 55(6):2800–2812. A robot (LaTARbot) measured display and capacitive-touch latency on **26 popular smartphones** (from under $100 to over $1,000; Android and iOS). "Total device (sum of display and touch) latencies ranged from 35 to 140 ms." The authors warn that this variability "could be misattributed as individual or group differences in response times". — [PubMed 35953659](https://pubmed.ncbi.nlm.nih.gov/35953659/); [PMC9918597](https://pmc.ncbi.nlm.nih.gov/articles/PMC9918597) **[extract]**. STRONG (direct measurement).
- **Passell et al. (2021)**, *Behavior Research Methods* 53(6):2544–2557. Using TestMyBrain.org data (59,587 and 3,818 participants), mobile users, "particularly Android smartphones", were significantly slower on reaction-time tests than laptop and desktop users, after controlling for age, gender, education and vocabulary. The authors attribute this to device latency. Screen size and input type also mattered (p < 0.001). — [PubMed 33954913](https://pubmed.ncbi.nlm.nih.gov/33954913/) **[extract]**. STRONG (very large, observational).
- A 2022 review puts touchscreen device latency at 50–200 ms, against simple reaction times of 200–300 ms. — [JMIR 2022;24(5):e34347](https://www.jmir.org/2022/5/e34347) **[extract]**.
- **Pronk et al. (2020)**, *Behavior Research Methods* 52:1371–1382, tested web apps on touchscreen and keyboard devices. Reaction times were "consistently overestimated", and brief stimuli (100 ms or less) were inaccurate in uncontrolled conditions. Device differences "might not substantially affect" group comparisons but "may affect reliability for individual differences". — [PMC7280355](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7280355/) **[extract]**. MODERATE–STRONG. Its exact millisecond values were not retrieved.
- An old vendor benchmark (Agawi TouchMarks, 2013; 240 fps cameras, minimal app): iPhone 5 about 55 ms, iPhone 4 about 85 ms, best Android (Galaxy S4) 114 ms, other Androids 110–120 ms. — [iMore](https://www.imore.com/iphone-5-touchscreen-latency-measured-found-be-25-times-faster-closest-android-device); [New Atlas](https://newatlas.com/smartphone-screen-latency/29144/) **[secondary]**. WEAK (dated, commercial).
- **Touch sampling.** A 60 Hz touch scan polls every 16.6 ms. Launch-era reports gave the Galaxy S20 240 Hz touch sensing (about 4.15 ms) and the iPhone 11 120 Hz. — [MobileSyrup 2020](https://mobilesyrup.com/2020/02/11/samsung-galaxy-s20-display-120hz-refresh-rate-240hz-touch-sensing/) **[secondary]**. Gaming phones advertise 360–1,000 Hz, often only in "game mode". — [iQOO community post](https://community.iqoo.com/in/thread/121354) **[secondary, promotional]**. Even an iPad Pro with Apple Pencil at 240 Hz plus touch prediction measured 42.9 ms at best. — [POLYPATH, arXiv 1608.05654](https://arxiv.org/pdf/1608.05654) **[extract]**.

**Browser timing facts (implementation)**
- In Chromium/Blink, `Event.timeStamp` returns "a DOMHighResTimeStamp using the platform timestamp", and for input events the platform time "is the event timestamp provided by the host OS". — [Chromium source, blink event.h](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/dom/events/event.h) **[full text]**. Since Chrome 49 it is high-resolution and monotonic, and directly comparable with `performance.now()`. — [Chrome for Developers blog](https://developer.chrome.com/blog/high-res-timestamps) **[extract]**.
- **Timestamp precision** is reduced to resist fingerprinting. — [MDN Event.timeStamp (source)](https://github.com/mdn/content/blob/main/files/en-us/web/api/event/timestamp/index.md) **[full text]**.
  - Chrome rounds to 0.1 ms (0.005 ms when cross-origin isolated).
  - Safari rounds to 1 ms (0.02 ms isolated).
  - Firefox rounds to 1 ms by default, but to **16.667 ms** if `privacy.resistFingerprinting` is on.
- `AudioContext.outputLatency` estimates the delay from the audio graph to the output device, and "it varies depending on the platform and the available hardware". — [MDN outputLatency (source)](https://github.com/mdn/content/blob/main/files/en-us/web/api/audiocontext/outputlatency/index.md) **[full text]**.

**How rhythm games calibrate**
- **osu!:** a "Universal offset" in milliseconds that "all beatmaps will use (in addition to the local offset)", plus an "Offset wizard". — [osu! wiki source, Client/Options](https://github.com/ppy/osu-wiki/blob/master/wiki/Client/Options/en.md) **[full text]**.
- **Rock Band:** Rock Band 2 added light and sound sensors to the bundled instruments.
  - Automatic calibration has the player hold the guitar to the speaker (audio) and then the screen (video). Manual calibration is a tap-along fallback.
  - Epic's support pages list starting values by display type, for example DLP audio 15 / video 60, and CRT 0 / 0.
  - Sources: [Harmonix, "How to calibrate"](https://www.harmonixmusic.com/blog/how-to-calibrate); [Epic Games support](https://www.epicgames.com/help/c-42381244/c-31937213/rock-band-4-calibration-is-off-what-can-i-do-a15678543); [Giant Bomb](https://giantbomb.com/wiki/Concepts/Lag_Calibration) **[extract/secondary]**. PRACTITIONER.
  - A Harmonix engineer's oscilloscope test found audio about 50 ms behind video on his TV, with jitter. — [Harmonix blog, 10th anniversary](https://www.harmonixmusic.com/blog/rock-band-10th-anniversary-blogs-james-fleming) **[extract]**.
  - Players reported that repeated auto-calibration gave inconsistent values. — [NeoGAF thread](https://neogaf.com/threads/rock-band-platform-ot.332470/post-12797359) **[secondary, anecdotal]**.
- **Guitar Hero Live:** calibrates automatically during play and offers advanced calibration for early or late registration. — [Activision support](https://support.activision.com/uk/en/guitar-hero-live/articles/advanced-calibration-for-a-guitar-hero-live-controller) **[extract]**.
- **Human adaptation to constant delays.**
  - After adapting to a fixed delay between a keypress and a flash, people perceived flashes that came sooner as occurring *before* the keypress. Humans partly compensate for a 100 ms lag, and more so for voluntary actions. — [Stetson, Cui, Montague & Eagleman 2006, Neuron (PDF)](https://beam.vt.edu/content/dam/fbri_vtc_vt_edu/publications/montague-publications/1-s2.0-S0896627306006271-main.pdf); [Frontiers review](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2012.00599/pdf) **[extract]**. MODERATE–STRONG.
  - Recalibration has been reported for delays of 50–800 ms (Heron et al. 2009, as cited in a 2021 paper). — [bioRxiv 2021](https://www.biorxiv.org/content/10.1101/2021.03.26.437189.full.pdf) **[secondary]**.
  - A 2014 study found **no recalibration in children aged 8–11**, although adults showed it. — [Pisa Vision Lab 2014 (PDF)](https://www.pisavisionlab.org/wp-content/uploads/2019/12/2014_ChildrenDoNotRecalibrate.pdf) **[extract]**.
  - Note: these are perception studies. That players re-time their taps is an inference.

### Inferences
- **Mechanism (inference).** The game computes the light's position from the clock. The player sees it late by the display latency and taps, and the tap is stamped late by the touch latency. So the recorded error ≈ human error + display latency + touch latency.
  - From Nicosia's 35–140 ms range, two phones could differ by up to about 100 ms of systematic lateness. That is several times the 5–22 ms precision of practised humans. Uncorrected, part of the leaderboard ranks phones.
  - Touch scanning adds a further delay that averages half a scan period (8.3 ms at 60 Hz, 2 ms at 240 Hz), plus jitter. This is small next to display and pipeline differences.
- **Recommended fairness stack**, in order of value:
  1. **Free, unscored practice and calibration lights** before the first paid play on each device, available at any time afterwards (see Key question 6). Each practice light shows "x ms early/late" so players can adapt; this matters most for younger players, who may adapt less.
  2. **A per-device offset**, like osu!'s universal offset. Take the median signed error of 5–10 calibration taps on the same light, cap it (for example at ±80 ms), store it per device and browser, and subtract it when scoring. Recalibrate when the device changes. Publish it ("we adjust for your phone's delay").
  3. **Stamp taps with `event.timeStamp` from `pointerdown`.** In Chrome this is the operating system's input time. Render the light from `performance.now()`, and score on the server from the logged timestamps.
  4. **Do not let a ±few-ms "perfect" zone or an uncalibrated first play decide prizes** (Key questions 2 and 5).
  5. **Log the platform** (OS and browser family only) with each score, and check before awarding prizes whether one platform dominates the top of the board.
  6. **Base timing on visuals only.** Audio output latency varies by device, so any tick sound should be decoration.
- **Is the offset a loophole?** A player who taps deliberately late during calibration gains nothing, because the offset only shifts their own target. It does remove each player's constant bias, which makes the game reward *consistency* more than *bias*. That is a defensible and publishable definition of skill.
- **Firefox edge case.** With `resistFingerprinting` on, timestamps round to 16.7 ms. The client can detect coarse timestamps and show a notice.

### Gaps
- Nicosia's iOS versus Android split was not retrievable, so it is still unconfirmed whether current iPhones beat Android phones on average as they did in 2013.
- No measurements were found of **browser-added** latency on phones (Safari versus Chrome versus in-app webviews).
- No source was found confirming that **WebKit (iOS Safari)** uses OS-level timestamps for touch events, as Chromium does.
- No study was found that compares calibration methods for **visual** (non-audio) timing games on phones. The recommendation above is an inference from rhythm-game practice plus the latency and adaptation studies.

---

## Key question 4: Personal-best framing and celebration: celebrating personal bests versus absolute scores, showing the gap to beat, and scaling celebration to performance

### Takeaway
Evidence points to comparing players with their own past:
- Racing one's own previous best improved performance, intrinsic motivation and flow compared with non-competitive versions, while competing against others can hurt less-able players' motivation.
- Adults learn a motor skill better when feedback follows their good attempts. Results for children are mixed.
- Framing progress works best when it highlights whichever is smaller: what's left when close to the goal, what's done when far away.
- Praise that is accurate and about the process beats inflated or person-focused praise, which backfires for children with low self-esteem and after failure.

Celebration should scale with genuine performance. Extreme juiciness lowered player experience (Key question 1), and celebrating losses misleads (earlier notes).

### Cited Findings
- **Self-competition.** "Race Yourselves" (University of Bath, CHI 2020) had cyclists race their own recorded "ghost". A four-week longitudinal study and a cross-sectional study found improved physical performance, intrinsic motivation and flow compared with a non-competitive exergame. The paper argues that competing against others "can negatively impact the intrinsic motivation of physically inactive individuals due to feelings of incompetence and low self-esteem". — [University of Bath research portal](https://researchportal.bath.ac.uk/en/publications/race-yourselves-a-longitudinal-exploration-of-self-competition-be/) **[extract]**. MODERATE.
- Competing against a ghost was more enjoyable than playing alone or with a virtual trainer, and a competitive AI trainer produced more distance and calories than a cooperative one. — [PeerJ Computer Science 2016](https://peerj.com/articles/cs-92) **[extract]**. WEAK–MODERATE.
- Racing one's own previous-best time raised cycling intensity and enjoyment compared with a control group (2024 preprint, not peer-reviewed; trait competitiveness flagged as a moderator). — [Preprints.org](https://preprints.org/manuscript/202409.1020/v1/download) **[extract]**. WEAK.
- **Feedback after good attempts.** In Chiviacowsky & Wulf (2007), adults throwing beanbags with the non-dominant arm learned more (delayed retention test) when they got feedback on their three best trials per block rather than their three worst. The authors read this as feedback having a motivational function. — [SPONET record](https://www.sponet.de/sponet/Record/4012854) **[extract]**. MODERATE. A children's study (n = 40) found no group differences at retention. — [RBEFE](https://revistas.usp.br/rbefe/en/article/view/16652) **[extract]**. Mixed for children.
- **To-go versus to-date framing.** Koo & Fishbach's small-area hypothesis (Key question 1): near the goal, show what remains; far from it, show progress made. — [RePEc](https://ideas.repec.org/a/oup/jconrs/doi10.1086-663827.html) **[extract]**. MODERATE–STRONG.
- **Counterfactual comparison.** Bronze medallists at the 1992 Olympics appeared happier than silver medallists. Bronze medallists compared themselves with fourth place; silver medallists compared themselves with gold (Medvec, Madey & Gilovich 1995, classic). McGraw, Mellers & Tetlock (2005) tie silver medallists' disappointment to higher expectations. — [Kill Screen summary](https://www.killscreen.com/bronze-medalists-happier-silver/); [McGraw et al. 2005 (PDF)](https://leeds-faculty.colorado.edu/mcgrawp/pdf/mcgraw.mellers.tetlock.2005.pdf) **[extract]**. MODERATE (classic, field data).
- **Praise type.** Across six studies, children praised for intelligence showed less persistence, less enjoyment, more low-ability attributions and worse performance after failure than children praised for effort. — [Mueller & Dweck 1998 (PDF)](https://www.columbia.edu/cu/psychology/courses/3615/Readings/Mueller_Dweck.pdf) **[extract]**. Classic; it has been criticised over the years. — [Progress-focused commentary](https://www.progressfocused.com/2020/09/mueller-dweck-1998-classic-study.html) **[secondary]**. MODERATE.
- **Inflated praise.** Adults gave children with low self-esteem twice as much inflated praise ("you're *incredibly* good at this"). Inflated praise made those children **less** likely to choose a challenge, while children with high self-esteem became more likely to (Brummelman et al. 2014, *Psychological Science*; relatively small studies). — [BPS Research Digest](https://www.bps.org.uk/research-digest/inflated-praise-your-children-incredibly-bad-idea); [ScienceDaily](https://sciencedaily.com/releases/2014/01/140102112041.htm); [Ohio State news](https://artsandsciences.osu.edu/news/high-praise-could-backfire-kids-low-self-esteem) **[secondary]**. MODERATE.
- **Moderate juice is best** (Kao 2020; Key question 1). Losses disguised as wins, peak-end, unit effect and the Duolingo milestone animation are covered in the earlier notes (Key questions 3 and 5 there).

### Inferences
1. **End screen order:** self first, others second.
   - Line 1 is the best true self-referenced fact: "New personal best: 874 (+12)", "2nd best of your 6 plays", or "Best light ever: 968".
   - Then the leaderboard context, as nearby ranks only (earlier notes).
   - For a near-miss of a personal best, use downward framing alongside the honest gap: "Your 2nd-best ever, 3 points off your record". This uses the bronze-medal comparison (with the level below) while staying accurate.
2. **Gap to beat, shown only when reachable** (small-area hypothesis).
   - After light 2, compute need = 3 × PB − (light 1 + light 2) + 1, with the same rounding the server uses.
   - Show "Need 905 on this light to beat your best" only if that is ≤ 1,000 and not far above the player's own best single light.
   - Otherwise switch to progress-made framing ("2 lights averaging 812 so far") or to the next round-number club. Never display an impossible target.
3. **Celebration tiers tied to the player's own record**, not spend (model of a scheme, not tested):
   - Below the player's median: a calm summary plus one diagnostic, such as "both lights a little late".
   - A good play or the session's best light: a small flourish.
   - A new personal best: confetti, a distinct sound, at most about 1.5 s, skippable.
   - A rare milestone (first 900+, top-10 entry): the largest effect.
   - Keep effects moderate (Kao's inverted U). Make every tier honest: no fanfare for a below-median play (losses disguised as wins).
4. **Wording that fits under-18s.** Praise the process and the measurement ("all three within 30 ms: steady timing"), not the person ("you're a natural"), and avoid superlatives on ordinary plays. This follows Mueller & Dweck, Brummelman and Chiviacowsky & Wulf. Celebrate good lights inside a poor play specifically: feedback on good attempts aids learning in adults, though the evidence for children is mixed.
5. **Leaderboards second, self-comparison first.** Self-competition gives every player a reachable goal. Global ranks mostly motivate the top few and the extraverted (Jia et al. 2017), so a personal-best track does most of the work for the majority.

### Gaps
- No controlled study was found that compares celebrating personal bests with celebrating absolute scores in a casual game, or that tests "need X to beat your best" prompts directly.
- No study was found on scaling celebration intensity to performance, beyond Kao's (2020) fixed juiciness levels.
- The Saemi et al. (2011) study of children (n = 28) on feedback after good trials, and its intrinsic-motivation measures, could not be read. The child evidence on feedback after good trials remains mixed and unresolved.
- Brummelman et al. (2014) and the Bath CHI 2020 paper were seen only through abstracts or press. Effect sizes are not quoted.

---

## Key question 5: Spend-neutral rewards: rewards money cannot buy (best first attempt, most improved, weekly bests, whole-group milestones) and their effect on people who spend little

### Takeaway
Non-monetary, symbolic recognition can raise participation: random symbolic awards to new Wikipedia editors improved retention for about a year. But awards backfire when they signal that the behaviour is unusual or arrive as surprise "thank-yous": in a randomised experiment with 15,329 students, perfect-attendance awards reduced later attendance.

A dominant "superstar" makes rivals ease off. Gamers think less of people who buy an advantage. Groups and donors respond to visible progress toward shared goals.

In a paid-per-play game, any "best score" board is spend-linked, because more plays mean more chances and more practice. Spend-neutral boards need rules that cap attempts (first play, best of the first N, one ranked attempt per period), and shared milestones should count people, not euros or plays.

### Cited Findings
- **Symbolic awards raise retention.** Gallus (2017, *Management Science*; online 2016, doi:10.1287/mnsc.2016.2540) ran a natural field experiment at Wikipedia in which purely symbolic awards to newcomers were assigned at random. The awards "had a sizeable effect on newcomer retention" that "persisted over the four quarters following the initial intervention". The status gain was confined to recipients' pseudonymous profiles, and the authors attribute the effect to stronger identification with the community. — [Innovation Growth Lab summary](https://innovationgrowthlab.org/node/901) **[extract]**. STRONG (large randomised field study). Effect size not retrieved.
- **Awards can backfire.** Robinson, Gallus, Lee & Rogers (2021), *Organizational Behavior and Human Decision Processes*, randomised 15,329 students in grades 6–12 across 14 California districts. — [Harvard Kennedy School](https://www.hks.harvard.edu/publications/demotivating-effect-and-unintended-message-awards-0); [UCLA Anderson Review](https://anderson-review.ucla.edu/retrospective-awards/) **[extract]**. STRONG.
  - Pre-announced awards did not improve attendance on average.
  - Surprise retrospective awards **decreased** later attendance, most among academically low-performing students.
  - The proposed mechanism: the awards signalled the behaviour was not the norm, and gave recipients licence to slack. 82% of recipients assumed they had fewer absences than classmates, against 27% of controls.
- **Superstar effect.** Brown (2011), "Quitters Never Win", *Journal of Political Economy*. PGA golfers took about 0.8–1 more strokes per tournament when Tiger Woods played. The effect was strongest among players near the top of the tournament leaderboard (about two strokes, per one report) and vanished during Woods' slump. Brown's explanation is reduced effort in a contest one expects to lose; an alternative view is "choking". — [Kellogg Insight](https://insight.kellogg.northwestern.edu/article/golf_lessons); [PsyPost](https://www.psypost.org/tiger-woods-superstar-status-hobbled-the-competition/) **[secondary]**. STRONG (large field dataset; interpretation debated).
- **Bought advantages lose respect.** Evers, van de Ven & Weeda (2015), *International Journal of Internet Science* 10(1):20–36, surveyed 532 active gamers and ran two scenario experiments. Players who bought gameplay advantages were judged more harshly and respected less than buyers of cosmetic items, whether the buyer was a rival or a teammate. — [IJIS (open access)](https://www.ijis.net/ijis10_1/ijis10_1_evers_et_al_pre.html); [Tilburg record](https://research.tilburguniversity.edu/en/publications/b0269c04-7e27-4e69-9285-2e8e3629b97b) **[extract]**. MODERATE.
- **Goals in communities.** Beenen et al. (2004), CSCW, ran MovieLens field experiments.
  - Members contributed more when given specific, challenging goals (abstract).
  - A summary adds that *group* goals increased contributions compared with individual goals, the reverse of the social-loafing prediction.
  - There was weak evidence that performance drops beyond a difficulty threshold.
  - Sources: [paper (Resnick site)](https://presnick.people.si.umich.edu/papers/cscw04) **[extract]**; [AcaWiki summary](https://acawiki.org/Using_social_psychology_to_motivate_contributions_to_online_communities) **[secondary for the group-goal point]**. MODERATE.
- **Goal-gradient in charity.** Donations accelerate as visible goals approach (Cryder et al. 2013; Key question 1). — [CMU PDF](https://www.cmu.edu/dietrich/sds/docs/loewenstein/GoalGradient.pdf) **[extract]**.
- **A ranked attempt money cannot multiply.** Spelunky's Daily Challenge gives every player the same generated cave, and each player gets **one attempt per day** on that day's leaderboard; dying ends the entry. Its random gambling wheel is locked in daily runs so that chance does not affect results. The mode was framed as removing randomness so players' skill can be compared. — [Spelunky wiki](https://spelunky.fandom.com/wiki/Daily_Challenge_Mode_(HD)); [PC Gamer](https://www.pcgamer.com/uk/spelunky-gets-competitive-with-the-steam-exclusive-daily-challenge); [Game Developer, "The 24-hour ticket"](https://www.gamedeveloper.com/design/the-24-hour-ticket-examining-daily-runs-) **[extract]**. PRACTITIONER.
- **Rank metrics shape behaviour.** Duolingo's XP and league incentives pulled learners off the path until XP was rebalanced (Key question 1). — [Duolingo blog](https://blog.duolingo.com/time-spent-learning-well) **[extract]**.

### Inferences
- **Why "best score" boards are spend-linked (order statistics).** If a player's play-to-play score varies with SD s, the expected best of n plays is about 0.85s above average for 3 plays, 1.16s for 5, 1.54s for 10 and 1.87s for 20. These are standard expected maxima of normal samples, computed by me. With s ≈ 50 points, ten plays (€20) buy roughly +77 points of expected best before any practice effect. Prizes for the plain best score therefore reward spending, which conflicts with the brief for under-18s.
- **Spend-neutral board options for PresLink's three leaderboards** (inference; each needs one account per person):
  1. **"Best first play"**: only each person's first paid play counts, after free practice and calibration (Key questions 3 and 6), like Spelunky's single ranked attempt. Without prior calibration it would partly reward low-latency phones. Risk: duplicate accounts. Mitigate with one verified identity per person (for example, school roster or email) and say so.
  2. **"Best of your first five plays"**, or **"weekly best" with a one-prize-per-person rule**. Both cap how many attempts can count. A weekly reset gives late joiners a fresh board and limits the superstar effect (Brown).
  3. **"Most improved"**: the best later play minus a baseline, where the baseline is the *better* of the first two plays (to blunt sandbagging), counting only the first N plays.
  4. Separate student and adult boards. This limits superstar effects and avoids pitting minors against adults.
- **Group milestones should count people, not money.** For example: "When 200 different people have played, the teachers play a staff-room final". This uses goal-gradient and group-goal effects (Cryder; Beenen) without making any individual's spending the lever. Show euro totals only as a campaign thermometer, never as individual rankings (Evers: bought status is disrespected; it is also a pressure risk for minors).
- **Award design (Robinson; Gallus).**
  - Announce the symbolic awards in advance ("Steady Hand badge: all three lights within 40 ms").
  - Tie them to accomplishments, not to turning up or playing often.
  - Avoid surprise retrospective "thanks for playing so much" awards, which signal an unusual norm and can license disengagement.
  - Keep them symbolic and visible on the player's own profile or card, as the Wikipedia awards were.
- **How light spenders are likely to respond (inference; no direct study found).** Self-referenced tracks, capped-attempt boards and people-counted milestones give someone who plays once or twice a real chance at recognition. By the superstar and pay-to-win evidence, plain best-score and most-plays boards are likely to discourage them.

### Gaps
- No study was found of spend-neutral prizes in **charity** games or fundraising events, or of how low spenders respond to them.
- No evidence was found on "most improved" awards in games specifically, or on sandbagging rates.
- Gallus's effect size is not quoted. A figure of "about 20%" circulates but was **not verified** and should not be used.
- The group-goal result in Beenen et al. is second-hand.

---

## Key question 6: Free practice or demo play before paying: effect on conversion and on fairness in paid skill games

### Takeaway
Evidence on demos and conversion is mixed and mostly correlational:
- Industry data from 2013 (Xbox 360) found games released with a demo and trailer sold about half as much as trailer-only games. The data were confounded and their method thin.
- Panel data from Google Play link a well-rated free version to *higher* paid sales.
- Steam practitioners report demos helping indie wishlists.

For a €2 charity skill game, the stronger case for free practice is **fairness**. Without it, the first paid plays buy device calibration and practice, which is a spend-linked advantage that also adds device-dependent, chance-like variation. Rhythm games keep calibration and practice outside scored play, and Spelunky separates free practice from the single ranked attempt.

### Cited Findings
- **The "demos halve sales" data.** EEDAR data presented by Jesse Schell (2013), Xbox 360 titles over six months: trailer only about 520,000 units; trailer and demo about 250,000; demo only about 200,000; neither about 100,000. Coverage notes the data do not show that demos caused lower sales; big franchises tended not to release demos. — [MCV](https://mcvuk.com/game-demos-cut-sales-by-half-study-claims/); [GameSpot](https://www.gamespot.com/articles/game-demos-can-hurt-sales-suggests-research/1100-6410863/) **[secondary]**; critique at [J. Boger, "The Unfair Lie That Ruined Demos"](https://jboger.substack.com/p/the-unfair-lie-that-ruined-demos) **[secondary]**. WEAK (correlational, old, console retail).
- **Free versions and paid sales.** Liu, Au & Choi (2014), *Journal of Management Information Systems* 31(3):326–354, studied a panel of 711 Google Play apps. A freemium strategy is "positively associated with increased sales of paid apps". A highly rated free version raises paid-version sales, while the free version's visibility (rank) has no significant effect. Review ratings matter less when a free version exists, because people can try it themselves. — [JMIS](https://www.jmis-web.org/articles/1219) **[extract]**. MODERATE (observational panel).
- **Steam demos (practitioner).** A summary of Chris Zukowski's Next Fest surveys reports about 2.5× the median wishlists for games that published a demo months before the festival rather than during it. — [Steam Page Analyzer](https://www.steampageanalyzer.com/blog/do-steam-demos-increase-sales) **[secondary, unverified]**. Separately, first-month sales per wishlist fell from 0.45 (2020–22 releases) to 0.22 (2023–25). — [Inven Global](https://www.invenglobal.com/articles/27273/steam-wishlist-inflation-value-of-1-wishlist-cut-in-half-but-predictive-power-remains-unchanged) **[secondary]**. PRACTITIONER.
- **Practice is kept apart from scored play elsewhere.** Rhythm games calibrate outside scored play (osu! offset wizard; Rock Band calibration; Key question 3). Spelunky keeps unlimited normal play separate from one ranked daily attempt (Key question 5). — sources as cited above. PRACTITIONER.
- Device latency differences (35–140 ms) and partial human adaptation (Key question 3) mean the first taps on a new phone are systematically biased until the player has had feedback.
- Lomas et al. (2013) recommend giving players feedforward about the expected challenge to increase challenge-seeking. A practice light is exactly that. — [CMU PDF](https://www.stat.cmu.edu/~brian/463-663/project-part-one/Optimizing%20Challenge.pdf) **[extract]**.

### Inferences
- **Conversion.** The negative demo evidence comes from €40–60 console games, where a demo can satisfy curiosity and replace a purchase. A €2 charity play differs in two ways: people pay mainly to give and to compete, and a demo cannot substitute for being on the board. The positive freemium evidence (Liu et al.) is about whether a good free experience builds willingness to pay, which is closer to PresLink's case. Net: expect little conversion cost and a trust gain. This is unproven and should be A/B tested only if it is ethical to do so with minors.
- **Fairness.** Make free practice unlimited, clearly labelled "Practice: not scored", never shown on boards, and never upsold ("you'd have scored 940, pay €2 to make it count" is a pressure nudge to avoid with under-18s). Require at least three practice and calibration lights on a device before its first paid play. This also makes "best first play" (Key question 5) a fair board.
- **Skill versus chance (for the solicitor).** Free practice, calibration, published scoring and early/late feedback all reduce device-dependent, chance-like variation in results. That supports describing PresLink as a game of skill, though the legal test under the Gambling Regulation Act 2024 is still unknown (Key question 1 Gaps).

### Gaps
- No study was found on free practice before paid attempts in paid skill-gaming platforms or charity games, for either conversion or perceived fairness. Skill-gaming platforms' practice modes were not researched.
- No trial-by-trial learning-curve data were found for coincidence-anticipation timing (how many practice taps until error stabilises). The search returned only practice-schedule studies. — [Gonçalves et al. 2010, RBEFE](https://revistas.usp.br/rbefe/article/view/16778) **[extract]**. The "three practice lights" minimum above is a judgement to test in the pilot.
- Zukowski's primary demo data were not read.
