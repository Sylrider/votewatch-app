import type { Lawsuit } from '../../lib/types';

// CourtListener v4 opinion search. Strategy: query by the official's surname in the
// case caption, then keep ONLY high-confidence matches where BOTH the official's first
// AND last name appear in the caption or opinion snippet. This favors PRECISION over
// recall: common surnames (Warren, McConnell, Crow, ...) otherwise pull in unrelated
// parties. Requiring the full name rejects e.g. 'Medicine Crow' for 'Jason Crow'. We
// would rather return [] than misattribute a lawsuit. Errors are thrown so the pipeline
// logs/retries instead of silently writing an empty list.

const CL_BASE = 'https://www.courtlistener.com/api/rest/v4/search/';

interface CLResult {
  caseName?: string;
  court?: string;
  dateFiled?: string;
  docketNumber?: string;
  suitNature?: string;
  opinions?: Array<{ snippet?: string }>;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameParts(fullName: string): { first: string; last: string } {
  const cleaned = fullName.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, '').trim();
  const parts = cleaned.split(/\s+/);
  return { first: parts[0] || cleaned, last: parts[parts.length - 1] || cleaned };
}

function classifyType(suitNature: string, blob: string): string {
  const s = ((suitNature || '') + ' ' + blob).toLowerCase();
  if (s.includes('subpoena')) return 'Civil - subpoena challenge (official capacity)';
  if (s.includes('proxy vot')) return 'Civil - constitutional challenge (official capacity)';
  if (s.includes('civil right')) return 'Civil rights';
  if (s.includes('criminal') || s.includes('indict') || s.includes('felony')) return 'Criminal';
  if (s.includes('defamation')) return 'Civil - defamation';
  if (s.includes('contract')) return 'Civil - contract';
  if (s.includes('constitution')) return 'Civil - constitutional challenge';
  return 'Civil';
}

function classifySeverity(blob: string): 'high' | 'medium' | 'low' {
  if (/convict|indict|guilty|felony|liable|damages|sentenced/.test(blob)) return 'high';
  if (/injunction|defamation|fraud|negligence/.test(blob)) return 'medium';
  return 'low';
}

function deriveStatusOutcome(blob: string): { status: string; outcome: string } {
  if (/dismiss/.test(blob)) return { status: 'DISMISSED', outcome: 'Case dismissed (per court opinion).' };
  if (/affirmed/.test(blob)) return { status: 'RESOLVED', outcome: 'Lower ruling affirmed on appeal.' };
  if (/granted/.test(blob)) return { status: 'RESOLVED', outcome: 'Motion granted (per court opinion).' };
  return { status: 'ONGOING', outcome: 'On the public docket; see CourtListener for disposition.' };
}

export async function searchLawsuits(name: string, token?: string): Promise<Lawsuit[]> {
  const { first, last } = nameParts(name);
  if (!last || last.length < 3) return [];

  const q = 'caseName:"' + last + '"';
  const url = CL_BASE + '?q=' + encodeURIComponent(q) + '&type=o&order_by=' + encodeURIComponent('dateFiled desc');

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = 'Token ' + token;

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw new Error('CourtListener search failed for ' + name + ': HTTP ' + resp.status);
  }
  const data = await resp.json();
  const results: CLResult[] = Array.isArray(data.results) ? data.results : [];

  const firstRe = new RegExp('\\b' + escapeRe(first) + '\\b', 'i');
  const lastRe = new RegExp('\\b' + escapeRe(last) + '\\b', 'i');
  const offCapRe = /official capacity|as speaker of the house|in (his|her) official capacity/i;

  const seen = new Set<string>();
  const lawsuits: Lawsuit[] = [];

  for (const r of results) {
    const caption = r.caseName || '';
    const snippet = (r.opinions && r.opinions[0] && r.opinions[0].snippet) || '';
    const blob = caption + ' ' + snippet;

    // High-confidence ONLY: both first AND last name must appear.
    if (!firstRe.test(blob) || !lastRe.test(blob)) continue;

    const key = caption + '|' + (r.dateFiled || '');
    if (seen.has(key)) continue;
    seen.add(key);

    const lower = blob.toLowerCase();
    const { status, outcome } = deriveStatusOutcome(lower);
    lawsuits.push({
      title: caption,
      year: r.dateFiled ? new Date(r.dateFiled).getFullYear() : 0,
      type: classifyType(r.suitNature || '', lower),
      status,
      outcome,
      description: 'Federal court matter naming ' + name + (offCapRe.test(lower) ? ' (official capacity).' : '.'),
      severity: classifySeverity(lower),
      caseId: r.docketNumber || r.court || '',
    });
    if (lawsuits.length >= 10) break;
  }

  return lawsuits;
}
