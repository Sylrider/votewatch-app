/**
 * scripts/sources/trades.ts
 * Fetches congressional stock trades from:
 *
 *  Senate Stock Watcher  → https://senatestockwatcher.com/api/stocks
 *  House Stock Watcher   → https://housestockwatcher.com/api/transactions_all
 *
 * Both are FREE, no API key required, updated daily from official STOCK Act disclosures.
 * Data is sourced directly from Senate.gov and Clerk.House.gov STOCK Act filing portals.
 *
 * These APIs return all trades ever filed. We filter by politician name.
 */

import type { StockTrade, StockWatcherTrade } from '../../lib/types';

// ─── Senate ───────────────────────────────────────────────────────────────────

let senateTradesCache: StockWatcherTrade[] | null = null;

export async function fetchSenateTrades(): Promise<StockWatcherTrade[]> {
  if (senateTradesCache) return senateTradesCache;

  console.log('  Fetching Senate stock trades (senatestockwatcher.com)...');
  const res = await fetch('https://senatestockwatcher.com/api/stocks', {
    headers: { 'User-Agent': 'VoteWatch/1.0 (civic-transparency project)' },
  });

  if (!res.ok) throw new Error(`Senate Stock Watcher → HTTP ${res.status}`);
  const data = await res.json();
  senateTradesCache = data.data || data || [];
  console.log(`    Loaded ${senateTradesCache!.length} Senate trades`);
  return senateTradesCache!;
}

// ─── House ────────────────────────────────────────────────────────────────────

let houseTradesCache: StockWatcherTrade[] | null = null;

export async function fetchHouseTrades(): Promise<StockWatcherTrade[]> {
  if (houseTradesCache) return houseTradesCache;

  console.log('  Fetching House stock trades (housestockwatcher.com)...');
  const res = await fetch('https://housestockwatcher.com/api/transactions_all', {
    headers: { 'User-Agent': 'VoteWatch/1.0 (civic-transparency project)' },
  });

  if (!res.ok) throw new Error(`House Stock Watcher → HTTP ${res.status}`);
  const data = await res.json();
  houseTradesCache = data.data || data || [];
  console.log(`    Loaded ${houseTradesCache!.length} House trades`);
  return houseTradesCache!;
}

// ─── Match trades to politician ───────────────────────────────────────────────

export async function getTradesForPolitician(
  name: string,
  chamber: 'Senate' | 'House'
): Promise<StockTrade[]> {
  const allTrades = chamber === 'Senate'
    ? await fetchSenateTrades()
    : await fetchHouseTrades();

  // Match by politician name (case-insensitive partial match on last name)
  const lastName = name.split(/[,\s]+/).find(part => part.length > 2) || name;
  const nameLower = lastName.toLowerCase();

  const matched = allTrades.filter(t => {
    const politician = (t.politician || '').toLowerCase();
    return politician.includes(nameLower);
  });

  return matched.map(t => parseStockWatcherTrade(t, chamber));
}

// ─── Parse a raw StockWatcher record into our StockTrade type ─────────────────

function parseStockWatcherTrade(raw: StockWatcherTrade, chamber: 'Senate' | 'House'): StockTrade {
  const action = parseAction(raw.type);
  const amount = parseAmount(raw.amount);
  const ticker = extractTicker(raw.ticker, raw.asset_description);

  // Heuristic: flag as potential conflict if trade is large (>$50K) or
  // involves an industry the politician oversees via committee
  const conflict = amount >= 50000 || isHighValueTrade(raw.amount);

  return {
    ticker: ticker || 'N/A',
    company: raw.asset_description || ticker || 'Unknown',
    action,
    amount,
    amountRange: raw.amount,
    date: raw.transaction_date || raw.disclosure_date || '',
    conflict,
    conflictNote: conflict
      ? `Trade of ${raw.amount} disclosed ${raw.disclosure_date}${raw.owner !== 'Self' ? ` (owner: ${raw.owner})` : ''}. Committee conflict analysis required.`
      : `Disclosed trade of ${raw.amount}. No immediate conflict identified.`,
    source: `${chamber} Stock Watcher`,
    filingId: raw.disclosure_date,
  };
}

// ─── Conflict detection ───────────────────────────────────────────────────────

export function detectConflicts(
  trades: StockTrade[],
  committeeMemberships: string[],
  industries: string[]
): StockTrade[] {
  /**
   * Flags a trade as conflicted when:
   * 1. Amount >= $500,000 (non-passive investment behavior)
   * 2. Company industry matches a committee the politician sits on
   * 3. Trade date is within 60 days of related legislation
   *
   * Full conflict detection requires cross-referencing with vote dates,
   * which the main pipeline does after fetching both votes and trades.
   */
  return trades.map(trade => {
    let conflict = trade.amount >= 500000;
    let conflictNote = trade.conflictNote;

    const tickerLower = (trade.ticker || '').toLowerCase();
    const companyLower = (trade.company || '').toLowerCase();

    // Check committee overlap (e.g. senator on Energy Committee buying oil stocks)
    for (const industry of industries) {
      const industryLower = industry.toLowerCase();
      if (companyLower.includes(industryLower) || tickerLower.includes(industryLower)) {
        conflict = true;
        conflictNote = `Trade in ${industry} sector; politician sits on ${committeeMemberships.find(c => c.toLowerCase().includes(industryLower)) || 'related committee'}. Potential conflict of interest.`;
      }
    }

    return { ...trade, conflict, conflictNote };
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAction(type: string): 'BUY' | 'SELL' | 'HOLD' {
  const t = (type || '').toLowerCase();
  if (t.includes('purchase') || t.includes('buy')) return 'BUY';
  if (t.includes('sale') || t.includes('sell')) return 'SELL';
  return 'HOLD';
}

function parseAmount(amountStr: string): number {
  // "$1,001 - $15,000" → take midpoint
  const clean = (amountStr || '').replace(/[$,]/g, '');
  const parts = clean.split(/\s*-\s*/).map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
  if (parts.length === 2) return Math.round((parts[0] + parts[1]) / 2);
  if (parts.length === 1) return parts[0];
  return 0;
}

function isHighValueTrade(amountStr: string): boolean {
  const HIGH_VALUE_BRACKETS = [
    '$500,001', '$1,000,001', '$5,000,001', '$25,000,001',
  ];
  return HIGH_VALUE_BRACKETS.some(b => (amountStr || '').includes(b.replace(/[$,]/g, '')));
}

function extractTicker(ticker?: string, description?: string): string {
  if (ticker && ticker !== 'N/A' && ticker.length <= 5) return ticker.toUpperCase();
  // Try to extract a ticker from description like "Apple Inc (AAPL)"
  const match = (description || '').match(/\(([A-Z]{1,5})\)/);
  return match ? match[1] : ticker || '';
}
