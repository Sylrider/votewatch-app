import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://watchgov.org'),
  title: {
    default: 'WatchGov - U.S. Political Transparency',
    template: '%s | WatchGov',
  },
  description: 'Independent transparency tracker for all U.S. elected officials. Scores based on lobby money, votes, stock trades, and legal records.',
  robots: { index: true, follow: true },
  verification: { google: 'dwGozQwD9nEkf_viu_qHihxGnGVHRDhjoh637EhDoBk' },
  authors: [{ name: 'WatchGov' }],
  openGraph: {
    siteName: 'WatchGov',
    type: 'website',
    locale: 'en_US',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="canonical" href={process.env.NEXT_PUBLIC_SITE_URL || 'https://watchgov.org'} />
      </head>
      <body>
        {/* Navigation */}
        <nav
          className="sticky top-0 z-50 flex items-center justify-between px-6 h-[58px] border-b"
          style={{ background: 'rgba(8,10,15,0.97)', borderColor: '#252a3a', backdropFilter: 'blur(16px)' }}
          aria-label="Main navigation"
        >
          <Link
            href="/"
            className="font-display text-[26px] tracking-widest"
            style={{ color: '#f59e0b' }}
            aria-label="WatchGov home"
          >
            Watch<span style={{ color: '#e2e8f0' }}>Gov</span>
          </Link>

          <div className="flex gap-1" role="menubar">
            <NavLink href="/">Politicians</NavLink>
            <NavLink href="/lobbies">Lobbies</NavLink>
            <NavLink href="/methodology">Methodology</NavLink>
          </div>
        </nav>

        {/* Disclaimer */}
        <div className="disc-bar" role="alert">
          ! Data sourced from FEC.gov, Congress.gov, Senate/House Stock Watchers, and CourtListener.
          All information is based on public disclosures. Not legal advice.
        </div>

        {/* Page content */}
        <main>{children}</main>

        {/* Footer */}
        <footer
          className="border-t mt-16 py-12 px-6"
          style={{ borderColor: '#252a3a', background: '#0f1117' }}
        >
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="font-display text-2xl tracking-widest mb-3" style={{ color: '#f59e0b' }}>
                WatchGov
              </div>
              <p className="text-sm" style={{ color: '#64748b', lineHeight: 1.7 }}>
                An independent civic transparency project.
                Not affiliated with any political party or organization.
              </p>
            </div>

            <div>
              <h3 className="font-cond text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#64748b' }}>
                Data Sources
              </h3>
              <ul className="space-y-1 text-sm" style={{ color: '#64748b' }}>
                {[
                  ['FEC Campaign Finance', 'https://fec.gov'],
                  ['Congress.gov Voting Records', 'https://congress.gov'],
                  ['Senate Stock Watcher', 'https://senatestockwatcher.com'],
                  ['House Stock Watcher', 'https://housestockwatcher.com'],
                  ['CourtListener', 'https://courtlistener.com'],
                  ['OpenSecrets', 'https://opensecrets.org'],
                ].map(([label, href]) => (
                  <li key={href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-amber-400 transition-colors"
                    >
                      {label} ->
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-cond text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#64748b' }}>
                About
              </h3>
              <ul className="space-y-1 text-sm" style={{ color: '#64748b' }}>
                <li><Link href="/methodology" className="hover:text-amber-400 transition-colors">Methodology & Scoring</Link></li>
                <li><a href="https://github.com/votewatch/votewatch" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">Open Source on GitHub -></a></li>
                <li><span>Data updated: {new Date().getFullYear()}</span></li>
              </ul>
            </div>
          </div>

          <div className="max-w-5xl mx-auto mt-8 pt-8 border-t text-xs text-center" style={{ borderColor: '#252a3a', color: '#64748b' }}>
            WatchGov is an independent, nonpartisan project. A high Transparency Risk Score does not constitute proof of illegal activity.
            All data is sourced from public government disclosures.
          </div>
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-cond text-[13px] font-bold tracking-widest uppercase px-4 py-2 rounded transition-colors"
      style={{ color: '#64748b' }}
    >
      {children}
    </Link>
  );
}
