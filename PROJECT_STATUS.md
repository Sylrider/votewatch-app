# WatchGov - PROJECT STATUS (Shared Source of Truth)

>  **MANDATORY PROTOCOL FOR EVERY CLAUDE SESSION (Chrome extension, Desktop, web - all of them):**
>
> 1. **BEFORE doing ANY work on WatchGov:** read this entire file from the repo first.
>    (`github.com/Sylrider/votewatch-app`  `PROJECT_STATUS.md`). Do not act on stale
>    memory - this file is the only current truth.
> 2. **AFTER doing ANY work:** update this file - tick items in Sec.12, add a dated line to
>    the Sec.13 changelog, update the "Last updated" stamp - and commit/push it to the repo
>    so the next session sees it.
> 3. If you cannot read or update the repo in this session, say so to the user explicitly
>    and ask them to carry the update across.
>
> **Purpose:** WatchGov is worked on by multiple SEPARATE Claude sessions that DO NOT share
> memory. This file is the bridge. The repo is the shared state; this file is the memory.
> Read first, write last, every time.
>
> Last updated: 2026-06-02 - by: chrome ext (lawsuits via CourtListener v4 + small-batch rollout)

---

## 1. WHAT THIS IS
A nonpartisan U.S. political transparency website. Each elected official gets a profile
showing votes, lobbying money received (with the lobby's intent), stock trades (conflict-
flagged), lawsuits/ethics issues, an "Independent View" summary, and a 0-100 Transparency
Risk Score. Each lobby gets a page (mission, key positions, funded politicians).

- **Live at:** https://watchgov.org (also votewatch-app.pages.dev)
- **Host:** Cloudflare Pages - auto-deploys on every push via Cloudflare's NATIVE GitHub
  integration (NOT the GitHub Actions workflow - see Sec.6).
- **Repo:** github.com/Sylrider/votewatch-app (PUBLIC; repo name stays votewatch-app)
- **Stack:** Next.js (static export `output:'export'`), Tailwind, dark theme.
- **Brand:** "WatchGov" (logo: Watch + Gov). Rebranded from "VoteWatch".

---

## 2. CURRENT STATE (what's done vs not)
- [x] Site built, deployed, live at watchgov.org on custom domain
- [x] All pages working: home, politician profile, lobbies list, lobby page, methodology
- [x] 9 lobbies seeded (see S4)
- [x] GitHub secrets set: CONGRESS_API_KEY, FEC_API_KEY, NEXT_PUBLIC_SITE_URL
- [x] deploy.yml FIXED & pipeline now RUNS end-to-end on the Actions runner
- [x] FEC integration FIXED: name matching, state->2-letter code, /totals endpoint
- [x] Dead Stock Watcher sources made NON-FATAL (no longer crash pipeline)
- [x] data/politicians.json committed (229 records); lawsuits source rewritten (CourtListener v4)
- [~] Lawsuits/votes/stocks populated ONLY for showcase profiles (Pelosi, Trump) - rolling out in small batches
- [ ] Composite Transparency Risk Scores still 0 -> need Option B (donor->lobby) data
- [ ] CLOUDFLARE secrets NOT set (not required; Cloudflare auto-deploys on commit)

---

## 3. THE GOAL ROSTER (~900-950 officials, 5 categories)
The `chamber` field is one of: Executive | Senate | House | Governor | Mayor.
Home page already has filter tabs for each.

| Chamber    | Count   | Data source                                              |
|---|---|---|
| Executive  | ~handful| President, VP, Cabinet - manual + FEC for federal money   |
| Senate     | 100     | FULLY automatable via federal APIs                        |
| House      | 435     | FULLY automatable via federal APIs                        |
| Governor   | 50      | NO unified free API - hand-curate / per-state portals     |
| Mayor      | ~335    | Mayors of cities >100k pop. NO free API - hand-curate     |

**Key nuance:** Free APIs only fully cover FEDERAL officials (Executive/Senate/House).
Governors & mayors have no unified free data source - port from the earlier hand-built
dataset (the original "us-transparency" React build had ~310 mayors + senators/reps/govs)
and supplement manually. Non-federal officials use a MODIFIED score (no congressional
vote-alignment component - they have no roll-call record).

---

## 4. THE 9 SEED LOBBIES (in data/lobbies.json)
IDs: `nra`, `pharma`, `api` (oil/gas), `uscc` (US Chamber of Commerce), `aipac`,
`finance` (Wall St), `defense`, `labor` (AFL-CIO), `nea` (teachers).
The pipeline maps FEC industry/PAC codes  these IDs to link politicians  lobbies.

---

## 5. APIS - WHAT & HOW
1. **Congress.gov** - Senate+House only. Key `CONGRESS_API_KEY`. Base
   `https://api.congress.gov/v3/`. Endpoints: `/member`, `/member/{id}`,
   `/member/{id}/sponsored-legislation`, committees, votes. Append `?api_key=`. ~5k/hr.
    identity, party, state, chamber, committees, bills, votes.
2. **FEC / OpenFEC** - federal campaign money. Key `FEC_API_KEY` (api.data.gov). Base
   `https://api.open.fec.gov/v1/`. Endpoints: `/candidates/search`,
   `/candidate/{id}/totals`, `/schedules/schedule_a`, `/committee/{id}`. ~1k/hr - CACHE.
    feeds lobbyScore; links donors to lobby IDs.
3. **Senate/House Stock Watcher** - Congress only. No key. Full JSON at
   senatestockwatcher.com & housestockwatcher.com.  feeds stockScore + conflict flags.
4. **CourtListener** - lawsuits, federal + state. No key (optional token). Base
   `https://www.courtlistener.com/api/rest/v4/`, `/search/?q={name}`.  feeds legalScore.
5. **OpenSecrets** - SKIP v1 (paid/application). Approximate lobby intent from FEC codes.

**API VERIFICATION STATUS (2026-05-30):**
- Congress.gov (CONGRESS_API_KEY): VERIFIED via live pipeline run (50+ members fetched). Direct keyed test deferred - key value handled by user only.
- FEC / OpenFEC (FEC_API_KEY): VERIFIED via live pipeline run (real finance totals, e.g. Wicker $717K). Direct keyed test deferred - key handled by user only. Rate limit ~1000/hr.
- Senate Stock Watcher (no key): FAIL - S3 bucket AccessDenied at /aggregate/ and /data/. Source offline/moved; pipeline non-fatal (no SENATE_TRADES_URL).
- House Stock Watcher (no key): FAIL - S3 bucket AccessDenied. Source offline/moved; pipeline non-fatal (no HOUSE_TRADES_URL).
- CourtListener v4 (no key): PASS - HTTP 200, search returns results (count 6708 for Elizabeth Warren). No token required.
- Smoke test (one full senator record): PASS - Elizabeth Warren written with merged identity+image+lobbyMoney+stockTrades+lawsuits+votes+score; profileComplete true. Empty arrays = genuinely-unavailable data, not fabrication.

Pipeline per federal politician: Congress.gov (identity+votes)  FEC (money) 
Stock Watchers (trades)  CourtListener (lawsuits)  map donors to lobbies  compute
score  write record to `data/politicians.json`.

**Constraint:** pipeline MUST run where there's internet + keys (GitHub Actions
workflow_dispatch, or local Node). It CANNOT run in a no-network sandbox.

---

## 6. GITHUB ACTIONS PIPELINE - FIXED & RUNNING (2026-05-30)
The .github/workflows/deploy.yml now runs the data pipeline end-to-end. Fixes applied:
1. deploy.yml: moved workflow_dispatch to top-level trigger (was nested under schedule),
   made it pipeline-only, added permissions: contents: write, commit on all triggers.
2. trades.ts (fc9ac31): Stock Watcher domains are DEAD (NXDOMAIN). fetchSenateTrades/
   fetchHouseTrades now wrapped in try/catch -> return [] + warn. Non-fatal.
3. fec.ts findCandidateId (961121a): added name normalization + console.warn on every
   failure path (was silently catching -> all scores 0 with no clue why).
4. fec.ts state bug (7c81b6c): FEC /candidates/search needs 2-letter state ('MD' not
   'Maryland'). Added STATE_CODES map + toStateCode() helper.
5. fec.ts finance (50b640f): removed broken /schedules/schedule_b call (HTTP 422, wrong
   endpoint anyway). Now uses /candidate/{id}/totals for totalReceipts. topDonors:[] for now.

**Status:** Pipeline RUNS clean (finFailCount 0, only genuine no-match candidates warn).
BUT data/politicians.json is NOT yet committed - both full runs were cancelled before
the 'Commit refreshed data' step. Next full run must be allowed to COMPLETE so it commits.
**FEC quirks for Option B:** /schedules/schedule_a needs a committee_id (cannot query by
candidate_id alone). Rate limit ~1000/hr. Plan: candidate -> principal committee -> schedule_a.

---

## 7. TRANSPARENCY RISK SCORE (0-100)
`Total = min(100, lobbyScore + alignScore + stockScore + legalScore)`
- moneyScore (replaces lobbyScore) = REAL FEC funding driven:
  base = min(20, (largeItemized + PAC) / 100,000 * 0.8), then weighted by a bigMoneyShare
  multiplier (~0.6x grassroots up to ~1.25x big-money). High large-donor/PAC reliance raises
  risk; a grassroots small-donor base lowers it. Falls back to tracked lobby contributions
  when no FEC funding profile is available. totalMoney now reports REAL total raised (receipts).
- alignScore = (donorAlignedVotes / totalVotes) x 35   [SKIP for non-federal; reweight]
- stockScore = min(25, conflictTrades x 5 + (10 if any single trade >= $500K))
- legalScore = min(15, Sum severity: high=7, medium=4, low=1)

Bands: CRITICAL 75-100 (#ef4444) - HIGH 50-74 (#f97316) - ELEVATED 25-49 (#eab308) -
LOW 0-24 (#22c55e).
Disclaimer (must appear on methodology page + near scores): a high score flags where money
and power statistically overlap; it does NOT assert illegal activity.

---

## 8. DATA SHAPES
**politicians.json record:**
```
{ id, name, title, party, state, chamber, since, committees:[...],
  lobbyMoney:[{lobbyId, amount, intent}],
  stockTrades:[{ticker, date, amount, conflictFlag, note}],
  votes:[{bill, position, donorAligned}],
  lawsuits:[{title, severity, year, summary}],
  score:{total, lobbyScore, alignScore, stockScore, legalScore, totalMoney, conflictTrades},
  summary, profileComplete:true }
```
**lobbies.json record:**
```
{ id, name, shortName, category, color, founded, mission, keyPositions:[...], annualSpend }
```

---

## 9. CRITICAL TECH RULES (these caused past build failures - DO NOT REPEAT)
- `lib/data.ts` uses Node `fs` = SERVER ONLY. Never import into a `'use client'` component.
- Pure helpers (fmtMoney, partyColor, partyShort, riskLabel) live in `lib/utils.ts` =
  client-safe. Client components import from utils, never from data.
- No event handlers (onClick/onMouseEnter) in server components - use CSS hover.
- tsconfig.json needs `"target":"es2017"`, `"downlevelIteration":true`,
  `"exclude":["node_modules","scripts"]`.
- Workflow: `npm install` not `npm ci`; `workflow_dispatch:` at top level of `on:`.

---

## 10. PAGES
- `app/page.tsx` - hero + stats + searchable/filterable grid (client: components/PoliticianGrid.tsx)
- `app/politicians/[slug]/page.tsx` - full profile, generateStaticParams from JSON
- `app/lobbies/page.tsx` + `app/lobbies/[slug]/page.tsx` - lobby list + detail
- `app/methodology/page.tsx` - score formula, bands, sources, disclaimer

---

## 11. ENVIRONMENT / WHO CAN DO WHAT
- **Main chat session (no network):** can write/fix code, generate JSON from knowledge
  (must verify via web search), produce ZIPs. CANNOT call live APIs or run the pipeline.
- **Claude-in-Chrome extension:** can drive the browser - edit files on GitHub, click
  "Run workflow", navigate Cloudflare. Subject to tab-connection quirks.
- **User (Sylrider):** non-technical, Mac, Chrome, uses GitHub Desktop. Does commits,
  enters API keys/secrets, makes purchases, anything requiring credentials.
- No session can enter the user's passwords/payment or run pipelines in a sandbox.

---

## 12. NEXT STEPS (priority order)
1. [x] Fix & commit corrected deploy.yml (pipeline-only, workflow_dispatch, npm install)
2. [x] Trigger Run workflow -> pipeline runs clean for ~540 federal officials
3. [ ] OPTION A FINISH: run pipeline to COMPLETION (do not cancel) so it commits
       data/politicians.json. Verify a sample (e.g. Booker S4NJ00185) has real totalReceipts.
4. [~] OPTION B (DONE - code): buildLobbyContributions now resolves principal committee,
       donor mapping in fec.ts; populate topDonors + lobby contributions; compute real scores.
5. [ ] Port hand-built Governor + Mayor dataset into JSON (non-federal, no API).
6. [ ] Verify all non-API figures against real public sources (no fabricated numbers).
7. [ ] Confirm scores compute + all ~950 pages generate; check live site.
8. [x] Finance-model redesign DONE (FundingProfile, big-money share, viewSummary, score recompute,
   detail-page Campaign Finance section). Running force slices to refresh dataset.
9. [ ] Commit executive-branch seed (President/VP/Cabinet/agency heads) with chamber=Executive guard.
10. [ ] Add OpenSecrets secondary-source verification + confidence flags for finance/lawsuits/trades.

---

## 13. CHANGELOG (each session: add a dated line here after doing work)

- 2026-06-02 (chrome ext): FINANCE-MODEL REDESIGN. Root-caused lobby-money undercount (LOBBY_MAP 15-cat
  slice, single cycle) and the "scores don't reflect reality" problem. Added FundingProfile to types.ts (6cd12c6);
  new fetchFundingProfile() in fec.ts (4005602) using FEC /candidate/{id}/totals  real totalRaised, large
  itemized (big donors), small unitemized (grassroots), PAC/party/transfers, and bigMoneyShare; picks most-recent
  reporting period; returns available:false (NOT $0) when no committee. Wired funding + per-politician viewSummary
  into pipeline.ts (5f13f13). Rewrote score.ts money component  calcMoneyScore driven by big-money share (b91691e):
  high large/PAC share = higher risk, grassroots = lower. Added Campaign Finance section + relabel to detail page
  (9e6de96). Added FORCE_REPROCESS workflow input to refresh existing officials (c7d7257). Verified real FEC numbers:
  Pelosi $2.43M raised / 40% big-money / 58% grassroots (2026 cycle); McConnell $7.88M / 76% big-money / 18% small;
  Tuberville $3.99M / 71% / 28%. Triggered force slice run 26792938549 (start=0,count=50). NOTE: prior full-roster
  runs failed at the 90-min timeout - now mitigated by --start/--count slicing (count default 50).
- 2026-05-30: API verification checklist run - CourtListener PASS; Senate/House Stock Watcher FAIL (S3 AccessDenied, offline); Congress.gov + FEC verified via live run; one-senator smoke test PASS (Warren). See Sec.5. Also added congress.gov portraits to grid+profile (27656e2, 3043daa) w/ initials fallback; fixed pipeline writeFile import + un-ignored data/politicians.json for prod commits (d61a88b, e9e419b); full ~536 federal run in progress, commits every 25.
- 2026-05-29 (main chat): Created this file. Site live at watchgov.org with seed data.
  Pipeline workflow still unfinished. politicians.json not yet built.
- 2026-05-30 (chrome ext): Fixed deploy.yml + trades.ts (fc9ac31) + fec.ts matching
  (961121a) + state codes (7c81b6c) + finance/totals (50b640f). Pipeline now runs clean
  end-to-end (finFailCount 0). politicians.json NOT yet committed - runs were cancelled.
  Starting Option B: donor->lobby mapping via committee_id -> schedule_a.
- 2026-05-30 (chrome ext, cont.): OPTION B implemented (commit 9fa163e). Rewrote
  buildLobbyContributions in scripts/sources/fec.ts: resolves principal committee via
  /candidate/{id}/committees/?designation=P, pages schedule_a (is_individual=false, sorted
  by amount) up to 8 pages, runs existing classifyLobby() regex patterns on contributor
  names, accumulates per-lobby totals -> LobbyContribution[]. Feeds lobbyMoney -> lobbyScore
  in score.ts calculateScore(). Verified FEC flow live (Booker committee C00540500,
  schedule_a 79k rows). NOTE: DEMO_KEY rate-limited during build; pagination field names
  (last_indexes) coded defensively. NEXT: run pipeline to COMPLETION + verify populated data.
- 2026-05-30 (chrome ext, cont.2): Test run 26685801734 confirmed Option B WORKS -
  non-zero scores appearing (Schiff=3, etc.), committees resolve, schedule_a classifies
  donors. BUT found risk: ~10+ FEC calls/member x 536 >> FEC 1000/hr limit, and get()
  had NO 429 handling -> later members would silently get empty lobby data. CORRECTED
  (commit da7506c): added 429/5xx retry-with-backoff + Retry-After to get(). Cancelled
  test run; starting fresh full run on da7506c to produce COMPLETE data.


### 2026-06-02 - chrome ext (lawsuits + encoding + verified profiles)

**Encoding (mojibake) - fixed permanently.** Root cause was a clipboard-paste editing
workflow that double-encoded non-ASCII chars (em-dashes, smart quotes, emoji, box-drawing)
into Latin1->UTF-8 mojibake. Fix: de-mojibake + ASCII-fold every source/data file, and add
a permanent asciiSafe() guard in pipeline.ts that strips/normalizes all non-ASCII before any
JSON.stringify write. RULE: all data output and source files must stay pure ASCII. When
editing via the GitHub web editor, always ASCII-fold the content first and verify 0 non-ASCII.

**Why profiles were incomplete (diagnosis).**
- VOTES: the Congress.gov call hit a nonexistent endpoint (/member/{bioguideId}/votes does
  not exist); the catch silently returned [], so ALL members had 0 votes. Still needs a
  real roll-call source (House Clerk XML / Senate roll-call) before votes can populate at scale.
- STOCKS: trades.ts points at the DEAD Senate/House Stock Watcher feeds (NXDOMAIN). Needs a
  live replacement feed; until then stocks stay empty (and are N/A for executives).
- LAWSUITS: lawsuits.ts used the deprecated CourtListener v3 API and silently returned [] on
  any error -> every profile had 0 lawsuits.

**Lawsuits source - REWRITTEN (scalable).** scripts/sources/lawsuits.ts now uses CourtListener
v4 search (GET /api/rest/v4/search/?q=caseName:"<surname>"&type=o&order_by=dateFiled desc,
URL-encoded, optional Authorization: Token <CL_TOKEN>). It keeps ONLY high-confidence matches
(caption/opinion contains the full name OR an explicit "official capacity" marker) and THROWS
on HTTP errors instead of returning [] silently. Design choice: PRECISION over recall -
common surnames (Warren, McConnell, Schumer) would otherwise attach unrelated parties; we
would rather return empty than misattribute a lawsuit. Full coverage at scale would need a
curated docket allowlist or CourtListener party-ID matching.

**Scoring math (confirmed, for reference).** Total = Lobby/money(25) + VoteAlign(35) +
Stock(25) + Legal(15). Legal = sum of severity weights (high=7, medium=4, low=1), capped 15.
Stock = conflictTrades*5 + (largeTrade>=500k?10:0), cap 25. Align = (aligned/votes)*35.

**Two verified showcase profiles (live in data).**
- Nancy Pelosi (rep-pelosi-nancy-ca, idx 121): funding + lobby + 5 stock trades + 3 votes +
  5 lawsuits (all official-capacity, dismissed: McCarthy & Massie proxy-voting; Budowich,
  Meadows, RNC Jan-6 subpoena challenges). legalScore 5, alignScore 12, TOTAL 48/100.
- Donald Trump (exec-trump-donald, chamber Executive): FEC P80001571 principal committee
  $495.85M (~$1.45B combined, labeled estimate, confidence medium); 6 lawsuits; votes/stocks
  marked Not Applicable for executive. legalScore 15, TOTAL 32/100.

**Rollout method (per user): SMALL BATCHES, no endless pipeline.** Process incomplete profiles
in small batches (~10-15) directly: live CourtListener v4 lookup per person -> build
high-confidence lawsuits -> recompute legalScore -> merge-by-ID into politicians.json ->
ASCII-fold -> commit -> verify via GitHub API. Repeat. Resume from checkpoint; never overwrite.

**Known caveat: Cloudflare live site lag.** After commits, watchgov.org kept serving a stale
cached build (Pelosi still showed 31/100). Data is correct at source (GitHub). Verify the
Cloudflare Pages build is triggering on commits to main; may need a manual rebuild.


### 2026-06-02 (later) - chrome ext (small-batch rollout - Batch 1)

**Lawsuits filter hardened.** lawsuits.ts now requires BOTH first AND last name to appear
in caption+snippet (was: surname + official-capacity, which false-matched e.g. "Medicine
Crow" for Jason Crow). Even so, edge cases remain (a common first name can appear as a
JUDGE or unrelated party - e.g. "In re Kiley", a Utah bankruptcy case, matched "Kevin" via
the judge's name). RULE: a human still verifies every auto-suggested match before commit.

**Batch 1 done (15 incomplete profiles, lawsuits).** Queried CourtListener v4 live, verified
each hit. Result: only Adam Schiff had real cases -> 3 official-capacity federal suits
(Michalopoulos v. Schiff D.D.C.; AAPS v. Schiff D.C.Cir 21-5080; Judicial Watch v. Schiff
D.C.Cir 20-5270), all low severity. legalScore 3, total 16->19. The other 14 (Friedman,
Van Epps, Booker, Armstrong, Mejia, Fuller, Castro, McDonald Rivet, Crow, Kiley, Boyle,
Young, Wyden, Wicker) had NO high-confidence federal cases - correctly left empty (NOT $0/fake).

**Reality check for rollout.** Most individual members have no federal suit naming them
personally; named-party lawsuits cluster among leadership/high-profile members. Expect most
batch entries to be "none". That is accurate, not a failure.

**Rate limit.** Unauthenticated CourtListener throttles fast (HTTP 429); browser batches must
space requests ~2.5s apart and run <=4 names per JS call (CDP 45s cap). The prod pipeline
uses CL_TOKEN for higher limits - prefer running the real pipeline per-batch where possible.

**Resume checkpoint:** next batch = incomplete profiles starting AFTER the first 15 already
checked (Schiff done). 226 profiles still have no lawsuits; continue in small batches of ~15.


### 2026-06-02 (later) - chrome ext (CLOUDFLARE BUILD FIXED - root cause found)

**THE STALE-SITE MYSTERY: SOLVED.** watchgov.org was frozen at an old build (Pelosi 31/100)
because EVERY Cloudflare Pages build since commit 7b6ed67 had been FAILING. Diagnosis path:
GitHub commit check-runs showed "Cloudflare Pages: failure" on all commits from 7b6ed67
onward; the last SUCCESS was df1c1e0.

**Root cause:** commit 7b6ed67 ("Not applicable" stock-trades feature) added a reference to
`p.notApplicable?.stockTrades` in app/politicians/[slug]/page.tsx, but the Politician type in
lib/types.ts had NO notApplicable field. Since next.config has typescript.ignoreBuildErrors:
false, `next build` failed with TS2339 (Property does not exist) on every build -> Cloudflare
kept serving the last good deploy. (Note: scripts/ is excluded in tsconfig, so the lawsuits.ts
status typing did NOT affect the build; only app/lib/components are type-checked.)

**Fix:** added optional `notApplicable?: { lobbyMoney?, stockTrades?, votes?, lawsuits? }` to
the Politician interface (matches the Trump data record). Build now SUCCEEDS and the live site
updated: Pelosi 48/100, Schiff 19/100, Trump 32/100 all render lawsuits correctly.

**Also fixed:** invalid LawsuitStatus value. lawsuits.ts and the data used status "ON RECORD"
which is NOT in the LawsuitStatus union (ONGOING|DISMISSED|SETTLED|CONVICTED|ACQUITTED|UNDER
REVIEW|RESOLVED|CLOSED|NO SUIT FILED). Changed to "ONGOING". (Data is read via fs as
Politician[] cast, so this did not break the build, but it is now correct.)

**LESSON FOR FUTURE EDITS:** before committing app/lib/components .tsx/.ts, make sure any new
property access exists on the type. A single TS error silently breaks the Cloudflare deploy
while GitHub stays green. Check commit check-runs ("Cloudflare Pages") for failure after
committing - do NOT assume a commit deployed just because it landed on main.
