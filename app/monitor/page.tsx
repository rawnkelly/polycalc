'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_NAV_LINKS, PolycoreShell } from '@/components/polycore-shell';
import { fetchMarketsByTickers } from '@/lib/market-client';
import { formatCents, formatCompactNumber, statusTone, type Market } from '@/lib/markets';
import { parseTickersText, stringifyTickers } from '@/lib/watchlists';

type HistoryMap = Record<string, number[]>;
type LogEntry = { id: number; level: 'INFO' | 'WARN'; message: string; timestamp: string };
type SortMode = 'ticker' | 'close' | 'spread' | 'last' | 'volume';

type MonitorSettings = {
  tickersText: string;
  refreshSeconds: number;
  density: 'comfortable' | 'compact';
  sortMode: SortMode;
  isPaused: boolean;
};

const SETTINGS_KEY = 'polycore.monitor.settings.v2';

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return <div className="sparkline-empty" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${24 - ((value - min) / range) * 24}`)
    .join(' ');
  return (
    <svg className="sparkline" viewBox="0 0 100 24" preserveAspectRatio="none">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  );
}

function calculatorHref(market: Market) {
  const params = new URLSearchParams({
    fairYesProbability: '50',
    bankroll: '1000',
    feeMode: 'kalshi',
    sizingMode: 'quarter-kelly',
    yesBid: String(market.yesBidCents ?? ''),
    yesAsk: String(market.yesAskCents ?? ''),
    noBid: String(market.noBidCents ?? ''),
    noAsk: String(market.noAskCents ?? ''),
  });
  return `/calculator?${params.toString()}`;
}

function sortMarkets(markets: Market[], sortMode: SortMode): Market[] {
  return [...markets].sort((left, right) => {
    if (sortMode === 'ticker') return left.ticker.localeCompare(right.ticker);
    if (sortMode === 'spread') return (right.yesSpreadCents ?? -1) - (left.yesSpreadCents ?? -1);
    if (sortMode === 'last') return (right.lastPriceCents ?? -1) - (left.lastPriceCents ?? -1);
    if (sortMode === 'volume') return (right.volume24h ?? -1) - (left.volume24h ?? -1);
    return new Date(left.closeTime ?? 0).getTime() - new Date(right.closeTime ?? 0).getTime();
  });
}

function makeLog(level: LogEntry['level'], message: string): LogEntry {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    level,
    message,
    timestamp: new Date().toLocaleTimeString(),
  };
}

export default function MonitorPage() {
  const [settings, setSettings] = useState<MonitorSettings>({
    tickersText: '',
    refreshSeconds: 8,
    density: 'compact',
    sortMode: 'close',
    isPaused: false,
  });
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [history, setHistory] = useState<HistoryMap>({});
  const [logs, setLogs] = useState<LogEntry[]>([makeLog('INFO', 'PolyCore monitor ready.')]);
  const [latencyMs, setLatencyMs] = useState(0);
  const [isDemo, setIsDemo] = useState(true);
  const [error, setError] = useState('');
  const previousMarketsRef = useRef<Record<string, Market>>({});

  useEffect(() => {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      setSettings((current) => ({
        ...current,
        tickersText: stringifyTickers(['DEMO-GDP-2026', 'DEMO-CPI-2026', 'DEMO-RATE-2026']),
      }));
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<MonitorSettings>;
      setSettings({
        tickersText: typeof parsed.tickersText === 'string' ? parsed.tickersText : stringifyTickers(['DEMO-GDP-2026', 'DEMO-CPI-2026', 'DEMO-RATE-2026']),
        refreshSeconds: Math.max(5, Number(parsed.refreshSeconds) || 8),
        density: parsed.density === 'comfortable' ? 'comfortable' : 'compact',
        sortMode: ['ticker', 'close', 'spread', 'last', 'volume'].includes(String(parsed.sortMode)) ? (parsed.sortMode as SortMode) : 'close',
        isPaused: parsed.isPaused === true,
      });
    } catch {
      setSettings((current) => ({
        ...current,
        tickersText: stringifyTickers(['DEMO-GDP-2026', 'DEMO-CPI-2026', 'DEMO-RATE-2026']),
      }));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchMarketsByTickers(parseTickersText(settings.tickersText));
      if (cancelled) return;

      setLatencyMs(result.durationMs);
      setMarkets(result.markets);
      setIsDemo(result.isDemo);
      setError(result.error);

      setHistory((current) => {
        const next = { ...current };
        for (const market of result.markets) {
          const point = market.lastPriceCents ?? market.midpointCents ?? 0;
          next[market.ticker] = [...(next[market.ticker] ?? []).slice(-11), point];
        }
        return next;
      });

      const previousMarkets = previousMarketsRef.current;
      const nextLogs: LogEntry[] = [];

      if (result.error) {
        nextLogs.push(makeLog('WARN', `Live request failed. Falling back to sample board: ${result.error}`));
      }

      for (const market of result.markets) {
        const previous = previousMarkets[market.ticker];
        if (!previous) continue;
        if (previous.status !== market.status) {
          nextLogs.push(makeLog('WARN', `${market.ticker} status changed ${previous.status} -> ${market.status}.`));
        }
        if (previous.lastPriceCents !== market.lastPriceCents && market.lastPriceCents !== null) {
          nextLogs.push(makeLog('INFO', `${market.ticker} last moved to ${formatCents(market.lastPriceCents)}.`));
        }
        if (previous.yesSpreadCents !== market.yesSpreadCents && market.yesSpreadCents !== null) {
          nextLogs.push(makeLog('INFO', `${market.ticker} spread is now ${formatCents(market.yesSpreadCents)}.`));
        }
      }

      previousMarketsRef.current = Object.fromEntries(result.markets.map((market) => [market.ticker, market]));

      if (nextLogs.length > 0) {
        setLogs((current) => [...nextLogs, ...current].slice(0, 24));
      } else {
        setLogs((current) => [makeLog('INFO', `Board refreshed with ${result.markets.length} rows.`), ...current].slice(0, 24));
      }
    }

    if (!settings.isPaused) {
      load();
    }

    const timer = window.setInterval(() => {
      if (!settings.isPaused) {
        void load();
      }
    }, Math.max(5, settings.refreshSeconds) * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [settings]);

  const sortedMarkets = useMemo(() => sortMarkets(markets, settings.sortMode), [markets, settings.sortMode]);

  useEffect(() => {
    if (sortedMarkets.length === 0) {
      setSelectedTicker('');
      return;
    }

    if (!sortedMarkets.some((market) => market.ticker === selectedTicker)) {
      setSelectedTicker(sortedMarkets[0].ticker);
    }
  }, [selectedTicker, sortedMarkets]);

  const selected = sortedMarkets.find((market) => market.ticker === selectedTicker) ?? sortedMarkets[0] ?? null;
  const openCount = useMemo(() => markets.filter((market) => market.status === 'open').length, [markets]);
  const widest = useMemo(() => sortMarkets(markets, 'spread')[0] ?? null, [markets]);
  const soonest = useMemo(() => sortMarkets(markets, 'close')[0] ?? null, [markets]);

  return (
    <main className="page-shell page-shell-monitor">
      <PolycoreShell
        title="PolyCore / Monitor"
        subtitle="Live board for tracked markets"
        footerTitle="Monitor module inside PolyCore, the open utility layer by Lurk."
        footerCopy="Live board, selected-market detail, event logs, and calculator launch for markets you already track."
        navLinks={DEFAULT_NAV_LINKS}
      >
        <section className="monitor-hud panel-surface">
          <div className="monitor-hud-main">
            <div>
              <p className="eyebrow">Monitor mode</p>
              <h1>Stay in the tape without sacrificing clarity.</h1>
              <p className="hero-copy">
                Sort the board the way you care about it, pause refresh when you want stability, and keep a selected market pinned while the board keeps moving.
              </p>
            </div>
            <div className="monitor-hud-actions">
              <label className="field field-span-2"><span>Tickers</span><textarea className="textarea textarea-compact" value={settings.tickersText} onChange={(event) => setSettings((current) => ({ ...current, tickersText: event.target.value }))} /></label>
              <label className="field"><span>Refresh (seconds)</span><input value={String(settings.refreshSeconds)} onChange={(event) => setSettings((current) => ({ ...current, refreshSeconds: Math.max(5, Number(event.target.value) || 5) }))} /></label>
              <label className="field"><span>Density</span><select value={settings.density} onChange={(event) => setSettings((current) => ({ ...current, density: event.target.value as MonitorSettings['density'] }))}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
              <label className="field"><span>Sort</span><select value={settings.sortMode} onChange={(event) => setSettings((current) => ({ ...current, sortMode: event.target.value as SortMode }))}><option value="close">Soonest close</option><option value="spread">Widest spread</option><option value="last">Highest last</option><option value="volume">Highest volume</option><option value="ticker">Ticker</option></select></label>
              <button className="secondary-button monitor-toggle" type="button" onClick={() => setSettings((current) => ({ ...current, isPaused: !current.isPaused }))}>{settings.isPaused ? 'Resume' : 'Pause'} live</button>
            </div>
          </div>
          <div className="monitor-stat-grid">
            <div className="info-chip"><span>Feed</span><strong>{isDemo ? 'Sample board' : 'Live board'}</strong></div>
            <div className="info-chip"><span>Refresh</span><strong>{settings.isPaused ? 'Paused' : `${settings.refreshSeconds}s`}</strong></div>
            <div className="info-chip"><span>Latency</span><strong>{latencyMs ? `${latencyMs}ms` : '--'}</strong></div>
            <div className="info-chip"><span>Open markets</span><strong>{openCount}</strong></div>
            <div className="info-chip"><span>Widest spread</span><strong>{widest ? `${widest.ticker} ${formatCents(widest.yesSpreadCents)}` : '--'}</strong></div>
            <div className="info-chip"><span>Soonest close</span><strong>{soonest ? `${soonest.ticker} ${soonest.timeToCloseLabel}` : '--'}</strong></div>
          </div>
        </section>

        {error ? <div className="error-box"><p>{error}</p></div> : null}

        <section className="monitor-grid">
          <section className="monitor-board panel-surface">
            <div className="section-head compact-head"><div><p className="eyebrow">Board</p><h2>Compact live rows</h2></div></div>
            <div className={`monitor-rows ${settings.density === 'compact' ? 'is-compact' : ''}`}>
              {sortedMarkets.map((market) => (
                <button key={market.ticker} type="button" className={`monitor-row ${selected?.ticker === market.ticker ? 'is-selected' : ''}`} onClick={() => setSelectedTicker(market.ticker)}>
                  <div className="monitor-row-main">
                    <div>
                      <div className="monitor-ticker">{market.ticker}</div>
                      <div className="monitor-title">{market.title}</div>
                    </div>
                    <span className={`status-pill status-${statusTone(market.status)}`}>{market.status}</span>
                  </div>
                  <div className="monitor-row-metrics">
                    <span>YES {formatCents(market.yesAskCents)}</span>
                    <span>NO {formatCents(market.noAskCents)}</span>
                    <span>Spread {formatCents(market.yesSpreadCents)}</span>
                    <span>Vol {formatCompactNumber(market.volume24h)}</span>
                    <span>{market.timeToCloseLabel}</span>
                  </div>
                  <div className="monitor-row-spark"><Sparkline values={history[market.ticker] ?? []} /></div>
                </button>
              ))}
            </div>
          </section>

          <section className="monitor-detail-stack">
            <section className="monitor-detail-card panel-surface">
              <div className="section-head compact-head">
                <div><p className="eyebrow">Selected</p><h2>{selected?.ticker ?? 'No market selected'}</h2></div>
                {selected ? <Link className="primary-button" href={calculatorHref(selected)}>Open in calculator</Link> : null}
              </div>
              {selected ? (
                <div className="metrics-grid">
                  <div className="metric-row"><span>Title</span><strong>{selected.title}</strong></div>
                  <div className="metric-row"><span>YES bid / ask</span><strong>{formatCents(selected.yesBidCents)} / {formatCents(selected.yesAskCents)}</strong></div>
                  <div className="metric-row"><span>NO bid / ask</span><strong>{formatCents(selected.noBidCents)} / {formatCents(selected.noAskCents)}</strong></div>
                  <div className="metric-row"><span>Midpoint / last</span><strong>{formatCents(selected.midpointCents, 1)} / {formatCents(selected.lastPriceCents)}</strong></div>
                  <div className="metric-row"><span>Close / countdown</span><strong>{selected.closeTimeLabel} / {selected.timeToCloseLabel}</strong></div>
                  <div className="metric-row"><span>24h volume</span><strong>{formatCompactNumber(selected.volume24h)}</strong></div>
                </div>
              ) : <div className="empty-state">Load a board and select a market.</div>}
            </section>

            <section className="monitor-detail-card panel-surface">
              <div className="section-head compact-head"><div><p className="eyebrow">Feed log</p><h2>Recent board events</h2></div></div>
              <div className="log-list">
                {logs.map((log) => (
                  <div key={log.id} className="log-row">
                    <span className={`log-level log-${log.level.toLowerCase()}`}>{log.level}</span>
                    <span className="log-time">{log.timestamp}</span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))}
              </div>
            </section>
          </section>
        </section>
      </PolycoreShell>
    </main>
  );
}
