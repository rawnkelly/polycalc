'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { evaluateQuotes, formatCurrency } from '@/lib/calculator';
import { SAMPLE_MARKETS, formatCents, formatCompactNumber, statusTone, type Market } from '@/lib/markets';

type RuleType =
  | 'yes-ask-lte'
  | 'no-ask-lte'
  | 'spread-lte'
  | 'spread-gte'
  | 'time-to-close-lte'
  | 'status-change'
  | 'yes-positive-ev'
  | 'no-positive-ev';

type Rule = {
  id: string;
  name: string;
  ticker: string;
  type: RuleType;
  threshold: string;
  fairYes: string;
  bankroll: string;
  feeMode: 'kalshi' | 'custom' | 'no-fee' | 'polymarket';
  customFeeCents: string;
  isEnabled: boolean;
};

type TriggerEvent = {
  id: string;
  ruleId: string;
  ruleName: string;
  ticker: string;
  message: string;
  triggeredAt: string;
  market: Market;
  fairYes: string;
  bankroll: string;
  feeMode: Rule['feeMode'];
};

const RULES_KEY = 'polycore.rules.v1';
const EVENTS_KEY = 'polycore.rule-events.v1';
const DEFAULT_RULE: Rule = {
  id: '',
  name: 'YES becomes positive EV',
  ticker: 'DEMO-GDP-2026',
  type: 'yes-positive-ev',
  threshold: '50',
  fairYes: '54',
  bankroll: '1000',
  feeMode: 'kalshi',
  customFeeCents: '1',
  isEnabled: true,
};

function calculatorHref(market: Market, fairYes: string, bankroll: string, feeMode: Rule['feeMode'], customFeeCents: string) {
  const params = new URLSearchParams({
    fairYesProbability: fairYes,
    bankroll,
    feeMode,
    customFeeCents,
    sizingMode: 'quarter-kelly',
    yesBid: String(market.yesBidCents ?? ''),
    yesAsk: String(market.yesAskCents ?? ''),
    noBid: String(market.noBidCents ?? ''),
    noAsk: String(market.noAskCents ?? ''),
    kellyCapPercent: '25',
  });
  return `/calculator?${params.toString()}`;
}

function evaluateRule(rule: Rule, market: Market, previousStatus: string | null) {
  const threshold = Number(rule.threshold) || 0;

  if (rule.type === 'yes-ask-lte') return market.yesAskCents !== null && market.yesAskCents <= threshold ? `YES ask ${formatCents(market.yesAskCents)} <= ${formatCents(threshold)}` : null;
  if (rule.type === 'no-ask-lte') return market.noAskCents !== null && market.noAskCents <= threshold ? `NO ask ${formatCents(market.noAskCents)} <= ${formatCents(threshold)}` : null;
  if (rule.type === 'spread-lte') return market.yesSpreadCents !== null && market.yesSpreadCents <= threshold ? `Spread ${formatCents(market.yesSpreadCents)} <= ${formatCents(threshold)}` : null;
  if (rule.type === 'spread-gte') return market.yesSpreadCents !== null && market.yesSpreadCents >= threshold ? `Spread ${formatCents(market.yesSpreadCents)} >= ${formatCents(threshold)}` : null;
  if (rule.type === 'time-to-close-lte') {
    if (!market.closeTime) return null;
    const diffMinutes = Math.floor((new Date(market.closeTime).getTime() - Date.now()) / 60000);
    return diffMinutes >= 0 && diffMinutes <= threshold ? `Time to close ${diffMinutes}m <= ${threshold}m` : null;
  }
  if (rule.type === 'status-change') return previousStatus !== null && previousStatus !== market.status ? `Status changed ${previousStatus} → ${market.status}` : null;

  const evaluated = evaluateQuotes({
    fairYesProbability: Number(rule.fairYes) || 50,
    bankroll: Number(rule.bankroll) || 1000,
    feeMode: rule.feeMode,
    customFeeCents: Number(rule.customFeeCents) || 0,
    sizingMode: 'quarter-kelly',
    fixedDollarSize: 100,
    fixedMaxLoss: 100,
    fixedBankrollRiskPercent: 2,
    kellyCapPercent: 25,
    yesBid: market.yesBidCents,
    yesAsk: market.yesAskCents,
    noBid: market.noBidCents,
    noAsk: market.noAskCents,
  });

  if (rule.type === 'yes-positive-ev') return evaluated.yes.price !== null && evaluated.yes.netEv > 0 ? `YES is positive EV at ${formatCents(evaluated.yes.price)} (${formatCents(evaluated.yes.netEv)})` : null;
  if (rule.type === 'no-positive-ev') return evaluated.no.price !== null && evaluated.no.netEv > 0 ? `NO is positive EV at ${formatCents(evaluated.no.price)} (${formatCents(evaluated.no.netEv)})` : null;
  return null;
}

export default function RulesPage() {
  const nav = [
    { href: '/', label: 'Overview' },
    { href: '/calculator', label: 'Calculator' },
    { href: '/watchlist', label: 'Watchlist' },
    { href: '/monitor', label: 'Monitor' },
    { href: 'https://github.com/Lurk-AI-INC/polycore', label: 'GitHub' }
  ];

  const [ruleDraft, setRuleDraft] = useState<Rule>({ ...DEFAULT_RULE });
  const [rules, setRules] = useState<Rule[]>([{ ...DEFAULT_RULE, id: 'demo-yes-ev' }]);
  const [events, setEvents] = useState<TriggerEvent[]>([]);
  const [markets, setMarkets] = useState<Market[]>(SAMPLE_MARKETS);
  const [isDemo, setIsDemo] = useState(true);
  const [error, setError] = useState('');
  const [refreshSeconds, setRefreshSeconds] = useState(10);
  const [previousStatuses, setPreviousStatuses] = useState<Record<string, string>>({});
  const [armedKeys, setArmedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const rawRules = window.localStorage.getItem(RULES_KEY);
    const rawEvents = window.localStorage.getItem(EVENTS_KEY);
    if (rawRules) {
      try {
        const parsed = JSON.parse(rawRules) as Rule[];
        if (Array.isArray(parsed) && parsed.length > 0) setRules(parsed);
      } catch {}
    }
    if (rawEvents) {
      try {
        const parsed = JSON.parse(rawEvents) as TriggerEvent[];
        if (Array.isArray(parsed)) setEvents(parsed);
      } catch {}
    }
  }, []);

  useEffect(() => { window.localStorage.setItem(RULES_KEY, JSON.stringify(rules)); }, [rules]);
  useEffect(() => { window.localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, 100))); }, [events]);

  const activeTickers = useMemo(() => Array.from(new Set(rules.filter((rule) => rule.isEnabled).map((rule) => rule.ticker.trim()).filter(Boolean))), [rules]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (activeTickers.length === 0) { setMarkets(SAMPLE_MARKETS); setIsDemo(true); return; }
      try {
        const response = await fetch(`/api/kalshi/markets?tickers=${encodeURIComponent(activeTickers.join(','))}`, { cache: 'no-store' });
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
  }, [activeTickers, refreshSeconds]);

  useEffect(() => {
    const nextStatuses: Record<string, string> = {};
    const nextArmed = { ...armedKeys };
    const nextEvents: TriggerEvent[] = [];

    for (const market of markets) {
      const matchingRules = rules.filter((rule) => rule.isEnabled && rule.ticker === market.ticker);
      const previousStatus = previousStatuses[market.ticker] ?? null;
      for (const rule of matchingRules) {
        const message = evaluateRule(rule, market, previousStatus);
        const key = `${rule.id}:${market.ticker}`;
        if (message) {
          if (!armedKeys[key]) {
            nextEvents.push({
              id: `${Date.now()}-${rule.id}-${market.ticker}`,
              ruleId: rule.id,
              ruleName: rule.name,
              ticker: market.ticker,
              message,
              triggeredAt: new Date().toLocaleTimeString(),
              market,
              fairYes: rule.fairYes,
              bankroll: rule.bankroll,
              feeMode: rule.feeMode,
            });
            nextArmed[key] = true;
          }
        } else {
          nextArmed[key] = false;
        }
      }
      nextStatuses[market.ticker] = market.status;
    }

    if (nextEvents.length > 0) setEvents((current) => [...nextEvents, ...current].slice(0, 50));
    setArmedKeys(nextArmed);
    setPreviousStatuses(nextStatuses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, rules]);

  function saveRule() {
    const nextRule = { ...ruleDraft, id: ruleDraft.id || `rule-${Date.now()}` };
    setRules((current) => {
      const index = current.findIndex((rule) => rule.id === nextRule.id);
      if (index === -1) return [nextRule, ...current];
      const copy = [...current];
      copy[index] = nextRule;
      return copy;
    });
    setRuleDraft({ ...DEFAULT_RULE, id: '' });
  }

  function editRule(rule: Rule) { setRuleDraft(rule); }
  function toggleRule(id: string) { setRules((current) => current.map((rule) => rule.id === id ? { ...rule, isEnabled: !rule.isEnabled } : rule)); }
  function removeRule(id: string) { setRules((current) => current.filter((rule) => rule.id !== id)); }
  function clearEvents() { setEvents([]); }

  const activeRules = rules.filter((rule) => rule.isEnabled);

  return (
    <main className="page-shell">
      <div className="page-frame">
        <div className="topbar panel-surface"><div className="brand-lockup"><div className="brand-mark">PC</div><div><p className="eyebrow">Open-source market toolkit by Lurk</p><div className="brand-line"><strong>PolyCore / Rules</strong><span>Alert when a market is finally worth touching</span></div></div></div><div className="topbar-actions">{nav.map((link) => <Link key={link.href} className="secondary-button" href={link.href}>{link.label}</Link>)}</div></div>

        <header className="hero panel-surface">
          <div className="hero-copy-wrap"><p className="eyebrow">Rules module</p><h1>Tell me when it actually matters.</h1><p className="hero-copy">Saved rules that watch live markets for thresholds, spread changes, status changes, and positive-EV conditions based on your fair value.</p></div>
          <div className="hero-rail"><div className="info-chip"><span>Active rules</span><strong>{activeRules.length}</strong></div><div className="info-chip"><span>Triggered events</span><strong>{events.length}</strong></div><div className="info-chip"><span>Tracked tickers</span><strong>{activeTickers.length || markets.length}</strong></div><div className="info-chip"><span>Feed</span><strong>{isDemo ? 'Sample mode' : `Every ${refreshSeconds}s`}</strong></div></div>
        </header>

        {error ? <div className="error-box"><p>{error}</p></div> : null}

        <section className="controls-layout controls-layout-watchlist">
          <section className="section-frame panel-surface">
            <div className="section-head"><div><p className="eyebrow">Create</p><h2>Rule builder</h2><p className="section-copy">Keep it tight: one market, one condition, one reason to care.</p></div><div className="section-actions"><button className="secondary-button" type="button" onClick={saveRule}>{ruleDraft.id ? 'Update rule' : 'Save rule'}</button></div></div>
            <div className="control-grid control-grid-2">
              <label className="field"><span>Name</span><input value={ruleDraft.name} onChange={(e) => setRuleDraft({ ...ruleDraft, name: e.target.value })} /></label>
              <label className="field"><span>Ticker</span><input value={ruleDraft.ticker} onChange={(e) => setRuleDraft({ ...ruleDraft, ticker: e.target.value })} /></label>
              <label className="field"><span>Rule type</span><select value={ruleDraft.type} onChange={(e) => setRuleDraft({ ...ruleDraft, type: e.target.value as RuleType })}><option value="yes-ask-lte">YES ask &lt;= X</option><option value="no-ask-lte">NO ask &lt;= X</option><option value="spread-lte">Spread &lt;= X</option><option value="spread-gte">Spread &gt;= X</option><option value="time-to-close-lte">Time to close &lt;= X minutes</option><option value="status-change">Status changes</option><option value="yes-positive-ev">YES becomes positive EV</option><option value="no-positive-ev">NO becomes positive EV</option></select></label>
              <label className="field"><span>Threshold</span><input value={ruleDraft.threshold} onChange={(e) => setRuleDraft({ ...ruleDraft, threshold: e.target.value })} placeholder="Used for price / spread / minutes rules" /></label>
              <label className="field"><span>Fair YES (%)</span><input value={ruleDraft.fairYes} onChange={(e) => setRuleDraft({ ...ruleDraft, fairYes: e.target.value })} /></label>
              <label className="field"><span>Bankroll ($)</span><input value={ruleDraft.bankroll} onChange={(e) => setRuleDraft({ ...ruleDraft, bankroll: e.target.value })} /></label>
              <label className="field"><span>Fee mode</span><select value={ruleDraft.feeMode} onChange={(e) => setRuleDraft({ ...ruleDraft, feeMode: e.target.value as Rule['feeMode'] })}><option value="kalshi">Kalshi</option><option value="custom">Custom</option><option value="no-fee">No fee</option><option value="polymarket">Polymarket</option></select></label>
              <label className="field"><span>Custom fee (¢)</span><input value={ruleDraft.customFeeCents} onChange={(e) => setRuleDraft({ ...ruleDraft, customFeeCents: e.target.value })} /></label>
              <label className="field"><span>Refresh (seconds)</span><input value={String(refreshSeconds)} onChange={(e) => setRefreshSeconds(Math.max(5, Number(e.target.value) || 5))} /></label>
            </div>
          </section>

          <section className="section-frame panel-surface">
            <div className="section-head"><div><p className="eyebrow">State</p><h2>Rules engine</h2></div></div>
            <div className="metrics-grid"><div className="metric-row"><span>Enabled rules</span><strong>{activeRules.length}</strong></div><div className="metric-row"><span>Total rules</span><strong>{rules.length}</strong></div><div className="metric-row"><span>Tracked tickers</span><strong>{activeTickers.length || markets.length}</strong></div><div className="metric-row"><span>Recent triggers</span><strong>{events.length}</strong></div><div className="metric-row"><span>Suggested action</span><strong>{events[0] ? 'Review latest trigger' : 'Waiting'}</strong></div><div className="metric-row"><span>Rule bankroll basis</span><strong>{events[0] ? formatCurrency(Number(events[0].bankroll) || 0) : '--'}</strong></div></div>
          </section>
        </section>

        <section className="section-frame panel-surface rules-list-section"><div className="section-head"><div><p className="eyebrow">Active rules</p><h2>Saved rules</h2></div></div><div className="rules-grid">{rules.map((rule) => <section key={rule.id} className={`subpanel surface-soft rule-card ${rule.isEnabled ? '' : 'rule-card-disabled'}`}><div className="subpanel-header"><h3>{rule.name}</h3><span className={`status-pill ${rule.isEnabled ? 'status-positive' : 'status-muted'}`}>{rule.isEnabled ? 'Enabled' : 'Disabled'}</span></div><div className="metrics-grid"><div className="metric-row"><span>Ticker</span><strong>{rule.ticker}</strong></div><div className="metric-row"><span>Type</span><strong>{rule.type}</strong></div><div className="metric-row"><span>Threshold</span><strong>{rule.threshold || '--'}</strong></div><div className="metric-row"><span>Fair / bankroll</span><strong>{rule.fairYes}% / {formatCurrency(Number(rule.bankroll) || 0)}</strong></div></div><div className="hero-actions rules-actions"><button className="secondary-button" type="button" onClick={() => editRule(rule)}>Edit</button><button className="secondary-button" type="button" onClick={() => toggleRule(rule.id)}>{rule.isEnabled ? 'Disable' : 'Enable'}</button><button className="secondary-button" type="button" onClick={() => removeRule(rule.id)}>Delete</button></div></section>)}</div></section>

        <section className="section-frame panel-surface"><div className="section-head"><div><p className="eyebrow">Triggered events</p><h2>Triggered log</h2><p className="section-copy">Latest hits stay here so you can inspect them, then launch the market straight into the calculator.</p></div><div className="section-actions"><button className="secondary-button" type="button" onClick={clearEvents}>Clear log</button></div></div><div className="table-wrap market-table-wrap"><table className="data-table market-table"><thead><tr><th>Time</th><th>Rule</th><th>Ticker</th><th>Message</th><th>Status</th><th>YES ask</th><th>Spread</th><th>Volume</th><th>Calc</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.triggeredAt}</td><td>{event.ruleName}</td><td className="ticker-cell">{event.ticker}</td><td>{event.message}</td><td><span className={`status-pill status-${statusTone(event.market.status)}`}>{event.market.status}</span></td><td>{formatCents(event.market.yesAskCents)}</td><td>{formatCents(event.market.yesSpreadCents)}</td><td>{formatCompactNumber(event.market.volume24h)}</td><td><Link className="table-link" href={calculatorHref(event.market, event.fairYes, event.bankroll, event.feeMode, '1')}>Price it</Link></td></tr>)}</tbody></table></div></section>

        <footer className="footer panel-surface"><div className="footer-main"><div><p className="eyebrow">PolyCore</p><h2>Rules module inside the PolyCore toolkit by Lurk.</h2><p className="section-copy footer-copy">Rules watch the market so the rest of PolyCore does not sit there like dead furniture.</p></div></div></footer>
      </div>
    </main>
  );
}
