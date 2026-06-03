/**
 * scripts/sources/congress.ts
 * Fetches member data and voting records from the Congress.gov API.
 *
 * API docs: https://api.congress.gov/
 * Free API key: https://api.congress.gov/sign-up/
 * Rate limit: 5,000 requests/hour on free tier
 */

import type { CongressMember, Vote } from '../../lib/types';

const BASE = 'https://api.congress.gov/v3';

async function get(path: string, key: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('api_key', key);
  url.searchParams.set('format', 'json');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Congress.gov ${path} → HTTP ${res.status}`);
  return res.json();
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function fetchAllMembers(apiKey: string): Promise<CongressMember[]> {
  const members: CongressMember[] = [];
  let offset = 0;
  const limit = 250;

  console.log('  Fetching Congress members...');

  while (true) {
    const data = await get('/member', apiKey, {
      limit: String(limit),
      offset: String(offset),
      currentMember: 'true',
    });

    const batch: CongressMember[] = (data.members || []).map((m: any) => ({
      bioguideId: m.bioguideId,
      name: m.name,
      party: m.partyName || 'Unknown',
      state: m.state || '',
      terms: (m.terms?.item || []).map((t: any) => ({
        chamber: t.chamber,
        startYear: parseInt(t.startYear, 10),
      })),
      imageUrl: m.depiction?.imageUrl,
    }));

    members.push(...batch);
    console.log(`    Fetched ${members.length} members so far...`);

    if (batch.length < limit) break;
    offset += limit;

    // Respect rate limit
    await sleep(200);
  }

  return members;
}

// ─── Voting Records ───────────────────────────────────────────────────────────

// House roll-call source: clerk.house.gov/evs/{year}/roll{NNN}.xml (name-id == bioguideId)
// Senate roll-call source: senate.gov LIS vote_menu + per-vote XML (matched by last name + state)
const HOUSE_MAX_ROLLS = 517;   // 118th Congress, 2nd session (2024) had roll calls 1..517
const VOTES_PER_MEMBER = 40;   // most-recent roll calls captured per member (keeps JSON sane)
const HOUSE_YEAR = 2024;
const SENATE_CONGRESS = 118;
const SENATE_SESSION = 2;

let __houseCache: Map<string, Vote[]> | null = null;
let __senateCache: Map<string, Vote[]> | null = null;

function getTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1].trim() : '';
}

async function buildHouseCache(): Promise<Map<string, Vote[]>> {
  if (__houseCache) return __houseCache;
  const cache = new Map<string, Vote[]>();
  // Walk most-recent roll calls first, stop once every member has VOTES_PER_MEMBER.
  for (let n = HOUSE_MAX_ROLLS; n >= 1; n--) {
    const roll = String(n).padStart(3, '0');
    let xml: string;
    try {
      const res = await fetch(`https://clerk.house.gov/evs/${HOUSE_YEAR}/roll${roll}.xml`);
      if (!res.ok) continue;
      xml = await res.text();
    } catch { continue; }
    const legisNum = getTag(xml, 'legis-num');
    const question = getTag(xml, 'vote-question');
    const desc = getTag(xml, 'vote-desc');
    const date = getTag(xml, 'action-date');
    const billLabel = legisNum && legisNum !== 'QUORUM' ? legisNum : (question || `Roll Call ${n}`);
    const re = /<recorded-vote>\s*<legislator name-id="([^"]+)"[^>]*>[^<]*<\/legislator>\s*<vote>([^<]*)<\/vote>/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(xml)) !== null) {
      const bioguide = mm[1];
      const arr = cache.get(bioguide) || [];
      if (arr.length >= VOTES_PER_MEMBER) continue;
      arr.push({
        bill: billLabel,
        billId: legisNum && legisNum !== 'QUORUM' ? legisNum.replace(/\s+/g, '') : undefined,
        date,
        vote: normaliseVote(mm[2]),
        alignsWithDonors: false,
        note: desc || question,
        congressNumber: 118,
        rollCallNumber: n,
      });
      cache.set(bioguide, arr);
    }
    await sleep(60);
  }
  __houseCache = cache;
  console.log(`[votes] House cache built: ${cache.size} members from ${HOUSE_YEAR} roll calls.`);
  return cache;
}

async function buildSenateCache(): Promise<Map<string, Vote[]>> {
  if (__senateCache) return __senateCache;
  const cache = new Map<string, Vote[]>();
  let menu: string;
  try {
    const res = await fetch(`https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${SENATE_CONGRESS}_${SENATE_SESSION}.xml`);
    menu = await res.text();
  } catch { __senateCache = cache; return cache; }
  const nums = (menu.match(/<vote_number>(\d+)<\/vote_number>/g) || [])
    .map(s => parseInt(s.replace(/\D/g, ''), 10))
    .sort((a, b) => b - a); // most-recent first
  for (const n of nums) {
    if (n <= 0) continue;
    const padded = String(n).padStart(5, '0');
    let xml: string;
    try {
      const res = await fetch(`https://www.senate.gov/legislative/LIS/roll_call_votes/vote${SENATE_CONGRESS}${SENATE_SESSION}/vote_${SENATE_CONGRESS}_${SENATE_SESSION}_${padded}.xml`);
      if (!res.ok) continue;
      xml = await res.text();
    } catch { continue; }
    const question = getTag(xml, 'question');
    const title = getTag(xml, 'vote_title');
    const issue = getTag(xml, 'vote_document_text') || getTag(xml, 'vote_question_text');
    const date = getTag(xml, 'vote_date');
    const re = /<member>([\s\S]*?)<\/member>/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(xml)) !== null) {
      const block = mm[1];
      const last = getTag(block, 'last_name').toLowerCase();
      const state = getTag(block, 'state').toUpperCase();
      const cast = getTag(block, 'vote_cast');
      if (!last || !state) continue;
      const key = `${last}|${state}`;
      const arr = cache.get(key) || [];
      if (arr.length >= VOTES_PER_MEMBER) continue;
      arr.push({
        bill: title || question || `Senate Vote ${n}`,
        billId: undefined,
        date,
        vote: normaliseVote(cast),
        alignsWithDonors: false,
        note: issue || question,
        congressNumber: SENATE_CONGRESS,
        rollCallNumber: n,
      });
      cache.set(key, arr);
    }
    await sleep(60);
  }
  __senateCache = cache;
  console.log(`[votes] Senate cache built: ${cache.size} members.`);
  return cache;
}

// Unified accessor. House -> match by bioguideId; Senate -> match by last name + state.
export async function fetchMemberVotes(
  bioguideId: string,
  chamber: 'House' | 'Senate',
  lastName: string,
  state: string
): Promise<Vote[]> {
  try {
    if (chamber === 'Senate') {
      const cache = await buildSenateCache();
      return cache.get(`${(lastName || '').toLowerCase()}|${(state || '').toUpperCase()}`) || [];
    }
    const cache = await buildHouseCache();
    return cache.get(bioguideId) || [];
  } catch {
    return [];
  }
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export async function fetchBillDetails(congress: number, billType: string, billNumber: string, apiKey: string) {
  try {
    const data = await get(`/bill/${congress}/${billType.toLowerCase()}/${billNumber}`, apiKey);
    return data.bill || null;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBillName(v: any): string {
  if (v.bill?.title) return v.bill.title;
  if (v.bill?.number) return `${v.bill.type} ${v.bill.number} (${v.congress}th Congress)`;
  if (v.description) return v.description;
  return `Roll Call Vote #${v.rollNumber}`;
}

function normaliseVote(raw: string): 'YEA' | 'NAY' | 'ABSTAIN' | 'NOT VOTING' {
  const v = (raw || '').toUpperCase();
  if (v === 'YEA' || v === 'AYE' || v === 'YES') return 'YEA';
  if (v === 'NAY' || v === 'NO' || v === 'NAYE') return 'NAY';
  if (v === 'PRESENT') return 'ABSTAIN';
  return 'NOT VOTING';
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
