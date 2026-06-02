import type { Lawsuit } from '../../lib/types';

// CourtListener v4 opinion search. Strategy: query by the official's surname in the
// case caption, then keep ONLY high-confidence matches -- captions/opinions that
// contain the official's full name OR an explicit 'official capacity' marker.
// This favors PRECISION over recall: common surnames (Warren, McConnell, ...) would
// otherwise pull in thousands of unrelated parties. We would rather return an empty
// list than attribute someone else's lawsuit to this official. Errors are thrown so
// the pipeline logs/retries instead of silently writing [].

const CL_BASE = 'https://www.courtlistener.com/api/rest/v4/search/';

interface CLResult {
  caseName?: string;
  court?: string;
  dateFiled?: string;
  docketNumber?: string;
  suitNature?: string;
  opinions?: Array<{ snippet?: string }>;
}

function lastNameOf(fullName: string): string {
  const cleaned = fullName.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, '').trim();
  const parts = cleaned.split(/\s+/);
  return parts[parts.length - 1] || cleaned;
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
  return { status: 'ON RECORD', outcome: 'On the public docket; see CourtListener for disposition.' };
}

export async function searchLawsuits(name: string, token?: string): Promise<Lawsuit[]> {
  const last = lastNameOf(name);
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

  const fullLower = name.toLowerCase();
  const surnameRe = new RegExp('\\b' + last + '\\b', 'i');
  const offCapRe = /official capacity|as speaker of the house|in (his|her) official capacity/i;

  const seen = new Set<string>();
  const lawsuits: Lawsuit[] = [];

  for (const r of results) {
    const caption = r.caseName || '';
    if (!surnameRe.test(caption)) continue;
    const snippet = (r.opinions && r.opinions[0] && r.opinions[0].snippet) || '';
    const blob = (caption + ' ' + snippet).toLowerCase();

    // High-confidence only: full name present OR explicit official-capacity marker.
    const confident = blob.includes(fullLower) || offCapRe.test(blob);
    if (!confident) continue;

    const key = caption + '|' + (r.dateFiled || '');
    if (seen.has(key)) continue;
    seen.add(key);

    const { status, outcome } = deriveStatusOutcome(blob);
    lawsuits.push({
      title: caption,
      year: r.dateFiled ? new Date(r.dateFiled).getFullYear() : 0,
      type: classifyType(r.suitNature || '', blob),
      status,
      outcome,
      description: 'Federal court matter naming ' + name + (offCapRe.test(blob) ? ' (official capacity).' : '.'),
      severity: classifySeverity(blob),
      caseId: r.docketNumber || r.court || '',
    });
    if (lawsuits.length >= 10) break;
  }

  return lawsuits;
}
