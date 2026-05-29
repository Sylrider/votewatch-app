import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Methodology — How We Score Politicians',
  description: 'How WatchGov calculates the Transparency Risk Score using lobby money, voter-donor alignment, stock trading conflicts, and legal history.',
};

export default function MethodologyPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-10" itemScope itemType="https://schema.org/WebPage">
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 50, letterSpacing: 2, marginBottom: 6, color: '#e2e8f0' }}>
        About <em style={{ color: '#f59e0b', fontStyle: 'normal' }}>WatchGov</em>
      </h1>
      <p style={{ fontSize: 14, color: '#b0bcd4', lineHeight: 1.75, marginBottom: 20 }} itemProp="description">
        An independent civic transparency tool that tracks lobbying money, stock trading conflicts, lawsuits,
        and donor-vote alignment for elected officials — based entirely on disclosed records and vote history,
        not self-reported statements.
      </p>

      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', margin: '26px 0 9px' }}>
        Transparency Risk Score — 4 Components
      </h2>
      <table style={{ background: '#0f1117', border: '1px solid #252a3a', borderRadius: 8, overflow: 'hidden', margin: '10px 0', width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#171b24', borderBottom: '1px solid #252a3a' }}>
            {['Component', 'Max Points', 'What It Measures'].map(h => (
              <th key={h} style={{ padding: '9px 16px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['💰 Lobby Money', '25 pts', 'Total career lobbying contributions received. Scaled per $100K received, capped at 25.'],
            ['🗳 Vote Alignment', '35 pts', 'Percentage of tracked votes that align with the politician\'s top donors\' positions.'],
            ['📈 Stock Conflicts', '25 pts', 'Trades made while in office that conflict with committee roles or upcoming legislation. +10 pts for any single trade ≥ $500K.'],
            ['⚖️ Legal Record', '15 pts', 'Lawsuits, ethics investigations, FEC violations. Weighted by severity: High=7, Medium=4, Low=1.'],
          ].map(([comp, pts, desc]) => (
            <tr key={comp} style={{ borderBottom: '1px solid #252a3a' }}>
              <td style={{ padding: '10px 16px', fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>{comp}</td>
              <td style={{ padding: '10px 16px', color: '#f59e0b', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700 }}>{pts}</td>
              <td style={{ padding: '10px 16px', color: '#b0bcd4', fontSize: 13 }}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ background: '#0f1117', border: '1px solid #252a3a', borderRadius: 8, padding: '16px 18px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, color: '#f59e0b', margin: '10px 0', lineHeight: 1.9 }}>
        Total Score = Lobby Score + Alignment Score + Stock Score + Legal Score<br /><br />
        Lobby Score &nbsp;&nbsp;&nbsp;= min(25, total_lobby_$ / 100,000 × 1.2)<br />
        Alignment Score = (donor-aligned votes / total votes) × 35<br />
        Stock Score &nbsp;&nbsp;&nbsp;= (conflict trades × 5) + (10 if any trade ≥ $500K)<br />
        Legal Score &nbsp;&nbsp;&nbsp;= Σ severity weights, capped at 15
      </div>

      <div style={{ background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.18)', borderRadius: 8, padding: '14px 18px', fontSize: 13, color: '#d4aa60', lineHeight: 1.65, margin: '10px 0' }}>
        ⚠ A high score identifies where financial incentives and official power overlap statistically.
        It does not prove illegal activity. A low score does not certify integrity — only that no
        significant conflicts were detected in the tracked data.
      </div>

      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', margin: '26px 0 9px' }}>Score Bands</h2>
      <p style={{ fontSize: 14, color: '#b0bcd4', lineHeight: 1.75 }}>
        <strong style={{ color: '#ef4444' }}>CRITICAL (75–100):</strong> Multiple financial conflicts across lobbying, trading, and legal domains.<br />
        <strong style={{ color: '#f97316' }}>HIGH RISK (50–74):</strong> Significant donor-vote correlation and/or stock trading conflicts.<br />
        <strong style={{ color: '#eab308' }}>ELEVATED (25–49):</strong> Some correlation; warrants monitoring.<br />
        <strong style={{ color: '#22c55e' }}>LOW RISK (0–24):</strong> No major financial conflicts detected in tracked data.
      </p>

      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', margin: '26px 0 9px' }}>Data Sources</h2>
      <p style={{ fontSize: 14, color: '#b0bcd4', lineHeight: 1.75 }}>
        FEC.gov · Congress.gov · Senate Stock Watcher · House Stock Watcher · CourtListener · OpenSecrets.org · Ballotpedia · ProPublica (archived) · National Governors Association
      </p>

      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', margin: '26px 0 9px' }}>Open Source</h2>
      <p style={{ fontSize: 14, color: '#b0bcd4', lineHeight: 1.75 }}>
        WatchGov is fully open source.{' '}
        <a href="https://github.com/Sylrider/votewatch-app" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
          View the code on GitHub ↗
        </a>
      </p>
    </article>
  );
}
