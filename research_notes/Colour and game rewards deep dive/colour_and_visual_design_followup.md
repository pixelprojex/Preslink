# Colour and visual design follow-up: verifying the earlier claims, and contrast, colour-blindness, player-chosen colours, trust and system preferences for PresLink Arcade

Scope note for the report writer. These notes follow on from `research_notes/Engagement and giving in web games/colour_visual_design_readability.md`, called "the earlier notes" below, with references to its key questions (KQ1–KQ6). They check the claims it flagged as unverified, close some of its Gaps and add the practical colour evidence it did not cover. Findings that are already well sourced there are referenced briefly, not repeated: WCAG 1.4.1 use of colour, the reasoning behind 4.5:1, NN/g's flat-UI and F-pattern studies, motion durations, vestibular prevalence and light-versus-dark polarity.

**Access caveat.** In this environment WebFetch could not resolve any host, and curl through the proxy reached only GitHub. So:

- **Read in full, from their GitHub repositories:** the W3C WCAG 2.2 Understanding documents and techniques, the APCA documentation and source, Material Color Utilities, USWDS, Tailwind CSS, Google's Material Design Lite palette, R's Okabe-Ito definition, colorspacious (the Machado matrices), the HTTP Archive Web Almanac, and a GitHub mirror of Apple's Human Interface Guidelines (HIG).
- **Read only as web-search extracts:** papers, NN/g, Baymard, WebAIM and industry data. These are extracts of abstracts, publisher pages or secondary write-ups, not full texts, and each item says so.

**Grades.**

- **[Strong]:** a standard, a meta-analysis, or replicated or large-sample work.
- **[Moderate]:** a single peer-reviewed study, or NN/g or Baymard research with numbers.
- **[Weak]:** a small, informal or self-selected sample, or a claim seen only second-hand.
- **[Practitioner]:** platform or design-system guidance, or expert opinion without published data.
- **[Computed here]:** my own arithmetic, not a perceptual experiment.
- **[Unverified]:** could not be traced to a primary source.

**Computation method.**

- **Contrast:** WCAG 2.x relative luminance and contrast ratio, as defined in Understanding 1.4.3.
- **APCA:** the APCA-W3 base algorithm 0.0.98G-4g, using the constants from the apca-w3 repository. As a check, black on white gives Lc 106.0 and white on black gives Lc −107.9. Lc is reported here as an absolute value; APCA signs light text on a dark background as negative.
- **Colour-vision-deficiency (CVD) simulation:** Machado, Oliveira & Fernandes (2009) matrices, applied in linear sRGB. Severity 1.0 stands for dichromacy and severity 0.6 for moderate anomalous trichromacy. My matrices match colorspacious exactly.
- **Colour difference:** CIEDE2000 (ΔE00). There is no single cut-off for "confusable", so pairs are compared with their normal-vision distance.
- **Darker variants:** found by lowering OKLCH lightness at a fixed hue while keeping the maximum in-gamut chroma.

**PresLink facts taken from the code.**

- **Tiles:** eight tile colours, #58cc02, #1cb0f6, #8549ba, #ff9600, #ff4b4b, #f05fa8, #14b8a6 and #4f5bd5, all with white weight-800 letters (`site/styles.css` lines 395–411). Letter sizes are 13 px on 44×34 px leaderboard tiles, 12 px in the prize lead and wide boards (lines 597 and 712), and 26 px on the 96×70 px "You" tile.
- **Swatches:** 24×24 px colour swatches with a dark ring on the selected one.
- **Game feedback:** a hit shows a green marker, a ring animation, green verdict text and a sound. A miss shows a white marker and grey text (`styles.css` lines 330–342; `site/app.js` lines 655–666 and 827–863).
- **Pay button:** "Play · €2" is 16 px bold white on #1f9d5a (`styles.css` lines 132–142).
- **System preferences:** there is no `prefers-color-scheme` rule. `prefers-reduced-motion` is handled (`styles.css` lines 52, 221, 292 and 569; `app.js` line 27).

## Key question 1: Which of the earlier notes' unverified or second-hand claims hold up against the primary source?

### Takeaway
At the abstract level, the HCI first-impression and reading studies hold up as the earlier notes described them: Lindgaard 2006, Tuch 2012 (IJHCS), Reinecke 2013 and NN/g's 79%/16% and 20–28% figures. Four things need correcting:

- **Colour-psychology effects are smaller than claimed.** The effect of red on test performance vanishes after correcting for publication bias (Gnambs 2020), and red's effect on attractiveness is small and possibly inflated.
- **The age finding from Reinecke & Gajos 2014 was reported the wrong way round.** Secondary accounts say older users prefer *more* colourful designs, not less.
- **The usability halo runs in reverse after use.** Tuch et al. 2012 (Computers in Human Behavior, CHB) found that usability shapes how beautiful a site seems after use, while beauty did not change perceived usability.
- **Two popular figures still have no primary source.** These are the "80% brand recognition" and "red button +21%" claims.

### Cited Findings
- **Lindgaard et al. 2006 ("50 milliseconds"): the study design holds; the exact correlations are unverified.** The abstract describes three studies:
  - Study 1: participants rated the visual appeal of homepages shown for 500 ms, twice.
  - Study 2: the same, plus ratings on seven design dimensions; visual appeal was closely related to most of them.
  - Study 3: replicated the 500 ms condition and added a 50 ms condition with the same stimuli, to test a mere-exposure explanation.

  One secondary account reports "a very high correlation of r = .97" without saying which comparison it refers to. This is an older classic (2006). [Moderate; abstract and secondary extracts] — [websiteoptimization.com summary](https://www.websiteoptimization.com/?p=2578); [Human Factors International newsletter](https://www.humanfactors.com/newsletters/an_exploration_of_relations_between_visual_appeal.html); [citation page](https://makinggood.ac.nz/l/lindgaard,-g,-fernandes,-g,-dudek,-c,-brown,-j-%282006%29-attention-web-designers-you-have-50-milliseconds-to-make-a-good-first-impression!-behaviour-it,-25,-115–126)
- **New: Lindgaard et al. 2011 extends the result to trust.** Three experiments were run, the second within-subjects and the third a between-subjects replication. Judgements of visual appeal, trustworthiness and perceived usability of homepages were "largely driven by visual appeal". However, the more cognitively demanding judgements (trust, usability) "are processed in a qualitatively different manner" and rely on somewhat different visual attributes. Published in ACM TOCHI 18(1). [Moderate; abstract extract] — [DOI 10.1145/1959022.1959023](https://doi.org/10.1145/1959022.1959023); [HFI summary](https://www.humanfactors.com/newsletters/an_exploration_of_relations_between_visual_appeal.html)
- **Tuch, Presslaber, Stöcklin, Opwis & Bargas-Avila 2012 (IJHCS 70(11):794–811): holds as described.**
  - Study 1 used 119 real website screenshots with exposure varied between subjects (50, 500 and 1,000 ms).
  - Study 2 used 17, 33 and 50 ms. Visual complexity and prototypicality affected aesthetic ratings "even within 17ms". The prototypicality effect was weaker at first and became as influential as complexity as exposure lengthened.
  - Sites with low complexity and high prototypicality were the most appealing.

  [Strong; abstract extract] — [Google Research](https://research.google/pubs/pub38315/); [University of Basel repository](https://edoc.unibas.ch/21676)
- **Reinecke et al. 2013 (CHI): holds.** 548 volunteers rated 450 websites for colourfulness, complexity and appeal. Computational models of complexity and colourfulness, combined with education and age, explain about half the variance in appeal judged after 500 ms. [Strong] — [Harvard record](https://www.eecs.harvard.edu/~kgajos/papers/2013/reinecke13predicting.shtml); [UW PDF](https://wildlab.cs.washington.edu/Publications_files/Reinecke_CHI2013.pdf)
- **Reinecke & Gajos 2014 (CHI, "Quantifying visual preferences around the world"): partly holds; the age direction is corrected.**
  - The abstract reports 2.4 million ratings from nearly 40,000 participants.
  - Women preferred more colourful sites than men.
  - Higher education generally lowered the preference for colourfulness.
  - Russians preferred lower complexity; Macedonians liked highly colourful designs more than any other country.
  - The abstract does not mention age. Susan Weinschenk's secondary summaries say participants over 40 preferred *more* colourful designs (more so over 50), and that over-45s liked low-complexity sites more. The earlier notes' "older users prefer less colourful sites" is therefore not supported, and the age thresholds remain unverified against the paper.

  [Strong for the abstract claims; Weak for age] — [Harvard record](https://eecs.harvard.edu/~kgajos/papers/2014/reinecke14visual.shtml); [paper PDF](https://iis.seas.harvard.edu/papers/reinecke14visual.pdf); [Weinschenk, "100 More Things #183"](https://www.goodreads.com/author_blog_posts/26009934-100-more-things-183-what-people-find-visually-appealing-depends-on-age?tab=book); [Team W blog](https://www.blog.theteamw.com/2015/10/04/beauty-is-in-the-eye-of-the-beholders-age-gender-and-geography/)
- **Tuch, Roth, Hornbæk, Opwis & Bargas-Avila 2012 (CHB 28(5):1596–1607): closes an earlier gap and reverses the "beautiful is usable" halo.** 80 participants used one of four online-shop versions (aesthetics low or high, crossed with usability low or high) and rated each shop before and after use. "Aesthetics does not affect perceived usability", whereas "usability has an effect on post-use perceived aesthetics". The authors suggest frustration with poor usability is the mediator. [Moderate; abstract extract] — [Google Research](https://research.google/pubs/is-beautiful-really-usable-toward-understanding-the-relation-between-usability-aesthetics-and-affect-in-hci/); [University of Copenhagen profile](https://researchprofiles.ku.dk/da/publications/is-beautiful-really-usable-toward-understanding-the-relation-betw/)
- **Sonderegger & Sauer 2010 (Applied Ergonomics 41:403–410): closes an earlier gap, with a teenage sample.** 60 adolescents aged 14–17 completed tasks on one of two functionally identical simulated phones, one highly appealing and one not. The appealing design gave shorter task-completion times and higher perceived usability. [Moderate; abstract extract] — [University of Fribourg PDF](https://sonar.ch/documents/302271/files/Sonderegger_Sauer2010.pdf); [record](https://folia.unifr.ch/unifr/documents/302271)
- **NN/g's "79% scan, 16% read word by word": holds.** The figures come from Nielsen's 1 October 1997 Alertbox ("79 percent of our test users always scanned any new page they came across; only 16 percent read word-by-word"), checked in two archived copies. This is an older classic. [Moderate] — [Deusto copy](https://paginaspersonales.deusto.es/abaitua/konzeptu/sgml/9710a.html); [GMU CHNM copy](https://www.chnm.gmu.edu/digitalhistory/links/pdf/chapter4/4.17c.pdf)
- **Nielsen 2008, "How little do users read?": holds, and the dataset is now clear.** It is based on Weinreich, Obendorf, Herder & Mayer (ACM Transactions on the Web 2(1), February 2008), who instrumented 25 users' browsers during normal use. Nielsen's estimate is "at most 28% of the words … 20% is more likely", and he notes these users were above average (several were university staff). The ~45,000 page-view total quoted in the earlier notes was not confirmed. [Moderate] — [Alertbox PDF](https://faculty.washington.edu/farkas/TC510-Fall2011/NielsenHowLittleDoUsersReadDF.pdf); [NN/g article](https://www.nngroup.com/articles/how-little-do-users-read/)
- **Red and intellectual performance: the effect sizes are corrected downwards.** Gnambs (2020, Psychonomic Bulletin & Review) meta-analysed 67 effect sizes from 38 samples.
  - Anagram tests: d = −0.06; knowledge tests: d = −0.04 (both not significant).
  - Reasoning tests: d = −0.34 [−0.61, −0.06].
  - Effects were "substantially larger in early studies", and after correcting for publication bias "no evidential value remained".

  [Strong] — [Springer](https://link.springer.com/article/10.3758/s13423-020-01772-1); [PMC7704521](https://pmc.ncbi.nlm.nih.gov/articles/PMC7704521/)
- **Gnambs, Appel & Batinic 2010 (CHB 26(6):1625–1631): closes an earlier gap.**
  - Study 1 (N = 131): a red rather than green progress bar impaired knowledge-test performance, for men only.
  - Study 2 (N = 190): varying the colour of the forward button (red, blue or mixed) replicated the gender-dependent effect.

  The same first author's 2020 meta-analysis above later found limited evidence for red effects overall. [Weak to moderate; abstract extract] — [Academia.edu copy](https://www.academia.edu/2887870/Color_red_in_web_based_knowledge_testing); [journal record](https://datalearner.com/academic/journal-papers/0747-5632/volumes-and-issues/121/paper-detail/33951)
- **Red and attractiveness: small and possibly inflated.** Lehmann, Elliot & Calin-Jageman (2018, Evolutionary Psychology) meta-analysis:
  - Men rating women: d = 0.26 [0.12, 0.40], N = 2,961.
  - Women rating men: d = 0.13 [0.01, 0.25], N = 2,739, with signs of upward bias.
  - Separately, a 2019 paper in Collabra: Psychology found no effect of red on attractiveness ratings (mean difference −0.07 [−0.31, 0.16]).

  [Strong] — [SAGE](https://journals.sagepub.com/doi/10.1177/1474704918802412); [Collabra 2019 via DOAJ](https://doaj.org/article/98cc5cffe7a44dcdb5247cf72f749160)
- **Jonauskaite et al. 2020, specific colour–emotion pairs: partly closes an earlier gap (secondary).**
  - Red's most consistent associations are love, anger and hate.
  - Pink goes with love; yellow with joy and amusement.
  - Brown goes with disgust; this one comes via a 2024 Jonauskaite paper that cites the 2020 study.

  The researchers caution that associations do not show people *feel* those emotions. [Moderate, via secondary summaries] — [Psychology Today, "Why links between colors and emotions may be universal"](https://www.psychologytoday.com/us/blog/color-psychology/202202/why-links-between-colors-and-emotions-may-be-universal); [Psychology Today, "Red is associated with love"](https://www.psychologytoday.com/intl/blog/color-psychology/202202/red-is-associated-love-do-we-actually-feel-it); [paper PDF](https://biopen.bi.no/bi-xmlui/bitstream/11250/2761614/1/Jonauskaite_etal_2020_PsychScience.pdf)
- **Cyr, Head & Larios 2010 (IJHCS 68(1–2):1–21): located, at abstract level.** The study tested three website colour treatments with three culturally distinct groups, using eye-tracking, a survey and interviews. "Website colour appeal emerged as a significant determinant of trust and satisfaction, with differences noted across cultures." It won IJHCS's most-cited paper award for 2010–2012. The specific colours and effect sizes were not confirmed. [Moderate] — [McMaster record](https://experts.mcmaster.ca/scholarly-works/58866); [SFU Beedie news](https://beedie.sfu.ca/blog/?p=6383)
- **New: Seckler, Opwis & Tuch 2015 (CHB 49:375–389).** Five online experiments (N = 194) on real websites varied symmetry, complexity, hue, saturation and brightness.
  - The highest overall aesthetic ratings went to sites with high symmetry, low complexity, a blue hue, medium brightness and medium-to-high saturation.
  - "Structural factors compared to color factors have a manifold and greater impact"; the colour factors mainly affected perceived colourfulness.

  [Moderate; abstract extract] — [University of Basel repository](https://edoc.unibas.ch/29197); [repository mirror](https://edoc-vmtest.ub.unibas.ch/40060)
- **"Colour increases brand recognition by up to 80%": still unsupported.**
  - Jill Morton's Colorcom "Why Color Matters" page lists it, credited to a "University of Loyola, Maryland study" with no title, authors or date.
  - A print-industry article dates it to 2007 and ties it to colour consistency on packaging.
  - A US patent repeats it in its background section.
  - No primary study was found.

  [Unverified — do not use] — [Colorcom](https://www.colorcom.com/research/why-color-matters/); [Schawk article on piworld](https://piworld.com/article/schawk-launches-industry-s-first-cloud-based-print-quality-management-platform/4); [USPTO patent 8086490](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8086490)
- **HubSpot/Performable "red beat green by 21%": still unverified, and confounded.** Secondary accounts describe a 2011 test of a "Get Started Now!" button in which red beat the usual green by 21%, reportedly on about 2,000 visits (unconfirmed). Critics point out that the page, including the logo, was dominated by green, so the result more likely reflects an isolation effect than anything about red. The original post was not retrieved. [Weak] — [Review42](https://resources.review42.com/call-to-action-tips/); [Uxcel lesson](https://app.uxcel.com/courses/color-psychology-for-designers/testing-color-combinations-148/testing-for-conversions-8936); [Poper](https://www.poper.ai/blog/cta-button-color-conversion/)
- **Buechner & Maier 2016: sample size still not found.** The title is confirmed: "Not always a matter of context: direct effects of red on arousal but context-dependent moderations on valence" (PeerJ 4:e2515, 27 September 2016). [Unverified for n] — [PeerJ](https://peerj.com/articles/2515)

### Inferences
- The findings that survive checking, and that bear on decisions, are about layout complexity, structure, consistency and usability, not about particular hues. Hue-specific effect claims weaken under scrutiny. For PresLink, tile colours should therefore be chosen for legibility, colour-blind robustness and identity, not for supposed psychological effects of individual hues.
- Taken together, Sonderegger & Sauer (an attractive design helped 14–17-year-olds perform) and Tuch et al. CHB (poor usability made a site look worse after use) say that a polished first screen helps, but a confusing or failing €2 payment flow would undo that impression.
- A final report should drop three claims: the 80% brand-recognition figure, the 21% red-button result as a general rule, and "older users prefer less colourful sites".

### Gaps
- No full texts were read for Lindgaard 2006 (r values), Lindgaard 2011, Reinecke & Gajos 2014 (age tables), Cyr 2010 (which colours), Tuch CHB (effect sizes) or Gnambs 2020 (the bias-corrected estimate).
- Still untraced: the sample size of Buechner & Maier 2016, the original HubSpot post, the "Loyola" study, the Weinreich page-view total, and the often-quoted "46.1%" design-look figure from Fogg et al. 2003, an older classic that was not confirmed.
- Gold-as-reward and purple-as-prestige (a gap in earlier KQ1) were not searched again in this pass. No evidence either way.

## Key question 2: Contrast and legibility for short bold labels (two or three initials, 12–13 px bold, white) on saturated tiles: what do WCAG 2.2 and APCA say, and how do practitioners keep colour vivid while passing?

### Takeaway
Under WCAG 2.2, 12–13 px bold initials count as normal-size text, because "large" starts at 14 pt bold, about 18.5 px. White letters therefore need 4.5:1 against the tile colour, and the tile's colour against the page needs no ratio because the initials carry the meaning.

Only 2 of PresLink's 8 tile colours pass: purple #8549ba at 5.74:1 and indigo #4f5bd5 at 5.54:1. Red and pink pass only the 3:1 large-text level, and green, sky blue, orange and teal (2.09–2.49:1) fail even that. APCA, which is not part of WCAG and whose place in the draft WCAG 3 is undecided, is stricter still for text this small. It also penalises weight 800 at 12–13 px.

Practitioners keep colour vivid in four main ways:

- darken within the hue in a perceptually uniform colour space, as in the USWDS grade-50 "vivid" tokens, Material's HCT tone rule and Tailwind's 600–700 shades;
- put dark letters on bright hues instead;
- add a dark outline or halo round the letters, which WCAG technique G18 explicitly accepts;
- enlarge the letters into the large-text band.

With white letters, eight vivid colours that all pass and all stay distinct for colour-blind players are only partly achievable (see Key question 3).

### Cited Findings
**What the standards say**
- **12–13 px bold initials are not large text.** WCAG defines large-scale text as "at least 18 point or 14 point bold". The Understanding document converts this: "1pt = 1.333px, therefore 14pt and 18pt are equivalent to approximately 18.5px and 24px." Ratios "should not be rounded (e.g., 4.499:1 would not meet the 4.5:1 threshold)". Thin or unusual fonts may render fainter than their nominal colour, so it recommends exceeding the minimums. [Strong — standard] — [WCAG 2.2 large-scale definition](https://www.w3.org/TR/WCAG22/#dfn-large-scale) (source: [w3c/wcag](https://github.com/w3c/wcag/blob/main/guidelines/terms/20/large-scale.html)); [Understanding SC 1.4.3 (WCAG 2.2)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) (source: [w3c/wcag](https://github.com/w3c/wcag/blob/main/understanding/20/contrast-minimum.html))
- **Initials are text, not a logo or symbol.** The logo exemption covers "text used as part of a logo or logotype". Text characters "used for their visual appearance, rather than expressing something in human language" fall under SC 1.4.11 instead. Initials name a person, so SC 1.4.3 applies. The Understanding document adds: "Beyond logos and logotypes, text that has insufficient contrast due to corporate identity or brand guidelines is not exempted from the requirements of this criterion." [Strong — standard] — [Understanding SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- **An outline or halo is an accepted way to pass.** Sufficient technique G18 says a designer "might darken the background behind the letter, or add a thin black outline (at least one pixel wide) around the letter" to keep the letter-to-background ratio above the threshold. G18 and G145 both note that "another method is to provide a halo around the text that provides the necessary contrast ratio". [Strong — W3C technique] — [Technique G18](https://www.w3.org/WAI/WCAG22/Techniques/general/G18) (source: [w3c/wcag](https://github.com/w3c/wcag/blob/main/techniques/general/G18.html)); [Technique G145](https://www.w3.org/WAI/WCAG22/Techniques/general/G145) (source: [w3c/wcag](https://github.com/w3c/wcag/blob/main/techniques/general/G145.html))
- **SC 1.4.11 (3:1 for non-text) does not cover the tile fill when visible text carries the same information.** The test procedure says to check graphics "that include information required for understanding the content (i.e., excluding graphics which have visible text for the same information, or are decorative)". It also says "Text within a graphic must meet 1.4.3 Contrast (Minimum)". For controls, a visible boundary is not required when "a control has visible content (such as text or a sufficiently contrasting icon)".
  - For controls whose only content is a graphic, the "essential" exception covers cases where "you cannot represent the graphic in any other way". Even then, W3C "encourage[s] (but not required)" another aspect that identifies the control, and focus indicators are still not exempt.
  - Selected and focus states must reach 3:1 against adjacent colours. A hue change alone to show state "is likely to fail the Use of color criterion".

  [Strong — standard] — [Understanding SC 1.4.11 (WCAG 2.2)](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) (source: [w3c/wcag](https://github.com/w3c/wcag/blob/main/understanding/21/non-text-contrast.html))
- **Apple is more lenient for bold text than WCAG.** Apple's HIG says its Accessibility Inspector uses "values from WCAG Level AA": up to 17 pt, 4.5:1; 18 pt and above, 3:1; and "All Bold: 3:1", meaning any bold text at 3:1. It names WCAG and APCA as "two popular standards" and asks apps that fall short by default to provide a higher-contrast scheme under the Increase Contrast setting. The HIG mirror is dated 2025-07-20. [Practitioner — platform guidance] — [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) (text from the [apple-dev-mcp mirror](https://github.com/tmaasen/apple-dev-mcp), `content/universal/accessibility.md`)
- **APCA Bronze ("simple mode") levels.**

  | Level | APCA's description |
  |---|---|
  | Lc 90 | Preferred for body text; covers "non-body text with a font no smaller than 12px/400" |
  | Lc 75 | Minimum for body text at 14px/700; usable for non-body text from 15px/400 |
  | Lc 60 | Minimum for "content text that is not body", from 16px/700 (bold) |
  | Lc 45 | Larger, heavier text (24px bold) |
  | Lc 30 | Absolute minimum for "spot readable" text such as placeholder or disabled text |

  APCA says adding Lc 15 gives the equivalent of AAA. It also argues that WCAG 2's maths "overstates contrast for dark colors" and "cannot be used for guidance designing 'dark mode'". That is the APCA author's claim, not a W3C position. [Practitioner — APCA's own documentation] — [APCA in a Nutshell](https://github.com/Myndex/SAPC-APCA/blob/master/documentation/APCA_in_a_Nutshell.md)
- **APCA's advanced lookup table is stricter still at 12–13 px, especially at weight 800.** Public Beta 0.1.7 (May 2022) gives minimum font sizes by contrast level.

  | Contrast | Minimum size at weight 700 | Minimum size at weight 800 |
  |---|---|---|
  | Lc 60 | 16 px | 16 px |
  | Lc 75 | 14 px | 16 px |
  | Lc 100 | 13 px | 16 px |
  | Lc 105 | 12 px | 16 px |
  | Lc 120 | — | 13 px |

  The README adds that "sub-fluent text" (not primary content) may drop by Lc 15, and "non-fluent spot text" by Lc 25, but never below Lc 30. One inconsistency: the code comment names Barlow as the reference font, while the Nutshell document says Helvetica or Arial. [Practitioner — beta standard] — [apca-w3 source, `fontLookupAPCA`](https://github.com/Myndex/apca-w3/blob/master/src/apca-w3.js); [apca-w3 README](https://github.com/Myndex/apca-w3/blob/master/README.md)
- **APCA's status.** The apca-w3 library is labelled "beta" (algorithm 0.0.98G-4g, February 2021). The Nutshell document still calls APCA "the candidate contrast method for the future WCAG 3". Adrian Roselli's April 2026 review reports that the WCAG 3 editor's note says the contrast algorithm is "yet to be determined", and that APCA was pulled from the July 2023 working draft for lack of working-group support. A May 2026 blog dates the removal differently, so check the W3C draft history. Yatil's review notes APCA cannot be relied on for compliance because it is not in WCAG 2. [Moderate — practitioner reviews; W3C draft not read] — [Roselli, "WCAG3 contrast as of April 2026"](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html); [W3C WCAG 3.0 working draft, July 2023](https://www.w3.org/TR/2023/WD-wcag-3.0-20230724/); [Yatil, "WCAG 3 is not ready yet"](https://www.yatil.net/blog/wcag-3-is-not-ready-yet); [apca-w3 README](https://github.com/Myndex/apca-w3/blob/master/README.md)

**How practitioners keep colour vivid while passing**
- **USWDS "magic number".** Grades run from 0 (white) to 100 (black), and the grades are matched across colour families by luminance. A grade difference of 40 or more gives AA large text, 50 or more gives AA, and 70 or more gives AAA. "Colors of grade 50 result in Section 508 AA contrast against both pure white … and pure black." So every grade-50 "vivid" token takes white text. USWDS states the AA rule as "4.5:1 for most text and 3:1 for large text (19px+ bold or 24px+ normal text)". [Practitioner — US federal design system] — [USWDS colour overview](https://designsystem.digital.gov/design-tokens/color/overview/) (source: [uswds-site](https://github.com/uswds/uswds-site/blob/main/pages/design-tokens/color/overview.md)); [token values](https://github.com/uswds/uswds-site/blob/main/_data/tokens/color.yml)
- **Material's HCT tone rule.** "A difference of 40 in HCT tone guarantees a contrast ratio >= 3.0, and a difference of 50 guarantees a contrast ratio >= 4.5." Because white is tone 100, any tile at tone 50 or below passes with white letters, whatever its hue and chroma. [Practitioner — Google library] — [material-color-utilities `hct.ts`](https://github.com/material-foundation/material-color-utilities/blob/main/typescript/hct/hct.ts)
- **Stripe's approach.** Stripe wanted "hand-picked, vibrant colors that also met standards for accessibility and contrast". It found that hand-picking and then checking depended on trial and error, and that generating tints from base colours "often produced muted results". It built a tool on perceptual colour models with real-time accessibility feedback. Later practitioner essays extend the method with perceptually uniform spaces, and Canonical with APCA. [Practitioner] — [Stripe, "Designing accessible color systems"](https://stripe.com/it-ca/blog/accessible-color-systems); [Gigazine summary](https://gigazine.net/gsc_news/en/20191017-stripe-designing-accessible-color-systems); [Matthew Ström, "Generating color palettes"](https://mattstromawn.com/writing/generating-color-palettes/); [Canonical, palettes inspired by APCA](https://ubuntu.com/blog/generating-color-palettes-for-design-systems-inspired-by-apca)
- **Where PresLink's palette comes from.** Feather Green #58CC02 and Macaw #1CB0F6 are official Duolingo identity colours. Third-party token sets list #FF9600 as Duolingo's streak/Fox orange and #FF4B4B as Cardinal red. So PresLink's tiles are essentially Duolingo's brand palette. Whether Duolingo itself puts small white text on these colours was not checked. [Practitioner] — [Duolingo design: colour](https://design.duolingo.com/identity/color); [third-party Duolingo token set](https://open-design.ai/plugins/design-system-duolingo/)

**How common the problem is**
- **WebAIM Million 2026.** Low-contrast text was found on 83.9% of the top one million home pages (79.1% in 2025), averaging about 34 instances per page (29.6 in 2025). 95.9% of home pages had detectable WCAG 2 failures (94.8% in 2025). These figures come from write-ups citing WebAIM; the primary 2026 page was not opened. [Strong source, read second-hand] — [WebAIM Million](https://webaim.org/projects/million/); [Priority Pixels summary](https://prioritypixels.co.uk/insights/web-accessibility-is-getting-worse-according-to-the-2026-webaim-million-report/); [WebAIM Million 2025](https://webaim.org/projects/million/2025)
- **Web Almanac.** Lighthouse found sufficient text contrast on 22.9% of mobile sites in 2022, 29% in 2024 and about 30–31% in 2025. The 2025 chapter gives both 30% and 31% in different places. [Strong — large crawl] — [Web Almanac 2022, Accessibility](https://almanac.httparchive.org/en/2022/accessibility); [2024](https://almanac.httparchive.org/en/2024/accessibility); [2025](https://almanac.httparchive.org/en/2025/accessibility) (source: [HTTPArchive/almanac.httparchive.org](https://github.com/HTTPArchive/almanac.httparchive.org/tree/main/src/content/en))

**Computed for PresLink's palette** [Computed here; WCAG 2.x formula from Understanding 1.4.3; APCA-W3 0.0.98G-4g; tile colours from `site/styles.css`]

Table 1. Current tiles with white letters.

| Tile | Hex | White text (WCAG) | Passes 4.5:1 (12–13 px bold)? | Passes 3:1 (26 px bold "You" tile)? | APCA \|Lc\| | Dark ink #1c1c1e text |
|---|---|---|---|---|---|---|
| k1 green | #58cc02 | 2.09:1 | No | No | 44.9 | 8.15:1 |
| k2 sky blue | #1cb0f6 | 2.44:1 | No | No | 52.5 | 6.96:1 |
| k3 purple | #8549ba | 5.74:1 | Yes | Yes | 83.5 | 2.96:1 |
| k4 orange | #ff9600 | 2.18:1 | No | No | 47.2 | 7.79:1 |
| k5 red | #ff4b4b | 3.30:1 | No | Yes | 64.5 | 5.15:1 |
| k6 pink | #f05fa8 | 3.04:1 | No | Yes (just) | 61.8 | 5.60:1 |
| k7 teal | #14b8a6 | 2.49:1 | No | No | 53.4 | 6.84:1 |
| k8 indigo | #4f5bd5 | 5.54:1 | Yes | Yes | 82.6 | 3.07:1 |

- **Under APCA's lookup table:**
  - 13 px at weight 800 needs Lc 120 as fluent text and Lc 95 as spot text. 13 px at weight 700 needs Lc 100 fluent and Lc 75 spot.
  - Purple and indigo (|Lc| about 83) therefore reach the "spot" level only at weight 700. No tile reaches the Bronze Lc 90 level that APCA lists for 12 px non-body text.
  - The 26 px weight-800 tile needs about Lc 45, which every colour meets except green (44.9).
- **Under Apple's "all bold 3:1" rule:** red, pink, purple and indigo pass; green, sky blue, orange and teal fail.
- **Colour swatches (24×24 px, colour only):**
  - The unselected green, orange, sky-blue and teal swatches are only 2.09–2.49:1 against the white sheet.
  - The selection ring (#1c1c1e on a white gap) is 17.0:1.
  - At 24×24 px the swatches meet the WCAG 2.2 SC 2.5.8 minimum target size (earlier notes, KQ3).

Table 2. Same hue, darkened only until white letters reach 4.5:1. This is the smallest change to the current palette.

| Tile | Current | Darkened | White text | APCA \|Lc\| | Visual shift (ΔE00) | Note |
|---|---|---|---|---|---|---|
| green | #58cc02 | #388700 | 4.53:1 | 76.5 | 20.8 | |
| sky blue | #1cb0f6 | #007eb4 | 4.52:1 | 76.2 | 16.6 | |
| purple | #8549ba | (unchanged) | 5.74:1 | 83.5 | 0 | |
| orange | #ff9600 | #ae6500 | 4.51:1 | 76.3 | 19.5 | Turns amber-brown |
| red | #ff4b4b | #e22b33 | 4.54:1 | 75.2 | 8.8 | |
| pink | #f05fa8 | #cd3e8a | 4.51:1 | 75.8 | 10.7 | |
| teal | #14b8a6 | #008577 | 4.54:1 | 76.4 | 16.3 | |
| indigo | #4f5bd5 | (unchanged) | 5.54:1 | 82.6 | 0 | |

Table 3. Published "vivid" shades that pass 4.5:1 with white letters. Hex values were read from each system's source, and the ratios computed here.

- **Tailwind v3** ([colors.js](https://github.com/tailwindlabs/tailwindcss/blob/v3.4.17/src/public/colors.js)):
  - Pass: green-700 #15803d 5.02, sky-700 #0369a1 5.93, violet-600 #7c3aed 5.70, purple-600 #9333ea 5.38, orange-700 #c2410c 5.18, red-600 #dc2626 4.83, pink-600 #db2777 4.60, pink-700 #be185d 6.04, fuchsia-600 #c026d3 4.71, teal-700 #0f766e 5.47, emerald-700 #047857 5.48, cyan-700 #0e7490 5.36, blue-600 #2563eb 5.17, indigo-600 #4f46e5 6.29, amber-700 #b45309 5.02, rose-600 #e11d48 4.70.
  - The 600 shades fail for green (3.30), sky (4.10), orange (3.56) and teal (3.74).
- **USWDS vivid grade 50** ([tokens](https://github.com/uswds/uswds-site/blob/main/_data/tokens/color.yml)): red-50v #e52207 4.60, orange-50v #c05600 4.59, gold-50v #936f38 4.59, green-50v #538200 4.60, mint-50v #008659 4.61, cyan-50v #0081a1 4.51, blue-50v #0076d6 4.60, indigo-50v #656bd7 4.53, violet-50v #9355dc 4.59, magenta-60v #ab2165 6.69.
- **Material 2014 palette** ([Material Design Lite colour definitions](https://github.com/google/material-design-lite/blob/mdl-1.x/src/_color-definitions.scss)):
  - Pass: Red 700 #D32F2F 4.98, Pink 700 #C2185B 5.87, Purple 700 #7B1FA2 8.20, Indigo 700 #303F9F 8.98, Blue 700 #1976D2 4.60, Light Blue 800 #0277BD 4.80, Cyan 800 #00838F 4.52, Teal 700 #00796B 5.32, Green 800 #2E7D32 5.13.
  - Fail: Green 700 #388E3C 4.12, Orange 700 #F57C00 2.70, Orange 900 #E65100 3.79, Deep Orange 800 #D84315 4.44. The 500 shades mostly fail with white (Green 500 2.78, Blue 500 3.12, Orange 500 2.16).
- **Colour-blind-safe palettes mostly need dark text.** In the Okabe-Ito palette only blue #0072B2 passes with white (5.19:1). Vermillion is 3.87, bluish green 3.42, reddish purple 3.06, sky blue 2.31, orange 2.25 and yellow 1.32. With black text the others reach 5.43–15.88:1. ([R grDevices definition](https://github.com/wch/r-source/blob/trunk/src/library/grDevices/R/colorstuff.R))

**Other white-on-colour elements on the site** [Computed here]
- The "Play · €2" button (white, 16 px, weight 700, on #1f9d5a) is 3.48:1, which fails 1.4.3; the darker #17824a already in the stylesheet gives 4.85:1. APCA gives Lc 67.4, which passes its Lc 60 level for 16 px bold.
- The green "Perfect / So close" verdict text (#1f9d5a, 17 px, weight 700, on white) is 3.48:1, which fails.
- The bronze rank badge (white, 14 px bold, on #f26a1b) is 3.06:1, which fails.
- The red error toast (#d93c3c) is 4.5046:1, which passes, just.

### Inferences
- **The cheapest compliant fix:** swap six hex values for the Table 2 variants. This keeps PresLink's hues and passes 4.5:1, but orange becomes amber-brown. If a lively orange matters more than the exact hue, use a red-orange instead, such as Tailwind orange-700 #c2410c or USWDS orange-warm-50v #cf4900.
- **The "keep the brights" alternatives, each standards-recognised:**
  - Dark ink letters on the light tiles (green, sky blue, orange and teal reach 6.8–8.2:1 with #1c1c1e), keeping white letters on purple, indigo, red and pink. The cost is less visual uniformity.
  - A 1 px dark outline or halo round white letters (technique G18). At 12–13 px weight 800 the letter counters may fill in; test on a real phone before adopting.
  - Bigger letters: at about 19 px bold or more, WCAG's 3:1 large-text level applies, though four colours still fail it.
- **APCA's view:** for 12–13 px labels it favours weight 700 over 800, and 16 px over 12–13 px. Switching the small tiles to weight 700, and to 14 px or more where layout allows, raises legibility under both methods.
- **Swatches:** their colour is arguably "essential" under 1.4.11, but W3C encourages a second cue. A 1 px border of at least 3:1, or showing the initials inside the swatch, would remove doubt. The selected-state ring already passes.
- **Same fix elsewhere:** apply the white-on-colour audit to the pay button and the verdict text. Using #17824a for both fixes them without changing the look much.

### Gaps
- No user-testing evidence was found specifically on legibility of two- or three-letter initials on coloured tiles. The standards' thresholds come from extended reading text, not short labels.
- The current APCA guidance for very short labels ("spot" versus "sub-fluent" text) is ambiguous for player initials. It is a judgement call that APCA's documents do not settle.
- Duolingo's own contrast practice for these colours was not checked.

## Key question 3: Colour-blindness — how many secondary-school boys are affected, and what it means for an eight-colour identity palette and green/red success and failure cues

### Takeaway
About 1 in 12 Irish schoolboys has a colour-vision deficiency: 8.3% in a random-schools Irish study, matching the roughly 8% seen in European men. Deutan types (4.8%) outnumber protan types (1.7%), and about 0.5–1.8% of girls are affected.

For PresLink's palette, simulation shows three pairs nearly merging for deuteranopes: pink with teal, purple with indigo, and green with orange. Red and green also lose most of their difference. With white letters at 4.5:1, eight tiles cannot be both vivid and fully distinct for colour-blind players. The workable answer is redundancy, which PresLink partly has already: the initials identify the player, and the game's hit/miss feedback uses lightness, text and sound as well as colour.

### Cited Findings
- **Ireland: Harrington, Davison & O'Dwyer (2021, Clinical and Experimental Optometry 104(1)).** The study tested 1,626 children from randomly selected schools in the Republic of Ireland (882 boys and 744 girls, aged 6–7 and 12–13) with the HRR 4th-edition test.
  - Boys: 8.3% had a deficiency (73 of 882; 95% CI 6.6–10.3). Deutan was most common at 4.8%, then protan at 1.7%.
  - Girls: 1.8% (13 of 744; 95% CI 1.0–3.1).
  - Traveller children: 21.0% of boys and 8.6% of girls, against about 7% of White non-Traveller boys and 1.0% of girls.
  - A ResearchGate snippet of the same study gives 8.12% of boys and 0.9% of girls, which conflicts with the abstract; prefer the journal figures.
  - A pooled meta-analysis is reported to give 5.29% for Ireland.

  [Strong — random sample; read from the PubMed abstract via search] — [PubMed 32285548](https://pubmed.ncbi.nlm.nih.gov/32285548/); [Taylor & Francis](https://www.tandfonline.com/doi/full/10.1111/cxo.13072); [ResearchGate record](https://www.researchgate.net/publication/340625193_Prevalence_of_colour_vision_deficiency_in_the_Republic_of_Ireland_schoolchildren_and_associated_socio-demographic_factors_Colour_vision_in_Ireland); [Ophthalmology Advisor, meta-analysis](https://www.ophthalmologyadvisor.com/news/congenital-color-vision-deficiency-in-children-vary-by-ethnicity/)
- **Europe: Birch 2012 (JOSA A 29(3):313–320).** Large random surveys put red-green deficiency at about 8% of European Caucasian men and 0.4% of women, and 4–6.5% of Chinese and Japanese men. This comes from a page that appears to reproduce the abstract and was not checked against the journal text. [Strong source, read second-hand] — [DOI 10.1364/JOSAA.29.000313](https://doi.org/10.1364/JOSAA.29.000313); [abstract reproduction](https://synapsesocial.com/papers/W1975246823)
- **Subtypes in men (older survey compilations):** deuteranomaly about 5%, protanomaly about 1%, protanopia about 1% and deuteranopia about 1%. So most affected boys are anomalous trichromats, with milder confusions, not dichromats. The colorspacious documentation likewise says about 5% of all men fall on the deuteranomaly spectrum and about 1% are fully deuteranopic or protanomalous. A Tehran survey of 500 boys found 5.2% in total. [Moderate — compilations of older classic surveys] — [Colblindor compilation](https://www.color-blindness.com/?p=143); [Colour Blind Awareness](https://www.colourblindawareness.org/?p=409); [colorspacious `cvd.py`](https://github.com/njsmith/colorspacious/blob/master/colorspacious/cvd.py); [Tehran school survey](https://www.magiran.com/paper/463248/?lang=en)
- **"One in every classroom".** The UK charity Colour Blind Awareness uses 1 in 12 boys and 1 in 200 girls, and estimates about 3 million colour-blind people in the UK, 450,000 of them schoolchildren. Its 2015 press release says teachers usually recall "one or two" colour-blind pupils, although statistically there has probably been one in every class. USWDS, citing NIH, uses 8% of men, 0.5% of women and about 4.5% of the population. [Practitioner/advocacy] — [Colour Blind Awareness campaign](https://www.colourblindawareness.org/about-us/campaigns/1ineveryclassroom/); [2015 press release](https://www.colourblindawareness.org/wp-content/uploads/2015/02/1ineveryclassroom-press-release-Final.pdf); [USWDS colour overview](https://designsystem.digital.gov/design-tokens/color/overview/)
- **Platform and game guidance.**
  - Apple's HIG says to "convey information with more than color alone". It warns that colour-blind people "may have particular difficulty with pairings such as red-green and blue-orange", and recommends "distinct shapes or icons, in addition to color".
  - Apple also suggests letting people "customize color schemes such as chart colors or game characters".
  - The Game Accessibility Guidelines include "Ensure no essential information is conveyed by a colour alone, reinforce with a symbol or offer a choice of alternative colours". A third-party checklist places it in the Basic tier; this was not confirmed on the official site.
  - The Xbox Accessibility Guidelines include XAG 103, "Additional channels for visual and audio cues" (current version 3.2, June 2023); its text was not retrieved.

  [Practitioner] — [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) (via [mirror](https://github.com/tmaasen/apple-dev-mcp)); [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/); [guideline reproduced (webbie)](https://www.webbie.org.uk/blog/tag/games/); [third-party tiering](https://abratabia.com/game-accessibility/accessibility-guidelines.php); [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/gaming/accessibility/guidelines). WCAG 1.4.1 was covered in the earlier notes (KQ1).
- **Simulating PresLink's eight tiles.** [Computed here; Machado et al. 2009 matrices verified against [colorspacious](https://github.com/njsmith/colorspacious/blob/master/colorspacious/cvd.py); CIEDE2000]

  | Vision type (share of men) | Closest pairs, ΔE00 under simulation (normal vision in brackets) |
  |---|---|
  | Normal vision | Purple–indigo is already the closest pair (12.5) |
  | Deuteranopia (~1%) | Pink–teal 1.5 (57.3); purple–indigo 3.2 (12.5); green–orange 3.6 (47.6); green–red 7.9 (75.8) |
  | Protanopia (~1%) | Purple–indigo 4.5; green–orange 7.1 |
  | Moderate deuteranomaly, severity 0.6 (most common type) | Purple–indigo 6.8; green–orange 11.9; orange–red 15.3 |
  | Tritanopia (rare) | Green–teal 5.7; sky blue–teal 6.0 |

  Under full deuteranopia the eight tiles reduce to roughly five distinguishable groups.
- **Red/green cues lose their difference; blue/orange keeps it.** [Computed here]
  - The site's green #1f9d5a and red #d93c3c differ in luminance by only 1.29:1. Under deuteranopia their ΔE00 falls to 8.5 (68.5 normally), and under moderate deuteranomaly to 20.6.
  - The Okabe-Ito blue #0072B2 against orange #E69F00 keeps ΔE00 at 55–63 under protan and deutan simulation, with a 2.30:1 luminance difference.
  - This conflicts with Apple's caution about blue-orange, which may refer to other shades or to tritan types.
- **A fully colour-blind-safe set of eight white-text tiles needs dark, muted colours.** [Computed here] Searching published Tailwind, Material and USWDS shades that pass 4.5:1 with white:
  - With no limit on vividness, the best set keeps every pair at ΔE00 of at least 15.1 under normal, deutan and protan vision. But it uses near-black tiles such as Tailwind red-950 #450a0a and amber-900 #78350f.
  - With a vividness limit (OKLCH chroma at least 0.12, lightness at least 0.42), the best set reaches a worst case of 8.1. The current palette's worst case is 1.5. A straightforward Tailwind set (green-700, sky-700, violet-600, orange-700, red-600, pink-700, teal-700, indigo-600) reaches only 1.2, because violet-600 and indigo-600 merge under protanopia.
  - The vivid best set, one shade per current hue family: green USWDS green-cool-50v #008817 (4.63:1); sky Material Light Blue 800 #0277BD (4.80:1); purple Tailwind fuchsia-800 #86198f (8.24:1); orange USWDS orange-warm-50v #cf4900 (4.56:1); red Tailwind red-800 #991b1b (8.31:1); pink Tailwind pink-800 #9d174d (7.88:1); teal USWDS mint-50v #008659 (4.61:1); indigo Tailwind blue-700 #1d4ed8 (6.70:1).
  - Its weakest deutan pairs are green–orange 8.1, pink–teal 8.4 and sky–indigo 8.4, and tritan green–teal is 2.1. It works by alternating mid tiles (about 4.6:1) with deep tiles (about 8:1), so the lightness differences survive colour-blindness.

### Inferences
- **Expected numbers** [Computed here, from 8.3% of boys]:
  - In a mixed class of 30 with 15 boys, expect about 1.2 colour-blind boys, and a 73% chance of at least one.
  - In an all-boys class of 30 the chance of at least one is about 93%.
  - A school with 400 boys has about 33. Add roughly 8% of the male teachers and fathers who play.
  - Of the boys whose type was classified, about three in four were deutan (4.8% against 1.7%). The remaining 1.8 percentage points were not typed in the abstract.
- **The identity palette is acceptable as it is**, because the initials, the "You" tag and the highlighted row carry identity; colour is a secondary cue. That satisfies WCAG 1.4.1 (earlier notes, KQ1). PresLink should avoid features that rely on colour alone: "find your colour", colour-only teams, or prize eligibility shown by tile colour.
- **If colour is to work as a real secondary cue**, the vivid best set above, or simply making purple and indigo, and pink and teal, differ more in lightness, is better than the current palette. No eight-colour set with white letters will be perfect for dichromats.
- **Success and failure in the timing game:** keep the current design. A hit is a green marker plus ring animation plus "Perfect"/"So close" text plus a sound; a miss is a white marker plus grey text. The hit/miss difference is mainly lightness and wording, which survive colour-blindness.
  - Do not add a red-versus-green-only cue, such as a red marker for a miss.
  - If a second colour is wanted, use blue against orange with an icon (tick and cross) or a label.
  - Avoid red flashes on a miss (WCAG 2.3.1; earlier notes, KQ5).
- **Apple's suggestion to let players customise character colours** turns PresLink's colour picker into an accessibility feature as well as a personalisation one, provided the swatches include clearly different light and dark options.

### Gaps
- The Irish study's split between dichromats and anomalous trichromats was not retrieved, and girls' prevalence (1.8%) is unusually high next to the European 0.4–0.5%. The full text should be checked.
- No study was found on how colour-blind players actually use player-chosen colour identities in games, or on how much colour-only confusions cost in a leaderboard.
- The text of XAG 103 and the official Game Accessibility Guidelines tier were not confirmed.
- The ΔE00 comparisons are simulations of typical observers; individual colour-blind people vary.

## Key question 4: Player-chosen identity colours — evidence on personalisation, choice and ownership effects on engagement

### Takeaway
There is consistent evidence that choice and customisation raise intrinsic motivation and play time:

- a 41-study meta-analysis of choice;
- self-determination-theory (SDT) studies of games;
- avatar-customisation experiments.

Choices that do not affect the task ("instructionally irrelevant"), like a tile colour, produced the strongest motivation effects in that meta-analysis. However, every game study found used richer customisation than picking one of eight colours, so the effect of PresLink's colour choice is plausibly real but small and untested. The IKEA effect is the wrong frame: it needs effortful, completed creation.

### Cited Findings
- **Patall, Cooper & Robinson 2008 (Psychological Bulletin 134(2):270–300).** A meta-analysis of 41 studies with child and adult samples:
  - Choice raised intrinsic motivation, effort, task performance and perceived competence.
  - Choice had its strongest effect on intrinsic motivation when the choices were "instructionally irrelevant".
  - The effect was also stronger with "2 to 4 successive choices" (the exact definition was not checked), when no reward followed the choice, and for children than adults.

  Effect sizes were not retrieved. Published 2008, just before the 2010 cut-off. [Strong — meta-analysis; abstract and summaries] — [PubMed 18298272](https://pubmed.ncbi.nlm.nih.gov/18298272/); [full-text PDF](https://selfdeterminationtheory.org/wp-content/uploads/2019/10/2008_PatallCooperRobinson_PsychBulletin.pdf)
- **Cordova & Lepper 1996 (Journal of Educational Psychology 88(4):715–730), an older classic.** "Intrinsic motivation and the process of learning: beneficial effects of contextualization, personalization, and choice." The study used an educational computer game in which children could personalise and choose incidental features. The title states the direction of the result; the numbers were not retrieved. [Moderate] — [Kellogg record](https://www.kellogg.northwestern.edu/academics-research/research/detail/1996/intrinsic-motivation-and-the-process-of-learning-beneficial-effects)
- **Ryan, Rigby & Przybylski 2006 (Motivation and Emotion 30:347–363), an older classic.** Across four studies, perceived autonomy, competence and relatedness in games independently predicted enjoyment and future play. Autonomy and competence also related to well-being changes and immersion. [Strong for the SDT framework in games] — [Essex repository](https://repository.essex.ac.uk/7228/); [ScienceDaily 2006](https://www.sciencedaily.com/releases/2006/12/061226134706.htm)
- **Birk, Atkins, Bowey & Mandryk 2016 (CHI, pp. 2982–2995).** Players either created an avatar (appearance, personality and attributes) or used a premade one in an infinite-runner game. Customising increased identification with the avatar, which raised autonomy, immersion, invested effort, enjoyment, positive affect and time spent playing. The exact figures were not retrieved. [Moderate — one experiment, read via citing papers] — [DOI 10.1145/2858036.2858062](https://doi.org/10.1145/2858036.2858062); [summary in arXiv 2202.05315](https://arxiv.org/pdf/2202.05315); [review, PMC6329434](https://pmc.ncbi.nlm.nih.gov/articles/PMC6329434)
- **Birk & Mandryk 2018 (CHI) and 2019 (JMIR).** "Combating attrition in digital self-improvement programs using avatar customization". The 2019 follow-up concludes avatar customisation "is a viable strategy to increase engagement and subsequently training efficacy" in a computerised cognitive task. Attrition figures were not retrieved. [Moderate] — [DOI 10.1145/3173574.3174234](https://doi.org/10.1145/3173574.3174234); [JMIR 2019](https://jmir.org/2019/1/e10133)
- **Turkay & Kinzer (2014/2015).** In a mixed-methods study, 66 participants played Lord of the Rings Online for about 10 hours over two weeks. Both time and avatar customisation increased identification with the avatar, and the effects lasted across sessions. [Moderate] — [IRMA chapter](https://www.irma-international.org/chapter/the-effects-of-avatar-based-customization-on-player-identification/126061); [DiGRA paper citing it](https://dl.digra.org/index.php/dl/article/download/2809/2793/2852)
- **The IKEA effect's boundary condition.** In Norton, Mochon & Ariely (2012, Journal of Consumer Psychology 22(3):453–460), people valued things they built (IKEA boxes, origami, Lego) more, but "labor leads to love only when labor results in successful completion of tasks". Building and then destroying, or not finishing, removed the effect. [Moderate — four studies] — [Harvard DASH](https://dash.harvard.edu/handle/1/12136084); [Duke record](https://scholars.duke.edu/publication/861385)
- **Platform view.** Apple's HIG lists letting people "customize color schemes such as chart colors or game characters" as a way to make an interface comfortable for colour-blind people. [Practitioner] — [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) (via [mirror](https://github.com/tmaasen/apple-dev-mcp))

### Inferences
- **The colour picker is a low-cost autonomy cue that fits SDT and Patall's finding.** Expect a small effect: it is one choice from eight options, far less than avatar creation, and no study isolates it.
- **To get whatever identification benefit exists:**
  - show the chosen colour wherever the player appears (leaderboard rows, results, prize leads, the big "You" tile);
  - let players change it at any time;
  - keep the automatic default derived from initials, which the code already does.
- **Do not frame the colour pick as earning ownership** (IKEA effect) or tie it to payment. Patall found choice works best with no reward attached, and for a charity game aimed at under-18s, nudging spending through personalisation would be hard to defend. (This is an inference, not a cited rule.)
- **Combine with Key question 3:** offer an accessible palette whose eight options differ in lightness as well as hue, so the picker serves both personalisation and colour-blind comfort.

### Gaps
- No study was found on choosing a single colour, badge or token (as opposed to full avatar creation) and its effect on engagement.
- No study was found on teenagers specifically, or on charity or donation contexts.
- The "mere ownership" and endowment literature was not searched.
- Effect sizes for Patall's moderators and Birk et al.'s play-time difference were not retrieved.

## Key question 5: Playful, brightly coloured styling versus trust and perceived professionalism, for teenagers, teachers and parents, especially on pages that take payments

### Takeaway
No study tests "bright and playful" against "plain" for teachers or parents, and the earlier notes' main gap remains. The adjacent evidence points the same way:

- Trust and usability judgements are driven by overall visual appeal, which depends more on structure and simplicity than on hue (Lindgaard 2011; Seckler 2015).
- Charity-site design builds donation intention through perceived consistency, warmth and competence (Kwak 2023).
- Payment trust is decided at the card-entry step, by visual "robustness" and reassurance cues (Baymard: 19% of US shoppers abandoned a checkout over card-trust in the previous three months).
- Teens want sites that are "simple, but not childish" (NN/g 2005).

Bright colour is therefore compatible with trust if the layout is simple and consistent, the tone is not babyish, and the €2 payment step looks sturdy and familiar.

### Cited Findings
- **Appeal drives trust and usability judgements.** In Lindgaard et al. 2011, all three judgements (appeal, trust, usability) were "largely driven by visual appeal" but rely on partly different visual attributes. [Moderate] — [DOI 10.1145/1959022.1959023](https://doi.org/10.1145/1959022.1959023)
- **Structure matters more than colour for aesthetics.** In Seckler et al. 2015, high symmetry and low complexity, with blue hue, medium brightness and medium-to-high saturation, scored highest; structural factors had more impact than colour. [Moderate] — [University of Basel repository](https://edoc.unibas.ch/29197)
- **Who prefers colour.** In Reinecke & Gajos 2014, women preferred more colourful sites and higher education lowered the preference. Secondary sources say over-40s preferred more colour and over-45s lower complexity (unverified; see Key question 1). Cyr et al. 2010 found colour appeal significantly predicted trust and satisfaction, with cultural differences. [Strong for the abstract; Moderate for Cyr] — [Reinecke & Gajos 2014](https://eecs.harvard.edu/~kgajos/papers/2014/reinecke14visual.shtml); [Cyr et al. record](https://experts.mcmaster.ca/scholarly-works/58866)
- **Teens perform better with an attractive design.** In Sonderegger & Sauer 2010, 14–17-year-olds were faster on, and rated as more usable, the attractive version of a functionally identical phone. [Moderate] — [University of Fribourg PDF](https://sonar.ch/documents/302271/files/Sonderegger_Sauer2010.pdf)
- **Charity websites.** Kwak et al. 2023 (Internet Research 33(3):994–1014) ran a 2 (appeal quality) × 3 (image type) lab experiment with 217 participants. Appeal quality and human images increased perceived design consistency, which raised the site's perceived warmth and competence and so the intention to donate through it. [Moderate; abstract] — [Emerald](https://www.emerald.com/insight/content/doi/10.1108/intr-11-2021-0847/full/html)
- **Charity websites: aesthetics versus trust in the organisation.** A two-study 2020 conference paper (N = 2,525) found that for donating one's own money, "the perceived content and trust in the organization showed the greatest influence", whereas for donating other people's money "the aesthetics of the website was the most important factor". The venue and details were not checked. [Weak to moderate] — [GI Digital Library](https://dl.gi.de/handle/20.500.12116/34268)
- **Payment trust (Baymard).**
  - In Baymard's latest checkout study (1,026 US adults, 2025), 19% had abandoned a checkout in the past three months because they did not trust the site with their card details. This reaffirms its 2009 and 2012 results.
  - Parts of a checkout with "trust badges, reassuring microcopy and a general visual 'robustness'" are perceived as more secure, even on the same form.
  - "Credit card interfaces with unique visual styling can feel more trustworthy."
  - Concern "kicks in" at the card fields, not at address or shipping steps.
  - A European retailer's blog warns that the sample is American.

  [Moderate; read via search extracts of Baymard's article] — [Baymard, perceived security of payment form](https://baymard.com/blog/perceived-security-of-payment-form); [Multichannel Merchant](https://multichannelmerchant.com/ecommerce/nearly-one-fifth-consumers-dont-trust-ecommerce-sites-cc-info); [MSLogic caveat](https://mslogic.gr/en/blog/egkataleipsi-kalathiou/)
- **Teenagers (NN/g).**
  - CNN's account of NN/g's 2005 teen study concluded that sites must be "simple, but not childish", with plenty of interactive features.
  - Teens disliked glitzy, blinking graphics.
  - The 2005 article has a section headed "Don't Talk Down to Teens".
  - The current NN/g report (third edition, ages 13–17) has 124 guidelines and stresses lower reading levels and impatience.
  - The exact word "childish" was not confirmed on NN/g's own page.

  [Moderate — older classic study plus current report summary] — [NN/g Alertbox 2005](https://www.nngroup.com/alertbox/20050131.html); [NN/g article](https://www.nngroup.com/articles/usability-of-websites-for-teenagers/); [CNN 2005](https://money.cnn.com/2005/01/31/technology/personaltech/Teenstudy/index.htm); [NN/g teen report](https://www.nngroup.com/reports/teenagers-on-the-web/)
- **Muted versus bright for older children.** In an informal test, all but one of the 9–11-year-olds preferred the more muted palette, and some said it felt more mature. [Weak — informal practitioner test] — [Lullabot](https://lullabot.com/articles/ux-kids-personal-journey)

### Inferences
- **Keep the bright, flat tiles and the arcade feel**, but put the effort into what the evidence ties to trust: low complexity, a consistent identity (the charity's name, logo and colours repeated across screens), clear tappable controls and an adult, plain-spoken tone. Avoid mascot-heavy, babyish illustration and blinking effects; those are what teens dislike.
- **On the €2 step, make the payment area look sturdier and calmer than the game.** Use a solid white panel, a clearly boxed card or wallet area, recognised payment marks, the charity's name, and short reassuring copy ("€2 goes to …; secure payment by …"). This follows Baymard's "robustness" finding; colour itself is not the trust lever.
- **Fix the "Play · €2" button contrast.** It is 3.48:1; #17824a gives 4.85:1 (Key question 2). It is the most-used call to action and the payment trigger, and it should pass WCAG AA.
- **For teachers and parents**, nothing found suggests bright colour lowers perceived professionalism, and secondary evidence suggests older adults like colour but dislike complexity. Test with five to eight adults (a heuristic, not a cited rule) by asking them to rate "would you trust this with €2 for a charity?" on the actual screens.

### Gaps
- No study was found on teachers' or parents' perception of gamified or brightly coloured charity or school-fundraising pages.
- No study was found comparing playful and conservative styling on payment conversion.
- Baymard's data are US adults; no Irish or teen-specific payment-trust data were found.
- Burt & Dunham 2009 (aid-agency web-page design and trust), cited in fundraising literature, could not be located.

## Key question 6: Dark mode, reduced motion and system preferences — what share of users enable them, and what is recommended for games?

### Takeaway
No authoritative population figure exists. The best measured data point is one university library's analytics, where about 38% of visitors had OS-level dark mode. Enthusiast polls (70–82%) overstate it. Reduce Motion is a low single-digit percentage in the only figures found (about 3.5%, source unclear). On the supply side, about half of websites now include a `prefers-reduced-motion` rule but only about 13% a `prefers-color-scheme` rule.

For games the guidance converges:

- honour Reduce Motion by cutting zooming, scaling and peripheral motion, not by removing the core play motion;
- check contrast in both appearances if dark mode is offered;
- on dark surfaces, use desaturated colours rather than saturated brights.

Light mode remains better for reading, per the earlier notes.

### Cited Findings
- **Dark-mode share (measured).** NC State University Libraries' web analytics found "about 38% of our users have dark mode enabled in their operating system", which led them to build a dark scheme. In their user research, 10 of 16 participants used dark mode always and 4 sometimes. This is a single site with a US university audience. [Moderate — real analytics, narrow audience] — [NCSU Libraries, "Implementing dark mode"](https://www.lib.ncsu.edu/node/68686)
- **Dark mode and Reduce Motion (single talk, source unclear).** An A11y Bytes talk (Allison Ravenhall, May 2023) reported dark mode 36.97%, Reduce Motion 3.52% and Reduce Transparency 2.64%, without a stated data source. TelemetryDeck's documentation shows an illustrative sample (Bold Text 3.31%, Reduce Motion 0%, XXXL text 6.61%, 88.43% at the default text size), not a benchmark. [Weak] — [Ravenhall slides](https://noti.st/allisonravenhall/g5pGSf/present); [TelemetryDeck metrics docs](https://telemetrydeck.com/docs/basics/metrics/); [TelemetryDeck announcement](https://telemetrydeck.com/blog/introducing-accessibility-insights/)
- **Self-selected polls overstate dark-mode use.** Android Authority reader polls found 81.9% using dark mode (2020) and 2,280 of 3,110 votes for "always on" (2026). A 2026 study of 215 young users recruited in Vietnam (mean age 24.3) found about 68% preferring dark mode overall. A July 2026 survey of 809 apps found only 19% with a dark-mode or theme toggle. [Weak] — [Android Authority 2026](https://www.androidauthority.com/dark-mode-survey-results-3682352/); [Android Authority 2020](https://www.androidauthority.com/dark-mode-poll-results-1090716); [Gadget Hacks on the 2026 study](https://android.gadgethacks.com/news/dark-mode-vs-light-mode-what-research-says-about-when-each-works-best/); [Lazyweb research](https://lazylanding-labs.onrender.com/research/what-percent-of-apps-have-a-dark-mode-toggle.md)
- **Supply side (Web Almanac).**
  - `prefers-reduced-motion` appears on 34% of mobile sites in 2022, 50% in 2024, and 50.55% of mobile and 49.99% of desktop pages in 2025.
  - `prefers-color-scheme` appears on 8% in 2022, 12% in 2024 and about 13% in 2025.
  - `forced-colors` reached about 19% of mobile pages in 2025; `prefers-contrast` about 1%.

  [Strong — large crawl] — [Web Almanac 2022](https://almanac.httparchive.org/en/2022/accessibility); [2024](https://almanac.httparchive.org/en/2024/accessibility); [2025](https://almanac.httparchive.org/en/2025/accessibility)
- **Apple's guidance for apps and games.**
  - When Reduce Motion is on, "ensure your app or game responds by reducing automatic and repetitive animations, including zooming, scaling, and peripheral motion". Further practices are "tightening animation springs to reduce bounce effects", "tracking animations directly with people's gestures" and avoiding animating depth changes.
  - "If your app supports Dark Mode, make sure to check the minimum contrast in both light and dark appearances."
  - For custom colours, "supply light and dark variants, and an increased contrast option for each".
  - High contrast "can also cause visual discomfort if people's eyes have adjusted to low light or darkness".

  [Practitioner] — [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility); [Apple HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color) (both via [mirror](https://github.com/tmaasen/apple-dev-mcp))
- **Material's dark theme.**
  - Benefits: "improved battery power conservation for devices with OLED screens; reduced eye strain; and better visibility in low-light environments"; Android 10 (Q) added a system setting.
  - Material 2 advises that saturated colours "can visually vibrate against dark backgrounds" and recommends desaturated colours instead (the 200 tone of the primary colour).
  - The base surface is #121212, with text at 15.8:1 against it so that body text still passes 4.5:1 on the lightest elevated surface.

  [Practitioner — platform guidance; Material 2 page read via search extract] — [material-components-android Dark.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Dark.md); [Material 2 dark theme](https://m2.material.io/design/color/dark-theme); [Material dark-theme codelab](https://codelabs.developers.google.com/codelabs/design-material-darktheme/)
- **Battery.** At the 2018 Android Dev Summit, Google showed that YouTube's dark mode used about 60% less display power at full brightness on the original Pixel's OLED screen; the saving shrinks at lower brightness. This was not checked against Google's own slides. [Weak to moderate, second-hand] — [OLED-Info](https://oled-info.com/google-details-oled-power-consumption-shows-how-androids-dark-mode-can-help-extend-your-battery-life)
- **Already covered in the earlier notes (KQ3 and KQ5):** light polarity (dark text on light) is better for reading with normal vision, and the advantage grows as text gets smaller. Over 35% of adults have experienced vestibular dysfunction by age 40. WCAG 2.3.3 and `prefers-reduced-motion` guidance, and the 100–500 ms motion durations, are also there.

### Inferences
- **Plan on roughly a third of phone visitors running OS dark mode** (weak evidence; PresLink's audience is younger and plays in the evening, so possibly more). Plan on a few percent with Reduce Motion, who matter more, because motion can make them ill.
- **Dark mode is optional for PresLink.** If added via `prefers-color-scheme`:
  - The tile-letter contrast does not change, because it is white on the tile colour.
  - Saturated green and orange text accents (verdict text, links) would need lighter, desaturated variants on #121212.
  - Body text should stay at about 15:1 or more.
  - Keep light mode as the default for rules and prize text.
- **Reduced motion in the game.** The moving timing marker is the game itself, so it should stay; the earlier notes cover WCAG 2.3.3's exception for essential motion. Celebratory scaling should be cut under Reduce Motion, per Apple. A code check found that the hit-ring scale animation (`.marker.hit::after`, `hitring`, scale 0.8 to 1.8) and the best-score `bump` (scale 1.18) are not in the existing reduced-motion rules (`styles.css` lines 52, 221, 292, 569), though many other animations are.
- **Measure PresLink's own audience.** Log `matchMedia('(prefers-color-scheme: dark)')` and `prefers-reduced-motion` as anonymous aggregate shares; the only reliable figure is one taken from PresLink's own users. This is an inference, consistent with the vendor advice above.

### Gaps
- No representative population data were found for dark-mode or Reduce Motion use in Ireland, the EU or teenagers. Apple and Google publish no telemetry, and the 3.52% figure has no stated source.
- No game-specific study was found on dark mode and player experience.
- The Material 3 equivalents of the Material 2 dark-theme numbers (#121212, 15.8:1, 200 tones) were not checked.
- Google's 2018 battery figures were not checked against Google's own material.
