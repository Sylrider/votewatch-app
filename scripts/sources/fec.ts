/**
 * scripts/sources/fec.ts
 * Fetches campaign finance data from the FEC Open Data API.
 *
 * API docs: https://api.open.fec.gov/developers/
 * Free API key: https://api.data.gov/signup/
 * Rate limit: 1,000 requests/hour on free tier
 *
 * Key concepts:
 *  - Each politician has a "candidate_id" (e.g. "S8TX00207" for Cruz in Senate TX)
 *  - PAC committees that donate to candidates are tracked in Schedule B
 *  - We match PAC names to known lobby categories via LOBBY_MAP
 */

import type { FECCandidate, LobbyContribution } from '../../lib/types';
import { classifyLobby } from '../lobby-map';

const BASE = 'https://api.open.fec.gov/v1';

async function get(path: string, apiKey: string, params: Record<string, string | number> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('api_key', apiKey);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FEC ${path} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Find FEC candidate ID ────────────────────────────────────────────────────

export async function findCandidateId(
  name: string,
  state: string,
  office: 'S' | 'H' | 'P',       // Senate / House / President
  apiKey: string
): Promise<string | null> {
  try {
    const data = await get('/candidates/search/', apiKey, {
      q: name,
      state,
      office,
      is_active_candidate: 'true',
      per_page: 5,
    });

    const results: FECCandidate[] = data.results || [];

    // Best match: name contains a significant part of search name
    const nameLower = name.toLowerCase();
    const match = results.find(c =>
      c.name.toLowerCase().includes(nameLower.split(',')[0].toLowerCase())
    );

    return match?.candidate_id || results[0]?.candidate_id || null;
  } catch {
    return null;
  }
}

// ─── Get total receipts and top donors ───────────────────────────────────────

export async function fetchCandidateFinance(
  candidateId: string,
  apiKey: string
): Promise<{ totalReceipts: number; topDonors: Array<{ name: string; total: number; industry?: string }> }> {
  try {
    // Get candidate totals across all election cycles
    const totalsData = await get(`/candidate/${candidateId}/totals/`, apiKey, {
      sort: '-cycle',
      per_page: 8,
    });

    const allCycles = totalsData.results || [];
    const totalReceipts = allCycles.reduce((sum: number, c: any) => sum + (c.receipts || 0), 0);

    // Get top PAC committees donating to this candidate
    const committeesData = await get('/schedules/schedule_b/', apiKey, {
      recipient_id: candidateId,
      per_page: 50,
      sort: '-total',
      // Aggregate by committee
    });

    // Aggregate by contributor name
    const donorMap = new Map<string, number>();
    for (const row of (committeesData.results || [])) {
      const name: string = row.contributor_name || 'Unknown';
      donorMap.set(name, (donorMap.get(name) || 0) + (row.contribution_receipt_amount || 0));
    }

    const topDonors = Array.from(donorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, total]) => ({
        name,
        total,
        industry: classifyLobby(name)?.id,
      }));

    return { totalReceipts, topDonors };
  } catch (err) {
    console.warn(`    FEC finance fetch failed for ${candidateId}:`, (err as Error).message);
    return { totalReceipts: 0, topDonors: [] };
  }
}

// ─── Build LobbyContributions from FEC donor data ────────────────────────────

export async function buildLobbyContributions(
  candidateId: string,
  apiKey: string
): Promise<LobbyContribution[]> {
  const { topDonors } = await fetchCandidateFinance(candidateId, apiKey);

  const contributions: LobbyContribution[] = [];
  const lobbyTotals = new Map<string, number>();

  for (const donor of topDonors) {
    const lobby = classifyLobby(donor.name);
    if (!lobby) continue;

    const existing = lobbyTotals.get(lobby.id) || 0;
    lobbyTotals.set(lobby.id, existing + donor.total);
  }

  for (const [lobbyId, total] of Array.from(lobbyTotals.entries())) {
    const lobby = getLobbyById(lobbyId);
    if (!lobby) continue;

    contributions.push({
      lobbyId,
      lobbyName: lobby.name,
      amount: Math.round(total),
      intent: lobby.defaultIntent,
      cycle: 'career',
      source: 'FEC',
    });
  }

  return contributions.sort((a, b) => b.amount - a.amount);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getLobbyById(id: string): { name: string; defaultIntent: string } | null {
  const LOBBY_INFO: Record<string, { name: string; defaultIntent: string }> = {
    nra: { name: 'National Rifle Association (NRA)', defaultIntent: 'Block gun safety legislation, promote firearms deregulation' },
    pharma: { name: 'PhRMA – Pharmaceutical Manufacturers', defaultIntent: 'Block drug price negotiation, protect pharmaceutical patents' },
    api: { name: 'American Petroleum Institute (API)', defaultIntent: 'Block climate legislation, support fossil fuel subsidies and deregulation' },
    uscc: { name: 'U.S. Chamber of Commerce', defaultIntent: 'Reduce corporate taxes, oppose labor regulations, support deregulation' },
    aipac: { name: 'AIPAC – American Israel Public Affairs Committee', defaultIntent: 'Support unconditional military aid to Israel, oppose arms embargo conditions' },
    finance: { name: 'Wall Street / Financial Industry', defaultIntent: 'Oppose financial regulation, support bank deregulation' },
    defense: { name: 'Defense Industry (MICC)', defaultIntent: 'Support defense budget increases, weapons procurement contracts' },
    tech: { name: 'Big Tech Industry', defaultIntent: 'Oppose antitrust enforcement, limit platform liability regulations' },
    realestate: { name: 'Real Estate Industry (NAR)', defaultIntent: 'Support tax incentives for real estate, oppose rent control' },
    health: { name: 'Health Insurance Industry (AHIP)', defaultIntent: 'Oppose public option / Medicare for All, protect private insurance market' },
    labor: { name: 'AFL-CIO / Labor Unions', defaultIntent: 'Support union organizing rights, minimum wage increases, worker protections' },
    nea: { name: 'National Education Association (NEA)', defaultIntent: 'Support education funding, teacher collective bargaining, oppose school vouchers' },
    agribusiness: { name: 'Agribusiness (Farm Bureau)', defaultIntent: 'Support farm subsidies, oppose environmental regulations on agriculture' },
    telecom: { name: 'Telecommunications Industry', defaultIntent: 'Oppose net neutrality, support broadband monopoly protections' },
    crypto: { name: 'Cryptocurrency Industry', defaultIntent: 'Oppose crypto regulation, support blockchain financial deregulation' },
  };
  return LOBBY_INFO[id] || null;
}
