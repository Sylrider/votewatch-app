'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';
import { fmtMoney, partyColor, partyShort, riskLabel } from '@/lib/utils';

const PAGE_SIZE = 24;

const CHAMBERS = [
  { id: 'all',       label: 'All Officials' },
  { id: 'Executive', label: 'Executive' },
  { id: 'Senate',    label: 'U.S. Senate' },
  { id: 'House',     label: 'U.S. House' },
  { id: 'Governor',  label: 'Governors' },
  { id: 'Mayor',     label: 'Mayors' },
];

export default function PoliticianGrid({ politicians }: { politicians: Politician[] }) {
  const [search,   setSearch]   = useState('');
  const [chamber,  setChamber]  = useState('all');
  const [party,    setParty]    = useState('all');
  const [sortBy,   setSortBy]   = useState('score');
  const [visible,  setVisible]  = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    return politicians
      .filter(p => {
        const q = search.toLowerCase();
        if (q && !p.name.toLowerCase().includes(q) && !p.state.toLowerCase().includes(q)) return false;
        if (chamber !== 'all' && p.chamber !== chamber) return false;
        if (party === 'R' && !p.party.startsWith('Republican')) return false;
        if (party === 'D' && !p.party.startsWith('Democrat'))   return false;
        if (party === 'I' && !p.party.startsWith('Independent') && !p.party.includes('(now Independent)')) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score') return (b.score?.total || 0) - (a.score?.total || 0);
        if (sortBy === 'money') return (b.score?.totalMoney || 0) - (a.score?.totalMoney || 0);
        if (sortBy === 'legal') return (b.lawsuits?.length || 0) - (a.lawsuits?.length || 0);
        if (sortBy === 'state') return a.state.localeCompare(b.state);
        return a.name.localeCompare(b.name);
      });
  }, [politicians, search, chamber, party, sortBy]);

  const shown = filtered.slice(0, visible);

  return (
    <>
      {/* Category tabs */}
      <nav
        className="flex overflow-x-auto border-b"
        style={{ background: '#ffffff', borderColor: '#e6eaed' }}
        aria-label="Filter by office type"
      >
        {CHAMBERS.map(c => (
          <button
            key={c.id}
            onClick={() => { setChamber(c.id); setVisible(PAGE_SIZE); }}
            aria-pressed={chamber === c.id}
            className="font-cond text-xs font-bold tracking-widest uppercase px-4 py-3 whitespace-nowrap border-b-2 transition-colors"
            style={{
              color: chamber === c.id ? '#0d9488' : '#8493a3',
              borderColor: chamber === c.id ? '#0d9488' : 'transparent',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${chamber === c.id ? '#0d9488' : 'transparent'}`,
              cursor: 'pointer',
            }}
          >
            {c.label}
            <span className="ml-1 text-[10px]" style={{ color: '#8493a3' }}>
              ({c.id === 'all' ? politicians.length : politicians.filter(p => p.chamber === c.id).length})
            </span>
          </button>
        ))}
      </nav>

      {/* Search + filters */}
      <div
        className="flex flex-wrap gap-2 px-6 py-3 border-b"
        style={{ background: '#f6f8f9', borderColor: '#e6eaed' }}
        role="search"
      >
        <input
          type="search"
          placeholder="Search name or state..."
          value={search}
          onChange={e => { setSearch(e.target.value); setVisible(PAGE_SIZE); }}
          aria-label="Search politicians"
          style={{
            background: '#ffffff', border: '1px solid #e6eaed', borderRadius: 6,
            padding: '8px 14px', color: '#0f1b2d', fontFamily: 'Barlow, sans-serif',
            fontSize: 14, width: 220, outline: 'none',
          }}
        />
        <Select value={party}   onChange={v => { setParty(v);  setVisible(PAGE_SIZE); }} label="All Parties"
          options={[['all','All Parties'],['R','Republican'],['D','Democrat'],['I','Independent']]} />
        <Select value={sortBy}  onChange={v => setSortBy(v)}  label="Sort"
          options={[['score','Sort: Risk Score'],['money','Sort: Lobby Money'],['legal','Sort: Legal Actions'],['state','Sort: State A-Z'],['name','Sort: Name A-Z']]} />
        <span className="ml-auto text-xs self-center" style={{ color: '#8493a3' }} aria-live="polite">
          {filtered.length} officials
        </span>
      </div>

      {/* Grid */}
      <main
        className="grid gap-4 p-6"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
        aria-label="Politicians list"
      >
        {shown.map(p => <PoliticianCard key={p.id} p={p} />)}
      </main>

      {/* Load more */}
      {visible < filtered.length && (
        <div className="text-center pb-8">
          <button
            onClick={() => setVisible(v => v + PAGE_SIZE)}
            style={{
              background: '#ffffff', border: '1px solid #e6eaed', color: '#0f1b2d',
              fontFamily: 'Barlow Condensed, sans-serif', fontSize: 14, fontWeight: 700,
              letterSpacing: '1.5px', textTransform: 'uppercase', padding: '10px 32px',
              borderRadius: 6, cursor: 'pointer',
            }}
          >
            Load More - showing {Math.min(visible, filtered.length)} of {filtered.length}
          </button>
        </div>
      )}
    </>
  );
}

function Select({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: '#ffffff', border: '1px solid #e6eaed', borderRadius: 6,
        padding: '8px 12px', color: '#0f1b2d', fontFamily: 'Barlow, sans-serif',
        fontSize: 13, cursor: 'pointer', outline: 'none',
      }}
    >
      {options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
    </select>
  );
}

function PoliticianCard({ p }: { p: Politician }) {
  const score = p.score?.total || 0;
  const { label, color } = riskLabel(score);
  const pc = partyColor(p.party);
  const ps = partyShort(p.party);
  const initials = p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2);
  const totalMoney = p.score?.totalMoney || 0;
  const conflicts  = p.score?.conflictTrades || 0;
  const legal      = p.lawsuits?.length || 0;

  return (
    <Link href={`/politicians/${p.id}`} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      <article
        className="card"
        aria-label={`${p.name}, ${p.title}, Transparency Risk Score ${score}/100`}
        itemScope itemType="https://schema.org/Person"
      >
        {/* Party color bar */}
        <div style={{ height: 3, background: pc }} />

        <div style={{ padding: '16px 18px 14px' }}>
          {/* Name row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt={`Official portrait of ${p.name}`}
                  loading="lazy"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 15,
                  background: pc + '22', color: pc, border: '1px solid #e6eaed', flexShrink: 0,
                }} aria-hidden="true">{initials}</div>
              )}
              <div>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 19, fontWeight: 700, color: '#0f1b2d', lineHeight: 1.15 }} itemProp="name">
                  {p.name}
                </h2>
                <p style={{ fontSize: 11, color: '#8493a3', marginTop: 2 }}>{p.title} - {p.state} - since {p.since}</p>
              </div>
            </div>
            <span
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', padding: '3px 9px',
                borderRadius: 20, textTransform: 'uppercase', flexShrink: 0,
                background: pc + '22', color: pc, border: `1px solid ${pc}44` }}
            >{ps}</span>
          </div>

          {/* Score gauge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${color}`, flexShrink: 0,
            }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, lineHeight: 1, color }}>{score}</span>
              <span style={{ fontSize: 9, color: '#8493a3' }}>/100</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color }}>{label}</div>
              <div style={{ fontSize: 10, color: '#8493a3' }}>Transparency Risk Score</div>
              <div style={{ height: 3, background: '#f6f8f9', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 2 }} />
              </div>
            </div>
          </div>

          {/* Score breakdown mini bars */}
          {p.profileComplete && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', marginBottom: 12 }}>
              {[
                { label: 'Lobby $',    val: p.score?.lobbyScore || 0, max: 25, color: '#0d9488' },
                { label: 'Vote Align', val: p.score?.alignScore || 0, max: 35, color: '#0d9488' },
                { label: 'Stock',   val: p.score?.stockScore || 0, max: 25, color: '#0d9488' },
                { label: 'Legal',   val: p.score?.legalScore || 0, max: 15, color: '#0d9488' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: '#8493a3', width: 66, flexShrink: 0 }}>{item.label}</span>
                  <div style={{ flex: 1, height: 3, background: '#f6f8f9', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(item.val / item.max) * 100}%`, background: item.color, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, width: 20, textAlign: 'right', color: item.color }}>{item.val}</span>
                </div>
              ))}
            </div>
          )}

          {/* Donor chips */}
          {p.lobbyMoney?.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {p.lobbyMoney.slice(0, 4).map(l => (
                <span key={l.lobbyId} style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                  letterSpacing: '0.5px', textTransform: 'uppercase',
                  border: '1px solid #e6eaed', color: '#8493a3', background: '#f6f8f9',
                }}>{l.lobbyId.toUpperCase()}</span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 'auto',
          background: '#f6f8f9', borderTop: '1px solid #e6eaed',
          padding: '9px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#8493a3' }}>
              <strong style={{ color: '#0f1b2d' }}>{fmtMoney(totalMoney)}</strong> lobby
            </span>
            <span style={{ fontSize: 11, color: '#8493a3' }}>
              <strong style={{ color: conflicts > 0 ? '#e11d48' : '#0f1b2d' }}>{conflicts}</strong> stock
            </span>
            <span style={{ fontSize: 11, color: '#8493a3' }}>
              <strong style={{ color: legal > 0 ? '#e11d48' : '#0f1b2d' }}>{legal}</strong> legal
            </span>
          </div>
          <span style={{
            fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            letterSpacing: '1.2px', textTransform: 'uppercase', color: '#0d9488',
            padding: '4px 10px', border: '1px solid rgba(13,148,136,.3)', borderRadius: 4,
            background: 'rgba(13,148,136,.07)',
          }}>Profile -></span>
        </div>
      </article>
    </Link>
  );
}
