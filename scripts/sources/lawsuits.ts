/**
 * scripts/sources/lawsuits.ts
 * Fetches legal records from CourtListener (courtlistener.com).
 *
 * API docs: https://www.courtlistener.com/api/rest/v3/
 * Free tier: 5,000 requests/day, no API key required for read-only
 * Optional: register for token at courtlistener.com for higher limits
 *
 * NOTE: CourtListener covers federal courts (PACER data).
 * State court cases (e.g. Manhattan DA) are NOT in CourtListener.
 * For state cases, we maintain a manual supplement (scripts/manual-lawsuits.ts).
 */

import type { Lawsuit, CourtListenerCase } from '../../lib/types';

const BASE = 'https://www.courtlistener.com/api/rest/v3';

export async function searchLawsuits(
  name: string,
  token?: string
): Promise<Lawsuit[]> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'VoteWatch/1.0 (civic-transparency project)',
    };
    if (token) headers['Authorization'] = `Token ${token}`;

    // Search for the politician by name in docket entries
    const params = new URLSearchParams({
      q: `"${name}"`,
      type: 'r',        // RECAP federal docket entries
      order_by: 'score desc',
      stat_Precedential: 'on',
    });

    const res = await fetch(`${BASE}/search/?${params}`, { headers });
    if (!res.ok) return [];

    const data = await res.json();
    const cases: CourtListenerCase[] = data.results || [];

    return cases
      .slice(0, 10) // cap at 10 results per politician
      .map(c => parseCourtCase(c))
      .filter((l): l is Lawsuit => l !== null);
  } catch {
    return [];
  }
}

function parseCourtCase(c: CourtListenerCase): Lawsuit | null {
  if (!c.case_name) return null;

  // Classify severity based on court and case type
  const severity = classifySeverity(c);
  const type = classifyType(c.nature_of_suit || '');

  return {
    title: c.case_name,
    year: c.date_filed ? new Date(c.date_filed).getFullYear() : 0,
    type,
    status: 'ONGOING',     // CourtListener doesn't give disposition easily
    outcome: 'See CourtListener for current status',
    description: c.snippet || `Federal case filed in ${c.court}. View full docket on CourtListener.`,
    severity,
    caseId: String(c.id),
    courtListenerUrl: `https://www.courtlistener.com${c.absolute_url}`,
  };
}

function classifySeverity(c: CourtListenerCase): 'high' | 'medium' | 'low' {
  const name = (c.case_name || '').toLowerCase();
  const nos = (c.nature_of_suit || '').toLowerCase();

  if (
    nos.includes('rico') ||
    nos.includes('fraud') ||
    nos.includes('bribery') ||
    name.includes('indictment') ||
    name.includes('criminal') ||
    name.includes('conspiracy')
  ) return 'high';

  if (
    nos.includes('civil rights') ||
    nos.includes('election') ||
    nos.includes('defamation') ||
    nos.includes('sexual')
  ) return 'high';

  if (
    nos.includes('contract') ||
    nos.includes('property') ||
    nos.includes('employment')
  ) return 'medium';

  return 'low';
}

function classifyType(nos: string): string {
  const n = nos.toLowerCase();
  if (n.includes('fraud')) return 'Civil / Fraud';
  if (n.includes('rico') || n.includes('racketeer')) return 'Criminal — RICO';
  if (n.includes('civil rights')) return 'Civil Rights';
  if (n.includes('election')) return 'Electoral';
  if (n.includes('employment')) return 'Employment / Labor';
  if (n.includes('defamation')) return 'Civil — Defamation';
  if (n.includes('sexual')) return 'Civil — Sexual Misconduct';
  if (n.includes('contract')) return 'Civil — Contract';
  return 'Federal Civil / Criminal';
}
