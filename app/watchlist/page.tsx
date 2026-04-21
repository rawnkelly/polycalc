'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_NAV_LINKS, PolycoreShell } from '@/components/polycore-shell';
import { fetchMarketsByTickers } from '@/lib/market-client';
import { formatCents, formatCompactNumber, statusTone, type Market } from '@/lib/markets';
import {
  WATCHLIST_ACTIVE_ID_KEY,
  WATCHLIST_STORAGE_KEY,
  createDefaultWatchlists,
  normalizeWatchlist,
  parseTickersText,
  parseWatchlistImport,
  serializeWatchlist,
  stringifyTickers,
  type SavedWatchlist,
} from '@/lib/watchlists';

type StatusFilter = 'all' | 'open' | 'paused' | 'closed' | 'settled' | 'unknown';
type SortMode = 'close' | 'spread' | 'last' | 'volume' | 'ticker';

function calculatorHref(market: Market, fairYes: string, bankroll: string) {
  const params = new URLSearchParams({
    fairYesProbability: fairYes,
    bankroll,
    feeMode: 'kalshi',
    sizingMode: 'quarter-kelly',
    yesBid: String(market.yesBidCents ?? ''),
    yesAsk: String(market.yesAskCents ?? ''),
    noBid: String(market.noBidCents ?? ''),
    noAsk: String(market.noAskCents ?? ''),
  });
  return `/calculator?${params.toString()}`;
}

function buildDraftFromWatchlist(watchlist: SavedWatchlist) {
  return {
    activeId: watchlist.id,
    name: watchlist.name,
    tickersText: stringifyTickers(watchlist.tickers),
    fairYes: watchlist.fairYesDefault,
    bankroll: watchlist.bankrollDefault,
    refreshSeconds: watchlist.refreshSeconds,
  };
}

export default function WatchlistPage() {
  const [saved, setSaved] = useState<SavedWatchlist[]>(createDefaultWatchlists());
  const [activeId, setActiveId] = useState('macro-sample');
  const [name, setName] = useState('Macro sample');
  const [tickersText, setTickersText] = useState('');
  const [fairYes, setFairYes] = useState('50');
  const [bankroll, setBankroll] = useState('1000');
  const [refreshSeconds, setRefreshSeconds] = useState(15);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('close');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [isDemo, setIsDemo] = useState(true);
  const [error, setError] = useState('');
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const stored = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const storedActiveId = window.localStorage.getItem(WATCHLIST_ACTIVE_ID_KEY);

    if (!stored) {
      const initial = createDefaultWatchlists();
      const first = initial[0];
      setSaved(initial);
      setActiveId(first.id);
      const draft = buildDraftFromWatchlist(first);
      setName(draft.name);
      setTickersText(draft.tickersText);
      setFairYes(draft.fairYes);
      setBankroll(draft.bankroll);
      setRefreshSeconds(draft.refreshSeconds);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as unknown[];
      const nextSaved = Array.isArray(parsed) && parsed.length > 0 ? parsed.map(normalizeWatchlist) : createDefaultWatchlists();
      setSaved(nextSaved);
      const first = nextSaved.find((item) => item.id === storedActiveId) ?? nextSaved[0];
      setActiveId(first.id);
      const draft = buildDraftFromWatchlist(first);
      setName(draft.name);
      setTickersText(draft.tickersText);
      setFairYes(draft.fairYes);
      setBankroll(draft.bankroll);
      setRefreshSeconds(draft.refreshSeconds);
    } catch {
      const fallback = createDefaultWatchlists();
      const first = fallback[0];
      setSaved(fallback);
      setActiveId(first.id);
      const draft = buildDraftFromWatchlist(first);
      setName(draft.name);
      setTickersText(draft.tickersText);
      setFairYes(draft.fairYes);
      setBankroll(draft.bankroll);
      setRefreshSeconds(draft.refreshSeconds);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_ACTIVE_ID_KEY, activeId);
  }, [activeId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchMarketsByTickers(parseTickersText(tickersText));
      if (cancelled) return;
      setMarkets(result.markets);
      setIsDemo(result.isDemo);
      setError(result.error);
    }

    load();

    const timer = window.setInterval(load, Math.max(5, refreshSeconds) * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tickersText, refreshSeconds]);

  const filteredMarkets = useMemo(() => {
    let next = markets.filter((market) => {
      const matchesSearch = market.title.toLowerCase().includes(search.toLowerCase()) || market.ticker.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' ? true : market.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    next = [...next].sort((left, right) => {
      if (sortMode === 'spread') return (right.yesSpreadCents ?? -1) - (left.yesSpreadCents ?? -1);
      if (sortMode === 'last') return (right.lastPriceCents ?? -1) - (left.lastPriceCents ?? -1);
      if (sortMode === 'volume') return (right.volume24h ?? -1) - (left.volume24h ?? -1);
      if (sortMode === 'ticker') return left.ticker.localeCompare(right.ticker);
      return new Date(left.closeTime ?? 0).getTime() - new Date(right.closeTime ?? 0).getTime();
    });

    return next;
  }, [markets, search, sortMode, statusFilter]);

  useEffect(() => {
    if (filteredMarkets.length === 0) {
      setSelectedTicker('');
      return;
    }

    if (!filteredMarkets.some((market) => market.ticker === selectedTicker)) {
      setSelectedTicker(filteredMarkets[0].ticker);
    }
  }, [filteredMarkets, selectedTicker]);

  const selectedMarket = filteredMarkets.find((market) => market.ticker === selectedTicker) ?? filteredMarkets[0] ?? null;
  const parsedTickers = parseTickersText(tickersText);
  const totalVolume = filteredMarkets.reduce((sum, market) => sum + (market.volume24h ?? 0), 0);

  function loadSavedWatchlist(item: SavedWatchlist) {
    setActiveId(item.id);
    const draft = buildDraftFromWatchlist(item);
    setName(draft.name);
    setTickersText(draft.tickersText);
    setFairYes(draft.fairYes);
    setBankroll(draft.bankroll);
    setRefreshSeconds(draft.refreshSeconds);
    setError('');
  }

  function currentDraft(): SavedWatchlist {
    return normalizeWatchlist({
      id: activeId || `watchlist-${Date.now()}`,
      name,
      tickers: parsedTickers,
      fairYesDefault: fairYes,
      bankrollDefault: bankroll,
      refreshSeconds,
    });
  }

  function saveCurrentWatchlist() {
    const next = currentDraft();
    setSaved((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...current];
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
    setActiveId(next.id);
  }

  function createNewWatchlist() {
    setActiveId(`watchlist-${Date.now()}`);
    setName('New watchlist');
    setTickersText('');
    setFairYes('50');
    setBankroll('1000');
    setRefreshSeconds(15);
    setImportText('');
    setError('');
  }

  function duplicateWatchlist() {
    const next = normalizeWatchlist({
      ...currentDraft(),
      id: `watchlist-${Date.now()}`,
      name: `${name} copy`,
    });
    setSaved((current) => [next, ...current]);
    loadSavedWatchlist(next);
  }

  function deleteCurrentWatchlist() {
    if (saved.length <= 1) return;
    const remaining = saved.filter((item) => item.id !== activeId);
    setSaved(remaining);
    loadSavedWatchlist(remaining[0]);
  }

  async function copyCurrentJson() {
    await navigator.clipboard.writeText(serializeWatchlist(currentDraft()));
    setCopied('Copied watchlist JSON');
    window.setTimeout(() => setCopied(''), 1200);
  }

  function importWatchlist() {
    try {
      const next = parseWatchlistImport(importText);
      setSaved((current) => {
        const index = current.findIndex((item) => item.id === next.id);
        if (index === -1) return [next, ...current];
        const copy = [...current];
        copy[index] = next;
        return copy;
      });
      loadSavedWatchlist(next);
      setError('');
    } catch {
      setError('Import JSON is invalid.');
    }
  }

  function removeTickerFromDraft(ticker: string) {
    const next = parsedTickers.filter((item) => item !== ticker);
    setTickersText(stringifyTickers(next));
  }

  return (
    <main className="page-shell">
      <PolycoreShell
        title="PolyCore / Watchlist"
        subtitle="Track the markets you chose"
        footerTitle="Watchlist module inside the PolyCore toolkit by Lurk."
        footerCopy="Saved watchlists, live rows, selected-market detail, JSON import/export, and calculator launch without backend sludge."
        navLinks={DEFAULT_NAV_LINKS}
      >
        <header className="hero panel-surface">
          <div className="hero-copy-wrap">
            <p className="eyebrow">Watchlist module</p>
            <h1>Saved lists, live rows, local workflow handoff.</h1>
            <p className="hero-copy">
              Save named lists locally, import/export JSON cleanly, keep a selected market pinned, and send any row straight into the calculator.
            </p>
            <div className="hero-actions">
              <button className="secondary-button" type="button" onClick={createNewWatchlist}>New list</button>
              <button className="secondary-button" type="button" onClick={duplicateWatchlist}>Duplicate</button>
              <button className="secondary-button" type="button" onClick={copyCurrentJson}>{copied || 'Copy JSON'}</button>
            </div>
          </div>
          <div className="hero-rail">
            <div className="info-chip"><span>Feed</span><strong>{isDemo ? 'Sample board' : 'Live board'}</strong></div>
            <div className="info-chip"><span>Saved lists</span><strong>{saved.length}</strong></div>
            <div className="info-chip"><span>Tracked tickers</span><strong>{parsedTickers.length}</strong></div>
            <div className="info-chip"><span>Visible volume</span><strong>{formatCompactNumber(totalVolume)}</strong></div>
          </div>
        </header>

        {error ? <div className="error-box"><p>{error}</p></div> : null}

        <section className="controls-layout controls-layout-watchlist">
          <section className="section-frame panel-surface">
            <div className="section-head">
              <div>
                <p className="eyebrow">Watchlist manager</p>
                <h2>Saved list controls</h2>
                <p className="section-copy">Edit the active list, save it locally, and keep the import/export format simple.</p>
              </div>
              <div className="section-actions">
                <button className="secondary-button" type="button" onClick={saveCurrentWatchlist}>Save list</button>
                <button className="secondary-button" type="button" onClick={deleteCurrentWatchlist} disabled={saved.length <= 1}>Delete</button>
              </div>
            </div>

            <div className="control-grid control-grid-2">
              <label className="field"><span>List name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label className="field"><span>Refresh (seconds)</span><input value={String(refreshSeconds)} onChange={(event) => setRefreshSeconds(Math.max(5, Number(event.target.value) || 5))} /></label>
              <label className="field field-span-2"><span>Tickers</span><textarea className="textarea" value={tickersText} onChange={(event) => setTickersText(event.target.value)} placeholder="DEMO-GDP-2026, DEMO-CPI-2026" /></label>
              <label className="field"><span>Default fair YES (%)</span><input value={fairYes} onChange={(event) => setFairYes(event.target.value)} /></label>
              <label className="field"><span>Default bankroll ($)</span><input value={bankroll} onChange={(event) => setBankroll(event.target.value)} /></label>
              <label className="field field-span-2"><span>Import JSON</span><textarea className="textarea" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='{"name":"Macro","tickers":["DEMO-GDP-2026"]}' /></label>
            </div>

            <div className="hero-actions">
              <button className="secondary-button" type="button" onClick={importWatchlist}>Import list</button>
            </div>

            <div className="saved-watchlists">
              {saved.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`saved-watchlist ${item.id === activeId ? 'is-active' : ''}`}
                  onClick={() => loadSavedWatchlist(item)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.tickers.length} tickers</span>
                </button>
              ))}
            </div>
          </section>

          <section className="section-frame panel-surface">
            <div className="section-head">
              <div>
                <p className="eyebrow">Board controls</p>
                <h2>Filter and sort</h2>
              </div>
            </div>
            <div className="control-grid control-grid-2">
              <label className="field"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <label className="field">
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="paused">Paused</option>
                  <option value="closed">Closed</option>
                  <option value="settled">Settled</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label className="field field-span-2">
                <span>Sort</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="close">Soonest close</option>
                  <option value="spread">Widest spread</option>
                  <option value="last">Highest last price</option>
                  <option value="volume">Highest volume</option>
                  <option value="ticker">Ticker</option>
                </select>
              </label>
            </div>

            <div className="metrics-grid">
              <div className="metric-row"><span>Mode</span><strong>{isDemo ? 'Sample board' : 'Live board'}</strong></div>
              <div className="metric-row"><span>Visible rows</span><strong>{filteredMarkets.length}</strong></div>
              <div className="metric-row"><span>Tracked tickers</span><strong>{parsedTickers.length}</strong></div>
              <div className="metric-row"><span>Total visible volume</span><strong>{formatCompactNumber(totalVolume)}</strong></div>
            </div>
          </section>
        </section>

        <section className="controls-layout controls-layout-watchlist">
          <section className="section-frame panel-surface">
            <div className="section-head">
              <div>
                <p className="eyebrow">Live rows</p>
                <h2>Tracked markets</h2>
              </div>
            </div>
            <div className="table-wrap market-table-wrap">
              <table className="data-table market-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>YES ask</th>
                    <th>NO ask</th>
                    <th>Spread</th>
                    <th>Last</th>
                    <th>Close</th>
                    <th>Volume</th>
                    <th>Calc</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMarkets.map((market) => (
                    <tr key={market.ticker} className={selectedTicker === market.ticker ? 'table-row-selected' : ''} onClick={() => setSelectedTicker(market.ticker)}>
                      <td className="ticker-cell">{market.ticker}</td>
                      <td className="title-cell"><strong>{market.title}</strong><span>{market.timeToCloseLabel}</span></td>
                      <td><span className={`status-pill status-${statusTone(market.status)}`}>{market.status}</span></td>
                      <td>{formatCents(market.yesAskCents)}</td>
                      <td>{formatCents(market.noAskCents)}</td>
                      <td>{formatCents(market.yesSpreadCents)}</td>
                      <td>{formatCents(market.lastPriceCents)}</td>
                      <td>{market.closeTimeLabel}</td>
                      <td>{formatCompactNumber(market.volume24h)}</td>
                      <td><Link className="table-link" href={calculatorHref(market, fairYes, bankroll)}>Price it</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section-frame panel-surface">
            <div className="section-head">
              <div>
                <p className="eyebrow">Selected market</p>
                <h2>{selectedMarket?.ticker ?? 'No market selected'}</h2>
              </div>
              {selectedMarket ? <Link className="primary-button" href={calculatorHref(selectedMarket, fairYes, bankroll)}>Open in calculator</Link> : null}
            </div>

            {selectedMarket ? (
              <>
                <div className="metrics-grid">
                  <div className="metric-row"><span>Title</span><strong>{selectedMarket.title}</strong></div>
                  <div className="metric-row"><span>Status</span><strong>{selectedMarket.status}</strong></div>
                  <div className="metric-row"><span>YES bid / ask</span><strong>{formatCents(selectedMarket.yesBidCents)} / {formatCents(selectedMarket.yesAskCents)}</strong></div>
                  <div className="metric-row"><span>NO bid / ask</span><strong>{formatCents(selectedMarket.noBidCents)} / {formatCents(selectedMarket.noAskCents)}</strong></div>
                  <div className="metric-row"><span>Spread / last</span><strong>{formatCents(selectedMarket.yesSpreadCents)} / {formatCents(selectedMarket.lastPriceCents)}</strong></div>
                  <div className="metric-row"><span>Close / countdown</span><strong>{selectedMarket.closeTimeLabel} / {selectedMarket.timeToCloseLabel}</strong></div>
                  <div className="metric-row"><span>24h volume</span><strong>{formatCompactNumber(selectedMarket.volume24h)}</strong></div>
                </div>
                <div className="hero-actions action-row-spaced">
                  <button className="secondary-button" type="button" onClick={() => removeTickerFromDraft(selectedMarket.ticker)}>Remove from draft</button>
                </div>
              </>
            ) : <div className="empty-state">Add tickers or adjust filters to select a market.</div>}
          </section>
        </section>
      </PolycoreShell>
    </main>
  );
}
