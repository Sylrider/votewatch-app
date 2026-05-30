# WatchGov ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ PROJECT STATUS (Shared Source of Truth)

> ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ ÃÂÃÂ¯ÃÂÃÂ¸ÃÂÃÂ **MANDATORY PROTOCOL FOR EVERY CLAUDE SESSION (Chrome extension, Desktop, web ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ all of them):**
>
> 1. **BEFORE doing ANY work on WatchGov:** read this entire file from the repo first.
>    (`github.com/Sylrider/votewatch-app` ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ `PROJECT_STATUS.md`). Do not act on stale
>    memory ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ this file is the only current truth.
> 2. **AFTER doing ANY work:** update this file ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ tick items in ÃÂÃÂÃÂÃÂ§12, add a dated line to
>    the ÃÂÃÂÃÂÃÂ§13 changelog, update the "Last updated" stamp ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ and commit/push it to the repo
>    so the next session sees it.
> 3. If you cannot read or update the repo in this session, say so to the user explicitly
>    and ask them to carry the update across.
>
> **Purpose:** WatchGov is worked on by multiple SEPARATE Claude sessions that DO NOT share
> memory. This file is the bridge. The repo is the shared state; this file is the memory.
> Read first, write last, every time.
>
> Last updated: 2026-05-29 ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ by: main chat session

---

## 1. WHAT THIS IS
A nonpartisan U.S. political transparency website. Each elected official gets a profile
showing votes, lobbying money received (with the lobby's intent), stock trades (conflict-
flagged), lawsuits/ethics issues, an "Independent View" summary, and a 0ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ100 Transparency
Risk Score. Each lobby gets a page (mission, key positions, funded politicians).

- **Live at:** https://watchgov.org (also votewatch-app.pages.dev)
- **Host:** Cloudflare Pages ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ auto-deploys on every push via Cloudflare's NATIVE GitHub
  integration (NOT the GitHub Actions workflow ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ see ÃÂÃÂÃÂÃÂ§6).
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
- [ ] data/politicians.json still NOT committed (runs cancelled before commit step)
- [ ] Composite Transparency Risk Scores still 0 -> need Option B (donor->lobby) data
- [ ] CLOUDFLARE secrets NOT set (not required; Cloudflare auto-deploys on commit)

---

## 3. THE GOAL ROSTER (~900ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ950 officials, 5 categories)
The `chamber` field is one of: Executive | Senate | House | Governor | Mayor.
Home page already has filter tabs for each.

| Chamber    | Count   | Data source                                              |
|------------|---------|----------------------------------------------------------|
| Executive  | ~handful| President, VP, Cabinet ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ manual + FEC for federal money   |
| Senate     | 100     | FULLY automatable via federal APIs                        |
| House      | 435     | FULLY automatable via federal APIs                        |
| Governor   | 50      | NO unified free API ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ hand-curate / per-state portals     |
| Mayor      | ~335    | Mayors of cities >100k pop. NO free API ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ hand-curate     |

**Key nuance:** Free APIs only fully cover FEDERAL officials (Executive/Senate/House).
Governors & mayors have no unified free data source ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ port from the earlier hand-built
dataset (the original "us-transparency" React build had ~310 mayors + senators/reps/govs)
and supplement manually. Non-federal officials use a MODIFIED score (no congressional
vote-alignment component ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ they have no roll-call record).

---

## 4. THE 9 SEED LOBBIES (in data/lobbies.json)
IDs: `nra`, `pharma`, `api` (oil/gas), `uscc` (US Chamber of Commerce), `aipac`,
`finance` (Wall St), `defense`, `labor` (AFL-CIO), `nea` (teachers).
The pipeline maps FEC industry/PAC codes ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ these IDs to link politicians ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ lobbies.

---

## 5. APIS ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ WHAT & HOW
1. **Congress.gov** ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Senate+House only. Key `CONGRESS_API_KEY`. Base
   `https://api.congress.gov/v3/`. Endpoints: `/member`, `/member/{id}`,
   `/member/{id}/sponsored-legislation`, committees, votes. Append `?api_key=`. ~5k/hr.
   ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ identity, party, state, chamber, committees, bills, votes.
2. **FEC / OpenFEC** ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ federal campaign money. Key `FEC_API_KEY` (api.data.gov). Base
   `https://api.open.fec.gov/v1/`. Endpoints: `/candidates/search`,
   `/candidate/{id}/totals`, `/schedules/schedule_a`, `/committee/{id}`. ~1k/hr ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ CACHE.
   ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ feeds lobbyScore; links donors to lobby IDs.
3. **Senate/House Stock Watcher** ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Congress only. No key. Full JSON at
   senatestockwatcher.com & housestockwatcher.com. ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ feeds stockScore + conflict flags.
4. **CourtListener** ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ lawsuits, federal + state. No key (optional token). Base
   `https://www.courtlistener.com/api/rest/v4/`, `/search/?q={name}`. ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ feeds legalScore.
5. **OpenSecrets** ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ SKIP v1 (paid/application). Approximate lobby intent from FEC codes.

**API VERIFICATION STATUS (2026-05-30):**
- Congress.gov (CONGRESS_API_KEY): VERIFIED via live pipeline run (50+ members fetched). Direct keyed test deferred — key value handled by user only.
- FEC / OpenFEC (FEC_API_KEY): VERIFIED via live pipeline run (real finance totals, e.g. Wicker $717K). Direct keyed test deferred — key handled by user only. Rate limit ~1000/hr.
- Senate Stock Watcher (no key): FAIL — S3 bucket AccessDenied at /aggregate/ and /data/. Source offline/moved; pipeline non-fatal (no SENATE_TRADES_URL).
- House Stock Watcher (no key): FAIL — S3 bucket AccessDenied. Source offline/moved; pipeline non-fatal (no HOUSE_TRADES_URL).
- CourtListener v4 (no key): PASS — HTTP 200, search returns results (count 6708 for Elizabeth Warren). No token required.
- Smoke test (one full senator record): PASS — Elizabeth Warren written with merged identity+image+lobbyMoney+stockTrades+lawsuits+votes+score; profileComplete true. Empty arrays = genuinely-unavailable data, not fabrication.

Pipeline per federal politician: Congress.gov (identity+votes) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ FEC (money) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
Stock Watchers (trades) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ CourtListener (lawsuits) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ map donors to lobbies ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ compute
score ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ write record to `data/politicians.json`.

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

## 7. TRANSPARENCY RISK SCORE (0ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ100)
`Total = min(100, lobbyScore + alignScore + stockScore + legalScore)`
- lobbyScore = min(25, totalLobbyMoney / 100,000 ÃÂÃÂÃÂÃÂ 1.2)
- alignScore = (donorAlignedVotes / totalVotes) ÃÂÃÂÃÂÃÂ 35   [SKIP for non-federal; reweight]
- stockScore = min(25, conflictTrades ÃÂÃÂÃÂÃÂ 5 + (10 if any single trade ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ¥ $500K))
- legalScore = min(15, ÃÂÃÂÃÂÃÂ£ severity: high=7, medium=4, low=1)

Bands: CRITICAL 75ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ100 (#ef4444) ÃÂÃÂÃÂÃÂ· HIGH 50ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ74 (#f97316) ÃÂÃÂÃÂÃÂ· ELEVATED 25ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ49 (#eab308) ÃÂÃÂÃÂÃÂ·
LOW 0ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ24 (#22c55e).
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

## 9. CRITICAL TECH RULES (these caused past build failures ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ DO NOT REPEAT)
- `lib/data.ts` uses Node `fs` = SERVER ONLY. Never import into a `'use client'` component.
- Pure helpers (fmtMoney, partyColor, partyShort, riskLabel) live in `lib/utils.ts` =
  client-safe. Client components import from utils, never from data.
- No event handlers (onClick/onMouseEnter) in server components ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ use CSS hover.
- tsconfig.json needs `"target":"es2017"`, `"downlevelIteration":true`,
  `"exclude":["node_modules","scripts"]`.
- Workflow: `npm install` not `npm ci`; `workflow_dispatch:` at top level of `on:`.

---

## 10. PAGES
- `app/page.tsx` ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ hero + stats + searchable/filterable grid (client: components/PoliticianGrid.tsx)
- `app/politicians/[slug]/page.tsx` ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ full profile, generateStaticParams from JSON
- `app/lobbies/page.tsx` + `app/lobbies/[slug]/page.tsx` ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ lobby list + detail
- `app/methodology/page.tsx` ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ score formula, bands, sources, disclaimer

---

## 11. ENVIRONMENT / WHO CAN DO WHAT
- **Main chat session (no network):** can write/fix code, generate JSON from knowledge
  (must verify via web search), produce ZIPs. CANNOT call live APIs or run the pipeline.
- **Claude-in-Chrome extension:** can drive the browser ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ edit files on GitHub, click
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

---

## 13. CHANGELOG (each session: add a dated line here after doing work)

- 2026-05-30: API verification checklist run — CourtListener PASS; Senate/House Stock Watcher FAIL (S3 AccessDenied, offline); Congress.gov + FEC verified via live run; one-senator smoke test PASS (Warren). See §5. Also added congress.gov portraits to grid+profile (27656e2, 3043daa) w/ initials fallback; fixed pipeline writeFile import + un-ignored data/politicians.json for prod commits (d61a88b, e9e419b); full ~536 federal run in progress, commits every 25.
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
