import type { Metadata } from 'next';
import { getPoliticians } from '@/lib/data';
import { fmtMoney } from '@/lib/utils';
import PoliticianGrid from '@/components/PoliticianGrid';

export const metadata: Metadata = {
  title: 'VoteWatch — U.S. Political Transparency Tracker',
  description:
    'Track lobbying money, stock trading conflicts, lawsuits, and donor-vote alignment for every U.S. Senator, Representative, Governor, and President. Transparency scores based on disclosed records, not declarations.',
  keywords: [
    'politician transparency', 'lobby money', 'congress voting record',
    'stock trading conflict of interest', 'corruption score', 'US senators',
    'US representatives', 'governors', 'campaign finance', 'special interests',
  ].join(', '),
  openGraph: {
    title: 'VoteWatch — Who Does Your Politician Really Work For?',
    description: 'Independent transparency tracking for all U.S. elected officials. Scores based on lobby money, votes, stock trades, and legal records.',
    type: 'website',
    url: 'https://votewatch.us',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

// JSON-LD structured data for Google
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'VoteWatch',
  description: 'U.S. Political Transparency Tracker',
  url: 'https://votewatch.us',
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://votewatch.us/search?q={search_term_string}',
    'query-input': 'required name=search_term_string',
  },
};

export default async function HomePage() {
  // Data is pre-generated at build time — zero per-user cost
  const politicians = await getPoliticians();

  const totalMoney = politicians.reduce(
    (s, p) => s + (p.score?.totalMoney || 0), 0
  );
  const totalConflicts = politicians.reduce(
    (s, p) => s + (p.score?.conflictTrades || 0), 0
  );
  const totalLegal = politicians.reduce(
    (s, p) => s + (p.lawsuits?.length || 0), 0
  );
  const totalVotes = politicians.reduce(
    (s, p) => s + (p.votes?.length || 0), 0
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <header className="hero">
        <p className="hero-eyebrow">Civic Transparency Initiative</p>
        <h1 className="hero-h1">
          Who Does Your <em>Politician</em> Really Work For?
        </h1>
        <p className="hero-desc">
          Track lobbying money, stock trading conflicts, lawsuits, and
          donor-vote alignment for every elected official. Views derived from
          actions and financial disclosures — not declarations.
        </p>
        <div className="stats-row">
          <div className="stat-item">
            <span className="stat-num">{politicians.length.toLocaleString()}</span>
            <span className="stat-lbl">Officials Tracked</span>
          </div>
          <div className="stat-item">
            <span className="stat-num">{fmtMoney(totalMoney)}</span>
            <span className="stat-lbl">Lobby Money</span>
          </div>
          <div className="stat-item">
            <span className="stat-num">{totalConflicts.toLocaleString()}</span>
            <span className="stat-lbl">Stock Conflicts</span>
          </div>
          <div className="stat-item">
            <span className="stat-num">{totalLegal.toLocaleString()}</span>
            <span className="stat-lbl">Legal Actions</span>
          </div>
          <div className="stat-item">
            <span className="stat-num">{totalVotes.toLocaleString()}</span>
            <span className="stat-lbl">Votes Tracked</span>
          </div>
        </div>
      </header>

      {/* Grid with client-side filtering */}
      <PoliticianGrid politicians={politicians} />
    </>
  );
}

