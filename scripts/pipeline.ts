#!/usr/bin/env tsx
/**
 * scripts/pipeline.ts
 * Master ETL pipeline Ã¢ÂÂ run this to generate data/politicians.json
 *
 * Usage:
 *   npx tsx scripts/pipeline.ts
 *   npx tsx scripts/pipeline.ts --chamber=Senate   (only Senate members)
 *   npx tsx scripts/pipeline.ts --limit=10          (first 10 members, for testing)
 *   npx tsx scripts/pipeline.ts --id=B001230        (single bioguide ID)
 *
 * Required env vars (.env.local):
 *   CONGRESS_API_KEY   Ã¢ÂÂ from api.congress.gov/sign-up/
 *   FEC_API_KEY        Ã¢ÂÂ from api.data.gov/signup/
 *
 * Optional env vars:
 *   COURTLISTENER_TOKEN Ã¢ÂÂ from courtlistener.com (higher rate limits)
 *
 * Runtime: ~45Ã¢ÂÂ90 minutes for all ~535 federal members
 * Output:  data/politicians.json  (~8Ã¢ÂÂ15 MB)
 *          data/pipeline-log.json (run metadata)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fetchAllMembers, fetchMemberVotes } from './sources/congress';
import { findCandidateId, buildLobbyContributions, fetchFundingProfile } from './sources/fec';
import { fetchSenateTrades, fetchHouseTrades, getTradesForPolitician } from './sources/trades';
import { searchLawsuits } from './sources/lawsuits';
import { calculateScore, annotateVoteAlignment } from './score';
import type { Politician, PipelineRun, Chamber } from '../lib/types';
import { readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Config Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || '';
const FEC_API_KEY      = process.env.FEC_API_KEY || '';
const CL_TOKEN         = process.env.COURTLISTENER_TOKEN;
const OUT_DIR          = path.join(process.cwd(), 'data');
const RATE_LIMIT_MS    = 250;  // ms between API calls (stay under rate limits)

// Parse CLI flags
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => a.slice(2).split('=') as [string, string])
);

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Main Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function main() {
  if (!CONGRESS_API_KEY || !FEC_API_KEY) {
    console.error('Ã¢ÂÂ Missing API keys. Set CONGRESS_API_KEY and FEC_API_KEY in .env.local');
    console.error('   Congress.gov: https://api.congress.gov/sign-up/');
    console.error('   FEC API:       https://api.data.gov/signup/');
    process.exit(1);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  const run: PipelineRun = {
    startedAt: new Date().toISOString(),
    version: '1.0.0',
    politiciansProcessed: 0,
    errors: [],
  };

  console.log('\nÃ°ÂÂÂ³  VoteWatch Data Pipeline');
  console.log('Ã¢ÂÂ'.repeat(50));
  console.log(`Started: ${run.startedAt}`);
  console.log('');

  // Pre-fetch bulk trade data (one request fetches all trades at once)
  console.log('Ã°ÂÂÂ Pre-fetching stock trade disclosures...');
  await fetchSenateTrades();
  await fetchHouseTrades();

  // Fetch all current Congress members
  console.log('\nÃ°ÂÂÂ  Fetching Congress members from Congress.gov...');
  let members = await fetchAllMembers(CONGRESS_API_KEY);
  console.log(`   Found ${members.length} current members`);

  // Apply CLI filters
  if (args.chamber) {
    members = members.filter(m =>
      m.terms.some(t => t.chamber.toLowerCase() === args.chamber.toLowerCase())
    );
    console.log(`   Filtered to ${members.length} ${args.chamber} members`);
  }
  if (args.id) {
    members = members.filter(m => m.bioguideId === args.id);
  }
  // Bounded slice: --start=<offset> --count=<n> (or --limit=<n>) so each run stays short & under the job timeout.
  const __start = args.start ? parseInt(String(args.start), 10) : 0;
  const __count = args.count ? parseInt(String(args.count), 10) : (args.limit ? parseInt(String(args.limit), 10) : 0);
  if (__start > 0 || __count > 0) {
    members = members.slice(__start, __count > 0 ? __start + __count : undefined);
    console.log(`  Slice: officials ${__start + 1}..${__start + members.length} (start=${__start}, count=${__count || 'all'})`);
  }

  console.log('\nÃ°ÂÂÂ Processing politicians...\n');

  const politicians: Politician[] = [];

  // --- Incremental prod commits: merge into existing data, commit every BATCH_SIZE officials ---
  const BATCH_SIZE = 25;
  const SHOULD_PUSH = process.env.PIPELINE_PUSH !== '0' && !args.id;
  const existingById = new Map<string, Politician>();
  try {
    const prevRaw = await readFile(path.join(OUT_DIR, 'politicians.json'), 'utf8');
    const prev = JSON.parse(prevRaw) as Politician[];
    for (const p of prev) existingById.set(p.id, p);
    console.log(`Loaded ${existingById.size} existing officials for incremental merge.`);
  } catch {
    console.log('No existing politicians.json - starting fresh.');
  }
  let gitReady = false;
  function ensureGit() {
    if (gitReady) return;
    try {
      execSync('git config user.email "pipeline@votewatch.org"');
      execSync('git config user.name "VoteWatch Pipeline Bot"');
      gitReady = true;
    } catch (e) {
      console.warn(`[git] config failed: ${(e as Error).message}`);
    }
  }
  let lastCommitted = 0;
  async function flushAndCommit(label: string, force = false) {
    if (!force && politicians.length - lastCommitted < BATCH_SIZE) return;
    for (const p of politicians) existingById.set(p.id, p);
    const merged = Array.from(existingById.values());
    await writeFile(
      path.join(OUT_DIR, 'politicians.json'),
      JSON.stringify(merged, null, 2),
    );
    lastCommitted = politicians.length;
    if (!SHOULD_PUSH) return;
    ensureGit();
    try {
      execSync('git add data/politicians.json');
      execSync(
        `git diff --staged --quiet || git commit -m "data: ${label} (${merged.length} officials)"`,
      );
      execSync('git pull --rebase origin main', { stdio: 'pipe' });
      execSync('git push');
      console.log(`[git] pushed: ${label} -> ${merged.length} officials live`);
    } catch (e) {
      console.warn(`[git] commit/push failed (${label}): ${(e as Error).message}`);
    }
  }

  for (let i = 0; i < members.length; i++) {
    const member = members[i];

    // [resume] Skip officials already in the dataset WITH real data; only re-process
    // empties/broken records, then continue forward into new officials. The per-25
    // commit of politicians.json is the durable checkpoint, so a timeout/crash resumes.
    {
      const __mid = generateId(member.name, member.state, member.chamber);
      const __ex = existingById.get(__mid);
      const __hasData = !!__ex && (
        (Array.isArray(__ex.lobbyMoney) && __ex.lobbyMoney.length > 0) ||
        (Array.isArray(__ex.stockTrades) && __ex.stockTrades.length > 0) ||
        (Array.isArray(__ex.lawsuits) && __ex.lawsuits.length > 0) ||
        (!!__ex.score && (__ex.score.totalMoney || 0) > 0)
      );
      if (__hasData && process.env.FORCE_REPROCESS !== "1") {
        politicians.push(__ex);
        console.log(`  [${i + 1}/${members.length}] ${member.name} â already complete, skipped`);
        continue;
      }
    }
    const progress = `[${i + 1}/${members.length}]`;

    try {
      process.stdout.write(`${progress} ${member.name}...`);

      // Determine chamber from most recent term
      const latestTerm = member.terms[member.terms.length - 1];
      const chamber: Chamber = latestTerm?.chamber === 'Senate' ? 'Senate' : 'House';
      const since = member.terms[0]?.startYear || 2000;

      // 1. Fetch votes from Congress.gov
      const votes = await fetchMemberVotes(member.bioguideId, CONGRESS_API_KEY, 50);
      await sleep(RATE_LIMIT_MS);

      // 2. Find FEC candidate ID
      const office = chamber === 'Senate' ? 'S' : 'H';
      const fecId = await findCandidateId(
        member.name,
        member.state,
        office,
        FEC_API_KEY
      );
      await sleep(RATE_LIMIT_MS);

      // 3. Fetch lobby contributions from FEC
      const lobbyMoney = fecId
        ? await buildLobbyContributions(fecId, FEC_API_KEY)
        : [];
      await sleep(RATE_LIMIT_MS);

      // 3b. Fetch full campaign-finance profile (real totals, big-money share)
      const funding = await fetchFundingProfile(fecId, FEC_API_KEY);
      await sleep(RATE_LIMIT_MS);

      // 4. Fetch stock trades
      const stockTrades = await getTradesForPolitician(member.name, chamber);
      await sleep(RATE_LIMIT_MS);

      // 5. Search for lawsuits (CourtListener)
      const lawsuits = await searchLawsuits(member.name, CL_TOKEN);
      await sleep(RATE_LIMIT_MS);

      // Build politician object
      const politicianId = generateId(member.name, member.state, chamber);

      let politician: Politician = {
        id: politicianId,
        name: formatName(member.name),
        state: member.state,
        party: member.party,
        chamber,
        title: chamber === 'Senate' ? 'Senator' : 'Representative',
        since,
        bioguideId: member.bioguideId,
        fecCandidateId: fecId || undefined,
        imageUrl: member.imageUrl,
        lobbyMoney,
        stockTrades,
        lawsuits,
        votes,
        funding,
        viewSummary: buildViewSummary({
          name: formatName(member.name),
          funding,
          lobbyMoney,
          stockTrades,
          lawsuits,
        }),
        profileComplete: Boolean((Array.isArray(lobbyMoney)&&lobbyMoney.length>0)||(Array.isArray(stockTrades)&&stockTrades.length>0)||(Array.isArray(lawsuits)&&lawsuits.length>0)),
        dataVersion: run.startedAt,
        score: {
          total: 0, lobbyScore: 0, alignScore: 0, stockScore: 0, legalScore: 0,
          totalMoney: 0, conflictTrades: 0, donorAlignedVotes: 0, totalTrackedVotes: 0,
          lastUpdated: run.startedAt,
        },
      };

      // 6. Annotate vote alignment and calculate score
      politician = annotateVoteAlignment(politician);
      politician.score = calculateScore(politician);

      politicians.push(politician);
      // Commit to prod every BATCH_SIZE officials added.
      await flushAndCommit(`batch through ${i + 1}/${members.length}`);
      run.politiciansProcessed++;

      const { total, label } = scoreLabel(politician.score.total);
      process.stdout.write(` Ã¢ÂÂ score=${total} (${label})\n`);

    } catch (err) {
      const msg = `${member.name}: ${(err as Error).message}`;
      run.errors.push(msg);
      process.stdout.write(` Ã¢ÂÂ ERROR: ${(err as Error).message}\n`);
    }
  }

  // Write output
  console.log('\nÃ°ÂÂÂ¾ Writing output files...');

  // (politicians.json is written by flushAndCommit below, with merged data.)

  // Final flush: commit any remaining officials (< BATCH_SIZE).
  await flushAndCommit('final batch', true);

  run.completedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(OUT_DIR, 'pipeline-log.json'),
    JSON.stringify(run, null, 2),
    'utf-8'
  );

  const duration = Math.round(
    (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000
  );

  console.log('\n' + 'Ã¢ÂÂ'.repeat(50));
  console.log(`Ã¢ÂÂ Pipeline complete`);
  console.log(`   Politicians processed: ${run.politiciansProcessed}`);
  console.log(`   Errors: ${run.errors.length}`);
  console.log(`   Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log(`   Output: data/politicians.json`);
  if (run.errors.length > 0) {
    console.log('\nÃ¢ÂÂ Ã¯Â¸Â  Errors:');
    run.errors.forEach(e => console.log(`   - ${e}`));
  }
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Helpers Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/**
 * Builds a plain-language summary of a politician's money & influence profile
 * from already-fetched, sourced data (no fabrication). Shows "unavailable" when
 * FEC finance is missing rather than implying $0.
 */
function buildViewSummary(input: {
  name: string;
  funding: import("./sources/fec").FundingProfile;
  lobbyMoney: Array<{ amount: number }>;
  stockTrades: Array<{ conflict?: boolean }>;
  lawsuits: Array<unknown>;
}): string {
  const { name, funding, lobbyMoney, stockTrades, lawsuits } = input;
  const parts: string[] = [];

  if (funding && funding.available && funding.totalRaised > 0) {
    const yr = funding.periodYear ? ` (through ${funding.periodYear})` : "";
    parts.push(
      `${name} raised ${fmtMoney(funding.totalRaised)} in reported campaign funds${yr}.`,
    );
    if (funding.bigMoneyShare != null && funding.smallDonorShare != null) {
      const bigPct = Math.round(funding.bigMoneyShare * 100);
      const smallPct = Math.round(funding.smallDonorShare * 100);
      parts.push(
        `About ${bigPct}% came from large donors, PACs and committee transfers ` +
          `(${fmtMoney(funding.largeDonorMoney)} itemized, ${fmtMoney(funding.pacMoney)} PAC), ` +
          `while ${smallPct}% (${fmtMoney(funding.smallDonorMoney)}) came from small grassroots donors.`,
      );
      if (bigPct >= 60) {
        parts.push("This funding mix leans heavily on big-money sources, a higher influence-risk signal.");
      } else if (smallPct >= 50) {
        parts.push("This funding mix is grassroots-leaning, a lower influence-risk signal.");
      }
    }
  } else {
    parts.push(`${name}: campaign-finance totals are unavailable (no matched FEC committee).`);
  }

  const trackedLobby = lobbyMoney.reduce((s, l) => s + (l.amount || 0), 0);
  if (trackedLobby > 0) {
    parts.push(`Tracked industry/PAC contributions identified so far total ${fmtMoney(trackedLobby)}.`);
  }

  const conflicts = stockTrades.filter((t) => t.conflict).length;
  if (stockTrades.length > 0) {
    parts.push(
      `${stockTrades.length} disclosed stock trade(s)` +
        (conflicts > 0 ? `, ${conflicts} flagged as a potential conflict of interest.` : "."),
    );
  }

  if (lawsuits.length > 0) {
    parts.push(`${lawsuits.length} legal action(s)/lawsuit(s) on record.`);
  }

  return parts.join(" ");
}

function generateId(name: string, state: string, chamber: string): string {
  const prefix = chamber === 'Senate' ? 'sen' : 'rep';
  const slug = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('-');
  const stateSlug = state.toLowerCase().replace(/\s+/g, '-').slice(0, 2);
  return `${prefix}-${slug}-${stateSlug}`;
}

function formatName(name: string): string {
  // Congress.gov returns "LAST, FIRST M." Ã¢ÂÂ convert to "First Last"
  const parts = name.split(',').map(s => s.trim());
  if (parts.length === 2) {
    const first = parts[1].split(' ')[0];
    return `${first} ${parts[0]}`;
  }
  return name;
}

function scoreLabel(score: number): { total: number; label: string } {
  const label = score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'ELEVATED' : 'LOW';
  return { total: score, label };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('\nÃ¢ÂÂ Fatal pipeline error:', err);
  process.exit(1);
});
