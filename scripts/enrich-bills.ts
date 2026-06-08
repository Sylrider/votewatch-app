// scripts/enrich-bills.ts
// Bill enrichment for the VOTES axis. For each distinct bill referenced in a
// roll-call vote, fetch the official title, CRS summary, policy area and
// legislative subjects from the Congress.gov API and cache to data/bills.json.
//
// WHY: keyword matching on the bare bill id (e.g. "H.R. 10545") almost never
// matches a lobby. With the real title + summary + official subject tags we can
// classify a vote into a topic galaxy AND read what it actually did, so the
// vote-alignment pillar can become meaningful instead of flatlined.
//
// SAFETY: reads the key from process.env.CONGRESS_API_KEY only. Never hardcode.
// Runs in GitHub Actions (no CORS). Resumes from existing data/bills.json so a
// partial / rate-limited run can be re-run safely. ASCII-only output.
//
// Usage:
//   npx tsx scripts/enrich-bills.ts                 (all bills, batches of 10)
//   npx tsx scripts/enrich-bills.ts --batch=25      (custom batch size)
//   npx tsx scripts/enrich-bills.ts --limit=20      (only first 20 missing)
//   npx tsx scripts/enrich-bills.ts --force         (refetch even if cached)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const API_KEY = process.env.CONGRESS_API_KEY || '';
const BASE = 'https://api.congress.gov/v3';
const DATA_DIR = join(process.cwd(), 'data');
const POLS_PATH = join(DATA_DIR, 'politicians.json');
const OUT_PATH = join(DATA_DIR, 'bills.json');

// --- args ---
const args = process.argv.slice(2);
function argNum(name: string, def: number): number {
  const a = args.find((x) => x.startsWith('--' + name + '='));
  if (!a) return def;
  const n = parseInt(a.split('=')[1], 10);
  return Number.isFinite(n) ? n : def;
}
const BATCH_SIZE = argNum('batch', 10);
const LIMIT = argNum('limit', 0); // 0 = no limit
const FORCE = args.includes('--force');
const RATE_LIMIT_MS = argNum('delay', 350); // ~170 req/min, well under 1000/hr

// --- ascii guard (project rule: no byte > 126 in any committed file) ---
function asciiSafe(s: string): string {
  return (s || '').replace(/[^\x00-\x7E]/g, (ch) => {
    const map: Record<string, string> = {
      '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"',
      '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u00A0': ' ',
    };
    return map[ch] || '';
  });
}
function stripHtml(s: string): string {
  return asciiSafe((s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}

// --- bill parser (handles "H.R. 82", "H R 82", procedural wrappers) ---
type Bill = { type: string; number: string };
function parseBill(text: string): Bill | null {
  if (!text) return null;
  const re = /\b(H\.?\s?J\.?\s?Res|H\.?\s?Con\.?\s?Res|H\.?\s?Res|S\.?\s?J\.?\s?Res|S\.?\s?Con\.?\s?Res|S\.?\s?Res|H\.?\s?R|S)\.?\s*(?:No\.?\s*)?(\d{1,6})\b/gi;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) last = m;
  if (!last) return null;
  const type = last[1].toLowerCase().replace(/[.\s]/g, '');
  return { type, number: last[2] };
}

function billKey(congress: number, b: Bill): string {
  return congress + ':' + b.type + ':' + b.number;
}

async function getJson(url: string): Promise<any | null> {
  const sep = url.includes('?') ? '&' : '?';
  const full = url + sep + 'api_key=' + API_KEY + '&format=json';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(full);
      if (res.status === 404) return null; // bill/summary genuinely absent
      if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      if (!res.ok) { await sleep(800 * (attempt + 1)); continue; }
      return await res.json();
    } catch (e) {
      await sleep(800 * (attempt + 1));
    }
  }
  return null;
}
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

type EnrichedBill = {
  congress: number; type: string; number: string;
  title: string; policyArea: string; subjects: string[];
  summary: string; fetchedAt: string; ok: boolean;
};

async function enrichOne(congress: number, b: Bill): Promise<EnrichedBill> {
  const base = BASE + '/bill/' + congress + '/' + b.type + '/' + b.number;
  const detail = await getJson(base);
  await sleep(RATE_LIMIT_MS);
  const subj = await getJson(base + '/subjects');
  await sleep(RATE_LIMIT_MS);
  const summ = await getJson(base + '/summaries');
  await sleep(RATE_LIMIT_MS);

  const bill = detail && detail.bill ? detail.bill : null;
  const title = bill ? asciiSafe(bill.title || '') : '';
  const policyArea = bill && bill.policyArea ? asciiSafe(bill.policyArea.name || '') : '';
  const subjects: string[] = [];
  if (subj && subj.subjects && Array.isArray(subj.subjects.legislativeSubjects)) {
    for (const s of subj.subjects.legislativeSubjects) {
      if (s && s.name) subjects.push(asciiSafe(s.name));
    }
  }
  let summary = '';
  if (summ && Array.isArray(summ.summaries) && summ.summaries.length) {
    // take the most recent summary
    const latest = summ.summaries[summ.summaries.length - 1];
    summary = stripHtml(latest && latest.text ? latest.text : '');
  }
  return {
    congress, type: b.type, number: b.number,
    title, policyArea, subjects, summary,
    fetchedAt: new Date().toISOString(),
    ok: !!(title || summary || subjects.length),
  };
}

async function main() {
  if (!API_KEY) {
    console.error('CONGRESS_API_KEY is not set. Add it as a repo secret. Aborting.');
    process.exit(1);
  }
  if (!existsSync(POLS_PATH)) {
    console.error('data/politicians.json not found. Aborting.');
    process.exit(1);
  }
  const raw = readFileSync(POLS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const pols: any[] = Array.isArray(parsed) ? parsed : (parsed.politicians || parsed.officials || []);

  // collect distinct bills (key -> {congress, bill})
  const wanted = new Map<string, { congress: number; bill: Bill }>();
  for (const p of pols) {
    const votes: any[] = p.votes || [];
    for (const v of votes) {
      if (!v || !v.bill) continue;
      const b = parseBill(v.bill);
      if (!b) continue;
      const congress = v.congressNumber || 118;
      wanted.set(billKey(congress, b), { congress, bill: b });
    }
  }

  // load existing cache (resume)
  let cache: Record<string, EnrichedBill> = {};
  if (existsSync(OUT_PATH)) {
    try { cache = JSON.parse(readFileSync(OUT_PATH, 'utf8')); } catch (e) { cache = {}; }
  }

  // figure out what still needs fetching
  let todo = [...wanted.entries()].filter(([k]) => FORCE || !cache[k] || !cache[k].ok);
  if (LIMIT > 0) todo = todo.slice(0, LIMIT);

  console.log('Distinct bills referenced: ' + wanted.size);
  console.log('Already cached (ok): ' + (wanted.size - todo.length));
  console.log('To fetch this run: ' + todo.length + ' (batch ' + BATCH_SIZE + ', delay ' + RATE_LIMIT_MS + 'ms)');

  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    for (const [key, { congress, bill }] of batch) {
      const enriched = await enrichOne(congress, bill);
      cache[key] = enriched;
      done++;
      const tag = enriched.ok ? 'ok' : 'EMPTY';
      console.log('  [' + done + '/' + todo.length + '] ' + key + ' -> ' + tag + (enriched.title ? ' :: ' + enriched.title.slice(0, 60) : ''));
    }
    // flush after each batch so a crash/rate-limit keeps progress
    writeFileSync(OUT_PATH, JSON.stringify(cache, null, 2) + '\n');
    console.log('  ...flushed ' + Object.keys(cache).length + ' bills to data/bills.json');
  }

  // final ascii guard on the file we wrote
  const finalText = readFileSync(OUT_PATH, 'utf8');
  const bad = finalText.match(/[^\x00-\x7E]/g);
  if (bad && bad.length) {
    console.error('ERROR: non-ASCII bytes in bills.json: ' + bad.length + ' - investigate before commit.');
    process.exit(1);
  }
  const okCount = Object.values(cache).filter((b) => b.ok).length;
  console.log('Done. ' + Object.keys(cache).length + ' bills cached, ' + okCount + ' with content.');
}

main().catch((e) => { console.error(e); process.exit(1); });
