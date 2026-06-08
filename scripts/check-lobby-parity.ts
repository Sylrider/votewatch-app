/**
 * scripts/check-lobby-parity.ts
 *
 * Guard: every id emitted by the classifier (LOBBY_META in lobby-map.ts)
 * MUST have a matching entry in data/lobbies.json, and vice versa.
 * This stops "orphan" lobby ids (classified money with no displayable
 * lobby card) and stale json entries from creeping back in.
 *
 * Run:  npx tsx scripts/check-lobby-parity.ts
 * Exits 1 (and prints the diff) if the two id sets disagree.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { LOBBY_META } from './lobby-map';

interface LobbyJson {
  id: string;
  name: string;
  [key: string]: unknown;
}

function main(): void {
  const metaIds = new Set<string>(Object.keys(LOBBY_META));

  const jsonPath = join(process.cwd(), 'data', 'lobbies.json');
  const raw = readFileSync(jsonPath, 'utf8');
  const lobbies = JSON.parse(raw) as LobbyJson[];
  const jsonIds = new Set<string>(lobbies.map((l) => l.id));

  const missingInJson: string[] = [];
  metaIds.forEach((id) => {
    if (!jsonIds.has(id)) missingInJson.push(id);
  });

  const orphanInJson: string[] = [];
  jsonIds.forEach((id) => {
    if (!metaIds.has(id)) orphanInJson.push(id);
  });

  const dupes: string[] = [];
  const seen = new Set<string>();
  lobbies.forEach((l) => {
    if (seen.has(l.id)) dupes.push(l.id);
    seen.add(l.id);
  });

  console.log('Lobby parity check');
  console.log('  LOBBY_META ids:    ' + metaIds.size);
  console.log('  lobbies.json ids:  ' + jsonIds.size);

  let ok = true;

  if (missingInJson.length > 0) {
    ok = false;
    console.error('  MISSING in lobbies.json (classifier emits, no card): ' + missingInJson.sort().join(', '));
  }
  if (orphanInJson.length > 0) {
    ok = false;
    console.error('  ORPHAN in lobbies.json (card, no classifier id):    ' + orphanInJson.sort().join(', '));
  }
  if (dupes.length > 0) {
    ok = false;
    console.error('  DUPLICATE ids in lobbies.json: ' + dupes.sort().join(', '));
  }

  if (!ok) {
    console.error('FAIL: LOBBY_META and data/lobbies.json are out of sync.');
    process.exit(1);
  }

  console.log('OK: every classifier id has a lobby card and vice versa (' + metaIds.size + ' ids).');
}

main();
