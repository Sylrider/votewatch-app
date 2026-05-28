import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPolitician, getPoliticianSlugs, getLobbies, fmtMoney, partyColor, partyShort, riskLabel } from '@/lib/data';
import type { Politician } from '@/lib/types';

// Static generation — one HTML file per politician, built at deploy time
export async function generateStaticParams() {
  const slugs = await getPoliticianSlugs();
  return slugs;
}

// Per-page SEO metadata
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await getPolitician(params.slug);
  if (!p) return { title: 'Not Found' };

  const desc = p.viewSummary
    || `Transparency profile for ${p.name}, ${p.title} from ${p.state}. Transparency Risk Score: ${p.score.total}/100.`;

  return {
    title: `${p.name} — ${p.title}, ${p.state}`,
    description: desc.slice(0, 160),
    keywords: `${p.name}, ${p.state}, ${p.chamber}, lobby contributions, voting record, stock trades, transparency score`,
    openGraph: {
      title: `${p.name} | VoteWatch`,
      description: desc.slice(0, 160),
      type: 'profile',
    },
    // JSON-LD injected below
  };
}

export default async function PoliticianPage({ params }: { params: { slug: string } }) {
  const [p, allLobbies] = await Promise.all([
    getPolitician(params.slug),
    getLobbies(),
  ]);

  if (!p) notFound();

  const { label, color } = riskLabel(p.score.total);
  const pc = partyColor(p.party);
  const ps = partyShort(p.party);
  const initials = p.name.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.name,
    jobTitle: p.title,
    description: p.viewSummary || `${p.title} from ${p.state}`,
    homeLocation: { '@type': 'Place', name: p.state },
    affiliation: { '@type': 'Organization', name: p.party },
    memberOf: {
      '@type': 'Organization',
      name: p.chamber === 'Senate' ? 'United States Senate'
        : p.chamber === 'House' ? 'United States House of Representatives'
        : `${p.state} Government`,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-4xl mx-auto px-6 py-6" itemScope itemType="https://schema.org/Person">

        {/* Breadcrumb */}
        <nav className="mb-6" aria-label="Breadcrumb">
          <Link
            href="/"
            className="text-sm px-4 py-2 rounded border transition-colors"
            style={{ color: '#64748b', borderColor: '#252a3a' }}
          >
            ← Back to Politicians
          </Link>
        </nav>

        {/* Header card */}
        <header
          className="rounded-xl p-7 mb-5 flex gap-6 flex-wrap"
          style={{ background: '#0f1117', border: '1px solid #252a3a' }}
        >
          {/* Avatar */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center font-display text-3xl border-2 flex-shrink-0"
            style={{ background: pc + '22', color: pc, borderColor: '#252a3a' }}
            aria-hidden="true"
          >
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0" itemProp="name">
            <h1 className="font-display text-4xl tracking-wide mb-2" itemProp="name">{p.name}</h1>
            <div className="flex flex-wrap gap-2 mb-3 items-center">
              <span className={`font-cond text-xs font-bold tracking-widest px-3 py-1 rounded-full badge-${ps.toLowerCase()}`}>{ps}</span>
              {[p.chamber, p.state, `Since ${p.since}`, p.title].map(t => (
                <span key={t} className="text-xs px-3 py-1 rounded font-medium" style={{ background: '#171b24', border: '1px solid #252a3a', color: '#64748b' }}>{t}</span>
              ))}
            </div>
            <p className="text-sm" style={{ color: '#64748b' }}>
              Lobby money: <strong style={{ color: '#f59e0b' }}>{fmtMoney(p.score.totalMoney)}</strong>
              &ensp;·&ensp;Donor-aligned votes: <strong style={{ color: '#f59e0b' }}>{p.score.donorAlignedVotes}/{p.score.totalTrackedVotes}</strong>
              &ensp;·&ensp;Stock conflicts: <strong style={{ color: p.score.conflictTrades > 0 ? '#f97316' : '#22c55e' }}>{p.score.conflictTrades}</strong>
              &ensp;·&ensp;Legal actions: <strong style={{ color: p.lawsuits.length > 0 ? '#f97316' : '#22c55e' }}>{p.lawsuits.length}</strong>
            </p>
          </div>

          {/* Score */}
          <aside className="flex flex-col items-center gap-2 flex-shrink-0" aria-label={`Transparency Risk Score: ${p.score.total}/100`}>
            <div className={`w-24 h-24 rounded-full flex flex-col items-center justify-center border-[3px] ${p.score.total >= 75 ? 'score-critical' : p.score.total >= 50 ? 'score-high' : p.score.total >= 25 ? 'score-elevated' : 'score-low'}`}>
              <span className="font-display text-4xl leading-none" style={{ color }}>{p.score.total}</span>
              <span className="text-xs" style={{ color: '#64748b' }}>/100</span>
            </div>
            <span className="font-cond text-xs font-bold tracking-widest uppercase" style={{ color }}>{label}</span>

            {/* Breakdown bars */}
            <div className="grid grid-cols-2 gap-2 mt-2 p-4 rounded-lg w-56" style={{ background: '#171b24', border: '1px solid #252a3a' }}>
              {[
                { label: 'Lobby $',      val: p.score.lobbyScore, max: 25, color: '#f97316' },
                { label: 'Vote Align',   val: p.score.alignScore, max: 35, color: '#ef4444' },
                { label: 'Stock Trade',  val: p.score.stockScore, max: 25, color: '#eab308' },
                { label: 'Legal',        val: p.score.legalScore, max: 15, color: '#a855f7' },
              ].map(item => (
                <div key={item.label} className="flex flex-col gap-1">
                  <span className="font-cond text-[10px] uppercase tracking-wider" style={{ color: '#64748b' }}>
                    {item.label} <strong style={{ color: item.color }}>{item.val}/{item.max}</strong>
                  </span>
                  <div className="h-1 rounded overflow-hidden" style={{ background: '#252a3a' }}>
                    <div className="h-full rounded" style={{ width: `${(item.val / item.max) * 100}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </header>

        {/* View Summary */}
        {p.viewSummary && (
          <section className="mb-5">
            <h2 className="section-title">Independent View Summary</h2>
            <blockquote className="summary-box" itemProp="description">{p.viewSummary}</blockquote>
          </section>
        )}

        {/* Lobby Contributions */}
        {p.lobbyMoney.length > 0 && (
          <section className="mb-5">
            <h2 className="section-title">Lobby Contributions Received</h2>
            <div className="data-table" role="table">
              <div className="data-table-head grid gap-3" style={{ gridTemplateColumns: '1fr 90px 1fr' }}>
                <span>Lobby / Donor</span><span>Amount</span><span>What They Want</span>
              </div>
              {p.lobbyMoney.map(l => {
                const lobby = allLobbies.find(lb => lb.id === l.lobbyId);
                return (
                  <div key={l.lobbyId} className="data-row grid gap-3 items-center" style={{ gridTemplateColumns: '1fr 90px 1fr' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: lobby?.color || '#888' }} />
                      <div>
                        <Link href={`/lobbies/${l.lobbyId}`} className="font-semibold text-sm hover:text-amber-400 transition-colors" style={{ color: '#e2e8f0' }}>
                          {l.lobbyName}
                        </Link>
                        {lobby && <div className="text-xs" style={{ color: '#64748b' }}>{lobby.category}</div>}
                      </div>
                    </div>
                    <div className="font-cond text-lg font-bold" style={{ color: '#f59e0b' }}>{fmtMoney(l.amount)}</div>
                    <div className="text-xs" style={{ color: '#64748b', lineHeight: 1.4 }}>{l.intent}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Stock Trades */}
        <section className="mb-5">
          <h2 className="section-title">Stock Trades While in Office</h2>
          <div className="data-table">
            {p.stockTrades.length === 0
              ? <div className="p-5 text-sm" style={{ color: '#22c55e' }}>✓ No stock trades on record with identifiable conflicts.</div>
              : p.stockTrades.map((t, i) => (
                <div key={i} className="data-row grid gap-3 items-start" style={{ gridTemplateColumns: '56px 1fr 90px 100px' }}>
                  <div>
                    <span className={`font-cond text-xs font-bold px-2 py-1 rounded vote-${t.action === 'BUY' ? 'yea' : t.action === 'SELL' ? 'nay' : 'abs'}`}>
                      {t.action}
                    </span>
                  </div>
                  <div>
                    <div className="font-cond text-base font-bold" style={{ color: '#e2e8f0' }}>{t.ticker}</div>
                    <div className="text-xs" style={{ color: '#64748b' }}>{t.company}</div>
                    <div className="text-xs mt-1" style={{ color: '#64748b', lineHeight: 1.4 }}>{t.conflictNote}</div>
                    {t.conflict && <div className="conflict-flag">⚡ Conflict of Interest</div>}
                  </div>
                  <div className="font-cond text-base font-bold" style={{ color: '#f59e0b' }}>
                    {t.amountRange || fmtMoney(t.amount)}
                  </div>
                  <div className="text-xs text-right" style={{ color: '#64748b' }}>{t.date}</div>
                </div>
              ))
            }
          </div>
        </section>

        {/* Legal Actions */}
        <section className="mb-5">
          <h2 className="section-title">Legal Actions &amp; Investigations</h2>
          <div className="data-table">
            {p.lawsuits.length === 0
              ? <div className="p-5 text-sm" style={{ color: '#22c55e' }}>✓ No lawsuits, investigations, or legal actions on record.</div>
              : p.lawsuits.map((l, i) => (
                <div key={i} className="data-row grid gap-3 items-start" style={{ gridTemplateColumns: '90px 1fr 110px' }}>
                  <div className={`font-cond text-xs font-bold tracking-wide px-2 py-1 rounded text-center sev-${l.severity}`}>
                    {l.severity.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-sm mb-1" style={{ color: '#e2e8f0' }}>{l.title}</div>
                    <div className="font-cond text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>{l.type}</div>
                    <div className="text-xs" style={{ color: '#64748b', lineHeight: 1.5 }}>{l.description}</div>
                    {l.courtListenerUrl && (
                      <a href={l.courtListenerUrl} target="_blank" rel="noopener noreferrer" className="text-xs mt-1 inline-block" style={{ color: '#3b82f6' }}>
                        View on CourtListener ↗
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <StatusChip status={l.status} />
                    <div className="text-xs mt-1" style={{ color: '#64748b' }}>{l.outcome}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </section>

        {/* Votes */}
        {p.votes.length > 0 && (
          <section className="mb-5">
            <h2 className="section-title">Voting Record</h2>
            <div className="data-table">
              {p.votes.map((v, i) => (
                <div key={i} className="data-row grid gap-3 items-start" style={{ gridTemplateColumns: '64px 1fr 100px' }}>
                  <div>
                    <span className={`font-cond text-xs font-bold px-2 py-1 rounded ${v.vote === 'YEA' ? 'vote-yea' : 'vote-nay'}`}>{v.vote}</span>
                    {v.alignsWithDonors && <div className="donor-flag">⚠ Donor</div>}
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-1" style={{ color: '#e2e8f0' }}>{v.bill}</div>
                    <div className="text-xs" style={{ color: '#64748b', lineHeight: 1.4 }}>{v.note}</div>
                  </div>
                  <div className="text-xs text-right" style={{ color: '#64748b' }}>
                    <time dateTime={v.date}>{v.date}</time>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls: Record<string, string> = {
    'DISMISSED':    'background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.25)',
    'ONGOING':      'background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25)',
    'SETTLED':      'background:rgba(245,158,11,.1);color:#f59e0b;border:1px solid rgba(245,158,11,.25)',
    'CONVICTED':    'background:rgba(239,68,68,.13);color:#ef4444;border:1px solid rgba(239,68,68,.28)',
    'ACQUITTED':    'background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.25)',
    'UNDER REVIEW': 'background:rgba(249,115,22,.1);color:#f97316;border:1px solid rgba(249,115,22,.25)',
    'RESOLVED':     'background:rgba(100,116,139,.1);color:#64748b;border:1px solid rgba(100,116,139,.25)',
    'CLOSED':       'background:rgba(100,116,139,.1);color:#64748b;border:1px solid rgba(100,116,139,.25)',
  };
  const style = cls[status] || cls['CLOSED'];
  return (
    <span
      className="font-cond text-[11px] font-bold tracking-wide px-2 py-1 rounded inline-block"
      style={Object.fromEntries(style.split(';').map(s => s.split(':').map(p => p.trim()))) as React.CSSProperties}
    >
      {status}
    </span>
  );
}
