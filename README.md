# WatchGov 🗳️
**U.S. Political Transparency Tracker**

Track lobbying money, stock trading conflicts, lawsuits, and donor-vote alignment
for every U.S. Senator, Representative, Governor, Mayor, and President.

Live site: **https://watchgov.org** (or your custom domain after setup)

---

## ⚡ What This Does

- Pulls live data from free public APIs (Congress.gov, FEC, Stock Watchers, CourtListener)
- Calculates a **Transparency Risk Score** (0–100) for every politician
- Generates a fully static website (HTML/CSS/JS) — zero per-user cost, no database
- Auto-deploys to Cloudflare Pages every week with fresh data
- Full SEO: JSON-LD schema, Open Graph, canonical URLs, sitemap

---

## 📋 What YOU Need to Do (15 minutes total)

### Step 1 — Create a GitHub account (3 min)
> **GitHub is 100% free for public repositories.**

1. Go to **https://github.com/signup**
2. Enter username, email, password
3. Verify email
4. Done ✓

---

### Step 2 — Create a Cloudflare account (3 min)
> **Cloudflare Pages is 100% free** — unlimited bandwidth, free SSL, free subdomain

1. Go to **https://cloudflare.com** → click **Sign Up**
2. Enter email + password
3. You'll get a free subdomain: `watchgov.org`

**Optional — Buy a domain (~$10/year):**
- Cloudflare Registrar sells `.org` domains at **cost price** (~$9.77/year, no markup)
- In Cloudflare dashboard → **Domain Registration** → search `watchgov.org`
- Cloudflare Registrar is genuinely the cheapest place to buy domains

---

### Step 3 — Get Free API Keys (5 min)

#### Congress.gov API Key (FREE, instant)
1. Go to **https://api.congress.gov/sign-up/**
2. Enter name + email
3. You get an API key immediately by email

#### FEC Campaign Finance API Key (FREE, instant)
1. Go to **https://api.data.gov/signup/**
2. Enter name + email
3. You get an API key immediately by email

#### OpenSecrets Researcher Access (FREE, 2–5 day approval)
> **See the ready-to-send application letter at the bottom of this README.**
> Copy it, fill in your name, and email it to research@opensecrets.org

OpenSecrets has the best processed lobby data. The pipeline works without it
(using raw FEC data), but OpenSecrets improves data quality significantly.

---

### Step 4 — Upload the code to GitHub (5 min)

Once you have a GitHub account:

```bash
# On your computer (Mac/Windows/Linux):

# Install Git if not already installed:
# Mac: brew install git  or  xcode-select --install
# Windows: https://git-scm.com/download/win
# Linux: sudo apt install git

# Clone this project
git clone https://github.com/YOUR-USERNAME/votewatch.git
cd votewatch

# Copy the .env.example file
cp .env.example .env.local

# Open .env.local in any text editor and fill in your API keys:
# CONGRESS_API_KEY=abc123...
# FEC_API_KEY=def456...

# Install dependencies
npm install

# Test the pipeline with 5 politicians first (takes ~2 min)
npm run pipeline:test

# If that works, run the full pipeline (takes 45-90 min)
npm run pipeline

# Build the static site
npm run build

# Test it locally (optional)
npm run dev
# → Open http://localhost:3000 in your browser

# Push to GitHub
git add .
git commit -m "Initial WatchGov deployment"
git push origin main
```

---

### Step 5 — Connect Cloudflare Pages to GitHub (3 min)

1. Log into **cloudflare.com**
2. Click **Workers & Pages** → **Create Application** → **Pages**
3. Click **Connect to Git**
4. Authorize Cloudflare to access your GitHub
5. Select your `votewatch` repository
6. Configure build settings:
   - **Framework**: Next.js (Static HTML Export)
   - **Build command**: `npm run build`
   - **Build output directory**: `out`
7. Click **Save and Deploy**

Your site will be live at `https://watchgov.org` in ~2 minutes! 🎉

---

### Step 6 — Add GitHub Secrets for auto-deploy

The GitHub Actions workflow auto-refreshes data weekly and deploys.
You need to add secrets so it can authenticate:

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** for each:

| Secret Name | Where to get it |
|---|---|
| `CONGRESS_API_KEY` | From Step 3 above |
| `FEC_API_KEY` | From Step 3 above |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Pages" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar |
| `NEXT_PUBLIC_SITE_URL | `https://watchgov.org`

---

### Step 7 — Connect custom domain (optional, ~5 min)

If you bought a domain at Cloudflare:
1. Cloudflare Pages → your project → **Custom Domains**
2. Click **Set up a custom domain**
3. Enter `watchgov.org`
4. Done — Cloudflare handles SSL automatically

---

## 🔄 How Data Updates Work

```
Every Monday at 6am UTC:
  GitHub Actions runs npm run pipeline
    → Fetches fresh data from Congress.gov, FEC, Stock Watchers, CourtListener
    → Recalculates all Transparency Risk Scores
    → Commits updated data to repo
    → Triggers new Cloudflare Pages deployment
    → Site is live with fresh data
  
Cost to users: $0 (static files, no API calls per page view)
Cost to you:   $0 (all free tiers)
```

---

## 💰 Total Cost Breakdown

| Service | Cost |
|---|---|
| Cloudflare Pages hosting | **$0/month** |
| GitHub repo | **$0/month** |
| Congress.gov API | **$0** |
| FEC API | **$0** |
| Senate/House Stock Watcher | **$0** |
| CourtListener | **$0** |
| OpenSecrets (researcher) | **$0** |
| Domain (watchgov.org) | **$0** |
| Domain (watchgov.org) | **~$9.77/year** optional |
| **Total** | **$0–$10/year** |

---

## 🏗️ Project Structure

```
votewatch/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (nav, footer, SEO)
│   ├── page.tsx                  # Home page (politicians list)
│   ├── globals.css               # Dark theme styles
│   ├── politicians/[slug]/       # Individual politician pages
│   │   └── page.tsx
│   ├── lobbies/                  # Lobbies list
│   │   └── page.tsx
│   ├── lobbies/[slug]/           # Individual lobby pages
│   │   └── page.tsx
│   └── methodology/              # How the score works
│       └── page.tsx
│
├── components/                   # Reusable React components
│   ├── PoliticianGrid.tsx        # Client-side filtered grid
│   ├── PoliticianCard.tsx        # Individual politician card
│   ├── LobbyCard.tsx             # Lobby card
│   └── ScoreGauge.tsx            # Score circle + breakdown
│
├── lib/
│   ├── types.ts                  # TypeScript types
│   └── data.ts                   # Data loading utilities
│
├── scripts/                      # Data pipeline (runs at build time)
│   ├── pipeline.ts               # Main pipeline orchestrator
│   ├── score.ts                  # Scoring algorithm
│   ├── lobby-map.ts              # PAC name → lobby category mapper
│   └── sources/
│       ├── congress.ts           # Congress.gov API
│       ├── fec.ts                # FEC campaign finance API
│       ├── trades.ts             # Senate/House Stock Watcher
│       └── lawsuits.ts           # CourtListener API
│
├── data/                         # Generated data (created by pipeline)
│   ├── politicians.json          # All politician profiles (~8–15 MB)
│   ├── lobbies.json              # Lobby definitions
│   └── pipeline-log.json         # Last run metadata
│
├── .github/workflows/
│   └── deploy.yml                # Auto-deploy + weekly data refresh
│
├── next.config.js                # Static export config for Cloudflare
├── tailwind.config.ts
├── .env.example                  # Copy to .env.local
└── package.json
```

---

## 📊 Transparency Risk Score

| Component | Max Points | How Calculated |
|---|---|---|
| 💰 Lobby Money | 25 | Total career donations ÷ $100K × 1.2 |
| 🗳️ Vote Alignment | 35 | % of votes matching donor positions |
| 📈 Stock Conflicts | 25 | Conflict trades × 5 + 10 if any ≥ $500K |
| ⚖️ Legal Record | 15 | High severity (7) + Medium (4) + Low (1) |

**Score bands:** CRITICAL (75–100) · HIGH RISK (50–74) · ELEVATED (25–49) · LOW RISK (0–24)

---

## 📧 OpenSecrets Researcher Application

> Copy this email and send to: **research@opensecrets.org**
> Subject: **Researcher API Access Request — Civic Transparency Project**

---

Dear OpenSecrets Team,

I am writing to request researcher API access for WatchGov, an open-source
civic transparency project that tracks lobbying contributions, voting records,
and financial conflicts of interest for U.S. elected officials.

**Project:** WatchGov (https://watchgov.org)
**Purpose:** Nonpartisan, educational civic transparency — helping voters
understand the relationship between campaign donations and legislative votes.

**How I will use OpenSecrets data:**
- Display career lobby contribution totals per politician
- Link PAC donations to industry categories
- Calculate donor-vote alignment scores
- Show citizens which industries fund their representatives

**Commitments:**
- Will prominently cite OpenSecrets as the data source on every politician page
- Will link back to opensecrets.org for all financial data
- Project is open-source (GitHub) and fully noncommercial
- No data will be resold or used for commercial purposes
- Will comply with all OpenSecrets API terms of service

This project serves the same mission as OpenSecrets — informed voters make
better democracies. I would be honored to use your data to help educate
citizens about the influence of money in politics.

Please let me know if you need any additional information.

Thank you for considering this request.

[YOUR NAME]
[YOUR EMAIL]
WatchGov Project

---

## 🚀 Quick Start (after setup)

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env.local
# → Add your API keys to .env.local

# Test pipeline (5 politicians, ~2 min)
npm run pipeline:test

# Full pipeline (all Congress, ~45-90 min)
npm run pipeline

# Run locally
npm run dev

# Build for production
npm run build
```

---

## 🤝 Contributing

This is an open-source civic project. Pull requests welcome for:
- More accurate PAC-to-lobby mappings (`scripts/lobby-map.ts`)
- Mayor and governor data
- State legislature support
- Better conflict detection algorithms

---

*WatchGov is nonpartisan and not affiliated with any political party or organization.
A high Transparency Risk Score reflects statistical overlap between donor money and votes —
it is not a determination of illegal activity. All data is from public government disclosures.*
