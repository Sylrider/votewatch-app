/**
 * scripts/score.ts
 * Calculates the Transparency Risk Score for each politician.
 *
 * Score = Lobby Score (0-25) + Alignment Score (0-25) + Stock Score (0-25) + Legal Score (0-25). Four equally-weighted 25% pillars.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Politician, TransparencyScore, Vote, LobbyContribution, StockTrade, Lawsuit } from '../lib/types';
import { classifyBill, voteServesLobby, type EnrichedBill } from './galaxies';

// --- Enriched bill lookup (data/bills.json), keyed congress:type:number ---
// Produced by scripts/enrich-bills.ts. Read once, lazily. If absent, alignment
// gracefully degrades to the legacy keyword model below (never crashes a build).
let BILLS: Record<string, EnrichedBill> | null = null;
function loadBills(): Record<string, EnrichedBill> {
  if (BILLS) return BILLS;
  try {
    const p = path.join(process.cwd(), 'data', 'bills.json');
    BILLS = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, EnrichedBill>;
  } catch {
    BILLS = {};
  }
  return BILLS;
}

// Parse a vote.bill string (e.g. "H.R. 82", "S.4367", "118 hr 10545") into the
// bills.json key congress:type:number. Defaults to the 118th Congress when the
// congress number is not encoded in the string.
export function billKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[.\s]+/g, ' ').trim();
  let congress = 118;
  const cm = s.match(/^(\d{3})\s+/);
  let rest = s;
  if (cm) { congress = parseInt(cm[1], 10); rest = s.slice(cm[0].length); }
  const m = rest.match(/\b(hr|hres|hconres|hjres|s|sres|sconres|sjres)\b\s*(\d+)/);
  if (!m) return null;
  return congress + ':' + m[1] + ':' + m[2];
}

// --- Legacy keyword positions (fallback only) ---
// Known lobby positions on major bills - used only when an enriched bill record
// is unavailable. Kept as a safety net so older curated votes still score.
const LOBBY_POSITIONS: Record<string, Record<string, 'YEA' | 'NAY'>> = {
  'inflation reduction': { api: 'NAY', pharma: 'NAY', nra: 'NAY', uscc: 'NAY' },
  'background check':     { nra: 'NAY' },
  'safer communities':   { nra: 'NAY' },
  'assault weapons':     { nra: 'NAY' },
  'red flag':            { nra: 'NAY' },
  'drug cost':           { pharma: 'NAY' },
  'insulin':             { pharma: 'NAY' },
  'medicare negotiat':   { pharma: 'NAY' },
  'clean energy':        { api: 'NAY' },
  'carbon':              { api: 'NAY' },
  'climate':             { api: 'NAY' },
  'minimum wage':        { uscc: 'NAY' },
  'pro act':             { uscc: 'NAY' },
  'union':               { uscc: 'NAY' },
  'israel':              { aipac: 'YEA' },
  'iron dome':           { aipac: 'YEA' },
  'military aid':        { aipac: 'YEA' },
  'ndaa':                { defense: 'YEA' },
  'defense authorization': { defense: 'YEA' },
  'dodd-frank':          { finance: 'NAY' },
  'net neutrality':      { telecom: 'NAY' },
};

// --- Main scoring function ---

export function calculateScore(politician: Politician): TransparencyScore {
  const lobbyScore  = calcMoneyScore(politician.funding, politician.lobbyMoney);
  const alignScore  = calcAlignScore(politician.votes, politician.lobbyMoney);
  const stockScore  = calcStockScore(politician.stockTrades);
  const legalScore  = calcLegalScore(politician.lawsuits);

  const total = Math.min(100, Math.round(lobbyScore + alignScore + stockScore + legalScore));

  const conflictTrades = politician.stockTrades.filter(t => t.conflict).length;
  const totalMoney =
    politician.funding && politician.funding.available
      ? politician.funding.totalRaised
      : politician.lobbyMoney.reduce((s, l) => s + l.amount, 0);
  const donorAlignedVotes = politician.votes.filter(v => v.alignsWithDonors).length;

  return {
    total,
    lobbyScore:  Math.round(lobbyScore),
    alignScore:  Math.round(alignScore),
    stockScore:  Math.round(stockScore),
    legalScore:  Math.round(legalScore),
    totalMoney,
    conflictTrades,
    donorAlignedVotes,
    totalTrackedVotes: politician.votes.length,
    lastUpdated: new Date().toISOString(),
  };
}

// --- Component calculators ---

/**
 * Money-Influence Score: 0-25. Driven by REAL FEC funding when available.
 * big-money dollars (large itemized individual + PAC) scaled per $100K, then
 * weighted by the big-money share so a high reliance on large/PAC money raises
 * risk and a grassroots (small-donor) base lowers it. Falls back to tracked
 * lobby contributions when no FEC funding profile is available.
 */
function calcMoneyScore(
  funding: Politician['funding'],
  contributions: LobbyContribution[],
): number {
  if (funding && funding.available && funding.totalRaised > 0) {
    // Outside / Super PAC independent expenditures (Schedule E) signal concentrated
    // influence beyond a candidate's own receipts, so they add to the big-money base.
    // Independent spend is NOT part of receipts, so it does not affect the grassroots share.
    const outsideTotal = (funding.outsideSpending || []).reduce((s, e) => s + (e.amount || 0), 0);
    const bigMoneyDollars = funding.largeDonorMoney + funding.pacMoney + outsideTotal;
    const base = Math.min(20, (bigMoneyDollars / 100_000) * 0.8);
    const share = funding.bigMoneyShare == null ? 0.5 : funding.bigMoneyShare;
    const shareMult = 0.6 + share * 0.65;
    return Math.min(25, base * shareMult);
  }
  const total = contributions.reduce((s, l) => s + l.amount, 0);
  return Math.min(25, (total / 100_000) * 1.2);
}

/**
 * Donor-Vote Alignment Score: 0-25.
 * A vote counts as donor-aligned ONLY when all three hold:
 *   1. the bill is enriched and classifies into a lobby topic (galaxies),
 *   2. that lobby is among the politician's donors,
 *   3. the bill summary carries a DEFENSIBLE directional cue that the
 *      politician's YEA/NAY served that lobby (voteServesLobby).
 * On-topic-but-direction-unknown votes are deliberately NOT counted. We never
 * guess a direction. The denominator is the count of donor-topic votes (votes
 * that touch a donor lobby at all), so the score reflects how often a member
 * sided with a paying lobby among the votes where that lobby had a stake.
 */
function calcAlignScore(votes: Vote[], contributions: LobbyContribution[]): number {
  if (votes.length === 0) return 0;
  const donorLobbyIds = new Set(contributions.map(c => c.lobbyId));

  let onTopicWithDonor = 0;
  let alignedCount = 0;

  for (const vote of votes) {
    const r = alignmentForVote(vote, donorLobbyIds);
    if (r.onTopicWithDonor) onTopicWithDonor++;
    if (r.aligned) alignedCount++;
  }

  if (onTopicWithDonor === 0) return 0;
  return (alignedCount / onTopicWithDonor) * 25;
}

/** Stock Trade Conflict Score: 0-25 */
function calcStockScore(trades: StockTrade[]): number {
  const conflictTrades = trades.filter(t => t.conflict);
  const hasLargeTrade = conflictTrades.some(t => t.amount >= 500_000);
  return Math.min(25, conflictTrades.length * 5 + (hasLargeTrade ? 10 : 0));
}

/** Legal Record Score: 0-25 */
function calcLegalScore(lawsuits: Lawsuit[]): number {
  const weights = { high: 7, medium: 4, low: 1 };
  const total = lawsuits.reduce((s, l) => s + weights[l.severity], 0);
  return Math.min(25, total * (25 / 15));
}

// --- Vote alignment checker ---

export type VoteAlignment = {
  onTopic: boolean;            // bill classifies into any lobby topic
  onTopicWithDonor: boolean;   // ...and at least one such lobby is a donor
  aligned: boolean;            // ...and a defensible direction served that donor lobby
  lobbies: string[];           // donor lobbies the bill is on-topic for
};

/**
 * Resolve a vote against the donor lobby set using enriched bills + galaxies.
 * Falls back to the legacy keyword model only when no enriched record exists.
 */
export function alignmentForVote(vote: Vote, donorLobbyIds: Set<string>): VoteAlignment {
  const empty: VoteAlignment = { onTopic: false, onTopicWithDonor: false, aligned: false, lobbies: [] };
  const bills = loadBills();
  const key = billKey(vote.bill);
  const bill = key ? bills[key] : undefined;

  if (bill && bill.ok) {
    const matches = classifyBill(bill);
    if (matches.length === 0) return empty;
    const donorLobbies = matches.map(m => m.lobby).filter(l => donorLobbyIds.has(l));
    const onTopicWithDonor = donorLobbies.length > 0;
    let aligned = false;
    for (const lobby of donorLobbies) {
      if (voteServesLobby(bill, lobby, vote.vote) === 'serves-lobby') { aligned = true; break; }
    }
    return {
      onTopic: true,
      onTopicWithDonor,
      aligned: aligned && onTopicWithDonor,
      lobbies: donorLobbies,
    };
  }

  // Legacy fallback (no enriched record): keyword positions.
  const billLower = ((vote.bill || '') + ' ' + (vote.note || '')).toLowerCase();
  const lobbies: string[] = [];
  let aligned = false;
  for (const [keyword, positions] of Object.entries(LOBBY_POSITIONS)) {
    if (!billLower.includes(keyword)) continue;
    for (const [lobbyId, expectedVote] of Object.entries(positions)) {
      if (!donorLobbyIds.has(lobbyId)) continue;
      lobbies.push(lobbyId);
      if (vote.vote === expectedVote) aligned = true;
    }
  }
  const onTopicWithDonor = lobbies.length > 0;
  return { onTopic: onTopicWithDonor, onTopicWithDonor, aligned: aligned && onTopicWithDonor, lobbies };
}

/** Back-compat boolean used by older callers and the Vote annotation. */
export function isAlignedWithDonors(vote: Vote, donorLobbyIds: Set<string>): boolean {
  return alignmentForVote(vote, donorLobbyIds).aligned;
}

/** Annotates votes with alignsWithDonors flag. Call after fetching both votes and contributions. */
export function annotateVoteAlignment(politician: Politician): Politician {
  const donorLobbyIds = new Set(politician.lobbyMoney.map(c => c.lobbyId));

  const annotatedVotes = politician.votes.map(vote => ({
    ...vote,
    alignsWithDonors: isAlignedWithDonors(vote, donorLobbyIds),
  }));

  return { ...politician, votes: annotatedVotes };
}

// --- Risk label helper ---

export function riskLabel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'CRITICAL',  color: '#ef4444' };
  if (score >= 50) return { label: 'HIGH RISK', color: '#f97316' };
  if (score >= 25) return { label: 'ELEVATED',  color: '#eab308' };
  return               { label: 'LOW RISK',   color: '#22c55e' };
}
