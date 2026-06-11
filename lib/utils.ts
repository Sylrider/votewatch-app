// Pure utility functions - no Node.js imports, safe for client components

export function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

export function partyColor(party: string): string {
  if (party.startsWith('Republican')) return '#465465';
  if (party.startsWith('Democrat'))   return '#465465';
  return '#465465';
}

export function partyShort(party: string): string {
  if (party.startsWith('Republican')) return 'REP';
  if (party.startsWith('Democrat'))   return 'DEM';
  return 'IND';
}

export function riskLabel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'CRITICAL',  color: '#e11d48' };
  if (score >= 50) return { label: 'HIGH RISK', color: '#e11d48' };
  if (score >= 25) return { label: 'ELEVATED',  color: '#0d9488' };
  return               { label: 'LOW RISK',   color: '#0d9488' };
}
