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
const FUNDING_CYCLE = 2024;
const MAX_PAGES = 8; // up to 800 largest org/PAC contributions

async function get(path: string, apiKey: string, params: Record<string, string | number> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('api_key', apiKey);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  // Retry on rate-limit (429) and transient 5xx with exponential backoff.
  const MAX_ATTEMPTS = 6;
  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(url.toString());
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(60000, 2000 * Math.pow(2, attempt - 1));
      console.warn(
        `[fec] HTTP ${res.status} on ${path} - backoff ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`FEC ${path} - HTTP ${res.status}: ${await res.text()}`);
  }
}

// --- Find FEC candidate ID ---

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
      sort: '-first_file_date',
      per_page: 20,
    });
    results = data.results || [];
  } catch (err) {
    console.warn(`   FEC candidate search failed for "${name}" (${state}/${office}): ${(err as Error).message} - no donor data for this official.`);
    return null;
  }

  if (results.length === 0) {
    console.warn(`   FEC: no candidates returned for "${name}" (${state}/${office}) - no donor data.`);
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
    console.warn(`   FEC: no name match for "${name}" (${state}/${office}) among ${results.length} candidates - no donor data.`);
    return null;
  }

  return match.candidate_id || null;
}

export async function fetchCandidateFinance(
  candidateId: string,
  apiKey: string
): Promise<{ totalReceipts: number; topDonors: Array<{ name: string; total: number; industry?: string }> }> {
  // OPTION A baseline: use the FEC /totals endpoint (which works cleanly and is
  // queryable by candidate_id) for real total receipts. Itemized donor->lobby
  // breakdown (schedule_a via committee_id) is a follow-up (Option B), so topDonors
  // is intentionally left empty here rather than fabricated.
  try {
    const data = await get(`/candidate/${candidateId}/totals/`, apiKey, {
      per_page: 1,
    });
    const row = (data.results || [])[0];
    const totalReceipts = row && typeof row.receipts === 'number' ? row.receipts : 0;
    return { totalReceipts, topDonors: [] };
  } catch (err) {
    console.warn(`   FEC finance fetch failed for ${candidateId}: ${(err as Error).message} - receipts unavailable.`);
    return { totalReceipts: 0, topDonors: [] };
  }
}

export interface FundingProfile {
  available: boolean;
  periodYear?: string;
  totalRaised: number;
  largeDonorMoney: number;
  smallDonorMoney: number;
  pacMoney: number;
  partyMoney: number;
  transferMoney: number;
  otherMoney: number;
  bigMoneyShare: number | null;
  smallDonorShare: number | null;
  confidence: "high" | "medium" | "low";
  sources: string[];
  // Super PAC / outside independent expenditures (Schedule E). Independent spend,
  // tracked separately from receipts. Omitted/empty when no data - never fabricated.
  outsideSpending?: Array<{
    spender: string;
    amount: number;
    position: "support" | "oppose";
    source: string;
    committeeType?: string;
    orgType?: string;
    party?: string;
  }>;
  // Named large individual donors (Schedule A, individuals). Never fabricated.
  topIndividualDonors?: Array<{
    name: string;
    employer?: string;
    occupation?: string;
    amount: number;
  }>;
}

/**
 * Build a full campaign-finance profile from the FEC /totals endpoint.
 * Picks the most-recent reporting period (by coverage_end_date) that has receipts.
 * Big-money share = (itemized individual + PAC + party + transfers) / receipts;
 * small-donor share = unitemized individual / receipts. Returns available:false
 * (NOT zeros) when the candidate has no FEC committee, so the UI can show "unavailable".
 */
export async function fetchFundingProfile(
  candidateId: string | null,
  apiKey: string,
): Promise<FundingProfile> {
  const empty: FundingProfile = {
    available: false,
    totalRaised: 0,
    largeDonorMoney: 0,
    smallDonorMoney: 0,
    pacMoney: 0,
    partyMoney: 0,
    transferMoney: 0,
    otherMoney: 0,
    bigMoneyShare: null,
    smallDonorShare: null,
    confidence: "low",
    sources: [],
  };
  if (!candidateId) return empty;
  try {
    // Use the most-recent COMPLETE election cycle (2024), matching buildLobbyContributions.
    // The in-progress cycle (2026) understates totals and will not reconcile.
    // FUNDING_CYCLE is a module-level constant (see top of file).
    const data = await get(`/candidate/${candidateId}/totals/`, apiKey, {
      cycle: FUNDING_CYCLE,
      per_page: 20,
    });
    const rows = (data && data.results) || [];
    const valid = rows
      .filter((r: any) => Number(r.receipts) > 0 && (r.cycle === FUNDING_CYCLE || r.cycle === undefined))
      .sort(
        (a: any, b: any) =>
          new Date(b.coverage_end_date).getTime() -
          new Date(a.coverage_end_date).getTime(),
      );
    if (valid.length === 0) return empty;
    const r = valid[0];
    const itemized = Number(r.individual_itemized_contributions) || 0;
    const unitemized = Number(r.individual_unitemized_contributions) || 0;
    const pac = Number(r.other_political_committee_contributions) || 0;
    const party = Number(r.political_party_committee_contributions) || 0;
    const transfers =
      Number(r.transfers_from_other_authorized_committee) || 0;
    const receipts = Number(r.receipts) || 0;
    const bigMoney = itemized + pac + party + transfers;
    // Remaining gross receipts not in the five named buckets (loans/self-funding,
    // offsets to operating expenditures, other receipts). Ensures the parts sum to total.
    const other = Math.max(0, receipts - (itemized + unitemized + pac + party + transfers));
    const periodYear =
      typeof r.coverage_end_date === "string"
        ? r.coverage_end_date.slice(0, 4)
        : undefined;
    return {
      available: true,
      periodYear,
      totalRaised: Math.round(receipts),
      largeDonorMoney: Math.round(itemized),
      smallDonorMoney: Math.round(unitemized),
      pacMoney: Math.round(pac),
      partyMoney: Math.round(party),
      transferMoney: Math.round(transfers),
      otherMoney: Math.round(other),
      bigMoneyShare: receipts ? Number((bigMoney / receipts).toFixed(3)) : null,
      smallDonorShare: receipts
        ? Number((unitemized / receipts).toFixed(3))
        : null,
      confidence: "high",
      sources: ["FEC /candidate/{id}/totals"],
    };
  } catch (err) {
    console.warn(
      `[fec] funding profile failed for ${candidateId}: ${(err as Error).message} - unavailable.`,
    );
    return empty;
  }
}

export async function buildLobbyContributions(
  candidateId: string,
  apiKey: string,
): Promise<LobbyContribution[]> {
  const CYCLE = 2024;
  // 1. Resolve the candidate's principal campaign committee.
  let committeeId: string | null = null;
  try {
    const cm = await get(`/candidate/${candidateId}/committees/`, apiKey, {
      designation: 'P',
      per_page: 5,
    });
    const list = (cm && cm.results) || [];
    if (list.length > 0) committeeId = list[0].committee_id;
  } catch (e) {
    console.warn(`[fec] committee lookup failed for ${candidateId}: ${(e as Error).message}`);
  }
  if (!committeeId) {
    console.warn(`[fec] no principal committee for ${candidateId} - no lobby money`);
    return [];
  }

  // 2. Page through committee/organization contributions (skip individuals),
  //    sorted by amount desc so the meaningful PAC money surfaces first.
  const totals: Record<string, { name: string; amount: number }> = {};
  // MAX_PAGES is a module-level constant (see top of file).
  let lastIndex: string | null = null;
  let lastAmount: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let data: any;
    try {
      const params: Record<string, string | number> = {
        committee_id: committeeId,
        two_year_transaction_period: CYCLE,
        is_individual: 'false',
        per_page: 100,
        sort: '-contribution_receipt_amount',
        sort_hide_null: 'true',
      };
      if (lastIndex && lastAmount) {
        params.last_index = lastIndex;
        params.last_contribution_receipt_amount = lastAmount;
      }
      data = await get('/schedules/schedule_a/', apiKey, params);
    } catch (e) {
      console.warn(`[fec] schedule_a page ${page} failed for ${candidateId}: ${(e as Error).message}`);
      break;
    }
    const rows = (data && data.results) || [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const donor = row.contributor_name as string | null;
      const amt = Number(row.contribution_receipt_amount) || 0;
      if (!donor || amt <= 0) continue;
      const hit = classifyLobby(donor);
      if (!hit) continue;
      if (!totals[hit.id]) totals[hit.id] = { name: hit.name, amount: 0 };
      totals[hit.id].amount += amt;
    }
    const pg = (data.pagination && data.pagination.last_indexes) || null;
    if (!pg) break;
    const nextIndex = pg.last_index ?? pg.last_index_value ?? null;
    const nextAmount =
      pg.last_contribution_receipt_amount ??
      pg.last_contribution_receipt_amount_value ??
      null;
    if (nextIndex == null || nextAmount == null) break;
    lastIndex = String(nextIndex);
    lastAmount = String(nextAmount);
  }

  // 3. Shape into LobbyContribution[] (rounded whole dollars).
  const out: LobbyContribution[] = Object.entries(totals)
    .map(([lobbyId, v]) => ({
      lobbyId,
      lobbyName: v.name,
      amount: Math.round(v.amount),
      intent: 'support',
      cycle: String(CYCLE),
      source: 'FEC schedule_a (itemized committee contributions)',
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  return out;
}

function getLobbyById(id: string): { name: string; defaultIntent: string } | null {
  const LOBBY_INFO: Record<string, { name: string; defaultIntent: string }> = {
    nra: { name: 'National Rifle Association (NRA)', defaultIntent: 'Block gun safety legislation, promote firearms deregulation' },
    pharma: { name: 'PhRMA - Pharmaceutical Manufacturers', defaultIntent: 'Block drug price negotiation, protect pharmaceutical patents' },
    api: { name: 'American Petroleum Institute (API)', defaultIntent: 'Block climate legislation, support fossil fuel subsidies and deregulation' },
    uscc: { name: 'U.S. Chamber of Commerce', defaultIntent: 'Reduce corporate taxes, oppose labor regulations, support deregulation' },
    aipac: { name: 'AIPAC - American Israel Public Affairs Committee', defaultIntent: 'Support unconditional military aid to Israel, oppose arms embargo conditions' },
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


/**
 * Fetch Super PAC / outside independent expenditures FOR or AGAINST a candidate
 * (FEC Schedule E), aggregated by spender + support/oppose.
 * Independent spend is NOT part of candidate receipts. Returns [] when no data
 * (never fabricated). Uses FUNDING_CYCLE so it matches the funding period.
 */
export async function fetchOutsideSpending(
  candidateId: string | null,
  apiKey: string,
): Promise<Array<{ spender: string; amount: number; position: "support" | "oppose"; source: string; committeeType?: string; orgType?: string; party?: string }>> {
  if (!candidateId) return [];
  try {
    const byKey = new Map<string, { spender: string; amount: number; position: "support" | "oppose"; source: string; committeeType?: string; orgType?: string; party?: string }>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await get(`/schedules/schedule_e/`, apiKey, {
        candidate_id: candidateId,
        cycle: FUNDING_CYCLE,
        per_page: 100,
        page,
        sort: "-expenditure_amount",
      });
      const results: any[] = data?.results || [];
      if (results.length === 0) break;
      for (const r of results) {
        const amt = Number(r.expenditure_amount) || 0;
        if (amt <= 0) continue;
        const support = String(r.support_oppose_indicator || "").toUpperCase();
        const position: "support" | "oppose" = support === "O" ? "oppose" : "support";
        const cmt = r.committee || {};
        const spender = String(cmt.name || r.committee_name || r.spender_name || "Unknown committee").trim();
        const committeeType = cmt.committee_type_full ? String(cmt.committee_type_full).trim() : undefined;
        const orgType = cmt.organization_type_full ? String(cmt.organization_type_full).trim() : undefined;
        const party = cmt.party_full ? String(cmt.party_full).trim() : undefined;
        const key = spender + "|" + position;
        const prev = byKey.get(key);
        if (prev) {
          prev.amount += amt;
          if (!prev.committeeType && committeeType) prev.committeeType = committeeType;
          if (!prev.orgType && orgType) prev.orgType = orgType;
          if (!prev.party && party) prev.party = party;
        } else {
          byKey.set(key, { spender, amount: amt, position, source: "FEC Schedule E (independent expenditures)", committeeType, orgType, party });
        }
      }
      const pages = data?.pagination?.pages || 1;
      if (page >= pages) break;
    }
    console.warn(`fec outsideSpending candidate=${candidateId} aggregated=${byKey.size}`);
    return Array.from(byKey.values()).sort((a, b) => b.amount - a.amount).slice(0, 15);
  } catch (e) {
    console.warn(`  [fec] outside spending fetch failed for ${candidateId}: ${(e as Error).message}`);
    return [];
  }
}

/**
 * Fetch named large individual donors to a candidate's principal campaign committee
 * (FEC Schedule A, is_individual=true), top N by aggregated amount.
 * Returns [] when no committee/data (never fabricated).
 */
export async function fetchTopDonors(
  candidateId: string | null,
  apiKey: string,
): Promise<Array<{ name: string; employer?: string; occupation?: string; amount: number }>> {
  if (!candidateId) return [];
  try {
    let committeeId: string | null = null;
    const cm = await get(`/candidate/${candidateId}/committees/`, apiKey, {
        designation: "P",
        per_page: 5,
      });
    const committees: any[] = cm?.results || [];
    if (committees.length > 0) committeeId = committees[0].committee_id || null;
    if (!committeeId) return [];

    const byName = new Map<string, { name: string; employer?: string; occupation?: string; amount: number }>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await get(`/schedules/schedule_a/`, apiKey, {
        committee_id: committeeId,
        two_year_transaction_period: FUNDING_CYCLE,
        line_number: "F3-11AI",
        per_page: 100,
        page,
        sort: "-contribution_receipt_amount",
      });
      const results: any[] = data?.results || [];
      if (results.length === 0) break;
      for (const r of results) {
        const amt = Number(r.contribution_receipt_amount) || 0;
        if (amt <= 0) continue;
        const name = String(r.contributor_name || "").trim();
        if (!name) continue;
        const employer = r.contributor_employer ? String(r.contributor_employer).trim() : undefined;
        const occupation = r.contributor_occupation ? String(r.contributor_occupation).trim() : undefined;
        const prev = byName.get(name);
        if (prev) {
          prev.amount += amt;
          if (!prev.employer && employer) prev.employer = employer;
          if (!prev.occupation && occupation) prev.occupation = occupation;
        } else {
          byName.set(name, { name, employer, occupation, amount: amt });
        }
      }
      const pages = data?.pagination?.pages || 1;
      if (page >= pages) break;
    }
    console.warn(`fec topDonors committee=${committeeId} aggregated=${byName.size}`);
    return Array.from(byName.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);
  } catch (e) {
    console.warn(`  [fec] top donors fetch failed for ${candidateId}: ${(e as Error).message}`);
    return [];
  }
}
