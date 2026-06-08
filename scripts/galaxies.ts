// scripts/galaxies.ts
// TOPIC GALAXIES for the VOTES axis (Step 2b) + word-boundary precision (Step 2d).
//
// WHY: a bare bill id (e.g. "H.R. 10545") almost never contains a lobby keyword,
// so old keyword matching produced an almost-empty alignment pillar (only 9 of
// 113 vote texts matched). Instead we classify each ENRICHED bill (title + CRS
// summary + policyArea + official legislativeSubjects, cached in data/bills.json)
// into one or more lobby "galaxies". A galaxy clusters: (a) exact CRS policyArea
// names and (b) exact CRS legislativeSubject tags (both curated by the Library of
// Congress = high confidence) and (c) term stems matched WITH WORD BOUNDARIES
// against the title + summary (broader, lower confidence).
//
// WHY word boundaries (Step 2d folded in here): naive substring matching is
// disastrous - tested on the real 70 enriched bills, substring "rent" hit 16
// bills (in "different", "current", "parent"...), "sec" hit 25 (in "section",
// "secretary", "security") and "aca" hit 4 (none real). Word-boundary matching
// drops those to 0, 6 and 0. So every term is matched as a whole word/phrase.
//
// WHY a threshold of 2: a single stray term (weight 1) is not enough to claim a
// bill is "about" a lobby. Requiring weight >= 2 means at least one curated CRS
// tag, or two independent terms. Tested on the 70 bills this classifies 41 of 70
// across 16 lobbies; the other 29 are genuinely lobby-neutral (procedural,
// oversight, naming, broad appropriations) and we DELIBERATELY leave them
// unclassified rather than fabricate a lobby link.
//
// This module decides TOPIC only (which lobby a bill concerns). It does NOT
// decide direction (who the vote serves) - that is Step 2c, kept separate so we
// never guess a direction we cannot defend.
//
// ASCII only. No network. Pure functions, easy to unit-test.

export type EnrichedBill = {
  congress: number; type: string; number: string;
  title: string; policyArea: string; subjects: string[];
  summary: string; ok: boolean;
};

export type Galaxy = {
  policyAreas: string[]; // exact CRS policyArea names (case-insensitive) - strongest
  subjects: string[];    // exact CRS legislative subject tags (case-insensitive) - strong
  terms: string[];       // word-boundary term/phrase stems in title+summary - weak
};

export const SIGNAL_WEIGHT = { policyArea: 3, subject: 2, term: 1 };
export const TOPIC_THRESHOLD = 2;

// Galaxies keyed by canonical lobby id (must match data/lobbies.json ids).
export const LOBBY_GALAXIES: Record<string, Galaxy> = {
  nra: {
    policyAreas: [],
    subjects: ['Firearms and explosives', 'Gun control'],
    terms: ['firearm', 'firearms', 'gun', 'guns', 'ammunition', 'second amendment', 'concealed carry', 'assault weapon'],
  },
  pharma: {
    policyAreas: [],
    subjects: ['Drug safety, medical device, and laboratory regulation', 'Prescription drugs'],
    terms: ['drug pricing', 'prescription', 'pharmaceutical', 'pharmaceuticals', 'medicare part d', 'biologic'],
  },
  api: {
    policyAreas: ['Energy', 'Public Lands and Natural Resources'],
    subjects: ['Oil and gas', 'Energy prices', 'Alaska'],
    terms: ['oil', 'natural gas', 'pipeline', 'drilling', 'offshore lease', 'fossil fuel', 'refinery'],
  },
  energy: {
    policyAreas: ['Energy', 'Environmental Protection'],
    subjects: ['Alternative and renewable resources', 'Energy efficiency and conservation', 'Climate change and greenhouse gases', 'Air quality'],
    terms: ['renewable', 'solar', 'wind power', 'clean energy', 'emission', 'emissions', 'climate', 'greenhouse gas', 'electric grid'],
  },
  uscc: {
    policyAreas: ['Commerce'],
    subjects: ['Business investment and capital', 'Small business'],
    terms: ['small business', 'deregulation', 'regulatory burden', 'chamber of commerce'],
  },
  aipac: {
    policyAreas: [],
    subjects: ['Israel', 'Middle East', 'Diplomacy, foreign officials, Americans abroad'],
    terms: ['israel', 'israeli', 'palestinian', 'gaza', 'west bank', 'iron dome', 'antisemitism', 'hamas', 'iran', 'iranian'],
  },
  finance: {
    policyAreas: ['Finance and Financial Sector'],
    subjects: ['Banking and financial institutions regulation', 'Securities', 'Financial services and investments'],
    terms: ['wall street', 'bank', 'banks', 'banking', 'securities', 'dodd frank', 'hedge fund', 'derivative'],
  },
  defense: {
    policyAreas: ['Armed Forces and National Security'],
    subjects: ['Defense spending', 'Military procurement, research, weapons development'],
    terms: ['defense budget', 'pentagon', 'weapons system', 'military procurement', 'ndaa', 'missile'],
  },
  labor: {
    policyAreas: ['Labor and Employment'],
    subjects: ['Labor-management relations', 'Employment and training programs', 'Worker safety and health'],
    terms: ['union', 'unions', 'collective bargaining', 'minimum wage', 'overtime', 'right to work', 'pension'],
  },
  nea: {
    policyAreas: ['Education'],
    subjects: ['Elementary and secondary education', 'Teaching, teachers, curricula'],
    terms: ['public school', 'public schools', 'teacher', 'teachers', 'student loan', 'school funding', 'curriculum'],
  },
  tech: {
    policyAreas: ['Science, Technology, Communications'],
    subjects: ['Computers and information technology', 'Internet, web applications, social media', 'Computer security and identity theft'],
    terms: ['big tech', 'section 230', 'data privacy', 'artificial intelligence', 'algorithm', 'social media'],
  },
  realestate: {
    policyAreas: ['Housing and Community Development'],
    subjects: ['Housing finance and home ownership', 'Real estate business'],
    terms: ['mortgage', 'real estate', 'housing market', 'zoning', 'property tax'],
  },
  health: {
    policyAreas: ['Health'],
    subjects: ['Health care coverage and access', 'Medicare', 'Medicaid'],
    terms: ['health insurance', 'medicare', 'medicaid', 'affordable care act', 'hospital', 'hospitals'],
  },
  agribusiness: {
    policyAreas: ['Agriculture and Food'],
    subjects: ['Agricultural practices and innovations', 'Farming and ranching', 'Food industry and services'],
    terms: ['farm subsidy', 'crop insurance', 'agriculture', 'agricultural', 'ethanol', 'pesticide', 'farm bill'],
  },
  telecom: {
    policyAreas: [],
    subjects: ['Telephone and wireless communication', 'Broadcasting, cable, digital technologies'],
    terms: ['broadband', 'spectrum', 'net neutrality', 'telecom', 'wireless carrier'],
  },
  crypto: {
    policyAreas: [],
    subjects: ['Currency'],
    terms: ['cryptocurrency', 'digital asset', 'blockchain', 'stablecoin', 'bitcoin', 'crypto exchange'],
  },
  insurance: {
    policyAreas: [],
    subjects: ['Insurance industry and regulation'],
    terms: ['insurance industry', 'insurer', 'insurers', 'underwriting', 'flood insurance'],
  },
  transport: {
    policyAreas: ['Transportation and Public Works'],
    subjects: ['Roads and highways', 'Aviation and airports', 'Railroads'],
    terms: ['highway', 'highways', 'airline', 'airlines', 'railroad', 'transit', 'fuel economy'],
  },
  lawyers: {
    policyAreas: ['Law'],
    subjects: ['Civil actions and liability', 'Litigation procedures'],
    terms: ['tort', 'class action', 'liability', 'trial lawyer', 'arbitration', 'malpractice'],
  },
  retail: {
    policyAreas: [],
    subjects: ['Retail and wholesale trades', 'Consumer affairs'],
    terms: ['retail', 'consumer product', 'e commerce', 'supply chain'],
  },
  building: {
    policyAreas: [],
    subjects: ['Building construction', 'Infrastructure development'],
    terms: ['construction', 'contractor', 'contractors', 'public works', 'davis bacon'],
  },
  leadership: {
    // Intentionally narrow: broad "Congress" / "Legislative rules" tags match
    // almost every procedural vote, which is noise. Only true leadership signals.
    policyAreas: [],
    subjects: ['Congressional leadership'],
    terms: ['party leadership', 'leadership pac', 'majority leader', 'minority leader'],
  },
  ideology: {
    policyAreas: [],
    subjects: ['Religion'],
    terms: ['pro life', 'pro choice', 'religious liberty', 'religious freedom'],
  },
  othercorp: {
    policyAreas: [],
    subjects: [],
    terms: [],
  },
};

// Lowercase + collapse punctuation to spaces for forgiving comparison.
function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Word-boundary phrase match on already-normalized (space-separated) text.
function wordMatch(haystackN: string, termRaw: string): boolean {
  const t = norm(termRaw);
  if (!t) return false;
  return (' ' + haystackN + ' ').indexOf(' ' + t + ' ') !== -1;
}

export type Match = { lobby: string; weight: number; signals: string[] };

// Classify one enriched bill into lobby topics. Returns matches at or above
// TOPIC_THRESHOLD, sorted by descending weight.
export function classifyBill(bill: EnrichedBill): Match[] {
  if (!bill || !bill.ok) return [];
  const policyN = norm(bill.policyArea);
  const subjectsSet = new Set((bill.subjects || []).map(norm));
  const haystackN = norm(bill.title + ' ' + bill.summary);

  const out: Match[] = [];
  for (const [lobby, g] of Object.entries(LOBBY_GALAXIES)) {
    let weight = 0;
    const signals: string[] = [];
    for (const pa of g.policyAreas) {
      if (policyN === norm(pa)) { weight += SIGNAL_WEIGHT.policyArea; signals.push('policyArea:' + pa); }
    }
    for (const sub of g.subjects) {
      if (subjectsSet.has(norm(sub))) { weight += SIGNAL_WEIGHT.subject; signals.push('subject:' + sub); }
    }
    for (const term of g.terms) {
      if (wordMatch(haystackN, term)) { weight += SIGNAL_WEIGHT.term; signals.push('term:' + term); }
    }
    if (weight >= TOPIC_THRESHOLD) out.push({ lobby, weight, signals });
  }
  out.sort((a, b) => b.weight - a.weight);
  return out;
}


// ============================================================================
// STEP 2c - HONEST DIRECTION
// ----------------------------------------------------------------------------
// classifyBill answers "what topic". Direction answers the stronger question:
// "did this YEA/NAY SERVE the paying lobby, or the public?" We assert a
// direction ONLY where the enriched bill carries a defensible, unambiguous cue;
// otherwise we return 'unknown' and the vote is on-topic-but-neutral - it never
// inflates an alignment score. We never guess.
//
// Each lobby has: (1) a GATE of allowed CRS policyAreas and/or subject tags so a
// cue cannot fire on an unrelated bill that merely cross-references a phrase, and
// (2) directional cues mapping the lobby-favored side (YEA = advance the bill,
// NAY = block it). Congressional Review Act disapproval resolutions invert the
// favored side, because a YEA there REPEALS the underlying rule.
// ============================================================================

export type Direction = 'serves-lobby' | 'serves-public' | 'unknown';

type DirCue = { phrases: string[]; lobbyFavors: 'YEA' | 'NAY' };
type LobbyDir = { areas: string[]; subjects: string[]; cues: DirCue[] };

const LOBBY_DIRECTION: Record<string, LobbyDir> = {
  // Oil & gas: favor expanding production, oppose new emissions/drilling limits.
  api: {
    areas: ['energy', 'environmental protection', 'public lands and natural resources'],
    subjects: ['climate change and greenhouse gases', 'air quality', 'oil and gas'],
    cues: [
      { phrases: ['oil and gas lease', 'expand leasing', 'expedite permit', 'natural gas export', 'offshore drilling'], lobbyFavors: 'YEA' },
      { phrases: ['greenhouse gas emission', 'carbon emission', 'emissions standard', 'methane', 'drilling moratorium', 'ban on drilling', 'multi pollutant emissions'], lobbyFavors: 'NAY' },
    ],
  },
  // Pharma: oppose price negotiation / importation that cut drug revenue.
  pharma: {
    areas: ['health'],
    subjects: ['drug therapy', 'prescription drugs'],
    cues: [
      { phrases: ['drug price negotiation', 'medicare negotiate', 'price negotiation', 'cap insulin', 'drug importation', 'lower prescription drug'], lobbyFavors: 'NAY' },
    ],
  },
  // Gun-rights: oppose new firearm restrictions.
  nra: {
    areas: ['crime and law enforcement'],
    subjects: ['firearms and explosives'],
    cues: [
      { phrases: ['background check', 'assault weapon', 'red flag', 'high capacity magazine', 'firearm ban', 'gun control'], lobbyFavors: 'NAY' },
      { phrases: ['concealed carry reciprocity', 'protect gun owner'], lobbyFavors: 'YEA' },
    ],
  },
  // Business/Chamber: oppose new labor mandates.
  uscc: {
    areas: ['labor and employment'],
    subjects: ['labor-management relations', 'wages and earnings'],
    cues: [
      { phrases: ['minimum wage increase', 'pro act', 'right to organize', 'union election', 'paid leave mandate', 'overtime rule'], lobbyFavors: 'NAY' },
    ],
  },
  // Defense contractors: favor higher authorizations/appropriations.
  defense: {
    areas: ['armed forces and national security'],
    subjects: ['defense spending'],
    cues: [
      { phrases: ['national defense authorization act', 'defense appropriation', 'military construction'], lobbyFavors: 'YEA' },
    ],
  },
  // Pro-Israel lobby: favor security assistance to Israel.
  aipac: {
    areas: ['international affairs'],
    subjects: ['arab-israeli relations', 'israel'],
    cues: [
      { phrases: ['security assistance to israel', 'aid to israel', 'iron dome', 'israel security', 'replenish israel', 'assistance to israel', 'supplemental appropriations'], lobbyFavors: 'YEA' },
      { phrases: ['condition aid to israel', 'restrict aid to israel', 'arms embargo'], lobbyFavors: 'NAY' },
    ],
  },
  // Financial sector: oppose new financial regulation.
  finance: {
    areas: ['finance and financial sector'],
    subjects: [],
    cues: [
      { phrases: ['dodd frank', 'consumer financial protection', 'capital requirement', 'stress test'], lobbyFavors: 'NAY' },
    ],
  },
  // Telecom: oppose net-neutrality common-carrier rules.
  telecom: {
    areas: ['science, technology, communications'],
    subjects: [],
    cues: [
      { phrases: ['net neutrality', 'common carrier reclassif'], lobbyFavors: 'NAY' },
    ],
  },
  // Big Tech: oppose antitrust/privacy mandates constraining platforms.
  tech: {
    areas: ['science, technology, communications', 'commerce'],
    subjects: [],
    cues: [
      { phrases: ['platform competition', 'data privacy mandate', 'section 230', 'app store competition'], lobbyFavors: 'NAY' },
    ],
  },
};

// A Congressional Review Act disapproval resolution: a YEA repeals the named
// rule, so the lobby-favored side is the OPPOSITE of the rule's subject matter.
function isCRADisapproval(bill: EnrichedBill): boolean {
  const hay = norm(bill.title + ' ' + bill.summary);
  return wordMatch(hay, 'congressional disapproval') ||
         wordMatch(hay, 'providing for congressional disapproval') ||
         wordMatch(hay, 'nullifies the rule');
}

function inGate(bill: EnrichedBill, g: LobbyDir): boolean {
  if (g.areas.includes(norm(bill.policyArea))) return true;
  const subs = (bill.subjects || []).map(norm);
  return g.subjects.some(s => subs.includes(norm(s)));
}

// Decide whether a member's recorded vote on an enriched bill served the lobby,
// served the public, or is direction-unknown (the honest default).
export function voteServesLobby(bill: EnrichedBill, lobby: string, vote: string): Direction {
  if (!bill || !bill.ok) return 'unknown';
  const g = LOBBY_DIRECTION[lobby];
  if (!g || !g.cues.length) return 'unknown';
  const v = (vote || '').toUpperCase();
  if (v !== 'YEA' && v !== 'NAY') return 'unknown';
  if (!inGate(bill, g)) return 'unknown';

  const hayN = norm(bill.title + ' ' + bill.summary);
  const cra = isCRADisapproval(bill);

  for (const cue of g.cues) {
    if (!cue.phrases.some(p => wordMatch(hayN, p))) continue;
    let favored: 'YEA' | 'NAY' = cue.lobbyFavors;
    if (cra) favored = favored === 'YEA' ? 'NAY' : 'YEA';
    return v === favored ? 'serves-lobby' : 'serves-public';
  }
  return 'unknown'; // on-topic but no defensible directional cue
}
