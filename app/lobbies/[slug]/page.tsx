import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getLobby, getLobbies, getLobbyRecipients } from '@/lib/data';
import { fmtMoney, riskLabel, partyShort } from '@/lib/utils';

export async function generateStaticParams() {
  const lobbies = await getLobbies();
  return lobbies.map(l => ({ slug: l.id }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const lobby = await getLobby(params.slug);
  if (!lobby) return { title: 'Not Found' };
  return {
    title: `${lobby.name} - Lobby Profile`,
    description: `${lobby.name} lobbying profile. Annual spend: ${fmtMoney(lobby.annualSpend)}. ${lobby.mission.slice(0, 140)}`,
    keywords: `${lobby.name}, ${lobby.category}, lobbying, political donations, campaign finance`,
  };
}

export default async function LobbyPage({ params }: { params: { slug: string } }) {
  const [lobby, recipients] = await Promise.all([
    getLobby(params.slug),
    getLobbyRecipients(params.slug),
  ]);

  if (!lobby) notFound();

  const totalDonated = recipients.reduce((s, p) => s + (p.lobbyMoney?.find(l => l.lobbyId === lobby.id)?.amount || 0), 0);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: lobby.name,
    description: lobby.mission,
    foundingDate: String(lobby.founded),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-4xl mx-auto px-6 py-6" itemScope itemType="https://schema.org/Organization">
        <nav className="mb-6">
          <Link href="/lobbies" style={{ color: '#8493a3', fontSize: 13, border: '1px solid #e6eaed', padding: '6px 14px', borderRadius: 6, textDecoration: 'none' }}>
            &larr; Back to Lobbies
          </Link>
        </nav>

        {/* Header */}
        <header style={{ background: '#ffffff', border: '1px solid #e6eaed', borderRadius: 12, padding: 26, marginBottom: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 8, color: lobby.color }}>{lobby.category}</p>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, letterSpacing: 2, lineHeight: 1, marginBottom: 16, color: '#0f1b2d' }} itemProp="name">{lobby.name}</h1>
          <div style={{ display: 'flex', border: '1px solid #e6eaed', borderRadius: 8, overflow: 'hidden', background: '#f6f8f9', maxWidth: 560 }}>
            {[
              { val: fmtMoney(lobby.annualSpend), key: 'Annual Spend' },
              { val: lobby.founded, key: 'Founded' },
              { val: recipients.length, key: 'Politicians Funded' },
              { val: fmtMoney(totalDonated), key: 'Total Donated' },
            ].map((item, i) => (
              <div key={i} style={{ flex: 1, padding: '12px 14px', borderRight: i < 3 ? '1px solid #e6eaed' : 'none', textAlign: 'center' }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#0d9488', display: 'block' }}>{item.val}</span>
                <span style={{ fontSize: 10, color: '#8493a3', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.key}</span>
              </div>
            ))}
          </div>
        </header>

        {/* Mission */}
        <section style={{ marginBottom: 18 }}>
          <h2 className="section-title">What They Defend</h2>
          <blockquote className="summary-box" itemProp="description">{lobby.mission}</blockquote>
        </section>

        {/* Key positions */}
        <section style={{ marginBottom: 18 }}>
          <h2 className="section-title">Key Political Positions</h2>
          <div className="data-table">
            <ul style={{ listStyle: 'none' }}>
              {lobby.keyPositions.map((pos, i) => (
                <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 18px', borderBottom: i < lobby.keyPositions.length - 1 ? '1px solid #e6eaed' : 'none', fontSize: 14, color: '#0f1b2d' }}>
                  <span style={{ color: '#e11d48', fontSize: 15, flexShrink: 0, marginTop: 1 }}>x</span>
                  <span>{pos}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Funded politicians */}
        <section style={{ marginBottom: 18 }}>
          <h2 className="section-title">Politicians This Lobby Has Funded</h2>
          <div className="data-table">
            {recipients.length === 0
              ? <p style={{ padding: '20px 18px', color: '#8493a3', fontSize: 14 }}>No tracked recipients yet.</p>
              : recipients.map(p => {
                const entry = p.lobbyMoney?.find(l => l.lobbyId === lobby.id);
                const { color } = riskLabel(p.score?.total || 0);
                const pc = p.party.startsWith('R') ? '#e11d48' : p.party.startsWith('D') ? '#2563eb' : '#9333ea';
                return (
                  <Link key={p.id} href={`/politicians/${p.id}`} style={{ textDecoration: 'none' }}>
                    <div className="data-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f1b2d' }}>{p.name}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: pc + '22', color: pc, border: `1px solid ${pc}44` }}>
                            {partyShort(p.party)}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#8493a3', marginBottom: entry?.intent ? 4 : 0 }}>{p.title} - {p.state}</div>
                        {entry?.intent && (
                          <div style={{ fontSize: 11, color: '#465465', lineHeight: 1.4, borderLeft: '2px solid #e6eaed', paddingLeft: 8 }}>{entry.intent}</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 19, fontWeight: 700, color: '#0d9488' }}>{fmtMoney(entry?.amount || 0)}</div>
                        <div style={{ fontSize: 11, color }}>Risk {p.score?.total || 0}/100</div>
                      </div>
                    </div>
                  </Link>
                );
              })
            }
          </div>
        </section>
      </div>
    </>
  );
}
