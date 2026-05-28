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

export async function fetchMemberVotes(
  bioguideId: string,
  apiKey: string,
  maxVotes = 50
): Promise<Vote[]> {
  try {
    const data = await get(`/member/${bioguideId}/votes`, apiKey, {
      limit: String(maxVotes),
      offset: '0',
    });

    const rawVotes = data.votes || [];

    return rawVotes.map((v: any) => ({
      bill: formatBillName(v),
      billId: v.bill?.number ? `${v.bill.type}${v.bill.number}` : undefined,
      date: v.date || '',
      vote: normaliseVote(v.memberVote),
      alignsWithDonors: false, // calculated later in scoring pipeline
      note: v.description || '',
      congressNumber: v.congress,
      rollCallNumber: v.rollNumber,
    }));
  } catch (err) {
    // Member may have no recorded votes (e.g. newly sworn in)
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
