/**
 * scripts/score.ts
 * Calculates the Transparency Risk Score for each politician.
 *
 * Score = Lobby Score (0-25) + Alignment Score (0-25) + Stock Score (0-25) + Legal Score (0-25). Four equally-weighted 25% pillars.
 */

import type { Politician, TransparencyScore, Vote, LobbyContribution, StockTrade, Lawsuit } from '../lib/types';

// Known lobby positions on major bills - used to calculate donor-vote alignment
// Format: { billKeyword: { lobbyId: expectedVote } }
const LOBBY_POSITIONS: Record<string, Record<string, 'YEA' | 'NAY'>> = {
  'inflation reduction': { api: 'NAY', pharma: 'NAY', nra: 'NAY', uscc: 'NAY' },
  'background check':    { nra: 'NAY' },
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
 * Money-Influence Score: 0-25. Driven by REAL FEC funding when available:
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
    const bigMoneyDollars = funding.largeDonorMoney + funding.pacMoney;
    const base = Math.min(20, (bigMoneyDollars / 100_000) * 0.8);
    const share = funding.bigMoneyShare == null ? 0.5 : funding.bigMoneyShare;
    const shareMult = 0.6 + share * 0.65;
    return Math.min(25, base * shareMult);
  }
  const total = contributions.reduce((s, l) => s + l.amount, 0);
  return Math.min(25, (total / 100_000) * 1.2);
}

/** Donor-Vote Alignment Score: 0-25 */
function calcAlignScore(votes: Vote[], contributions: LobbyContribution[]): number {
  if (votes.length === 0) return 0;

  const donorLobbyIds = new Set(contributions.map(c => c.lobbyId));
  let alignedCount = 0;

  for (const vote of votes) {
    if (isAlignedWithDonors(vote, donorLobbyIds)) {
      alignedCount++;
    }
  }

  return (alignedCount / votes.length) * 25;
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

export function isAlignedWithDonors(vote: Vote, donorLobbyIds: Set<string>): boolean {
  const billLower = (vote.bill || '').toLowerCase();

  for (const [keyword, positions] of Object.entries(LOBBY_POSITIONS)) {
    if (!billLower.includes(keyword)) continue;

    for (const [lobbyId, expectedVote] of Object.entries(positions)) {
      if (!donorLobbyIds.has(lobbyId)) continue;
      if (vote.vote === expectedVote) return true;
    }
  }

  return false;
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
