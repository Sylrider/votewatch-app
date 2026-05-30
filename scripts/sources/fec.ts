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
  if (!res.ok) throw new Error(`FEC ${path} â HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// âââ Find FEC candidate ID ââââââââââââââââââââââââââââââââââââââââââââââââââââ

const STATE_CODES: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC', 'puerto rico': 'PR', 'guam': 'GU', 'american samoa': 'AS',
  'virgin islands': 'VI', 'northern mariana islands': 'MP',
};

// FEC stores state as a 2-letter postal code. Congress.gov often returns the full name.
function toStateCode(state: string): string {
  if (!state) return '';
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  return STATE_CODES[s.toLowerCase()] || s.toUpperCase();
}

export async function findCandidateId(
  name: string,
  state: string,
  office: 'S' | 'H' | 'P',      // Senate / House / President
  apiKey: string
): Promise<string | null> {
  // Normalize a name for comparison: uppercase, drop punctuation/suffixes, collapse spaces.
  const norm = (s: string) =>
    s.toUpperCase()
      .replace(/[.,]/g, ' ')
      .replace(/\b(JR|SR|II|III|IV)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Congress.gov gives "Last, First M." -> derive last + first tokens.
  const parts = name.split(',');
  const lastName = norm(parts[0] || '');
  const firstName = norm(parts[1] || '');
  const firstToken = firstName.split(' ')[0] || '';
  const stateCode = toStateCode(state);

  let results: FECCandidate[] = [];
  try {
    const data = await get('/candidates/search/', apiKey, {
      q: parts[0]?.trim() || name,
      state: stateCode,
      office,
      is_active_candidate: 'true',
      sort: '-first_file_date',
      per_page: 20,
    });
    results = data.results || [];
  } catch (err) {
    console.warn(`  â  FEC candidate search failed for "${name}" (${state}/${office}): ${(err as Error).message} â no donor data for this official.`);
    return null;
  }

  if (results.length === 0) {
    console.warn(`  â  FEC: no candidates returned for "${name}" (${state}/${office}) â no donor data.`);
    return null;
  }

  // Prefer a candidate whose normalized name matches BOTH last and first name.
  let match = results.find(c => {
    const n = norm(c.name || '');
    return n.includes(lastName) && (firstToken ? n.includes(firstToken) : true);
  });

  // Next best: last-name match only.
  if (!match) match = results.find(c => norm(c.name || '').includes(lastName));

  // If the office+state filter already narrowed to a single candidate, trust it.
  if (!match && results.length === 1) match = results[0];

  if (!match) {
    console.warn(`  â  FEC: no name match for "${name}" (${state}/${office}) among ${results.length} candidates â no donor data.`);
    return null;
  }

  return match.candidate_id || null;
}

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

// âââ Build LobbyContributions from FEC donor data ââââââââââââââââââââââââââââ

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

// âââ Internal helpers âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function getLobbyById(id: string): { name: string; defaultIntent: string } | null {
  const LOBBY_INFO: Record<string, { name: string; defaultIntent: string }> = {
    nra: { name: 'National Rifle Association (NRA)', defaultIntent: 'Block gun safety legislation, promote firearms deregulation' },
    pharma: { name: 'PhRMA â Pharmaceutical Manufacturers', defaultIntent: 'Block drug price negotiation, protect pharmaceutical patents' },
    api: { name: 'American Petroleum Institute (API)', defaultIntent: 'Block climate legislation, support fossil fuel subsidies and deregulation' },
    uscc: { name: 'U.S. Chamber of Commerce', defaultIntent: 'Reduce corporate taxes, oppose labor regulations, support deregulation' },
    aipac: { name: 'AIPAC â American Israel Public Affairs Committee', defaultIntent: 'Support unconditional military aid to Israel, oppose arms embargo conditions' },
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
