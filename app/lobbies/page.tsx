import type { Metadata } from 'next';
import Link from 'next/link';
import { getLobbies, getPoliticians } from '@/lib/data';
import { fmtMoney } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'U.S. Lobbying Groups & Special Interests',
  description: 'Profiles of the most powerful U.S. lobbying groups - NRA, PhRMA, API, Chamber of Commerce, AIPAC, and more. See what they spend, what they want, and which politicians they fund.',
  keywords: 'lobbying groups, special interests, NRA, PhRMA, AIPAC, Chamber of Commerce, campaign finance, political donors',
};

export default async function LobbiesPage() {
  const [lobbies, politicians] = await Promise.all([getLobbies(), getPoliticians()]);

  return (
    <>
      <header className="hero">
        <p className="hero-eyebrow">Special Interest Groups</p>
        <h1 className="hero-h1">The <em>Lobbies</em><br />Shaping Congress</h1>
        <p className="hero-desc">Who funds Congress, what they want, and which politicians they've bought access to.</p>
      </header>

      <main
        className="grid gap-4 p-6"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))' }}
        aria-label="Lobbying groups"
      >
        {lobbies.map(lobby => {
          const recipients = politicians.filter(p => p.lobbyMoney?.some(l => l.lobbyId === lobby.id));
          const totalDonated = recipients.reduce((s, p) => s + (p.lobbyMoney?.find(l => l.lobbyId === lobby.id)?.amount || 0), 0);

          return (
            <Link key={lobby.id} href={`/lobbies/${lobby.id}`} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
              <article
                className="card"
                itemScope itemType="https://schema.org/Organization"
                aria-label={`${lobby.name}: ${lobby.category}`}
              >
                <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid #e6eaed' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 8, color: '#0d9488' }}>
                    {lobby.category}
                  </p>
                  <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, color: '#0f1b2d', lineHeight: 1.3, marginBottom: 12 }} itemProp="name">
                    {lobby.name}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: '#0d9488' }}>{fmtMoney(lobby.annualSpend)}</span>
                      <span style={{ fontSize: 11, color: '#8493a3', marginLeft: 4 }}>/ yr lobbying</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#0f1b2d' }}>{recipients.length}</div>
                      <div style={{ fontSize: 10, color: '#8493a3', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Politicians Funded</div>
                    </div>
                  </div>
                </div>
                <p style={{ padding: '12px 18px', background: '#f6f8f9', fontSize: 12, color: '#8493a3', lineHeight: 1.5,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  itemProp="description">
                  {lobby.mission}
                </p>
              </article>
            </Link>
          );
        })}
      </main>
    </>
  );
}
