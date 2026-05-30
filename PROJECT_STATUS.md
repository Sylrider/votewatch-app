# WatchGov — PROJECT STATUS (Shared Source of Truth)

> ⚠️ **MANDATORY PROTOCOL FOR EVERY CLAUDE SESSION (Chrome extension, Desktop, web — all of them):**
>
> 1. **BEFORE doing ANY work on WatchGov:** read this entire file from the repo first.
>    (`github.com/Sylrider/votewatch-app` → `PROJECT_STATUS.md`). Do not act on stale
>    memory — this file is the only current truth.
> 2. **AFTER doing ANY work:** update this file — tick items in §12, add a dated line to
>    the §13 changelog, update the "Last updated" stamp — and commit/push it to the repo
>    so the next session sees it.
> 3. If you cannot read or update the repo in this session, say so to the user explicitly
>    and ask them to carry the update across.
>
> **Purpose:** WatchGov is worked on by multiple SEPARATE Claude sessions that DO NOT share
> memory. This file is the bridge. The repo is the shared state; this file is the memory.
> Read first, write last, every time.
>
> Last updated: 2026-05-29 — by: main chat session

---

## 1. WHAT THIS IS
A nonpartisan U.S. political transparency website. Each elected official gets a profile
showing votes, lobbying money received (with the lobby's intent), stock trades (conflict-
flagged), lawsuits/ethics issues, an "Independent View" summary, and a 0–100 Transparency
Risk Score. Each lobby gets a page (mission, key positions, funded politicians).

- **Live at:** https://watchgov.org (also votewatch-app.pages.dev)
- **Host:** Cloudflare Pages — auto-deploys on every push via Cloudflare's NATIVE GitHub
  integration (NOT the GitHub Actions workflow — see §6).
- **Repo:** github.com/Sylrider/votewatch-app (PUBLIC; repo name stays votewatch-app)
- **Stack:** Next.js (static export `output:'export'`), Tailwind, dark theme.
- **Brand:** "WatchGov" (logo: Watch + Gov). Rebranded from "VoteWatch".

---

## 2. CURRENT STATE (what's done vs not)
- ✅ Site built, deployed, live at watchgov.org on custom domain
- ✅ All pages working: home, politician profile, lobbies list, lobby page, methodology
- ✅ 9 lobbies seeded (see §4)
- ✅ GitHub secrets set: CONGRESS_API_KEY, FEC_API_KEY, NEXT_PUBLIC_SITE_URL
- ⛔ Site currently shows ONLY SEED DATA: 1 politician (Trump) + 9 lobbies
- ⛔ `data/politicians.json` does NOT exist yet → the big remaining task
- ⛔ GitHub Actions pipeline workflow still not running (see §6)
- ❌ CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID secrets NOT set (only needed if the
  Actions workflow itself deploys — currently not required since Cloudflare auto-deploys)

---

## 3. THE GOAL ROSTER (~900–950 officials, 5 categories)
The `chamber` field is one of: Executive | Senate | House | Governor | Mayor.
Home page already has filter tabs for each.

| Chamber    | Count   | Data source                                              |
|------------|---------|----------------------------------------------------------|
| Executive  | ~handful| President, VP, Cabinet — manual + FEC for federal money   |
| Senate     | 100     | FULLY automatable via federal APIs                        |
| House      | 435     | FULLY automatable via federal APIs                        |
| Governor   | 50      | NO unified free API — hand-curate / per-state portals     |
| Mayor      | ~335    | Mayors of cities >100k pop. NO free API — hand-curate     |

**Key nuance:** Free APIs only fully cover FEDERAL officials (Executive/Senate/House).
Governors & mayors have no unified free data source — port from the earlier hand-built
dataset (the original "us-transparency" React build had ~310 mayors + senators/reps/govs)
and supplement manually. Non-federal officials use a MODIFIED score (no congressional
vote-alignment component — they have no roll-call record).

---

## 4. THE 9 SEED LOBBIES (in data/lobbies.json)
IDs: `nra`, `pharma`, `api` (oil/gas), `uscc` (US Chamber of Commerce), `aipac`,
`finance` (Wall St), `defense`, `labor` (AFL-CIO), `nea` (teachers).
The pipeline maps FEC industry/PAC codes → these IDs to link politicians ↔ lobbies.

---

## 5. APIS — WHAT & HOW
1. **Congress.gov** — Senate+House only. Key `CONGRESS_API_KEY`. Base
   `https://api.congress.gov/v3/`. Endpoints: `/member`, `/member/{id}`,
   `/member/{id}/sponsored-legislation`, committees, votes. Append `?api_key=`. ~5k/hr.
   → identity, party, state, chamber, committees, bills, votes.
2. **FEC / OpenFEC** — federal campaign money. Key `FEC_API_KEY` (api.data.gov). Base
   `https://api.open.fec.gov/v1/`. Endpoints: `/candidates/search`,
   `/candidate/{id}/totals`, `/schedules/schedule_a`, `/committee/{id}`. ~1k/hr — CACHE.
   → feeds lobbyScore; links donors to lobby IDs.
3. **Senate/House Stock Watcher** — Congress only. No key. Full JSON at
   senatestockwatcher.com & housestockwatcher.com. → feeds stockScore + conflict flags.
4. **CourtListener** — lawsuits, federal + state. No key (optional token). Base
   `https://www.courtlistener.com/api/rest/v4/`, `/search/?q={name}`. → feeds legalScore.
5. **OpenSecrets** — SKIP v1 (paid/application). Approximate lobby intent from FEC codes.

Pipeline per federal politician: Congress.gov (identity+votes) → FEC (money) →
Stock Watchers (trades) → CourtListener (lawsuits) → map donors to lobbies → compute
score → write record to `data/politicians.json`.

**Constraint:** pipeline MUST run where there's internet + keys (GitHub Actions
workflow_dispatch, or local Node). It CANNOT run in a no-network sandbox.

---

## 6. GITHUB ACTIONS PIPELINE — UNFINISHED, KNOWN ISSUES
The `.github/workflows/deploy.yml` has been failing. Root causes identified:
- `workflow_dispatch:` was nested under `schedule:` (wrong indent) → no "Run workflow" button
- Workflow used `npm ci` but there's NO package-lock.json → must use `npm install`
- Build job `needs: [pipeline]` ran the full pipeline on every push → slow/failing

**Correct design:** The site deploys via Cloudflare's native integration, so the workflow
should ONLY run the data pipeline (on workflow_dispatch + weekly schedule) and commit
`data/politicians.json` back to the repo. The committed data then triggers Cloudflare's
auto-rebuild. No build/deploy jobs needed in the workflow.

**Status:** A corrected workflow was drafted but NOT successfully committed yet (GitHub
Desktop "Commit to main" was greyed out; browser-edit attempt was interrupted).
**Also note:** the pipeline scripts in `/scripts` have NEVER successfully run end-to-end,
so they may contain their own bugs to debug once the workflow triggers them.

---

## 7. TRANSPARENCY RISK SCORE (0–100)
`Total = min(100, lobbyScore + alignScore + stockScore + legalScore)`
- lobbyScore = min(25, totalLobbyMoney / 100,000 × 1.2)
- alignScore = (donorAlignedVotes / totalVotes) × 35   [SKIP for non-federal; reweight]
- stockScore = min(25, conflictTrades × 5 + (10 if any single trade ≥ $500K))
- legalScore = min(15, Σ severity: high=7, medium=4, low=1)

Bands: CRITICAL 75–100 (#ef4444) · HIGH 50–74 (#f97316) · ELEVATED 25–49 (#eab308) ·
LOW 0–24 (#22c55e).
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

## 9. CRITICAL TECH RULES (these caused past build failures — DO NOT REPEAT)
- `lib/data.ts` uses Node `fs` = SERVER ONLY. Never import into a `'use client'` component.
- Pure helpers (fmtMoney, partyColor, partyShort, riskLabel) live in `lib/utils.ts` =
  client-safe. Client components import from utils, never from data.
- No event handlers (onClick/onMouseEnter) in server components — use CSS hover.
- tsconfig.json needs `"target":"es2017"`, `"downlevelIteration":true`,
  `"exclude":["node_modules","scripts"]`.
- Workflow: `npm install` not `npm ci`; `workflow_dispatch:` at top level of `on:`.

---

## 10. PAGES
- `app/page.tsx` — hero + stats + searchable/filterable grid (client: components/PoliticianGrid.tsx)
- `app/politicians/[slug]/page.tsx` — full profile, generateStaticParams from JSON
- `app/lobbies/page.tsx` + `app/lobbies/[slug]/page.tsx` — lobby list + detail
- `app/methodology/page.tsx` — score formula, bands, sources, disclaimer

---

## 11. ENVIRONMENT / WHO CAN DO WHAT
- **Main chat session (no network):** can write/fix code, generate JSON from knowledge
  (must verify via web search), produce ZIPs. CANNOT call live APIs or run the pipeline.
- **Claude-in-Chrome extension:** can drive the browser — edit files on GitHub, click
  "Run workflow", navigate Cloudflare. Subject to tab-connection quirks.
- **User (Sylrider):** non-technical, Mac, Chrome, uses GitHub Desktop. Does commits,
  enters API keys/secrets, makes purchases, anything requiring credentials.
- No session can enter the user's passwords/payment or run pipelines in a sandbox.

---

## 12. NEXT STEPS (priority order)
1. [ ] Fix & commit the corrected deploy.yml (pipeline-only, workflow_dispatch, npm install)
2. [ ] Trigger "Run workflow" → debug pipeline scripts until they produce politicians.json
       for the ~540 FEDERAL officials (Executive/Senate/House)
3. [ ] Port the earlier hand-built dataset (~310 mayors + govs/senators) into JSON for the
       Governor + Mayor categories; supplement to reach ~335 mayors of 100k+ cities
4. [ ] Verify all non-API figures against real public sources (no fabricated numbers)
5. [ ] Confirm scores compute + all ~950 pages generate; check live site
6. [ ] (Optional) OpenSecrets researcher application for richer lobby intent

---

## 13. CHANGELOG (each session: add a dated line here after doing work)
- 2026-05-29 (main chat): Created this file. Site live at watchgov.org with seed data.
  Pipeline workflow still unfinished. politicians.json not yet built.
