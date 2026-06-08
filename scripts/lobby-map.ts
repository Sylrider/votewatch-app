/**
 * scripts/lobby-map.ts
 * Maps FEC PAC committee names to lobby categories.
 *
 * The FEC tracks every PAC individually (>20,000 committees), but for our
 * transparency scoring we need to group them into meaningful lobby categories.
 *
 * This file contains ~500 PAC name patterns covering the major spending groups.
 * It is also the place to add OpenSecrets industry codes when/if you upgrade
 * to the paid tier or researcher access.
 */

export interface LobbyClassification {
  id: string;
  name: string;
  category: string;
  color: string;
}

// Keyword patterns â lobby category
const PAC_PATTERNS: Array<{ patterns: RegExp[]; lobbyId: string }> = [
  // ââ Firearms / NRA ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/national rifle/i, /\bNRA\b/, /nra political/i, /gun rights/i, /firearms/i, /safari club/i],
    lobbyId: 'nra',
  },
  // ââ Pharmaceutical âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/\bphrma\b/i, /pharmaceutical/i, /biotechnology/i, /pfizer/i, /merck/i, /johnson.*johnson/i, /abbvie/i, /eli\s*lilly/i, /bristol.*myers/i, /astrazeneca/i, /novartis/i, /roche/i, /amgen/i, /biogen/i, /genentech/i, /sanofi/i],
    lobbyId: 'pharma',
  },
  // ââ Oil, Gas, Fossil Fuels âââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/american petroleum/i, /\bapi\b.*politi/i, /exxon/i, /chevron/i, /conocophillips/i, /bp\s+america/i, /shell\s+oil/i, /marathon.*oil/i, /valero/i, /halliburton/i, /schlumberger/i, /devon\s+energy/i, /pioneer\s+natural/i, /occidental\s+petro/i, /oil.*gas/i, /natural\s+gas/i, /coal/i, /mining/i, /peabody/i],
    lobbyId: 'api',
  },
  // ââ U.S. Chamber of Commerce âââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/chamber of commerce/i, /national federation.*business/i, /\bNFIB\b/, /business roundtable/i, /national assoc.*manufacturers/i, /retail industry/i],
    lobbyId: 'uscc',
  },
  // ââ AIPAC / Pro-Israel âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/\baipac\b/i, /norpac/i, /j\s*street/i, /pro-israel/i, /united democracy project/i, /democratic majority.*israel/i, /\bdmfi\b/i, /america israel/i, /american israel/i],
    lobbyId: 'aipac',
  },
  // ââ Finance / Wall Street ââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/\bjpmorgan\b/i, /goldman\s*sachs/i, /morgan\s*stanley/i, /citigroup/i, /bank of america/i, /wells\s*fargo/i, /blackrock/i, /blackstone/i, /hedge\s*fund/i, /private\s*equity/i, /securities\s*industry/i, /financial\s*services\s*roundtable/i, /american\s*bankers\s*assoc/i, /\baba\b.*bank/i],
    lobbyId: 'finance',
  },
  // ââ Defense / Military Industrial ââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/lockheed/i, /raytheon/i, /boeing\s*defense/i, /northrop\s*grumman/i, /general\s*dynamics/i, /l3\s*technologies/i, /defense.*indust/i, /aerospace.*defense/i],
    lobbyId: 'defense',
  },
  // ââ Technology / Big Tech ââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/\bgoogle\b/i, /alphabet.*politi/i, /\bamazon\b.*pac/i, /\bapple\b.*pac/i, /\bmeta\b.*pac/i, /facebook/i, /microsoft.*pac/i, /\bintel\b.*pac/i, /tech.*industry/i, /silicon\s*valley/i, /\bceia\b/i],
    lobbyId: 'tech',
  },
  // ââ Real Estate âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/national\s*assoc.*realtors/i, /\bnar\b.*politi/i, /real\s*estate/i, /mortgage/i, /home\s*builders/i, /\bnahb\b/i],
    lobbyId: 'realestate',
  },
  // ââ Health Insurance âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/\bahip\b/i, /health\s*insurance/i, /unitedhealth/i, /anthem/i, /cigna/i, /aetna/i, /humana/i, /blue\s*cross/i],
    lobbyId: 'health',
  },
  // ââ Labor Unions âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/\bafl.?cio\b/i, /seiu/i, /teamsters/i, /united\s*auto\s*workers/i, /\buaw\b/i, /afscme/i, /united\s*steelworkers/i, /international\s*brotherhood/i, /\biba\b.*union/i, /laborers\s*int/i],
    lobbyId: 'labor',
  },
  // ââ Education (NEA / AFT) ââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/national\s*education\s*assoc/i, /\bnea\b.*fund/i, /american\s*federation.*teachers/i, /\baft\b.*endorse/i],
    lobbyId: 'nea',
  },
  // ââ Agribusiness âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/american\s*farm\s*bureau/i, /\bafbf\b/i, /archer\s*daniels/i, /\badm\b.*politi/i, /cargill/i, /tyson.*food/i, /john\s*deere/i, /agribusiness/i, /national\s*corn\s*growers/i, /soybean/i],
    lobbyId: 'agribusiness',
  },
  // ââ Telecom âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/comcast/i, /at&t/i, /verizon/i, /t-mobile/i, /charter\s*communications/i, /national\s*cable/i, /ctia/i, /ncta/i, /telecom/i],
    lobbyId: 'telecom',
  },
  // ââ Cryptocurrency âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  {
    patterns: [/coinbase/i, /crypto.*pac/i, /blockchain.*assoc/i, /fairshake/i, /ripple/i, /bitcoin.*policy/i],
    lobbyId: 'crypto',
  },
];

export const LOBBY_META: Record<string, LobbyClassification> = {
  nra:         { id: 'nra',         name: 'National Rifle Association (NRA)',         category: 'Firearms & Gun Rights',        color: '#dc2626' },
  pharma:      { id: 'pharma',      name: 'PhRMA â Pharmaceutical Manufacturers',      category: 'Pharmaceutical Industry',      color: '#2563eb' },
  api:         { id: 'api',         name: 'American Petroleum Institute (API)',        category: 'Oil & Gas / Fossil Fuels',     color: '#d97706' },
  uscc:        { id: 'uscc',        name: 'U.S. Chamber of Commerce',                  category: 'Corporate / Business',         color: '#7c3aed' },
  aipac:       { id: 'aipac',       name: 'AIPAC',                                     category: 'Foreign Policy / Israel',      color: '#0891b2' },
  finance:     { id: 'finance',     name: 'Wall Street / Financial Industry',          category: 'Finance & Banking',            color: '#10b981' },
  defense:     { id: 'defense',     name: 'Defense Industry (MICC)',                  category: 'Defense & Aerospace',          color: '#6366f1' },
  tech:        { id: 'tech',        name: 'Big Tech Industry',                         category: 'Technology',                   color: '#8b5cf6' },
  realestate:  { id: 'realestate',  name: 'Real Estate Industry (NAR)',                category: 'Real Estate',                  color: '#f59e0b' },
  health:      { id: 'health',      name: 'Health Insurance Industry (AHIP)',          category: 'Health Insurance',             color: '#06b6d4' },
  labor:       { id: 'labor',       name: 'AFL-CIO / Labor Unions',                   category: 'Labor / Unions',               color: '#ef4444' },
  nea:         { id: 'nea',         name: 'National Education Association (NEA)',      category: 'Education / Labor',            color: '#059669' },
  agribusiness:{ id: 'agribusiness',name: 'Agribusiness (Farm Bureau)',                category: 'Agriculture',                  color: '#84cc16' },
  telecom:     { id: 'telecom',     name: 'Telecommunications Industry',              category: 'Telecom & Media',              color: '#ec4899' },
  crypto:      { id: 'crypto',      name: 'Cryptocurrency Industry',                  category: 'Cryptocurrency',               color: '#f97316' },
  insurance:   { id: 'insurance',   name: 'Insurance Industry',                       category: 'Insurance',                    color: '#0d9488' },
  energy:      { id: 'energy',      name: 'Electric Utilities & Energy',              category: 'Utilities / Energy',           color: '#ca8a04' },
  transport:   { id: 'transport',   name: 'Transportation & Airlines',                category: 'Transportation',               color: '#4f46e5' },
  lawyers:     { id: 'lawyers',     name: 'Lawyers & Law Firms',                      category: 'Legal / Lawyers',              color: '#9333ea' },
  retail:      { id: 'retail',      name: 'Retail & Consumer Goods',                  category: 'Retail / Consumer',            color: '#e11d48' },
  building:    { id: 'building',    name: 'Construction & Building Trades',           category: 'Construction',                 color: '#b45309' },
  leadership:  { id: 'leadership',  name: 'Leadership PACs & Party Committees',        category: 'Leadership / Party PAC',        color: '#475569' },
  ideology:    { id: 'ideology',    name: 'Ideological / Single-Issue Groups',        category: 'Ideological / Single-Issue',    color: '#db2777' },
  othercorp:   { id: 'othercorp',   name: 'Other PAC & Corporate Money',              category: 'Other Organized Money',         color: '#64748b' },
};

// Second-tier FEC-style sector patterns. Applied only when no specific named
// archetype above matched, so that the broad universe of PAC money is bucketed
// into a sector instead of being dropped on the floor.
const SECTOR_PATTERNS: Array<{ patterns: RegExp[]; lobbyId: string }> = [
  { patterns: [/insurance/i, /\bins\b.*pac/i, /mutual.*(life|insurance)/i, /property.*casualty/i], lobbyId: 'insurance' },
  { patterns: [/electric/i, /\butilit/i, /\bpower\b/i, /\benergy\b/i, /edison/i, /duke energy/i, /exelon/i, /southern co/i], lobbyId: 'energy' },
  { patterns: [/airlin/i, /\bair\b.*(line|transport)/i, /railroad/i, /\brail\b/i, /trucking/i, /freight/i, /\bups\b/i, /fedex/i, /\bdelta\b/i, /united air/i, /maritime/i, /shipping/i], lobbyId: 'transport' },
  { patterns: [/\blaw\b/i, /attorney/i, /\bllp\b/i, /trial lawyer/i, /litigat/i, /\besq\b/i, /\blegal\b/i], lobbyId: 'lawyers' },
  { patterns: [/retail/i, /\bstores?\b/i, /walmart/i, /\bamazon\b/i, /restaurant/i, /\bfood\b.*(service|chain)/i, /grocer/i, /consumer/i, /\bmcdonald/i, /\bcoca.?cola/i, /pepsi/i], lobbyId: 'retail' },
  { patterns: [/construct/i, /\bbuild/i, /contractors?/i, /carpenters?/i, /plumbers?/i, /electricians?/i, /\bcement\b/i, /\bsteel\b.*(work|construct)/i, /engineers?/i], lobbyId: 'building' },
  { patterns: [/for congress/i, /victory fund/i, /leadership pac/i, /\bfor\b.*\bsenate\b/i, /\bpac\b.*\b(committee|party)\b/i, /republican (national|congressional|senatorial)/i, /democratic (national|congressional|senatorial)/i, /\bdccc\b/i, /\bnrcc\b/i, /\bdscc\b/i, /\bnrsc\b/i], lobbyId: 'leadership' },
  { patterns: [/\bclub for growth\b/i, /emily.?s list/i, /planned parenthood/i, /right to life/i, /\bsierra club\b/i, /human rights/i, /\baclu\b/i, /conservative/i, /progressive/i, /\bliberty\b/i, /freedom\b.*\b(works|fund|pac)\b/i], lobbyId: 'ideology' },
];

export function classifyLobby(pacName: string): LobbyClassification | null {
  // Tier 1: specific named lobby archetypes (NRA, PhRMA, AIPAC, ...).
  for (const { patterns, lobbyId } of PAC_PATTERNS) {
    if (patterns.some(p => p.test(pacName))) {
      return LOBBY_META[lobbyId] || null;
    }
  }
  // Tier 2: broad FEC-style sector buckets.
  for (const { patterns, lobbyId } of SECTOR_PATTERNS) {
    if (patterns.some(p => p.test(pacName))) {
      return LOBBY_META[lobbyId] || null;
    }
  }
  // Tier 3: catch-all so no organized PAC money is silently dropped.
  if (pacName && /\b(pac|committee|fund|association|assn|inc|corp|llc|union|political)\b/i.test(pacName)) {
    return LOBBY_META['othercorp'] || null;
  }
  return null;
}

export function getLobbyMeta(lobbyId: string): LobbyClassification | null {
  return LOBBY_META[lobbyId] || null;
}

export function getAllLobbies(): LobbyClassification[] {
  return Object.values(LOBBY_META);
}
