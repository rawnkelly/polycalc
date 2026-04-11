'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { SAMPLE_MARKETS, formatCents, formatCompactNumber, statusTone, type Market } from '@/lib/markets';

type SavedWatchlist = {
  id: string;
  name: string;
  tickers: string[];
  fairYesDefault: string;
  bankrollDefault: string;
  refreshSeconds: number;
};

const STORAGE_KEY = 'polycore.watchlists.v2';

function defaultLists(): SavedWatchlist[] {
  return [{ id: 'macro', name: 'Macro sample', tickers: SAMPLE_MARKETS.map((market) => market.ticker), fairYesDefault: '50', bankrollDefault: '1000', refreshSeconds: 15 }];
}
function calculatorHref(market: Market, fairYes: string, bankroll: string) {
  const params = new URLSearchParams({
    fairYesProbability: fairYes, bankroll, feeMode: 'kalshi', sizingMode: 'quarter-kelly',
    yesBid: String(market.yesBidCents ?? ''), yesAsk: String(market.yesAskCents ?? ''),
    noBid: String(market.noBidCents ?? ''), noAsk: String(market.noAskCents ?? ''),
  });
  return `/calculator?${params.toString()}`;
}

export default function WatchlistPage() {
  const nav = [{ href: '/', label: 'Overview' }, { href: '/calculator', label: 'Calculator' }, { href: '/watchlist', label: 'Watchlist' }, { href: '/monitor', label: 'Monitor' }, { href: 'https://github.com/Lurk-AI-INC/polycore', label: 'GitHub' }];
  const [saved, setSaved] = useState<SavedWatchlist[]>(defaultLists());
  const [activeId, setActiveId] = useState('macro');
  const [name, setName] = useState('Macro sample');
  const [tickersText, setTickersText] = useState(SAMPLE_MARKETS.map((market) => market.ticker).join(', '));
  const [fairYes, setFairYes] = useState('50');
  const [bankroll, setBankroll] = useState('1000');
  const [refreshSeconds, setRefreshSeconds] = useState(15);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'paused'>('all');
  const [sort, setSort] = useState<'close' | 'spread' | 'last'>('close');
  const [markets, setMarkets] = useState<Market[]>(SAMPLE_MARKETS);
  const [isDemo, setIsDemo] = useState(true);
  const [error, setError] = useState('');
  const [importText, setImportText] = useState('');

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedWatchlist[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setSaved(parsed);
        const first = parsed[0];
        setActiveId(first.id); setName(first.name); setTickersText(first.tickers.join(', '));
        setFairYes(first.fairYesDefault); setBankroll(first.bankrollDefault); setRefreshSeconds(first.refreshSeconds);
      }
    } catch {}
  }, []);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); }, [saved]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const tickers = tickersText.split(',').map((ticker) => ticker.trim()).filter(Boolean);
      if (tickers.length === 0) { setMarkets(SAMPLE_MARKETS); setIsDemo(true); setError(''); return; }
      try {
        const response = await fetch(`/api/kalshi/markets?tickers=${encodeURIComponent(tickers.join(','))}`, { cache: 'no-store' });
        const payload = await response.json() as { markets?: Market[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? 'Request failed');
        if (!cancelled) { setMarkets(Array.isArray(payload.markets) && payload.markets.length > 0 ? payload.markets : SAMPLE_MARKETS); setIsDemo(false); setError(''); }
      } catch (nextError) {
        if (!cancelled) { setError(nextError instanceof Error ? nextError.message : 'Unknown error'); setMarkets(SAMPLE_MARKETS); setIsDemo(true); }
      }
    }
    load();
    const timer = window.setInterval(load, refreshSeconds * 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [tickersText, refreshSeconds]);

  const filtered = useMemo(() => {
    let next = markets.filter((market) => market.title.toLowerCase().includes(search.toLowerCase()) || market.ticker.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all') next = next.filter((market) => market.status === statusFilter);
    if (sort === 'spread') next = [...next].sort((a, b) => (b.yesSpreadCents ?? -1) - (a.yesSpreadCents ?? -1));
    else if (sort === 'last') next = [...next].sort((a, b) => (b.lastPriceCents ?? -1) - (a.lastPriceCents ?? -1));
    else next = [...next].sort((a, b) => new Date(a.closeTime ?? 0).getTime() - new Date(b.closeTime ?? 0).getTime());
    return next;
  }, [markets, search, statusFilter, sort]);

  function saveCurrentWatchlist() {
    const next: SavedWatchlist = {
      id: activeId || String(Date.now()), name,
      tickers: tickersText.split(',').map((ticker) => ticker.trim()).filter(Boolean),
      fairYesDefault: fairYes, bankrollDefault: bankroll, refreshSeconds,
    };
    setSaved((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...current];
      const copy = [...current]; copy[index] = next; return copy;
    });
    setActiveId(next.id);
  }
  function loadSaved(item: SavedWatchlist) {
    setActiveId(item.id); setName(item.name); setTickersText(item.tickers.join(', ')); setFairYes(item.fairYesDefault); setBankroll(item.bankrollDefault); setRefreshSeconds(item.refreshSeconds);
  }
  function exportCurrent() {
    const payload = JSON.stringify({ id: activeId || String(Date.now()), name, tickers: tickersText.split(',').map((ticker) => ticker.trim()).filter(Boolean), fairYesDefault: fairYes, bankrollDefault: bankroll, refreshSeconds }, null, 2);
    navigator.clipboard.writeText(payload);
  }
  function importWatchlist() {
    try {
      const parsed = JSON.parse(importText) as SavedWatchlist;
      loadSaved(parsed);
    } catch { setError('Import JSON is invalid.'); }
  }

  const selected = filtered[0] ?? null;

  return (
    <main className="page-shell">
      <div className="page-frame">
        <div className="topbar panel-surface"><div className="brand-lockup"><div className="brand-mark">PC</div><div><p className="eyebrow">Open-source, local-first market toolkit by Lurk</p><div className="brand-line"><strong>PolyCore / Watchlist</strong><span>Track the markets you chose</span></div></div></div><div className="topbar-actions">{nav.map((link) => <Link key={link.href} className="secondary-button" href={link.href}>{link.label}</Link>)}</div></div>

        <header className="hero panel-surface">
          <div className="hero-copy-wrap"><p className="eyebrow">Watchlist module</p><h1>Saved lists, live rows, local workflow handoff.</h1><p className="hero-copy">Use named watchlists, import/export JSON, and jump any market straight into the calculator with quote fields already filled.</p></div>
          <div className="hero-rail"><div className="info-chip"><span>Mode</span><strong>{isDemo ? 'Sample board' : 'Live board'}</strong></div><div className="info-chip"><span>Refresh</span><strong>{refreshSeconds}s</strong></div><div className="info-chip"><span>Saved lists</span><strong>{saved.length}</strong></div><div className="info-chip"><span>Visible rows</span><strong>{filtered.length}</strong></div></div>
        </header>

        {error ? <div className="error-box"><p>{error}</p></div> : null}

        <section className="controls-layout controls-layout-watchlist">
          <section className="section-frame panel-surface">
            <div className="section-head"><div><p className="eyebrow">Watchlist V2</p><h2>Saved list manager</h2><p className="section-copy">Edit a list, save it locally, and import/export JSON without adding backend baggage.</p></div><div className="section-actions"><button className="secondary-button" type="button" onClick={saveCurrentWatchlist}>Save list</button><button className="secondary-button" type="button" onClick={exportCurrent}>Copy JSON</button></div></div>
            <div className="control-grid control-grid-2">
              <label className="field"><span>List name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field"><span>Refresh (seconds)</span><input value={String(refreshSeconds)} onChange={(e) => setRefreshSeconds(Math.max(5, Number(e.target.value) || 5))} /></label>
              <label className="field field-span-2"><span>Tickers</span><input value={tickersText} onChange={(e) => setTickersText(e.target.value)} /></label>
              <label className="field"><span>Default fair YES (%)</span><input value={fairYes} onChange={(e) => setFairYes(e.target.value)} /></label>
              <label className="field"><span>Default bankroll ($)</span><input value={bankroll} onChange={(e) => setBankroll(e.target.value)} /></label>
              <label className="field field-span-2"><span>Import JSON</span><textarea className="textarea" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"name":"Macro","tickers":["..."]}' /></label>
            </div>
            <div className="hero-actions"><button className="secondary-button" type="button" onClick={importWatchlist}>Import list</button></div>
            <div className="saved-watchlists">{saved.map((item) => <button key={item.id} type="button" className={`saved-watchlist ${item.id === activeId ? 'is-active' : ''}`} onClick={() => loadSaved(item)}><strong>{item.name}</strong><span>{item.tickers.length} tickers</span></button>)}</div>
          </section>

          <section className="section-frame panel-surface">
            <div className="section-head"><div><p className="eyebrow">View</p><h2>Filter and sort</h2></div></div>
            <div className="control-grid control-grid-2">
              <label className="field"><span>Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <label className="field"><span>Status</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'paused')}><option value="all">All</option><option value="open">Open</option><option value="paused">Paused</option></select></label>
              <label className="field"><span>Sort</span><select value={sort} onChange={(e) => setSort(e.target.value as 'close' | 'spread' | 'last')}><option value="close">Soonest close</option><option value="spread">Widest spread</option><option value="last">Highest last price</option></select></label>
            </div>
            {selected ? <div className="subpanel surface-soft"><div className="subpanel-header"><h3>Pinned market</h3></div><div className="metrics-grid"><div className="metric-row"><span>Ticker</span><strong>{selected.ticker}</strong></div><div className="metric-row"><span>YES bid / ask</span><strong>{formatCents(selected.yesBidCents)} / {formatCents(selected.yesAskCents)}</strong></div><div className="metric-row"><span>NO bid / ask</span><strong>{formatCents(selected.noBidCents)} / {formatCents(selected.noAskCents)}</strong></div><div className="metric-row"><span>Spread / close</span><strong>{formatCents(selected.yesSpreadCents)} / {selected.timeToCloseLabel}</strong></div></div><div className="hero-actions"><Link className="primary-button" href={calculatorHref(selected, fairYes, bankroll)}>Open in calculator</Link></div></div> : <div className="empty-state">No visible rows.</div>}
          </section>
        </section>

        <section className="section-frame panel-surface">
          <div className="section-head"><div><p className="eyebrow">Board</p><h2>Live watchlist</h2><p className="section-copy">{isDemo ? 'Showing sample rows.' : 'Live Kalshi rows loaded.'}</p></div></div>
          <div className="table-wrap market-table-wrap">
            <table className="data-table market-table">
              <thead><tr><th>Ticker</th><th>Title</th><th>Status</th><th>YES bid</th><th>YES ask</th><th>NO bid</th><th>NO ask</th><th>Spread</th><th>Last</th><th>Close</th><th>Time left</th><th>Vol 24h</th><th>Calc</th></tr></thead>
              <tbody>
                {filtered.map((market) => <tr key={market.ticker}><td className="ticker-cell">{market.ticker}</td><td className="title-cell"><strong>{market.title}</strong><span>Public market data</span></td><td><span className={`status-pill status-${statusTone(market.status)}`}>{market.status}</span></td><td>{formatCents(market.yesBidCents)}</td><td>{formatCents(market.yesAskCents)}</td><td>{formatCents(market.noBidCents)}</td><td>{formatCents(market.noAskCents)}</td><td>{formatCents(market.yesSpreadCents)}</td><td>{formatCents(market.lastPriceCents)}</td><td>{market.closeTimeLabel}</td><td>{market.timeToCloseLabel}</td><td>{formatCompactNumber(market.volume24h)}</td><td><Link className="table-link" href={calculatorHref(market, fairYes, bankroll)}>Price it</Link></td></tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
